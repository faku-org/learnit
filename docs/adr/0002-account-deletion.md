# ADR 0002 — Account deletion is real deletion

- **Status:** Proposed
- **Date:** 2026-10-12
- **Supersedes:** the append-only rule for `mastery_snapshots` in `docs/ARCHITECTURE-MINDVAULT.md` §8.2
  ("Never update, never delete"), for the case of an account being deleted.

## Context

The MindVault design makes mastery snapshots append-only so the history of what a student understood is never
rewritten. That is the right rule for the history **while the account exists**. It does not cover the user asking
to leave: LearnIt is a public product under the house Zero Data Policy, and "delete my account" has to mean the
data is gone.

## Decision

- `DELETE /api/me` removes the account and **every row the user owns**: all collections listed in
  `USER_COLLECTIONS` (`api/src/db/scoped.ts`: `attempts`, `feedback`, `goals`, `module_completions`, `paths`,
  `preferences`, `progress`, `streak`, `topic_sessions`, `user_exercises`, `vocabulary`), then the user, sessions
  and recovery codes.
- Confirmation: the user types their handle; an account with a password also sends the password.
- Any new per-user collection (including `mastery_snapshots` and the concept graph when they are built) is added to
  `USER_COLLECTIONS`. A collection that is not in that list is not deleted, so it is a bug to leave it out.
- Append-only still holds for everything else: no route updates or deletes a snapshot, and no job rewrites them.
- Shared content has no owner and stays: the exercise bank, taxonomy, verified sources. Exercises generated from a
  user's private material (RAG, later phases) are scoped to that user and are deleted with them.
- There is no soft delete and no retention window: backups age out on the backup schedule.

## Consequences

- Deletion cannot be undone. The UI says so and asks for the handle.
- A test creates two users with data in several collections, deletes one, and checks the other is untouched.
