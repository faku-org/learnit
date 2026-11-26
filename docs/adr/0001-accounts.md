# ADR 0001 — Accounts: server sessions in a cookie, `@wefaber/accounts`

- **Status:** Proposed
- **Date:** 2026-10-12

## Context

LearnIt signed users in with Google only. The API minted an HS256 JWT, redirected the browser to
`/verify?jwt=...`, and the page stored it in `localStorage`. There were no server-side sessions, so a token could
not be revoked; it travelled in a URL (history, logs, referrers); and `JWT_SECRET` fell back to a known string
when unset. Every route trusted the token, and one route (`PUT /api/goals/:id`) re-read the goal without the
owner filter. `/api/tts` was public and unthrottled.

JobIt already solved accounts (handle + password, TOTP, recovery codes, hashed sessions, encrypted email) in its own
module. LearnIt needs the same rules over MongoDB, and LearnIt and JobIt will link through users.

## Decision

- Accounts come from the shared package **`@wefaber/accounts`** (kit ADR 0003): pure rules plus an `AccountStore`
  port. LearnIt implements the port over Mongo (`api/src/accounts/mongo-store.ts`).
- The session is an opaque token in an `HttpOnly; Secure; SameSite=Lax; Path=/api` cookie (`learnit_session`).
  The server stores only its sha256 and can revoke it. JWT, `jose`, `JWT_SECRET`, `/verify` and
  `learnit_token` are removed.
- The browser calls its own origin. `credentials: "include"`; in dev an Astro proxy forwards `/api`.
- Google stays as a **linked** sign-in method (with an OAuth `state` check). The callback creates the session and
  redirects with nothing in the URL. A Google user gets a handle; users created before this change are backfilled
  the next time they sign in (or with `migrate:accounts`). They must sign in again: old JWTs stop working.
- Email and TOTP secret are encrypted at rest; the key comes from a file in env. No key means email and 2FA are
  off (fail closed); password sign-in still works.
- Per-user data goes through `forUser(db, userId)` (`api/src/db/scoped.ts`); a repo check fails on raw
  `.collection(` outside the owning modules, with a ratcheting allowance for legacy code. This closes the
  `PUT /api/goals/:id` read leak.
- Rate limits: `/api/auth/*` per address, password guesses per handle, `/api/tts` per address (in memory).
- Errors from the new routes keep the existing `{ error: string }` shape and add a stable `code` where the client
  needs one. The house `{ error: { code, message } }` envelope is not adopted yet: the existing client reads
  `.error` as a string, and changing it belongs with moving the rest of `app.ts` to modules.

## Consequences

- LearnIt depends on a private GitHub Packages package: CI and the VPS runner need `NPM_TOKEN` with `read:packages`.
- Users sign in again once after deploy.
- No IP, user agent or login history is stored (Zero Data Policy); the limiter is in memory and resets on restart.
- Passkeys and E2E enter `@wefaber/accounts` when JobIt's account-system branch merges.
- JobIt migrates to the package in its own PR, after LearnIt.
