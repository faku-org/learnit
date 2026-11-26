import type { Limit } from "@wefaber/accounts";
import { addressOf, limiter } from "../accounts";

/** In memory, one process: the house default, same limiter the accounts routes use. */
export const LIMITS_INTEGRATION = {
  /** Public, cacheable, but it reads the whole bank. */
  catalog: { windowMs: 60_000, max: 60 } satisfies Limit,
  /** Requests without a valid service token, per address: keeps guessing cheap to refuse. */
  badToken: { windowMs: 60_000, max: 30 } satisfies Limit,
  /** Public credential lookups, per address. */
  credential: { windowMs: 60_000, max: 120 } satisfies Limit,
  /** Redeeming a one-time code, per address. */
  redeem: { windowMs: 60_000, max: 30 } satisfies Limit,
};

type Server = Parameters<typeof addressOf>[1];
type Setter = { status?: number | string; headers: Record<string, string | number | undefined> };

/** A ready 429 body when the caller is over the limit, otherwise null. */
export function takeOrReject(
  request: Request,
  server: Server,
  bucket: string,
  limit: Limit,
  set: Setter,
): { error: string; code: "rate_limited" } | null {
  const allowance = limiter.take(`integration:${bucket}:${addressOf(request, server)}`, limit);
  if (allowance.ok) return null;
  set.status = 429;
  set.headers["retry-after"] = String(allowance.retryAfter);
  return { error: "too many requests", code: "rate_limited" };
}
