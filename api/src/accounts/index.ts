import {
  type AccountUser,
  type CookieConfig,
  type Limit,
  type Session,
  clientKey,
  createAccounts,
  createLimiter,
  createSecretBox,
} from "@wefaber/accounts";
import { ObjectId } from "mongodb";
import { getDB } from "../db";
import { COLLECTIONS, createMongoStore } from "./mongo-store";

/**
 * LearnIt's wiring of `@wefaber/accounts`: the Mongo store, the secret box (key from a file in production), the
 * limiter and the cookie shape. Identity lives here and in `routes.ts`; handlers elsewhere only ask who is calling.
 */
export const SESSION_COOKIE = "learnit_session";
export const CHALLENGE_COOKIE = "learnit_2fa";

/** `secure` is only ever off for development over http://. */
export const cookieConfig = (): CookieConfig => ({
  audience: "account",
  path: "/api",
  secure: process.env.LEARNIT_INSECURE_COOKIES !== "true",
});

export const box = createSecretBox({
  keyFile: process.env.LEARNIT_SECRET_KEY_FILE,
  key: process.env.LEARNIT_SECRET_KEY,
});

export const store = createMongoStore(getDB);

export const accounts = createAccounts({
  store,
  box,
  issuer: "LearnIt",
  reservedHandles: ["learnit"],
  commonPasswords: ["learnit12345"],
  newId: () => new ObjectId().toHexString(),
});

/* --- Rate limit ----------------------------------------------------------- */

export const limiter = createLimiter();

export const LIMITS = {
  /** Every POST under /api/auth, per address. */
  auth: { windowMs: 15 * 60_000, max: 40 } satisfies Limit,
  /** Password guesses against one handle, wherever they come from. */
  login: { windowMs: 15 * 60_000, max: 10 } satisfies Limit,
  /** Public speech synthesis: it costs a request to Microsoft per call. */
  tts: { windowMs: 60_000, max: 30 } satisfies Limit,
};

export const addressOf = (
  request: Request,
  server: { requestIP(request: Request): { address: string } | null } | null | undefined,
): string => clientKey(request, server?.requestIP(request)?.address ?? null);

/* --- Who is calling ------------------------------------------------------- */

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      return value ? decodeURIComponent(value) : undefined;
    }
  }
  return undefined;
}

type HeaderBag = Record<string, string | undefined>;

/** The signed-in account behind a request's cookie, or `null`. */
export async function authenticate(headers: HeaderBag): Promise<AccountUser | null> {
  return accounts.sessionUser(readCookie(headers.cookie, SESSION_COOKIE));
}

/* --- Google ---------------------------------------------------------------- */

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

/** `local-part` of an email as a handle candidate: letters, digits, dot, dash, underscore; 3 to 30 long. */
export function handleBase(email: string, name: string): string {
  const source = email.split("@")[0] || name || "user";
  const clean = source.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^[^a-z0-9]+/, "");
  const padded = clean.length >= 3 ? clean : `${clean}user`;
  return padded.slice(0, 26);
}

async function freeHandle(email: string, name: string): Promise<string> {
  const base = handleBase(email, name);
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    const valid = accounts.normaliseHandle(candidate);
    if (valid.ok && !(await store.findUserByHandle(valid.value))) return valid.value;
  }
  return `user${new ObjectId().toHexString().slice(-12)}`;
}

/** The email is only kept when the server can encrypt it; nothing here reads it back. */
async function sealEmail(email: string): Promise<string | null> {
  if (!email || !(await box.enabled())) return null;
  const sealed = await box.encrypt(email.trim().toLowerCase());
  return sealed.ok ? sealed.value : null;
}

/**
 * Gives a pre-accounts Google user (googleId, email, name; no handle) the fields the account core needs. The
 * plaintext `email` goes away when the encrypted copy is stored.
 */
export async function backfillLegacyUser(doc: Record<string, unknown>, now = new Date()): Promise<void> {
  if (typeof doc.handle === "string" && doc.handle) return;
  const email = typeof doc.email === "string" ? doc.email : "";
  const name = typeof doc.name === "string" ? doc.name : "";
  const emailEnc = await sealEmail(email);
  const db = await getDB();
  await db.collection(COLLECTIONS.users).updateOne(
    { _id: doc._id as ObjectId },
    {
      $set: {
        handle: await freeHandle(email, name),
        displayName: name || handleBase(email, name),
        status: "active",
        updatedAt: now.toISOString(),
        ...(emailEnc ? { emailEnc } : {}),
      },
      ...(emailEnc ? { $unset: { email: "" } } : {}),
    },
  );
}

/** Signs a Google profile in, creating or backfilling the account. `null` when the account is suspended. */
export async function signInWithGoogle(profile: GoogleProfile, now = new Date()): Promise<Session | null> {
  const db = await getDB();
  const users = db.collection(COLLECTIONS.users);

  const existing = await users.findOne({ googleId: profile.googleId });
  if (existing) {
    await backfillLegacyUser(existing, now);
    const user = await store.findUserById(String(existing._id));
    if (!user || user.status !== "active") return null;
    await users.updateOne({ _id: existing._id }, { $set: { picture: profile.picture ?? null } });
    return accounts.startSession(user.id, now);
  }

  const created = await accounts.register(
    {
      handle: await freeHandle(profile.email, profile.name),
      displayName: profile.name || handleBase(profile.email, profile.name),
      email: (await box.enabled()) ? profile.email : undefined,
    },
    now,
  );
  if (!created.ok) return null;
  await users.updateOne(
    { _id: new ObjectId(created.value.user.id) },
    { $set: { googleId: profile.googleId, picture: profile.picture ?? null } },
  );
  return accounts.startSession(created.value.user.id, now);
}
