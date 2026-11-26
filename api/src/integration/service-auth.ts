import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Service tokens: how JobIt (and any later partner) proves it is a server and not a browser. Separate from user
 * sessions on purpose: a service token never carries a user, and a session never opens /api/service.
 *
 * `SERVICE_TOKENS` is a comma-separated list so a token can be rotated without downtime: add the new one, move
 * the caller over, remove the old one. Short entries are ignored. Nothing here logs a token.
 */

export const MIN_TOKEN_LENGTH = 32;

export interface ServiceCaller {
  /** Stable label for audit rows: `svc_` plus the start of the token's sha256. Not reversible to the token. */
  label: string;
}

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

export function configuredTokens(env: string | undefined = process.env.SERVICE_TOKENS): string[] {
  return (env ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

/** Pulls the token out of `Authorization: Bearer <token>`. */
export function bearerOf(header: string | null | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return match?.[1] ?? null;
}

/**
 * Compares the presented token against every configured one, in constant time: both sides are hashed to the same
 * length first, every candidate is always checked, and the loop never exits early on a match.
 */
export function authenticateService(
  header: string | null | undefined,
  tokens: string[] = configuredTokens(),
): ServiceCaller | null {
  const presented = bearerOf(header);
  if (!presented) return null;

  const probe = digest(presented);
  let caller: ServiceCaller | null = null;
  for (const token of tokens) {
    const expected = digest(token);
    if (timingSafeEqual(probe, expected) && caller === null) {
      caller = { label: `svc_${expected.toString("hex").slice(0, 8)}` };
    }
  }
  return caller;
}
