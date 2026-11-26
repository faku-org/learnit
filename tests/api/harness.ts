import { mock } from "bun:test";
import { memDb } from "./memdb";

/**
 * One in-memory Mongo shared by every API test file. `mock.module` is process-wide and the API modules
 * capture `getDB` when first loaded, so the database is swapped through `state.db` instead of re-mocked per file.
 */
export const state: { db: ReturnType<typeof memDb> } = { db: memDb() };

mock.module("../../api/src/db", () => ({
  getDB: async () => state.db,
  connectDB: async () => state.db,
}));

// Read when the account modules load: set before the dynamic imports below.
process.env.LEARNIT_SECRET_KEY = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
process.env.APP_URL = "http://localhost:4321";
delete process.env.LEARNIT_INSECURE_COOKIES;
// JobIt integration: two service tokens (rotation) and a throwaway Ed25519 signing key.
export const SERVICE_TOKEN = "test-service-token-aaaaaaaaaaaaaaaaaaaaaaaa";
export const SERVICE_TOKEN_NEXT = "test-service-token-bbbbbbbbbbbbbbbbbbbbbbbb";
process.env.SERVICE_TOKENS = `${SERVICE_TOKEN}, ${SERVICE_TOKEN_NEXT}`;
const signing = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair;
export const CREDENTIAL_KEY = Buffer.from(await crypto.subtle.exportKey("pkcs8", signing.privateKey)).toString("base64");
process.env.LEARNIT_CREDENTIAL_KEY = CREDENTIAL_KEY;

export const { app } = await import("../../api/src/app");
export const { accounts, limiter, backfillLegacyUser } = await import("../../api/src/accounts");
