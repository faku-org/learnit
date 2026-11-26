---
type: technical
author: Ether
created: 2026-08-03
tags: [testing, qa, agents, template, vitest, playwright, msw]
priority: high
---

# TESTING.md — AI Agent Test Generation Guide

> Instructions for AI coding agents (OpenCode, Claude Code, Codex, Cursor) asked
> to write, extend, or fix the automated test suite of this project.
>
> **How to use:** copy this file into the repo root (or keep it in the vault and
> reference it) so any agent has it in context. The agent reads this file,
> completes the Project Context section from the actual codebase, then writes
> tests following the rules below. This file is a technical artifact — keep it
> in English.

---

## 1. Project Context (complete per project)

| Field | Value |
|-------|-------|
| Project name | |
| App type | (SPA / API / full-stack / library) |
| Frontend | (React 19 / Astro / none) |
| Backend | (Elysia / none / other) |
| Test runner | (Vitest / bun:test) |
| Existing tests? | (none / partial / full — check `test` script in package.json) |
| Test command | (`bun run test` / other — always verify in package.json) |

Before writing any test, run these and record results:

```bash
bun run test -- --run        # or the project's test command; if it errors on
                             # missing config, that's the FIRST task: set it up
bun run typecheck            # tsc --noEmit — tests must compile
bun run lint                 # oxlint — new test files must pass
```

## 2. Non-negotiables

- **Bun, never npm.** Install, run, and script everything with Bun.
- **TypeScript strict.** Test files are `.ts`/`.tsx`, fully typed, no `any`.
- **Tests are written during implementation, not after.** A feature is not done
  until its tests exist and pass.
- **TDD when the project uses it:** strict RED → GREEN → REFACTOR. Write the
  failing test first, watch it fail for the right reason, then implement.
- **No emojis** in code, test names, or output.
- **Don't change the stack.** If the project already has a test setup, use it.
  Never add a second test runner or framework.
- **Don't modify source code to make tests pass** unless the test exposes a
  real bug — then fix the bug (root cause, not symptom) and keep the test.
- **No snapshots of large DOM trees or full components** — they are brittle and
  obscure intent. Inline expected values instead.

## 3. Test stack (Faku/Ether defaults)

| Level | Tool |
|-------|------|
| Runner / assertions | Vitest (or `bun:test` if the project uses it) |
| DOM matchers | `@testing-library/jest-dom` |
| React rendering | `@testing-library/react` |
| User interaction | `@testing-library/user-event` (never `fireEvent` for new tests) |
| Network mocking | MSW (`msw`) — mock at the HTTP layer, never mock fetch inline |
| Mocking | `vi.fn()` / `vi.spyOn()` — only for seams that can't run for real |
| E2E | Playwright (`@playwright/test`) — only for projects with a running app |
| Coverage | `@vitest/coverage-v8`, threshold per project |

Install everything with:

```bash
bun add -d vitest @vitest/coverage-v8 @testing-library/react \
  @testing-library/jest-dom @testing-library/user-event msw
bunx playwright install chromium      # only if the project needs E2E
```

## 4. Testing pyramid — what to write where

```
        / E2E  \        few — critical user journeys only (login, checkout,
       / ------- \           the 3 flows that losing would hurt most)
      / Integration \    some — a feature's behavior with real rendering
     / -------------- \      and mocked network
    /  Unit  \/ Unit  \  many — pure logic: validators, transforms, helpers,
   --------------------      hooks, state reducers, API client edge cases
```

Rule of thumb: **80% unit, 15% integration, 5% E2E.** If a test needs a
database, real network, or a running server, it does not belong in unit tests.

## 5. Directory conventions

```
src/
├── components/
│   └── Button/
│       ├── Button.tsx
│       └── Button.test.tsx        # colocated with the code
├── lib/
│   ├── format.ts
│   └── format.test.ts
└── __mocks__/                     # MSW handlers (per feature or shared)
    └── handlers.ts
tests/
└── e2e/                           # Playwright specs (only if E2E is in scope)
    └── auth.spec.ts
```

- **Unit tests:** colocated next to the code (`Button.test.tsx`).
- **MSW handlers:** one `handlers.ts` per feature or a shared one — never
  duplicate the same endpoint handler in two files.
- **E2E specs:** under `tests/e2e/`, named `<flow>.spec.ts`.

## 6. What to test, by level

### Unit tests (pure logic, hooks, utilities)

Every function with logic (not trivial pass-throughs) gets tests covering:

1. **Happy path** — the main use case with typical input.
2. **Edge cases** — empty string, `null`/`undefined`, `0`, max-length,
   unicode/special chars, negative numbers, malformed input.
3. **Errors** — what the function throws/returns on invalid input; HTTP 400/404
   handling in API clients (including non-JSON error bodies).
4. **Boundaries** — off-by-one at limits (e.g. pagination, slicing, validation
   thresholds).

```ts
// format.test.ts — example shape (adjust to the codebase)
import { describe, expect, it } from "vitest";
import { formatCurrency } from "./format";

describe("formatCurrency", () => {
  it("formats positive amounts with 2 decimals", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });
  it("handles zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });
  it("throws on NaN", () => {
    expect(() => formatCurrency(Number.NaN)).toThrow();
  });
});
```

### Integration tests (React components with MSW)

Per feature, the most important user flows:

1. **Render + happy path** — component renders its data from a mocked API
   response.
2. **Loading state** — skeleton/loader shows before the response resolves.
3. **Error state** — MSW returns 500; component shows the error UI, not a
   crash.
4. **Empty state** — API returns `[]`; component shows the empty-state copy.
5. **User interaction** — click a button, submit a form, toggle a switch; assert
   the resulting DOM change and that the right request hit the network.

```tsx
// Feature.test.tsx — example shape (adjust to the codebase)
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Feature } from "./Feature";

describe("Feature", () => {
  it("shows the empty state when the API returns no items", async () => {
    render(<Feature />);
    expect(await screen.findByText("No items yet")).toBeInTheDocument();
  });
  it("submits the form and reflects the result", async () => {
    const user = userEvent.setup();
    render(<Feature />);
    await user.type(screen.getByLabelText("Name"), "Ether");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved Ether")).toBeInTheDocument();
  });
});
```

Rules for integration tests:

- Use `userEvent.setup()` — never `fireEvent` for new tests.
- Prefer queries by role/label/text: `getByRole`, `getByLabelText`,
  `findByText`. No `data-testid` unless there is genuinely no accessible query.
- Use `findBy*` for anything that appears after async resolution; use
  `waitFor` sparingly.
- Mock **network** with MSW, not the module that calls the network.

### E2E tests (Playwright, only when the app runs)

1. Pick the **3–5 critical journeys** (auth, primary feature, data entry,
   settings persistence).
2. Each spec: `test.describe` per flow, `test` per step or per assertion group.
3. Seed state through the API/database, not through the UI, where possible.
4. Keep specs independent — no test depends on another test's side effects.

## 7. MSW setup (integration tests)

```ts
// src/__mocks__/handlers.ts
import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("/api/items", () => HttpResponse.json([{ id: 1, name: "A" }])),
  http.post("/api/items", async ({ request }) => {
    const body = (await request.json()) as { name?: string };
    if (!body?.name) {
      return HttpResponse.json({ error: "name required" }, { status: 400 });
    }
    return HttpResponse.json({ id: 2, name: body.name }, { status: 201 });
  }),
];
```

Wire it in a test setup file (`src/test/setup.ts`) referenced by the Vitest
config: `beforeAll(server.listen)` / `afterEach(server.resetHandlers)` /
`afterAll(server.close)`. Mock at the HTTP layer so the real API client code is
exercised.

## 8. TDD workflow (when the project uses TDD)

```
RED     write ONE failing test → run it → it fails for the right reason
GREEN   minimal code to pass → run it → it passes
REFACTOR clean up → run the full suite → still green
```

- One behavior per test, one test per behavior. Name describes behavior
  (`"formats positive amounts"`), never implementation (`"calls toFixed"`).
- If a test passes on the first run without having failed first, it tests the
  wrong thing — rewrite it.
- If the suite fails after a refactor, undo the refactor and take smaller
  steps.

## 9. Commands

```bash
bun run test                # run the suite once (watch in dev)
bun run test -- --coverage  # coverage report
bun run test -- --run src/lib/format.test.ts   # single file
bunx playwright test        # E2E suite (if configured)
bun run typecheck && bun run lint && bun run test   # full gate
```

Always verify the actual scripts in `package.json` — if they differ, use the
project's own commands and note the difference in the Project Context table.

## 10. Definition of done for testing work

- [ ] Test runner configured; `bun run test` runs clean
- [ ] Every new function/component has tests
- [ ] Happy path + error paths + edge cases covered per section 6
- [ ] MSW used for network, `userEvent` for interaction
- [ ] No `any`, no emojis, no giant snapshots
- [ ] `bun run test` + `bun run typecheck` + `bun run lint` all pass
- [ ] Coverage of the touched code is reasonable (per project threshold) —
      at minimum, no obviously untested branches in new code
- [ ] Tests committed with the feature (conventional commit: `test:` prefix
      for pure test work)

## 11. Anti-patterns — never do these

- Testing implementation details (internal function calls, component state
  shape) instead of observable behavior.
- Mocking the thing under test (e.g. mocking the API client you're testing).
- `fireEvent` instead of `userEvent` (misses real-event semantics).
- Giant inline snapshots or snapshotting whole component trees.
- Asserting on timers, random values, or dates without deterministic control
  (`vi.useFakeTimers`, `vi.setSystemTime`).
- Writing tests that pass only because they never fail — every test must be
  able to fail.
- Sleeping (`await new Promise(...)`) instead of `findBy*`/`waitFor`.
- Skipping a failing test with `it.skip` / `test.skip` to make CI green —
  fix it or report it.
