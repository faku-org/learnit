import { type AccountUser, getMe } from "./api";

/**
 * Who is signed in, as far as this page knows.
 *
 * The session itself is an HttpOnly cookie the page cannot read, so the only way to know is to ask the API
 * (`GET /api/me`). The answer is kept in memory for the life of the page and never persisted: nothing about the
 * session lives in `localStorage`.
 */
let current: AccountUser | null = null;

export function getUser(): AccountUser | null {
  return current;
}

export function isAuthenticated(): boolean {
  return current !== null;
}

export function setSession(user: AccountUser): void {
  current = user;
}

export function clearSession(): void {
  current = null;
}

/** Keys the JWT flow left behind. They are removed on sight: a stale token is a credential at rest. */
function purgeLegacyStorage(): void {
  try {
    localStorage.removeItem("learnit_token");
    localStorage.removeItem("learnit_user");
  } catch {
    // Storage can be blocked; there is nothing to purge then.
  }
}

/** Asks the API who the cookie belongs to. `null` when there is no valid session. */
export async function loadSession(): Promise<AccountUser | null> {
  purgeLegacyStorage();
  if (current) return current;
  try {
    current = (await getMe()).user;
  } catch {
    current = null;
  }
  return current;
}
