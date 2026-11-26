# LearnIt architecture

Extends the WeFaber house [ARCHITECTURE.md](https://github.com/wefaber/kit/blob/main/handbook/ARCHITECTURE.md) and
lists only what is specific to LearnIt and where it deviates. Deviations have an ADR in [docs/adr](docs/adr).

LearnIt is a **product**: public on the internet, real users, privacy first. It is one of the two products the kit
(`@wefaber/*`) is built around.

## Shape

| Part | Where | Notes |
|---|---|---|
| Frontend | `src/` | Astro 7 + React 19 islands, Tailwind v4, i18n `en`/`es`. Talks only to its own origin (`/api`). |
| API | `api/src/` | One Elysia process. `app.ts` still holds most routes (legacy); new code goes in modules. |
| Data | MongoDB | `db` name from env. Indexes are ensured at start. |
| LLM | `api/src/llm.ts` | DeepSeek through the OpenAI SDK. The house rule (OpenRouter with ZDR) is registered debt. |
| Shared pure code | `api/src/{expr,grading}.ts` | Imported by the client as `@shared/*`: the grade is the same on both sides. |

The browser never learns an API port. In development Astro proxies `/api` to the API (`astro.config.mjs`, port
from `PUBLIC_API_PORT`); in production nginx does the same, so the session cookie is first-party.

## Accounts

[ADR 0001](docs/adr/0001-accounts.md). Identity comes from the shared package **`@wefaber/accounts`** (rules, no
I/O); LearnIt supplies the Mongo adapter and the HTTP routes.

```
api/src/accounts/
├── index.ts        wiring: store, secret box, limiter, cookie shape, who-is-calling, Google sign-in
├── mongo-store.ts  AccountStore over Mongo (users, user_sessions, user_recovery_codes) + indexes
├── routes.ts       /api/auth/*  /api/me  (register, login, 2FA, logout, profile, deletion)
└── migrate.ts      backfill handles for pre-accounts Google users (optional)
```

- **Session:** opaque 32-byte token in the `learnit_session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`,
  `path=/api`). The database holds only its sha256, in `user_sessions` with a TTL index. 30 days, renewed daily
  while used. No JWT, no `localStorage`, nothing in a URL.
- **Methods in:** handle + password (argon2id), optional TOTP with one-time recovery codes, and Google as a linked
  method. Google users get a handle; legacy Google users are backfilled on their next sign-in.
- **At rest:** email and TOTP secret are AES-256-GCM, key from `LEARNIT_SECRET_KEY_FILE` (or `LEARNIT_SECRET_KEY`
  in dev). Without a key, email and 2FA are off and fail closed; password sign-in keeps working.
- **Throttling:** `/api/auth/*` per address; password guesses per handle; public `/api/tts` per address. In
  memory, one process (house default).
- **CSRF:** `SameSite=Lax` plus an Origin check on every state-changing route in the accounts module.
- **Deletion:** real deletion of every row the user owns, [ADR 0002](docs/adr/0002-account-deletion.md).

## JobIt integration

Catalog, assessments, consent-based sharing and signed credentials for JobIt, in `api/src/integration/`
([ADR 0003](docs/adr/0003-jobit-integration.md)). `GET /api/catalog` is public and carries no user data.
`/api/service/*` needs a service token from `SERVICE_TOKENS` (rotatable list, constant-time compare, separate from
user sessions). The applicant grants consent per application with a one-time code, revocable and expiring;
revoking cuts every read. Credentials are Ed25519-signed and verifiable with the public key at
`/api/service/credentials/public-key`. Raw access to the cross-user lookups lives in `api/src/db/integration.ts`.

## Isolation

Per-user data is reached only through `forUser(db, userId).of(collection)` in `api/src/db/scoped.ts`. It puts
`userId` into every filter and every inserted document, and applies it last so a caller cannot override it.
`scripts/check-scoped.ts` (part of `bun run check`) fails on a raw `.collection(` outside `api/src/db/` and
`api/src/accounts/`. Code written before the rule has a per-file allowance that can only go down; migrating a
query means lowering the number in that script. `goals`, `streak` and `vocabulary` are migrated; the rest of
`app.ts` is the backlog.

New per-user collections are added to `USER_COLLECTIONS`: that list is also what account deletion walks.

## Testing

`bun run check` = tsc (app and API) + oxlint + `check-scoped` + `bun test`.

- API tests run `app.handle` against an in-memory Mongo (`tests/api/memdb.ts`) through one shared harness
  (`tests/api/harness.ts`): `mock.module` is process-wide, so the database is swapped through `state.db`.
- The frontend never reads `PUBLIC_API_PORT` at runtime, so tests do not depend on a developer's `.env`.
- `@wefaber/accounts` is a private GitHub Packages dependency: set `NPM_TOKEN` (`read:packages`) to install it.
  See `bunfig.toml`.

## Not here yet

No `deploy.yml`, systemd unit or blue/green: nothing in this repo can be deployed to production until the pipeline
exists. Tracked as separate work before the first merge to `master`.
