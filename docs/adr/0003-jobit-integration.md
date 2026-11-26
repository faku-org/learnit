# ADR 0003 — JobIt integration: catalog, assessments and verified credentials

- **Status:** Proposed
- **Date:** 2026-11-26
- **Issue:** #10

## Context

JobIt (a hiring product) wants to know what LearnIt can teach and assess, ask an applicant to take an assessment,
read the result with the applicant's consent, and trust a credential without calling LearnIt for every check.
Three things must hold: the applicant stays in control of what is shared, a leaked token cannot read other
people's data, and a third party can verify a credential offline.

## Decisions (defaults for the open questions)

1. **The assessment is the standard LearnIt evaluation**, chosen by subject, optional topic and level. The company
   does not write the questions. Questions come from the shared exercise bank (modes `choice`, `exact`, `numeric`
   only), are frozen into the assessment (3 to 10 of them) and are graded on the server by the deterministic
   grading ladder. No model is called at assessment time. A subject/level with fewer than 3 gradable questions
   returns `422 not_enough_questions`: the bank has to be seeded before JobIt can ask for it.
2. **LearnIt branding.** The applicant takes it in LearnIt (`{APP_URL}/assessment?code=...`), signed in.
3. **Sharing is opt-in per item.** By default a consent shares only the assessment result (and the credential
   derived from it). A learning path is shared only if the applicant lists that path when granting the consent
   (`scopes: ["assessment", "path:<id>"]`), and only the applicant's own paths can be listed.

## API

Public, no token:

- `GET /api/catalog`: subjects, taxonomy lineage, and per-level path metadata (title, level, topics, effort).
  Built from the taxonomy and the shared bank only; no user data. Cacheable.
- `GET /api/service/credentials/public-key` and `GET /api/service/credentials/:token`.

Service API, `Authorization: Bearer <service token>`:

- `POST /api/service/assessments` `{subject, topic?, level, offer_id?, link_id?}` → `201 {id, code, url, expires_at, question_count}`.
- `GET /api/service/assessments/:id` → `{status, passed, score, failed_topics, ...}`. `403` when the applicant's
  consent is revoked or expired.
- `POST /api/service/link` `{code}` → `201 {link_id, application_id, scopes, expires_at}`.
- `GET /api/service/links/:linkId` → what the consent covers: result, credential, opted-in paths.

Applicant API, session cookie plus same-origin check (state-changing methods):

- `POST /api/integration/consents` → one-time `code` (shown once); `GET` lists them (with what was shared and
  when); `DELETE /api/integration/consents/:id` revokes.
- `POST /api/integration/assessments/claim` `{code}`, `POST /api/integration/assessments/:id/answers`.

## Service tokens

`SERVICE_TOKENS` is a comma-separated list, so a token rotates without downtime (add the new one, move the caller,
remove the old one). Entries shorter than 32 characters are ignored; with none configured, every service route is
`401`. Comparison hashes both sides and checks every candidate with `timingSafeEqual`, no early exit. Requests
without a valid token are refused in `onRequest`, before the body is parsed, and are rate limited per address.
A service token never carries a user, and a user session never opens `/api/service`. Tokens are never logged; audit
rows use a label (`svc_` + start of the sha256).

## Consent, links and revocation

- The applicant creates a consent for one application (`applicationId`). It returns a **one-time code**: 32 random
  bytes, only its sha256 is stored, valid for 30 minutes (`INTEGRATION_CODE_TTL_MINUTES`).
- JobIt redeems it at `POST /api/service/link`. The redemption is one atomic update filtered on "not redeemed, not
  revoked, not expired", so two callers cannot both win. Unknown, spent, expired and revoked codes get the same
  `400 invalid_code`. The answer is an **opaque link id** (random, only its sha256 stored).
- A consent expires (30 days by default, 90 at most) and can be revoked at any time. Revoking, or expiry, makes
  every read through that consent fail: link (`403`), assessment result (`403`), credential (`410` when revoked),
  and stops the applicant from submitting an assessment taken under it.
- If the applicant takes an assessment without a prior link, taking it is the consent: a consent with scope
  `assessment` for that offer is created, revocable like any other.
- LearnIt records every read in `integration_shares` (`what`, `ref`, `at`, `consentId`). The applicant sees it in
  `GET /api/integration/consents`.

## Credentials

A passing assessment issues a credential: a small JSON statement (random id, issuer, subject name and taxonomy,
topic, level, score, issued and expiry dates, audience = offer id) plus an **Ed25519** signature over its
canonical form (JSON with keys sorted at every depth), with `kid` = first 16 hex of the sha256 of the public key.
There is no account id, handle or name in it.

- The private key (PKCS#8, PEM or base64) comes from `LEARNIT_CREDENTIAL_KEY_FILE` (production) or
  `LEARNIT_CREDENTIAL_KEY` (development). Without a usable key nothing is signed and the public-key route is `503`.
- The public key is served at `/api/service/credentials/public-key` as a JWK. A third party verifies with
  WebCrypto: import the JWK, `verify("Ed25519", key, signature, canonicalize(credential))`. Changing any character
  of the statement, or the signature, fails verification.
- The applicant gets a **credential token** once, when they pass (32 random bytes, only the sha256 stored). It is a
  **bearer** credential: whoever holds the token can fetch the signed statement. The statement itself is public by
  design. Revoking the consent withdraws it from `GET /api/service/credentials/:token` (`410`), but a copy already
  fetched still verifies offline. That limit is inherent to offline verification and must be told to the applicant.

## Storage

All four new collections are per-user and are in `USER_COLLECTIONS`, so account deletion (ADR 0002) removes them:
`assessments` (from the claim on), `integration_consents`, `integration_shares`, `assessment_credentials`.
Lookups that arrive without a user (a code, a link id, a token) are resolved by sha256 in
`api/src/db/integration.ts`, the only place with raw collection access for this feature; everything keyed by a user
goes through `forUser`. Questions and the answer key are frozen in the assessment document and never leave the
server.

## Consequences

- JobIt cannot ask for a subject/level the bank does not cover (`422`); the bank grows through normal LearnIt use.
- Credential tokens and the signing key are secrets to provision. Rotating the signing key changes `kid`; keep the
  old public key published while old credentials are still in circulation.
- Rate limits are in memory, one process, like the rest of the accounts module.
- Not in this change: the LearnIt screens (take an assessment at `/assessment`, manage consents). The API is
  complete; the screens are a follow-up.
