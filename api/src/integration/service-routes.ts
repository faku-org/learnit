import { Elysia } from "elysia";
import { ObjectId } from "mongodb";
import { getDB } from "../db";
import {
  type AssessmentDoc,
  type ConsentDoc,
  consentState,
  findAssessment,
  findConsentById,
  findConsentByLink,
  findCredentialByToken,
  findCredentialForAssessment,
  insertAssessment,
  recordShare,
  redeemCode,
} from "../db/integration";
import { forUser } from "../db/scoped";
import { createAssessment } from "./assessments";
import { config, sha256Hex } from "./config";
import { type SignedCredential, publicKeyDocument } from "./credentials";
import { LIMITS_INTEGRATION, takeOrReject } from "./limits";
import { authenticateService } from "./service-auth";

/**
 * /api/service/*: what a partner server (JobIt) calls. Every route here needs a service token, except the public
 * credential routes in `credentialRoutes`, which anyone may call. Reads that touch an applicant's data also need
 * that applicant's consent to be active: revoking it cuts them (ADR 0003).
 */

const SERVICE_PREFIX = "/api/service/";
const PUBLIC_PREFIX = "/api/service/credentials/";

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= max
    ? value.trim()
    : null;

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

type Setter = { status?: number | string };
const fail = (set: Setter, status: number, error: string, code: string) => {
  set.status = status;
  return { error, code };
};

/** The refusal for a consent that no longer allows reads, or null when it does. */
function blockedBy(consent: ConsentDoc | null, set: Setter, now = new Date()) {
  if (!consent) return fail(set, 404, "not found", "not_found");
  const state = consentState(consent, now);
  if (state === "revoked")
    return fail(set, 403, "the applicant revoked this consent", "consent_revoked");
  if (state === "expired") return fail(set, 403, "this consent has expired", "consent_expired");
  return null;
}

const resultOf = (assessment: AssessmentDoc, now: Date) => {
  const expired = assessment.status !== "completed" && assessment.expiresAt <= now.toISOString();
  return {
    id: assessment._id,
    status: expired ? "expired" : assessment.status,
    passed: assessment.passed,
    score: assessment.score,
    failed_topics: assessment.failedTopics,
    subject: assessment.subject,
    topic: assessment.topic,
    level: assessment.level,
    offer_id: assessment.offerId,
    completed_at: assessment.completedAt,
  };
};

export const serviceRoutes = new Elysia({ name: "learnit-service" })
  /** Runs before body parsing and validation, so an unauthenticated caller learns nothing but 401. */
  .onRequest(({ request, server, set }) => {
    const path = new URL(request.url).pathname;
    if (!path.startsWith(SERVICE_PREFIX) || path.startsWith(PUBLIC_PREFIX)) return;

    if (authenticateService(request.headers.get("authorization"))) return;
    const limited = takeOrReject(request, server, "bad-token", LIMITS_INTEGRATION.badToken, set);
    if (limited) return limited;
    set.status = 401;
    set.headers["www-authenticate"] = 'Bearer realm="learnit-service"';
    return { error: "a service token is required", code: "unauthorized" };
  })

  /* --- Assessments -------------------------------------------------------- */

  .post("/api/service/assessments", async ({ body, request, set }) => {
    const caller = authenticateService(request.headers.get("authorization"));
    if (!caller) return fail(set, 401, "a service token is required", "unauthorized");

    const input = record(body);
    const subject = text(input.subject, 120);
    const level = text(input.level, 32);
    const topic = input.topic === undefined || input.topic === null ? null : text(input.topic, 120);
    const offerId =
      input.offer_id === undefined || input.offer_id === null ? null : text(input.offer_id, 128);
    const linkId =
      input.link_id === undefined || input.link_id === null ? null : text(input.link_id, 128);
    if (!subject || !level || !/^[a-z0-9_-]+$/i.test(level))
      return fail(set, 400, "subject and level are required", "invalid_request");
    if (input.topic != null && !topic) return fail(set, 400, "topic is invalid", "invalid_request");
    if (input.offer_id != null && !offerId)
      return fail(set, 400, "offer_id is invalid", "invalid_request");

    const db = await getDB();
    const now = new Date();

    // A link id binds the assessment to the applicant who granted it; their consent then governs every read.
    let consentId: string | null = null;
    if (linkId) {
      const consent = await findConsentByLink(db, sha256Hex(linkId));
      const blocked = blockedBy(consent, set, now);
      if (blocked || !consent) return blocked ?? fail(set, 404, "not found", "not_found");
      consentId = consent._id;
    }

    const created = await createAssessment(
      db,
      caller,
      { subject, topic, level, offerId, consentId },
      now,
    );
    if (!created.ok) {
      return fail(
        set,
        created.code === "unknown_subject" ? 404 : 422,
        created.code === "unknown_subject"
          ? "no questions for that subject and level"
          : "not enough questions yet for that subject, topic and level",
        created.code,
      );
    }

    await insertAssessment(db, created.assessment);
    set.status = 201;
    return {
      id: created.assessment._id,
      status: "pending",
      // Shown once: only its sha256 is stored. The applicant types or opens it while signed in to LearnIt.
      code: created.code,
      url: `${config.appUrl()}/assessment?code=${encodeURIComponent(created.code)}`,
      expires_at: created.assessment.expiresAt,
      question_count: created.assessment.questions.length,
    };
  })

  .get("/api/service/assessments/:id", async ({ params, set }) => {
    const db = await getDB();
    const now = new Date();
    const assessment = await findAssessment(db, params.id);
    if (!assessment) return fail(set, 404, "not found", "not_found");

    // Nobody has claimed it yet, so there is no applicant data to protect.
    if (!assessment.userId || !assessment.consentId) return resultOf(assessment, now);

    const blocked = blockedBy(await findConsentById(db, assessment.consentId), set, now);
    if (blocked) return blocked;

    if (assessment.status === "completed") {
      await recordShare(db, assessment.userId, {
        consentId: assessment.consentId,
        what: "assessment_result",
        ref: assessment._id,
        at: now.toISOString(),
      });
    }
    return resultOf(assessment, now);
  })

  /* --- Link: the one-time code becomes an opaque, revocable link id ------- */

  .post("/api/service/link", async ({ body, request, server, set }) => {
    const limited = takeOrReject(request, server, "redeem", LIMITS_INTEGRATION.redeem, set);
    if (limited) return limited;

    const code = text(record(body).code, 200);
    if (!code) return fail(set, 400, "code is required", "invalid_request");

    const linkId =
      crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const consent = await redeemCode(await getDB(), sha256Hex(code), sha256Hex(linkId), new Date());
    // One answer for unknown, spent, expired and revoked: the caller learns nothing about which.
    if (!consent) return fail(set, 400, "that code is not valid", "invalid_code");

    set.status = 201;
    return {
      link_id: linkId,
      application_id: consent.applicationId,
      scopes: consent.scopes,
      expires_at: consent.expiresAt,
    };
  })

  /** What the applicant agreed to share through this link, and only that. */
  .get("/api/service/links/:linkId", async ({ params, set }) => {
    const db = await getDB();
    const now = new Date();
    const consent = await findConsentByLink(db, sha256Hex(params.linkId));
    const blocked = blockedBy(consent, set, now);
    if (blocked || !consent) return blocked ?? fail(set, 404, "not found", "not_found");

    const scope = forUser(db, consent.userId);
    const at = now.toISOString();
    const shared: {
      assessment: ReturnType<typeof resultOf> | null;
      credential: SignedCredential | null;
      paths: unknown[];
    } = {
      assessment: null,
      credential: null,
      paths: [],
    };

    if (consent.scopes.includes("assessment")) {
      const mine = (await scope
        .of("assessments")
        .find({ consentId: consent._id, status: "completed" })
        .toArray()) as unknown as AssessmentDoc[];
      const latest = mine.sort((a, b) =>
        (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
      )[0];
      if (latest) {
        shared.assessment = resultOf(latest, now);
        await recordShare(db, consent.userId, {
          consentId: consent._id,
          what: "assessment_result",
          ref: latest._id,
          at,
        });
        const credential = await findCredentialForAssessment(db, latest._id);
        if (credential) {
          shared.credential = credential.signed as unknown as SignedCredential;
          await recordShare(db, consent.userId, {
            consentId: consent._id,
            what: "credential",
            ref: credential._id,
            at,
          });
        }
      }
    }

    const pathIds = consent.scopes
      .filter((scopeName) => scopeName.startsWith("path:"))
      .map((scopeName) => scopeName.slice("path:".length))
      .filter((id) => /^[0-9a-f]{24}$/i.test(id));
    const sharedPaths = await Promise.all(
      pathIds.map(async (id) => {
        const path = await scope.of("paths").findOne({ _id: new ObjectId(id) } as never);
        if (!path) return null;
        const modules = Array.isArray(path.modules)
          ? (path.modules as { name?: string; topics?: { name?: string }[] }[])
          : [];
        await recordShare(db, consent.userId, {
          consentId: consent._id,
          what: "path",
          ref: id,
          at,
        });
        return {
          id,
          subject: path.subject ?? null,
          level: path.startingLevel ?? null,
          objective: path.objective ?? null,
          modules: modules.map((module) => ({
            name: module.name ?? "",
            topics: (module.topics ?? []).map((topic) => ({ name: topic.name ?? "" })),
          })),
        };
      }),
    );
    for (const entry of sharedPaths) if (entry) shared.paths.push(entry);

    return {
      application_id: consent.applicationId,
      scopes: consent.scopes,
      expires_at: consent.expiresAt,
      ...shared,
    };
  });

/* --- Public: anyone can verify a credential --------------------------------------------------------------- */

export const credentialRoutes = new Elysia({ name: "learnit-credentials" })
  /** The key a third party checks signatures against. Declared before `:token` so it is never read as a token. */
  .get("/api/service/credentials/public-key", async ({ set }) => {
    const document = await publicKeyDocument();
    if (!document) return fail(set, 503, "credential signing is not configured", "not_configured");
    set.headers["cache-control"] = "public, max-age=300";
    return document;
  })

  .get("/api/service/credentials/:token", async ({ params, request, server, set }) => {
    const limited = takeOrReject(request, server, "credential", LIMITS_INTEGRATION.credential, set);
    if (limited) return limited;

    const db = await getDB();
    const now = new Date();
    const credential = await findCredentialByToken(db, sha256Hex(params.token));
    if (!credential) return fail(set, 404, "not found", "not_found");

    // Revoking the consent withdraws the credential too; an expired credential is refused the same way.
    const consent = await findConsentById(db, credential.consentId);
    if (!consent || consentState(consent, now) === "revoked")
      return fail(set, 410, "this credential was revoked", "revoked");
    if (credential.expiresAt <= now.toISOString())
      return fail(set, 410, "this credential has expired", "expired");

    await recordShare(db, credential.userId, {
      consentId: credential.consentId,
      what: "credential",
      ref: credential._id,
      at: now.toISOString(),
    });
    set.headers["cache-control"] = "no-store";
    return credential.signed;
  });
