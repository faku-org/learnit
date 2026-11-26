import type { AccountStore, AccountUser, SessionRecord, UserPatch } from "@wefaber/accounts";
import { type Db, ObjectId } from "mongodb";

/**
 * `AccountStore` over Mongo.
 *
 * `users` predates this module: documents written by the Google flow carry `googleId`, `email`, `name`, `picture`
 * and ISO-string dates, and no `handle`. Those read as accounts with an empty handle (never matched by a login)
 * until `backfillLegacyUser` gives them one. Dates stay ISO strings in `users`, as everywhere else in this API;
 * sessions and recovery codes use real Dates so the TTL index can expire them.
 */
export const COLLECTIONS = {
  users: "users",
  sessions: "user_sessions",
  recovery: "user_recovery_codes",
} as const;

type Doc = Record<string, unknown>;

const toDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  const parsed = new Date(typeof value === "string" || typeof value === "number" ? value : 0);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

const asString = (value: unknown): string | null => (typeof value === "string" ? value : null);

export function toAccountUser(doc: Doc): AccountUser {
  return {
    id: String(doc._id),
    handle: asString(doc.handle) ?? "",
    displayName: asString(doc.displayName) ?? asString(doc.name) ?? "",
    passwordHash: asString(doc.passwordHash),
    emailEnc: asString(doc.emailEnc),
    totpSecretEnc: asString(doc.totpSecretEnc),
    totpEnabled: doc.totpEnabled === true,
    status: doc.status === "suspended" ? "suspended" : "active",
    createdAt: toDate(doc.createdAt),
    updatedAt: toDate(doc.updatedAt ?? doc.createdAt),
  };
}

const serialise = (patch: UserPatch): Doc => {
  const out: Doc = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
};

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;

const validId = (id: string): boolean => /^[0-9a-f]{24}$/i.test(id);

export function createMongoStore(getDb: () => Promise<Pick<Db, "collection">>): AccountStore {
  const users = async () => (await getDb()).collection(COLLECTIONS.users);
  const sessions = async () => (await getDb()).collection(COLLECTIONS.sessions);
  const recovery = async () => (await getDb()).collection(COLLECTIONS.recovery);

  return {
    async findUserById(id) {
      if (!validId(id)) return null;
      const doc = await (await users()).findOne({ _id: new ObjectId(id) });
      return doc ? toAccountUser(doc) : null;
    },

    async findUserByHandle(handle) {
      if (!handle) return null;
      const doc = await (await users()).findOne({ handle });
      return doc ? toAccountUser(doc) : null;
    },

    async insertUser(user) {
      const col = await users();
      // The unique index is the real guard; this read only saves a round of E11000 in the common case.
      if (await col.findOne({ handle: user.handle })) return false;
      try {
        const { id, ...fields } = user;
        await col.insertOne({ _id: new ObjectId(id), ...serialise(fields) });
        return true;
      } catch (error) {
        if (isDuplicateKey(error)) return false;
        throw error;
      }
    },

    async updateUser(id, patch) {
      if (!validId(id)) return;
      await (await users()).updateOne({ _id: new ObjectId(id) }, { $set: serialise(patch) });
    },

    async deleteUser(id) {
      if (!validId(id)) return;
      await (await users()).deleteOne({ _id: new ObjectId(id) });
      await (await sessions()).deleteMany({ userId: id });
      await (await recovery()).deleteMany({ userId: id });
    },

    async insertSession(session) {
      await (await sessions()).insertOne({ ...session });
    },

    async findSession(tokenHash) {
      const doc = await (await sessions()).findOne({ tokenHash });
      if (!doc) return null;
      const record: SessionRecord = {
        tokenHash,
        userId: String(doc.userId),
        createdAt: toDate(doc.createdAt),
        expiresAt: toDate(doc.expiresAt),
        lastSeen: toDate(doc.lastSeen),
      };
      return record;
    },

    async touchSession(tokenHash, lastSeen, expiresAt) {
      await (await sessions()).updateOne({ tokenHash }, { $set: { lastSeen, expiresAt } });
    },

    async deleteSession(tokenHash) {
      await (await sessions()).deleteOne({ tokenHash });
    },

    async deleteSessionsOf(userId) {
      await (await sessions()).deleteMany({ userId });
    },

    async deleteExpiredSessions(now) {
      await (await sessions()).deleteMany({ expiresAt: { $lte: now } });
    },

    async replaceRecoveryCodes(userId, codeHashes) {
      const col = await recovery();
      await col.deleteMany({ userId });
      if (codeHashes.length > 0) {
        await col.insertMany(codeHashes.map((codeHash) => ({ userId, codeHash, usedAt: null })));
      }
    },

    async consumeRecoveryCode(userId, codeHash, usedAt) {
      const result = await (await recovery()).updateOne(
        { userId, codeHash, usedAt: null },
        { $set: { usedAt } },
      );
      return result.modifiedCount === 1;
    },

    async countRecoveryCodes(userId) {
      return (await recovery()).countDocuments({ userId, usedAt: null });
    },
  };
}

/** Indexes the module relies on. Idempotent; called once at start. */
export async function ensureAccountIndexes(db: Pick<Db, "collection">): Promise<void> {
  const users = db.collection(COLLECTIONS.users);
  await users.createIndex({ handle: 1 }, { unique: true, partialFilterExpression: { handle: { $type: "string" } } });
  await users.createIndex({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: "string" } } });

  const sessions = db.collection(COLLECTIONS.sessions);
  await sessions.createIndex({ tokenHash: 1 }, { unique: true });
  await sessions.createIndex({ userId: 1 });
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  await db.collection(COLLECTIONS.recovery).createIndex({ userId: 1, codeHash: 1 }, { unique: true });
}
