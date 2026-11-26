import { Elysia } from "elysia";
import { ObjectId } from "mongodb";
import { authenticate } from "../accounts";
import { sameOrigin } from "../accounts/routes";
import { getDB } from "../db";
import {
  type ConsentDoc,
  claimAssessment,
  completeAssessment,
  consentState,
  findAssessmentByCode,
  findConsentFor,
  insertConsent,
  insertCredential,
  listConsents,
  revokeConsent,
  sharesOf,
  findAssessment,
} from "../db/integration";
import { forUser } from "../db/scoped";
import { gradeAssessment, publicQuestions, type SubmittedAnswer } from "./assessments";
import { DAY, MINUTE, addMs, config, newId, newToken, sha256Hex } from "./config";
import { payloadOf, signCredential } from "./credentials";

/**
 * /api/integration/*: what the applicant does, signed in to LearnIt. Grants and revokes consent per application,
 * and takes the assessment JobIt asked for. These routes use the user session (cookie), never a service token.
 */

const PREFIX = "/api/integration/";

type Setter = { status?: number | string };
const fail = (set: Setter, status: number, error: string, code: string) => {
  set.status = status;
  return { error, code };
};

const stateOf = (consent: ConsentDoc, now: Date) => consentState(consent, now);

/** Never includes the code or the link hash: the code was shown once, at creation. */
const consentView = (
  consent: ConsentDoc,
  now: Date,
  shares: { what: string; ref: string; at: string; consentId: string }[],
) => ({
  id: consent._id,
  applicationId: consent.applicationId,
  scopes: consent.scopes,
  state: stateOf(consent, now),
  createdAt: consent.createdAt,
  expiresAt: consent.expiresAt,
  revokedAt: consent.revokedAt,
  redeemed: consent.redeemedAt !== null,
  shared: shares
    .filter((share) => share.consentId === consent._id)
    .map(({ what, ref, at }) => ({ what, ref, at })),
});

export const userRoutes = new Elysia({ name: "learnit-integration" })
  .onBeforeHandle(({ request, set, path }) => {
    if (!path.startsWith(PREFIX)) return;
    if (request.method === "GET" || request.method === "HEAD") return;
    if (!sameOrigin(request)) return fail(set, 403, "origin not allowed", "bad_origin");
  })

  /* --- Consents ----------------------------------------------------------- */

  .post("/api/integration/consents", async ({ body, headers, set }) => {
    const user = await authenticate(headers);
    if (!user) return fail(set, 401, "Unauthorized", "unauthorized");

    const input = (body ?? {}) as { applicationId?: unknown; paths?: unknown; days?: unknown };
    const applicationId = typeof input.applicationId === "string" ? input.applicationId.trim() : "";
    if (!applicationId || applicationId.length > 128)
      return fail(set, 400, "applicationId is required", "invalid_request");

    const requested = Array.isArray(input.paths) ? input.paths : [];
    if (
      requested.some((id) => typeof id !== "string" || !/^[0-9a-f]{24}$/i.test(id)) ||
      requested.length > 20
    ) {
      return fail(set, 400, "paths must be a list of path ids", "invalid_request");
    }

    const days =
      typeof input.days === "number" && Number.isFinite(input.days)
        ? Math.floor(input.days)
        : config.consentDays();
    if (days < 1 || days > config.maxConsentDays())
      return fail(
        set,
        400,
        `days must be between 1 and ${config.maxConsentDays()}`,
        "invalid_request",
      );

    const db = await getDB();
    // Sharing a path is opt-in per item, and only the applicant's own paths can be offered.
    const scope = forUser(db, user.id);
    const chosen = [...new Set(requested as string[])];
    for (const id of chosen) {
      if (!(await scope.of("paths").findOne({ _id: new ObjectId(id) } as never)))
        return fail(set, 404, "path not found", "path_not_found");
    }

    const now = new Date();
    const code = newToken();
    const consent: ConsentDoc = {
      _id: newId(),
      userId: user.id,
      applicationId,
      scopes: ["assessment", ...chosen.map((id) => `path:${id}`)],
      codeHash: sha256Hex(code),
      codeExpiresAt: addMs(now, config.codeMinutes() * MINUTE).toISOString(),
      redeemedAt: null,
      linkHash: null,
      createdAt: now.toISOString(),
      expiresAt: addMs(now, days * DAY).toISOString(),
      revokedAt: null,
    };
    await insertConsent(db, consent);

    set.status = 201;
    // The code is shown once: only its sha256 is stored.
    return {
      id: consent._id,
      applicationId,
      scopes: consent.scopes,
      code,
      codeExpiresAt: consent.codeExpiresAt,
      expiresAt: consent.expiresAt,
    };
  })

  .get("/api/integration/consents", async ({ headers, set }) => {
    const user = await authenticate(headers);
    if (!user) return fail(set, 401, "Unauthorized", "unauthorized");
    const db = await getDB();
    const now = new Date();
    const [consents, shares] = await Promise.all([
      listConsents(db, user.id),
      sharesOf(db, user.id),
    ]);
    consents.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { consents: consents.map((consent) => consentView(consent, now, shares)) };
  })

  .delete("/api/integration/consents/:id", async ({ params, headers, set }) => {
    const user = await authenticate(headers);
    if (!user) return fail(set, 401, "Unauthorized", "unauthorized");
    const db = await getDB();
    const consent = await findConsentFor(db, user.id, params.id);
    if (!consent) return fail(set, 404, "not found", "not_found");
    await revokeConsent(db, user.id, consent._id, new Date());
    const after = (await findConsentFor(db, user.id, consent._id)) ?? consent;
    return consentView(after, new Date(), await sharesOf(db, user.id));
  })

  /* --- Taking the assessment ---------------------------------------------- */

  .post("/api/integration/assessments/claim", async ({ body, headers, set }) => {
    const user = await authenticate(headers);
    if (!user) return fail(set, 401, "Unauthorized", "unauthorized");

    const code =
      typeof (body as { code?: unknown } | null)?.code === "string"
        ? (body as { code: string }).code.trim()
        : "";
    if (!code || code.length > 200) return fail(set, 400, "code is required", "invalid_request");

    const db = await getDB();
    const now = new Date();
    const assessment = await findAssessmentByCode(db, sha256Hex(code));
    if (!assessment) return fail(set, 404, "that code is not valid", "invalid_code");
    if (assessment.status !== "completed" && assessment.expiresAt <= now.toISOString()) {
      return fail(set, 410, "this assessment has expired", "expired");
    }

    // Already taken, or already claimed by someone else.
    if (assessment.userId && assessment.userId !== user.id)
      return fail(set, 404, "that code is not valid", "invalid_code");
    if (assessment.status === "completed")
      return fail(set, 409, "this assessment was already taken", "already_completed");
    if (assessment.status === "in_progress") {
      return {
        id: assessment._id,
        subject: assessment.subject,
        level: assessment.level,
        topic: assessment.topic,
        questions: publicQuestions(assessment),
      };
    }

    // JobIt may have tied it to a consent at creation: that consent must be this applicant's and still active.
    let consentId = assessment.consentId;
    if (consentId) {
      const preset = await findConsentFor(db, user.id, consentId);
      if (!preset)
        return fail(set, 403, "this assessment was requested for another account", "wrong_account");
      if (consentState(preset, now) !== "active")
        return fail(set, 403, "that consent is no longer active", "consent_inactive");
    } else {
      // Taking it is itself the applicant's consent to share the result with this application, and nothing else.
      consentId = newId();
      await insertConsent(db, {
        _id: consentId,
        userId: user.id,
        applicationId: assessment.offerId ?? assessment._id,
        scopes: ["assessment"],
        codeHash: null,
        codeExpiresAt: null,
        redeemedAt: null,
        linkHash: null,
        createdAt: now.toISOString(),
        expiresAt: addMs(now, config.consentDays() * DAY).toISOString(),
        revokedAt: null,
      });
    }

    if (!(await claimAssessment(db, assessment._id, user.id, consentId, now))) {
      return fail(set, 409, "this assessment was just claimed", "already_claimed");
    }
    return {
      id: assessment._id,
      subject: assessment.subject,
      level: assessment.level,
      topic: assessment.topic,
      questions: publicQuestions(assessment),
    };
  })

  .post("/api/integration/assessments/:id/answers", async ({ params, body, headers, set }) => {
    const user = await authenticate(headers);
    if (!user) return fail(set, 401, "Unauthorized", "unauthorized");

    const db = await getDB();
    const now = new Date();
    const assessment = await findAssessment(db, params.id);
    if (!assessment || assessment.userId !== user.id)
      return fail(set, 404, "not found", "not_found");
    if (assessment.status === "completed")
      return fail(set, 409, "this assessment was already taken", "already_completed");
    if (assessment.expiresAt <= now.toISOString())
      return fail(set, 410, "this assessment has expired", "expired");

    const consent = assessment.consentId
      ? await findConsentFor(db, user.id, assessment.consentId)
      : null;
    if (!consent || consentState(consent, now) !== "active")
      return fail(set, 403, "that consent is no longer active", "consent_inactive");

    const raw = (body as { answers?: unknown } | null)?.answers;
    if (!Array.isArray(raw) || raw.length > assessment.questions.length)
      return fail(set, 400, "answers must be a list", "invalid_request");
    const answers: SubmittedAnswer[] = [];
    for (const item of raw) {
      const entry = item as { q?: unknown; choice?: unknown; text?: unknown };
      if (typeof entry?.q !== "number" || !Number.isInteger(entry.q))
        return fail(set, 400, "each answer needs a question number", "invalid_request");
      answers.push({
        q: entry.q,
        choice: typeof entry.choice === "number" ? entry.choice : null,
        text: typeof entry.text === "string" ? entry.text.slice(0, 2000) : undefined,
      });
    }

    const outcome = gradeAssessment(assessment, answers);
    if (!(await completeAssessment(db, user.id, assessment._id, outcome, now))) {
      return fail(set, 409, "this assessment was already taken", "already_completed");
    }

    let credentialToken: string | null = null;
    if (outcome.passed) {
      const payload = payloadOf(
        {
          id: newId(),
          subject: { name: assessment.subject, taxonomy: assessment.taxonomy },
          topic: assessment.topic,
          level: assessment.level,
          score: outcome.score,
          offerId: assessment.offerId,
        },
        now,
      );
      const signed = await signCredential(payload);
      if (signed) {
        credentialToken = newToken();
        await insertCredential(db, user.id, {
          _id: payload.id,
          tokenHash: sha256Hex(credentialToken),
          consentId: consent._id,
          assessmentId: assessment._id,
          signed: signed as unknown as Record<string, unknown>,
          issuedAt: payload.issuedAt,
          expiresAt: payload.expiresAt,
        });
      }
    }

    return {
      id: assessment._id,
      status: "completed",
      passed: outcome.passed,
      score: outcome.score,
      failed_topics: outcome.failedTopics,
      // Shown once: only its sha256 is stored. Whoever holds it can fetch the signed credential.
      credentialToken,
    };
  });
