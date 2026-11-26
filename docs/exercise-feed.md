# Exercise feed (`GET /api/exercises/next`)

Implementation: `api/src/exercise-feed.ts`. Bank access: `api/src/db/bank.ts`.

## Why

Issue #8: the request generated the exercise synchronously (2-4 reasoning-model calls: generate,
validate, source verification, regeneration), so "Continuar aprendiendo" took >20s.

## Flow

1. Due SRS card (`user_exercises`, per-user via `forUser`) -> `delivery: "srs"`.
2. Unseen exercise in the shared bank (`exercises`, keyed by `topicKey`) -> `delivery: "cached"`; a
   placeholder card (`lastScore: -1`) marks it seen for that student.
3. Nothing available -> HTTP 202 `{ _status: "generating", retryAfterMs }`; a background job fills the bank
   (`PREFETCH_TARGET` exercises, rotating types). The client polls.
4. After every served exercise the bank is topped up in the background so the next one is already there.

## Guarantees

- One generation job per `topicKey` (single flight), however many students ask.
- A per-user claim lock: two concurrent requests never get the same exercise.
- Failures raise once to a student who was waiting; unwatched prefetch failures are dropped.
- The status key is `_status` (reserved; cannot collide with LLM fields). Ready replies carry `_delivery`.

## UI

`getNextExercise` (`src/lib/api.ts`) polls and calls `onGenerating` once; `LearnPage` shows
`learn.loadingExercise` or `learn.generatingExercise`.

## Known limits

- Topic advance starts cold (the client clears its queue; no cross-topic prefetch).
- The shared bank means prefetched content uses the triggering student's difficulty note.
