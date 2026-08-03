---
type: technical
author: Ether
created: 2026-08-03
status: proposed
tags: [testing, qa, plan, bun-test, msw, playwright]
priority: high
---

# LearnIt Testing Plan

> Concrete plan produced from `docs/AI_Testing_Agent_Template.md`. Project
> context is filled in from the real codebase and the baseline was measured on
> 2026-08-03. Follow the template's rules: Bun only, strict TS, no emojis, no
> snapshots of large trees, `userEvent` over `fireEvent`, MSW at the HTTP layer.

## 1. Project context (measured)

| Field | Value |
|-------|-------|
| Project name | learnit |
| App type | full-stack (Astro SPA frontend + Elysia API) |
| Frontend | Astro 7 + React 19 + Tailwind v4 + react-i18next |
| Backend | Elysia (`api/src/index.ts`, 2,224 lines, 45+ routes) |
| Test runner | `bun:test` via `bun test` (kept — do NOT add Vitest) |
| Existing tests? | partial — 73 pass, 10 live-skips across 5 files |
| Test command | `bun test` (verify: root `package.json`) |
| Typecheck | `bun run typecheck` (`bunx tsc --noEmit`, excludes `api/`) |
| Lint | `bun run lint` (`bunx oxlint src`) |
| Coverage | `bun test --coverage` (Bun built-in, works today) |

### Baseline — commands run and recorded 2026-08-03

```bash
bun install          # was REQUIRED: katex and bun-types were missing from
                     # node_modules and broke tests + typecheck
bun test             # 73 pass, 10 skip, 0 fail (169ms)
bun test --coverage  # 50.62% statements / 56.98% branches (all files)
bun run typecheck    # passes after install
bun run lint         # not yet gated on the plan's new files
```

### Phase 1 status (completed 2026-08-03)

```bash
bun test             # 241 pass, 10 skip, 0 fail (10 new test files)
bun test --coverage  # 68.70% statements / 74.28% branches
bun run typecheck    # passes
bun run lint         # 0 warnings / 0 errors
```

### Phase 2 status (completed 2026-08-03)

```bash
bun test             # 298 pass, 10 skip, 0 fail (11 new component test files)
bun run typecheck    # passes
bun run lint         # 0 warnings / 0 errors
```

The component suite uses jsdom + `@testing-library/react` + `user-event` + MSW
(via `tests/msw.ts`), with `bunfig.toml` preloading `tests/setup.ts`.
framer-motion exit animations are forced to complete immediately (jsdom's rAF
does not tick under Bun), and Bun's native Blob/FormData are kept so MSW's
`instanceof` checks still hold. Representative coverage:

- `answers/` (AnswerArea, Choice, Text, Order, Set, MathInput): 67-100%
- `CalibrationFlow.tsx`: 16% -> 93%
- `SettingsPage.tsx`, `VocabularyPage.tsx`, `ScopingQuiz.tsx`, `StatsOverview.tsx`: 88-100%
- `LearnPage.tsx`: 0% -> 61% (ready state, correct/wrong/give-up flows)
- `GoalsPage.tsx`: 0% -> 65%; `PathRoadmap.tsx` 78%; `DashboardContent.tsx` 71%

### Phase 2 completion (2026-08-03)

Remaining components covered in a second pass: `LoginModal`/`AuthGuard`,
`FeedbackModal`, `LessonSummary`, `SectionSummary`, `ClickableText`,
`LanguageSwitcher`, `SpeakPage`, `ExercisesPage`. Full gate now at **321 pass /
0 fail** (26 component test files). Notes:

- `LoginModal` was refactored from a `button` doing `window.location.href` to the
  codebase's idiomatic `<Button asChild><a href>` (jsdom cannot stub navigation).
- The suite sets `--timeout 20000` (bun's 5s default is too tight for whole-page
  renders with framer-motion exit animations under parallel load).
- `bunfig.toml` preloads `api/src/preload.ts` first so tests that import the
  Elysia app can load the mongodb driver (v8 startup-snapshot stub).

### Phase 3 status (completed 2026-08-03)

```bash
bun test             # 352 pass, 10 skip, 0 fail
bun run typecheck    # passes
bun run lint         # 0 warnings / 0 errors
```

Refactor done: the Elysia `app` moved from `api/src/index.ts` into
`api/src/app.ts` (exported); `api/src/index.ts` is now a thin entrypoint that
imports `app` and calls `.listen()`. Verified the API boots and serves
`/api/health`.

Contract tests in `api/src/app.test.ts` (19 tests) drive `app.handle()` with an
in-memory Mongo shim (`tests/api/memdb.ts`) and real signed JWTs:
- Auth: 401 on missing/garbage tokens, `GET /api/auth/me` returns the user
- `GET /api/health`
- Goals CRUD incl. 400 validation and 404 on absent (but valid) ids
- Streak get/update incl. same-day idempotency
- Vocabulary create/list/delete + 400 validation
- Preferences get/upsert, difficulty-bias clamping to [-1, 1], 400 on empty

Phase 4 (Playwright E2E) remains.

Phase 1 delivered: `src/lib/{api,auth,domains,exerciseTypes,format}.test.ts`,
`api/src/{expr,schemas,taxonomy,domains,prompt-router}.test.ts`, and
extensions to `api/src/grading.test.ts`. Test infra added: `bunfig.toml`
preload, `tests/setup.ts` (happy-dom), `tests/handlers.ts` (MSW).
`src/lib/api.ts` went 0% -> 93.6% stmts, `src/lib/auth.ts` and the pure
`api/src` modules are at 100%.

### Current coverage snapshot (relevant gaps)

| File | Stmts | Notes |
|------|-------|-------|
| `src/lib/api.ts` | 0% | 503-line API client, entirely untested |
| `src/lib/auth.ts` | 0% | localStorage session helpers |
| `src/lib/domains.ts` | 20% | `breadcrumbOf`, `taxonomyOf`, `subjectNameOf` untested |
| `src/components/CalibrationFlow.tsx` | 16% | integration behavior untested |
| `api/src/grading.ts` | 69% | remaining upgrade/escalation branches |
| `api/src/classify.ts`, `taxonomy.ts`, `schemas.ts`, `prompt-router.ts`, `semantic.ts`, `llm.ts` | not loaded | no tests at all |
| `api/src/sources/*` | 0–62% | `gutenberg` 0%, `wikisource` 14%, `academic` 8% |
| `src/components/blocks/*` | 0–100% | `Diagram`, `SourceExcerpt` partial; coverage fine |
| All page components (`LearnPage`, `ExercisesPage`, ...) | not loaded | untested |

## 2. Stack decisions

1. **Runner stays `bun:test`.** The project already has a working setup; the
   template forbids adding a second runner. No Vitest.
2. **Presentational tests keep the existing SSR pattern**
   (`renderToStaticMarkup` + string assertions), as in `blocks.test.tsx` and
   `calibration.test.tsx`. Zero new infra for these.
3. **Interactive/data-fetching components get one new environment**:
   `happy-dom` + `@testing-library/react` + `@testing-library/user-event` +
   `@testing-library/jest-dom` + `msw`, wired through a Bun test preload. This
   is the minimal addition needed to test click/type/submit behavior and
   loading/error/empty states.
4. **Mock at the HTTP layer with MSW**, never inline fetch stubs, so
   `src/lib/api.ts` is exercised for real.
5. **E2E only for the running app** (Playwright), scoped to 3-5 critical
   journeys.

New dev deps to add:

```bash
bun add -d @testing-library/react @testing-library/user-event \
  @testing-library/jest-dom @happy-dom/global-registrator msw
bunx playwright install chromium   # Phase 4 only
```

Bun test setup (`bunfig.toml` at repo root):

```toml
[test]
preload = ["./tests/setup.ts"]
```

`tests/setup.ts` registers happy-dom globally and starts/stops MSW:
`beforeAll(server.listen)` / `afterEach(server.resetHandlers)` /
`afterAll(server.close)`.

## 3. Phase plan

### Phase 1 — Unit tests, pure logic (DONE)

All test files live under `tests/`, mirroring the source tree (`tests/lib/`,
`tests/components/`, `tests/api/`). Use the template's case matrix: happy path,
edge cases, errors, boundaries.

**Frontend (`src/lib/`):**
- `src/lib/api.ts` (`api.test.ts`) — top priority. Use MSW at the HTTP layer
  (Phase 2 infra) or a bare fetch mock if not yet installed. Cover:
  - `request` success and typed parsing; `requestForm` multipart shape
  - 400/404/500 → throws with the server's `error` message
  - non-JSON error body → falls back to `res.statusText`, no crash
  - `getAuthHeaders` merged into every request; absent token → no header
  - every exported call: goals, streak, vocabulary (+enrich), calibration
    stage, path generate, taxonomy classify/scope/tree, exercises
    get/generate/next/answer/explain, grade semantic, feedback, translate,
    correct, progress, stats topic/module/overview, speak tts/transcribe/
    scenario/grade, prefs get/set
  - network failure (`fetch` rejects) → error surfaces, not an unhandled throw
- `src/lib/auth.ts` — `getToken/getUser` with corrupt JSON → null, session
  set/clear round-trip, `isAuthenticated`, `getAuthHeaders`, all safe when
  `window` is undefined (SSR path).
- `src/lib/domains.ts` — `isLanguagePath` (empty/undefined/non-language),
  `breadcrumbOf` (missing node → falls back to id), `childrenOf` name-sorted,
  `taxonomyOf` (new field wins, legacy `language`/`subject` fallback,
  neither → `["general"]`), `subjectNameOf`.
- `src/lib/format.ts` — `formatPercent` rounding, `formatDuration` at the
  60s/60m boundaries and exact-hour case, `formatExerciseType` underscores +
  empty string, `formatDelta` negative/zero/positive sign.
- `src/lib/exerciseTypes.ts` — every key maps to a non-empty i18n key; key set
  stays in sync with the server registry (mirror test against
  `api/src/domains.ts`).

**Backend (`api/src/`):**
- `expr.ts` (`expr.test.ts`) — parser precedence, unary minus, functions and
  their arity, unknown tokens → null, `evalExpr` division by zero and
  domain errors, `freeVariables`, `compileExpr` of garbage → null. Current
  expr coverage is 100% stmts via grading tests, so keep it green and extend
  for error/edge lines 187-188, 224, 227, 262-283.
- `grading.ts` (`grading.test.ts` — extend) — cover the remaining branches:
  lines 255-260 (upgrade path), 430-442, 468-473, 516-525 (escalation),
  540-585, 607-640. Specifically: malformed grading specs → `parseGradingSpec`
  defaults, and the "deterministic miss → escalate to semantic rung" wiring.
- `schemas.ts` — `subjectOf` (new vs legacy docs), `bankKeyOf`,
  `topicKeyOf`, and that each Zod schema rejects malformed input
  (safe-parse, not throw).
- `taxonomy.ts` — pure functions first: `slugify` (unicode, accents, casing),
  `relate` (identity/ancestor/descendant/sibling/disjoint), `transferPolicy`
  matrix. DB-touching functions (`seedTaxonomy`, `allNodes`, `matchSubject`,
  `ensureNode`, `bumpPathCount`) go in Phase 3 integration.
- `domains.ts` (api) — `isLanguagePath` parity with the client mirror,
  exercise-type/block-kind registries.
- `prompt-router.ts` — `pickNextType` (avoids `recent`, empty pool, unknown
  type), prompt builders return both system+user and interpolate the
  subject context. Pure, fast, high value.
- `llm.ts` — only if extractable pure logic exists; otherwise defer to Phase 3.
- `classify.ts` — `checkScope` and pure transforms; model calls deferred to
  Phase 3 with mocked `generateJSON`.
- `sources/` — extend the existing mock `sources.test.ts` to lift
  `gutenberg` (0%), `wikisource` (14%), `academic` (8%): stub `http.get` and
  assert parsing/citation behavior; keep the live suite opt-in via
  `LIVE_SOURCES=1`.

### Phase 2 — Integration tests, React components + MSW (DONE)

Cover one critical flow per component: render + happy path, loading, error
(MSW 500 → error UI, no crash), empty (`[]` → empty-state copy), and the main
user interaction (assert DOM change and that the correct request hit the
network).

- `src/components/answers/` — the grading surface is the product's core:
  `ChoiceAnswer`, `TextAnswer`, `MathInput`, `OrderAnswer`, `SetAnswer`,
  `AnswerArea`. Test submit → correct/wrong feedback, disabled during
  submission, keyboard interaction in `OrderAnswer`.
- `src/components/LearnPage.tsx` — path render, module navigation, exercise
  draw + answer + explain flow against mocked endpoints.
- `src/components/ExercisesPage.tsx` — topic picker → exercise list → grade.
- `src/components/VocabularyPage.tsx` — list, add, enrich, delete, empty and
  error states.
- `src/components/SettingsPage.tsx` — prefs load, save, persistence calls.
- `src/components/GoalsPage.tsx` — create goal, delete, streak display.
- `src/components/ScopingQuiz.tsx` + `PathRoadmap.tsx` — scope → roadmap flow.
- `src/components/SpeakPage.tsx` — transcript + grade flow (mock TTS endpoints).
- `src/components/DashboardContent.tsx` + `StatsOverview.tsx` + `StatTile.tsx`
  — stats loading/empty/error and `format` helpers integration.
- `src/components/LoginModal.tsx` + `AuthGuard.tsx` — auth gate, logout clears
  session, redirect when unauthenticated.
- `src/components/CalibrationFlow.tsx` — extend past the static-copy tests to
  interactive: answer a question → next stage request, skip, complete.

**MSW handlers:** one `tests/handlers.ts` per feature area, never
duplicated. Handlers mirror the routes in `api/src/app.ts`.

### Phase 3 — API integration (Elysia request/response contracts) (DONE)

Small refactor first: extract the Elysia `app` construction from `index.ts`
into `api/src/app.ts` and export it, keeping `.listen()` in `index.ts` only
when run as the entrypoint. Then test `app.handle(new Request(...))` with:

- DB mocked (in-memory `bun:sqlite` shim or a `vi.spyOn` on `db.ts`
  collections) and LLM calls mocked (`generateJSON` spy).
- Cover the routes with real logic and no external calls:
  `/api/health`, `/api/goals` CRUD, `/api/preferences`,
  `/api/progress`, `/api/stats/*`, `/api/taxonomy/*`.
- Auth: 401 without a valid token on protected routes; 200 with one.
- Validation: Zod failures → 400 with shape, not 500.
- For LLM/TTS routes (`/api/path/generate`, `/api/exercises/generate`,
  `/api/speak/*`), assert request/response contract with the model spy
  returning fixtures, including the 500 fallback paths.

### Phase 4 — E2E (Playwright, app must be running)

Five critical journeys in `tests/e2e/`, seed state via the API/DB, specs
independent:

1. `auth.spec.ts` — Google sign-in → dashboard renders.
2. `calibration.spec.ts` — new path: calibration → roadmap generated.
3. `exercise.spec.ts` — draw an exercise, answer, see grade + explain.
4. `speak.spec.ts` — speak practice end-to-end (TTS/transcribe mocked or
   stubbed at the network level).
5. `settings.spec.ts` — change preference, reload, persists.

Config: `bunx playwright test` against `astro dev --background` + the API.

## 4. Sequencing and ownership

| Step | Effort | Depends on |
|------|--------|------------|
| Fix baseline (`bun install`), add test setup file | S | DONE |
| Phase 1 unit tests (lib + api pure logic) | L | DONE |
| Phase 2 component integration | L | DONE |
| Phase 3 API app refactor + contract tests | M | DONE |
| Phase 4 E2E | M | running app, `astro dev --background` |

Write tests alongside features from here on (template rule: a feature is not
done until its tests exist and pass).

## 5. Definition of done

- [ ] `bun test` runs clean: 0 failures, live suites skipped by default
- [ ] `bun test --coverage` for newly touched files: no obviously untested
      branches; `src/lib/*` and `api/src` pure modules at ~80%+
- [ ] Every new function/component has happy + error + edge coverage
- [ ] MSW for network, `userEvent` for interaction, no `fireEvent`
- [ ] No `any`, no emojis, no giant snapshots
- [ ] `bun run typecheck && bun run lint && bun test` all pass
- [ ] Playwright journeys pass against a live dev server (Phase 4)
- [ ] Committed as `test:` conventional commits

## 6. Open decisions

1. **API app export refactor** (Phase 3): refactor `index.ts` to export the
   app. Approved? Alternative: skip Phase 3, rely on Phase 1 unit tests.
2. **Coverage gate**: adopt a hard threshold in CI (proposal: 60% statements
   project-wide, 80% on new code) or keep it advisory for now.
3. **E2E scope**: confirm the 5 journeys; TTS/transcribe in the speak journey
   hits a paid backend — mock it at the network layer or run against a stub?
4. **DOM environment**: happy-dom chosen for speed; switch to jsdom only if a
   component needs APIs happy-dom lacks.
