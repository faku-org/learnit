import { readFile } from "node:fs/promises";
import { config } from "./config";

/**
 * Signed credentials: a small JSON statement ("this person passed this assessment") plus an Ed25519 signature
 * over its canonical form. Anyone holding the public key can check it without calling LearnIt; changing one
 * character of the statement breaks the signature.
 *
 * The private key is PKCS#8, as PEM or bare base64, from `LEARNIT_CREDENTIAL_KEY_FILE` (production: a file
 * outside the repo) or `LEARNIT_CREDENTIAL_KEY` (development). Without one nothing is signed and nothing is
 * issued: the routes fail closed with 503.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface CredentialPayload {
  v: 1;
  type: "learnit.assessment";
  /** Random per credential; no account id, handle or name. */
  id: string;
  issuer: string;
  subject: { name: string; taxonomy: string[] };
  topic: string | null;
  level: string;
  /** Percentage of correct answers, 0 to 100. */
  score: number;
  passed: true;
  issuedAt: string;
  expiresAt: string;
  /** The JobIt offer it was taken for, when there was one. */
  audience: string | null;
}

export interface SignedCredential {
  credential: CredentialPayload;
  proof: { alg: "Ed25519"; kid: string; canonicalization: "sorted-keys-json"; signature: string };
}

export interface PublicKeyDocument {
  alg: "Ed25519";
  kid: string;
  jwk: { kty: "OKP"; crv: "Ed25519"; x: string };
}

/** JSON with object keys sorted at every depth: the same bytes on both sides of the signature. */
export function canonicalize(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key] as Json)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

type Bytes = Uint8Array<ArrayBuffer>;
const bytes = (text: string): Bytes => new Uint8Array(new TextEncoder().encode(text));
const fromBase64Url = (text: string): Bytes => new Uint8Array(Buffer.from(text, "base64url"));
const toBase64Url = (data: ArrayBuffer | Uint8Array): string => Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data)).toString("base64url");

const keyId = async (x: string): Promise<string> =>
  Buffer.from(await crypto.subtle.digest("SHA-256", fromBase64Url(x))).toString("hex").slice(0, 16);

interface KeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  document: PublicKeyDocument;
}

let cached: { source: string; pair: KeyPair } | null = null;

/** PEM, or bare base64 / base64url, with or without literal `\n` escapes (an env var cannot hold a newline). */
const pkcs8Of = (raw: string): Bytes =>
  new Uint8Array(Buffer.from(raw.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64"));

async function rawKeySource(): Promise<string | null> {
  const file = process.env.LEARNIT_CREDENTIAL_KEY_FILE;
  if (file) return (await readFile(file, "utf8").catch(() => "")).trim() || null;
  return process.env.LEARNIT_CREDENTIAL_KEY?.trim() || null;
}

/** The signing pair, or null when no usable key is configured. */
export async function credentialKeys(): Promise<KeyPair | null> {
  const source = await rawKeySource();
  if (!source) return null;
  if (cached?.source === source) return cached.pair;

  try {
    const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8Of(source), "Ed25519", true, ["sign"]);
    // A private Ed25519 JWK carries the public half in `x`.
    const { x } = (await crypto.subtle.exportKey("jwk", privateKey)) as { x?: string };
    if (!x) return null;
    const jwk = { kty: "OKP", crv: "Ed25519", x } as const;
    const publicKey = await crypto.subtle.importKey("jwk", jwk, "Ed25519", true, ["verify"]);
    const pair: KeyPair = { privateKey, publicKey, document: { alg: "Ed25519", kid: await keyId(x), jwk } };
    cached = { source, pair };
    return pair;
  } catch {
    return null;
  }
}

export async function publicKeyDocument(): Promise<PublicKeyDocument | null> {
  return (await credentialKeys())?.document ?? null;
}

export interface CredentialInput {
  id: string;
  subject: { name: string; taxonomy: string[] };
  topic: string | null;
  level: string;
  score: number;
  offerId: string | null;
}

export function payloadOf(input: CredentialInput, now: Date): CredentialPayload {
  return {
    v: 1,
    type: "learnit.assessment",
    id: input.id,
    issuer: config.appUrl(),
    subject: input.subject,
    topic: input.topic,
    level: input.level,
    score: input.score,
    passed: true,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + config.credentialDays() * 86_400_000).toISOString(),
    audience: input.offerId,
  };
}

/** Null when no key is configured. */
export async function signCredential(payload: CredentialPayload): Promise<SignedCredential | null> {
  const keys = await credentialKeys();
  if (!keys) return null;
  const signature = await crypto.subtle.sign("Ed25519", keys.privateKey, bytes(canonicalize(payload as unknown as Json)));
  return {
    credential: payload,
    proof: { alg: "Ed25519", kid: keys.document.kid, canonicalization: "sorted-keys-json", signature: toBase64Url(signature) },
  };
}

/**
 * What a third party runs: the signed object and the public key (from `/api/service/credentials/public-key`),
 * nothing else. False for a tampered statement, a wrong key or a malformed signature; never throws.
 */
export async function verifyCredential(
  signed: SignedCredential,
  publicKey: PublicKeyDocument["jwk"],
): Promise<boolean> {
  try {
    if (signed.proof.alg !== "Ed25519") return false;
    const key = await crypto.subtle.importKey("jwk", publicKey, "Ed25519", false, ["verify"]);
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      fromBase64Url(signed.proof.signature),
      bytes(canonicalize(signed.credential as unknown as Json)),
    );
  } catch {
    return false;
  }
}

