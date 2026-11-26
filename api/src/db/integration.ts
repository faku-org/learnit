import type { Db } from "mongodb";
import type { GradingSpec } from "../grading";
import { forUser } from "./scoped";

/**
 * Storage for the JobIt integration (ADR 0003). Lives under `db/` because some lookups cannot be scoped to a user
 * before the user is known: a one-time code, a link id or a credential token arrives on its own and is resolved
 * by its sha256. Everything keyed by a user goes through `forUser`.
 */

export const SERVICE_COLLECTIONS = {
  assessments: "assessments",
  consents: "integration_consents",
  shares: "integration_shares",
  credentials: "assessment_credentials",
  bank: "exercises",
} as const;

type Doc = Record<string, unknown>;
type DbLike = Pick<Db, "collection">;

/* --- Consent: the applicant's permission for one application ------------------------------------------------- */

export interface ConsentDoc {
  _id: string;
  userId: string;
  /** JobIt's own id for the application (or offer) this consent is for. */
  applicationId: string;
  /** "assessment", plus one "path:<id>" per path the applicant chose to share. */
  scopes: string[];
  /** sha256 of the one-time code the applicant hands to JobIt. Null for a consent born from taking an assessment. */
  codeHash: string | null;
  codeExpiresAt: string | null;
  redeemedAt: string | null;
  /** sha256 of the opaque link id JobIt received on redemption. */
  linkHash: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export type ConsentState = "active" | "revoked" | "expired";

export const consentState = (
  consent: Pick<ConsentDoc, "revokedAt" | "expiresAt">,
  now = new Date(),
): ConsentState =>
  consent.revokedAt ? "revoked" : consent.expiresAt <= now.toISOString() ? "expired" : "active";

export async function insertConsent(db: DbLike, consent: ConsentDoc): Promise<void> {
  await forUser(db, consent.userId).of("integration_consents").insertOne(consent);
}

export const listConsents = async (db: DbLike, userId: string): Promise<ConsentDoc[]> =>
  (await forUser(db, userId)
    .of("integration_consents")
    .find({})
    .toArray()) as unknown as ConsentDoc[];

export const findConsentFor = async (
  db: DbLike,
  userId: string,
  id: string,
): Promise<ConsentDoc | null> =>
  (await forUser(db, userId)
    .of("integration_consents")
    .findOne({ _id: id } as never)) as unknown as ConsentDoc | null;

export const findConsentById = async (db: DbLike, id: string): Promise<ConsentDoc | null> =>
  (await db
    .collection(SERVICE_COLLECTIONS.consents)
    .findOne({ _id: id } as never)) as unknown as ConsentDoc | null;

export const findConsentByLink = async (db: DbLike, linkHash: string): Promise<ConsentDoc | null> =>
  (await db
    .collection(SERVICE_COLLECTIONS.consents)
    .findOne({ linkHash })) as unknown as ConsentDoc | null;

/** Revokes one consent of the user. False when it is not theirs or was already revoked. */
export async function revokeConsent(
  db: DbLike,
  userId: string,
  id: string,
  now: Date,
): Promise<boolean> {
  const result = await forUser(db, userId)
    .of("integration_consents")
    .updateOne({ _id: id, revokedAt: null } as never, { $set: { revokedAt: now.toISOString() } });
  return (result.modifiedCount ?? 0) > 0;
}

/**
 * One-time redemption: the code can be spent once, before it expires, and not after a revocation. The filter is
 * the lock, so two simultaneous redemptions cannot both win.
 */
export async function redeemCode(
  db: DbLike,
  codeHash: string,
  linkHash: string,
  now: Date,
): Promise<ConsentDoc | null> {
  const iso = now.toISOString();
  const col = db.collection(SERVICE_COLLECTIONS.consents);
  const result = await col.updateOne(
    { codeHash, redeemedAt: null, revokedAt: null, codeExpiresAt: { $gt: iso } } as never,
    { $set: { redeemedAt: iso, linkHash } },
  );
  if (!result.modifiedCount) return null;
  return (await col.findOne({ linkHash })) as unknown as ConsentDoc | null;
}

/* --- Shares: what LearnIt handed over, and when -------------------------------------------------------------- */

export interface ShareDoc {
  consentId: string;
  what: "assessment_result" | "credential" | "path";
  ref: string;
  at: string;
}

export async function recordShare(db: DbLike, userId: string, share: ShareDoc): Promise<void> {
  await forUser(db, userId)
    .of("integration_shares")
    .insertOne({ ...share });
}

export const sharesOf = async (db: DbLike, userId: string): Promise<ShareDoc[]> =>
  (await forUser(db, userId).of("integration_shares").find({}).toArray()) as unknown as ShareDoc[];

/* --- Assessments -------------------------------------------------------------------------------------------- */

/** A question frozen at creation, with its answer key: the assessment stays stable if the bank changes, and the key never leaves the server. */
export interface AssessmentQuestion {
  exerciseId: string;
  topic: string;
  type: string;
  question: string;
  options: string[] | null;
  sentence: string | null;
  blocks: unknown[] | null;
  spec: GradingSpec;
}

export interface AssessmentDoc {
  _id: string;
  /** sha256 of the code the applicant uses to take it. */
  codeHash: string;
  /** Which service token created it (a label, never the token). */
  createdBy: string;
  subject: string;
  taxonomy: string[];
  topic: string | null;
  level: string;
  offerId: string | null;
  questions: AssessmentQuestion[];
  status: "pending" | "in_progress" | "completed";
  /** Null until the applicant claims it; from then on `forUser` scopes it. */
  userId: string | null;
  /** A consent JobIt asked for at creation (`linkId`); the applicant's claim must come from the same user. */
  consentId: string | null;
  score: number | null;
  passed: boolean | null;
  failedTopics: string[];
  createdAt: string;
  expiresAt: string;
  claimedAt: string | null;
  completedAt: string | null;
}

export async function insertAssessment(db: DbLike, doc: AssessmentDoc): Promise<void> {
  await db.collection(SERVICE_COLLECTIONS.assessments).insertOne(doc as never);
}

export const findAssessment = async (db: DbLike, id: string): Promise<AssessmentDoc | null> =>
  (await db
    .collection(SERVICE_COLLECTIONS.assessments)
    .findOne({ _id: id } as never)) as unknown as AssessmentDoc | null;

export const findAssessmentByCode = async (
  db: DbLike,
  codeHash: string,
): Promise<AssessmentDoc | null> =>
  (await db
    .collection(SERVICE_COLLECTIONS.assessments)
    .findOne({ codeHash })) as unknown as AssessmentDoc | null;

/** Binds a pending assessment to the applicant. The filter makes the claim happen once. */
export async function claimAssessment(
  db: DbLike,
  id: string,
  userId: string,
  consentId: string,
  now: Date,
): Promise<boolean> {
  const result = await db
    .collection(SERVICE_COLLECTIONS.assessments)
    .updateOne({ _id: id, status: "pending", userId: null } as never, {
      $set: { status: "in_progress", userId, consentId, claimedAt: now.toISOString() },
    });
  return (result.modifiedCount ?? 0) > 0;
}

export async function completeAssessment(
  db: DbLike,
  userId: string,
  id: string,
  result: { score: number; passed: boolean; failedTopics: string[] },
  now: Date,
): Promise<boolean> {
  const done = await forUser(db, userId)
    .of("assessments")
    .updateOne({ _id: id, status: "in_progress" } as never, {
      $set: { ...result, status: "completed", completedAt: now.toISOString() },
    });
  return (done.modifiedCount ?? 0) > 0;
}

/** Shared exercise bank rows for one subject leaf and level; everyone studying the subject draws from it. */
export async function bankFor(
  db: DbLike,
  filter: { taxonomyLeaf: string; level?: string },
): Promise<Doc[]> {
  const cursor = db.collection(SERVICE_COLLECTIONS.bank).find(filter);
  const rows = (await cursor.toArray()) as unknown as Doc[] | undefined;
  return rows ?? [];
}

export async function allBank(db: DbLike): Promise<Doc[]> {
  return (await db.collection(SERVICE_COLLECTIONS.bank).find({}).toArray()) as unknown as Doc[];
}

/* --- Credentials -------------------------------------------------------------------------------------------- */

export interface CredentialDoc {
  _id: string;
  /** sha256 of the token the applicant received once. */
  tokenHash: string;
  consentId: string;
  assessmentId: string;
  /** The full signed object, exactly as served. */
  signed: Doc;
  issuedAt: string;
  expiresAt: string;
}

export async function insertCredential(
  db: DbLike,
  userId: string,
  doc: CredentialDoc,
): Promise<void> {
  await forUser(db, userId).of("assessment_credentials").insertOne(doc);
}

type OwnedCredential = CredentialDoc & { userId: string };

export const findCredentialByToken = async (
  db: DbLike,
  tokenHash: string,
): Promise<OwnedCredential | null> =>
  (await db
    .collection(SERVICE_COLLECTIONS.credentials)
    .findOne({ tokenHash })) as unknown as OwnedCredential | null;

export const findCredentialForAssessment = async (
  db: DbLike,
  assessmentId: string,
): Promise<OwnedCredential | null> =>
  (await db
    .collection(SERVICE_COLLECTIONS.credentials)
    .findOne({ assessmentId })) as unknown as OwnedCredential | null;

export async function ensureIntegrationIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection(SERVICE_COLLECTIONS.assessments).createIndex({ codeHash: 1 }, { unique: true }),
    db
      .collection(SERVICE_COLLECTIONS.consents)
      .createIndex(
        { codeHash: 1 },
        { unique: true, partialFilterExpression: { codeHash: { $type: "string" } } },
      ),
    db
      .collection(SERVICE_COLLECTIONS.consents)
      .createIndex(
        { linkHash: 1 },
        { unique: true, partialFilterExpression: { linkHash: { $type: "string" } } },
      ),
    db.collection(SERVICE_COLLECTIONS.consents).createIndex({ userId: 1 }),
    db.collection(SERVICE_COLLECTIONS.shares).createIndex({ userId: 1, consentId: 1 }),
    db.collection(SERVICE_COLLECTIONS.credentials).createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection(SERVICE_COLLECTIONS.credentials).createIndex({ assessmentId: 1 }),
  ]);
}
