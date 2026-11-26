import { ObjectId, type Db } from "mongodb";
import { exerciseBank } from "./db/bank";
import { forUser } from "./db/scoped";
import { generateJSON, validateExercise } from "./llm";
import { isLanguagePath, type BlockKind, type ExerciseType } from "./domains";
import { sanitizeBlocks } from "./blocks";
import { parseGradingSpec } from "./grading";
import { resolveSourceBlocks } from "./sources";
import { classifySubject, classificationFor, buildSubjectContext } from "./classify";
import { exercisePrompt, pickNextType, type SubjectContext } from "./prompt-router";
import { topicKeyOf } from "./schemas";

/**
 * Serving the next exercise of a topic.
 *
 * Generating an exercise is two to four sequential calls to a reasoning model (write, validate, verify sources,
 * sometimes write again): tens of seconds. That must never sit inside the request a student is waiting on, so
 * the feed splits the two things apart:
 *
 *  - CACHED: an exercise already in the shared bank that the student has not seen (or an SRS card that is due)
 *    is claimed and returned at once.
 *  - GENERATING: the bank has nothing for this student. A background job is started (or joined) and the answer
 *    is "generating, ask again in a moment". The client polls; the first exercise the job stores is claimed.
 *
 * Every served exercise also tops the bank up in the background, so the next ones are already there while the
 * student is solving the current one.
 */

/** Unseen exercises to keep ready per student and topic. */
export const PREFETCH_TARGET = 2;
export const RETRY_AFTER_MS = 1500;

export type FeedInput = {
  userId: string;
  subject: string;
  taxonomyLeaf?: string;
  bankKey?: string;
  topic: string;
  level: string;
  nativeLanguage: string;
};

export type FeedResult =
  | { status: "ready"; delivery: "cached" | "srs"; exercise: Record<string, unknown> }
  | { status: "generating"; retryAfterMs: number };

type GenerationParams = {
  db: Db;
  level: string;
  topic: string;
  type: ExerciseType;
  difficultyNote?: string;
};

/** What the feed needs from the outside world; replaced in tests so no model is called. */
export type FeedDeps = {
  generateExercise: (ctx: SubjectContext, params: GenerationParams) => Promise<Record<string, unknown>>;
};

// ── Generated content, rebuilt before it is stored ────────────────────────────

/**
 * A generated exercise with its two structured fields re-read from a whitelist.
 *
 * Everything else the model returned is prose and is stored as-is, as it always
 * has been. `blocks` and `grading` are different: blocks are rendered, exercises
 * are SHARED ACROSS USERS, and a generator that could emit markup would be
 * stored XSS against everyone who later draws the exercise. So the stored block
 * array is rebuilt field by field rather than passed through, and a grading spec
 * that does not typecheck is dropped so the legacy fields grade it instead of a
 * half-formed one.
 */
export function safeExerciseFields(
  raw: Record<string, unknown>,
  spec: { blocks: BlockKind[] },
  resolvedBlocks?: unknown,
): Record<string, unknown> {
  const { blocks, grading, ...rest } = raw;
  const cleanBlocks = sanitizeBlocks(resolvedBlocks ?? blocks, spec.blocks);
  const cleanGrading = parseGradingSpec(grading);
  return {
    ...rest,
    ...(cleanBlocks.length > 0 ? { blocks: cleanBlocks } : {}),
    ...(cleanGrading ? { grading: cleanGrading } : {}),
  };
}

/** Exercise types whose question is unanswerable without the source it cites. */
const SOURCE_DEPENDENT: ReadonlySet<string> = new Set(["source_analysis", "reading_comprehension"]);

/**
 * Retrieve and verify every source the generator proposed.
 *
 * The generator is never trusted for a citation: asked for a primary source it
 * will invent one with a plausible attribution, and telling it not to does not
 * work. So each claim is resolved against a real corpus and the block is either
 * rewritten with the retrieved text or dropped.
 *
 * The returned `lostItsSource` flag is what drives regeneration: an exercise
 * that asks the student to read a passage is worthless once the passage is gone.
 */
export async function verifySources(
  db: Db,
  exercise: Record<string, unknown>,
  ctx: SubjectContext,
  type: string,
): Promise<{ blocks: unknown[]; lostItsSource: boolean }> {
  const outcome = await resolveSourceBlocks(db, exercise.blocks, ctx.spec, ctx.nativeLanguage)
    .catch(() => null);
  if (!outcome) {
    return { blocks: Array.isArray(exercise.blocks) ? exercise.blocks : [], lostItsSource: false };
  }
  return {
    blocks: outcome.blocks,
    lostItsSource:
      SOURCE_DEPENDENT.has(type) && outcome.proposed > 0 && outcome.verified === 0,
  };
}

export function computeDifficultyNote(recentScores: number[], bias: number): string | undefined {
  if (recentScores.length === 0) return undefined;
  const avg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
  const adjusted = avg + bias * 0.2;
  if (adjusted < 0.5)
    return "Generate an easier exercise: simpler vocabulary, shorter sentences, very common structures.";
  if (adjusted > 0.85)
    return "Generate a harder exercise: complex vocabulary, idiomatic expressions, nuanced grammar.";
  return undefined;
}

/** The slow part: write, validate, verify sources, rewrite once if the source was lost. */
export const defaultDeps: FeedDeps = {
  async generateExercise(ctx, { db, level, topic, type, difficultyNote }) {
    const built = exercisePrompt(ctx, { level, topic, type, difficultyNote });
    let exercise = await generateJSON<Record<string, unknown>>(built.system, built.user, {
      temperature: 0.9,
      maxTokens: 2048,
    });

    // Validate: correct in-place if fixable, regenerate once if not
    const validation = await validateExercise(exercise, ctx.subject, level, topic);
    if (!validation.valid) {
      if (validation.corrected) {
        exercise = { ...exercise, ...validation.corrected };
      } else {
        const retry = exercisePrompt(ctx, { level, topic, type });
        exercise = await generateJSON<Record<string, unknown>>(retry.system, retry.user, {
          temperature: 0.7,
          maxTokens: 2048,
        });
      }
    }

    // Retrieve and verify every cited source. A citation the generator invented
    // fails here and its block is dropped; if that leaves a source-dependent
    // exercise with nothing to read, the exercise is written once more rather
    // than served as an unanswerable question.
    let sources = await verifySources(db, exercise, ctx, type);
    if (sources.lostItsSource) {
      const retry = exercisePrompt(ctx, { level, topic, type });
      const regenerated = await generateJSON<Record<string, unknown>>(retry.system, retry.user, {
        temperature: 0.7,
        maxTokens: 2048,
      }).catch(() => null);
      if (regenerated) {
        const retrySources = await verifySources(db, regenerated, ctx, type);
        // Only accept the second attempt if it actually did better; otherwise
        // keep the first, which at least had a validated question.
        if (!retrySources.lostItsSource) {
          exercise = regenerated;
          sources = retrySources;
        }
      }
    }
    return safeExerciseFields(exercise, ctx.spec, sources.blocks);
  },
};

/** Tests swap the generator so no model is called; `null` restores the real one. */
let activeDeps: FeedDeps = defaultDeps;
export function setFeedDeps(deps: FeedDeps | null): void {
  activeDeps = deps ?? defaultDeps;
}

// ── Single flight ─────────────────────────────────────────────────────────────

type Job = {
  running: boolean;
  /** A student was told "generating" against this job, so a failure is theirs to hear about. */
  waited: boolean;
  error: unknown;
  done: Promise<void>;
};

/** One generation job per topic: the bank is shared, so two students asking at once must not pay twice. */
const jobs = new Map<string, Job>();
/** Per student and topic: claiming an exercise (pick + write the SRS card) is one step, or two tabs get the same one. */
const claimLocks = new Map<string, Promise<unknown>>();

/** Resolves when every generation job has finished. For tests and graceful shutdown. */
export async function whenIdle(): Promise<void> {
  for (;;) {
    const running = [...jobs.values()].filter((j) => j.running);
    if (running.length === 0) return;
    await Promise.allSettled(running.map((j) => j.done));
  }
}

export function resetFeedState(): void {
  jobs.clear();
  claimLocks.clear();
}

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = claimLocks.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);
  claimLocks.set(key, run);
  try {
    return await run;
  } finally {
    if (claimLocks.get(key) === run) claimLocks.delete(key);
  }
}

type Resolved = {
  ctx: SubjectContext;
  classification: Awaited<ReturnType<typeof classificationFor>>;
  bank: string;
  topicKey: string;
};

async function resolveTopic(db: Db, input: FeedInput): Promise<Resolved> {
  const classification = input.taxonomyLeaf
    ? await classificationFor(db, input.taxonomyLeaf)
    : await classifySubject(db, input.subject, "");
  const ctx = await buildSubjectContext(db, {
    subject: input.subject,
    taxonomy: classification.taxonomy,
    nativeLanguage: input.nativeLanguage,
  });
  const bank = input.bankKey ?? classification.taxonomyLeaf;
  return { ctx, classification, bank, topicKey: topicKeyOf(bank, input.topic, input.level) };
}

// ── Claiming ──────────────────────────────────────────────────────────────────

function toObjectIds(ids: string[]): ObjectId[] {
  return ids.flatMap((id) => {
    try {
      return [new ObjectId(id)];
    } catch {
      return [];
    }
  });
}

const byRecency = <T extends Record<string, unknown>>(docs: T[]): T[] =>
  [...docs].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));

type SeenState = { seenIds: ObjectId[]; recent: Record<string, unknown>[] };

async function seenState(db: Db, userId: string, topicKey: string): Promise<SeenState> {
  const cards = await forUser(db, userId).of("user_exercises").find({ topicKey }).toArray();
  return {
    seenIds: toObjectIds(cards.map((c) => String(c.exerciseId))),
    recent: byRecency(cards).slice(0, 10),
  };
}

const typesOf = (recent: Record<string, unknown>[]): string[] =>
  recent.map((c) => c.exerciseType as string).filter(Boolean);

const unseenFilter = (seenIds: ObjectId[]) => (seenIds.length > 0 ? { _id: { $nin: seenIds } } : {});

const withId = (doc: Record<string, unknown>) => ({ ...doc, _id: String(doc._id) });

/** The exercise to serve now, if the student can have one without anything being generated. */
async function claim(db: Db, input: FeedInput, topic: Resolved): Promise<FeedResult | null> {
  const cards = forUser(db, input.userId).of("user_exercises");
  const bank = exerciseBank(db);
  const now = new Date().toISOString();

  // 1. Due SRS cards. A card with lastScore -1 is the placeholder written when an exercise is first served,
  // so a still-unanswered exercise is not re-served as if it were due for review.
  const dueCard = await cards.findOne(
    { topicKey: topic.topicKey, dueDate: { $lte: now }, lastScore: { $ne: -1 } },
    { sort: { dueDate: 1 } },
  );
  if (dueCard) {
    const [oid] = toObjectIds([String(dueCard.exerciseId)]);
    const ex = oid ? await bank.findOne({ _id: oid }) : null;
    if (ex) {
      return {
        status: "ready",
        delivery: "srs",
        exercise: { ...withId(ex), _srs: { dueDate: dueCard.dueDate, interval: dueCard.interval } },
      };
    }
  }

  // 2. An exercise from the bank this student has not seen: the rotated type first, any type otherwise.
  const { seenIds, recent } = await seenState(db, input.userId, topic.topicKey);
  const unseen = unseenFilter(seenIds);
  const preferred = pickNextType(topic.ctx.spec, typesOf(recent));
  const found =
    (await bank.findOne({ topicKey: topic.topicKey, type: preferred, ...unseen })) ??
    (await bank.findOne({ topicKey: topic.topicKey, ...unseen }));
  if (!found) return null;

  // The card is written at once so the next call does not pick the same exercise.
  await cards.insertOne({
    exerciseId: String(found._id),
    exerciseType: found.type,
    topicKey: topic.topicKey,
    ease: 2.5,
    interval: 0,
    repetitions: 0,
    dueDate: now,
    lastScore: -1,
    updatedAt: now,
  });
  return { status: "ready", delivery: "cached", exercise: withId(found) };
}

// ── Generation ────────────────────────────────────────────────────────────────

/** Store `count` more exercises for the topic. Each is in the bank, claimable, the moment it is written. */
async function generateInto(
  db: Db,
  input: FeedInput,
  topic: Resolved,
  count: number,
  deps: FeedDeps,
): Promise<void> {
  const scoped = forUser(db, input.userId);
  const bank = exerciseBank(db);
  const { ctx, classification } = topic;

  const prefs = await scoped.of("preferences").findOne({});
  const bias = (prefs?.difficultyBias as number) ?? 0;
  const { seenIds, recent } = await seenState(db, input.userId, topic.topicKey);
  const recentScores = recent.map((d) => d.lastScore as number).filter((s) => s >= 0);
  const difficultyNote = computeDifficultyNote(recentScores, bias);

  // Types already in the pipeline count too, so a batch rotates instead of repeating one type.
  const pool = await bank.find({ topicKey: topic.topicKey, ...unseenFilter(seenIds) }).toArray();
  const types = [...pool.map((d) => d.type as string), ...typesOf(recent)];

  for (let i = 0; i < count; i++) {
    const type = pickNextType(ctx.spec, types);
    types.push(type);
    const generated = await deps.generateExercise(ctx, {
      db,
      level: input.level,
      topic: input.topic,
      type,
      difficultyNote,
    });
    const createdAt = new Date().toISOString();
    await bank.insertOne({
      subject: input.subject,
      language: isLanguagePath(classification.taxonomy) ? input.subject : null,
      taxonomy: classification.taxonomy,
      taxonomyLeaf: classification.taxonomyLeaf,
      level: input.level,
      topic: input.topic,
      bankKey: topic.bank,
      topicKey: topic.topicKey,
      tags: [input.topic.toLowerCase(), type, classification.taxonomyLeaf, input.level],
      ...generated,
      validatedAt: createdAt,
      createdAt,
    });
  }
}

/** Start the topic's generation job, or join the one already running. */
function ensureJob(
  db: Db,
  input: FeedInput,
  topic: Resolved,
  count: number,
  deps: FeedDeps,
  waited: boolean,
): void {
  const existing = jobs.get(topic.topicKey);
  if (existing?.running) {
    if (waited) existing.waited = true;
    return;
  }
  const job: Job = { running: true, waited, error: null, done: Promise.resolve() };
  job.done = generateInto(db, input, topic, count, deps)
    .catch((err) => {
      job.error = err;
      console.error(`exercise generation failed (${topic.topicKey}):`, err);
    })
    .finally(() => {
      job.running = false;
      // A failure nobody was waiting on is not worth remembering.
      if (!job.error || !job.waited) jobs.delete(topic.topicKey);
    });
  jobs.set(topic.topicKey, job);
}

/** Unseen exercises this student still has in the bank for the topic. */
async function readyCount(db: Db, userId: string, topic: Resolved): Promise<number> {
  const { seenIds } = await seenState(db, userId, topic.topicKey);
  return exerciseBank(db).countDocuments({ topicKey: topic.topicKey, ...unseenFilter(seenIds) });
}

/**
 * The next exercise for a student on a topic.
 *
 * Returns at once, never waits for a model: either an exercise ("ready") or "generating". Throws only when a
 * generation a student was already waiting on has failed.
 */
export async function nextExercise(
  db: Db,
  input: FeedInput,
  deps: FeedDeps = activeDeps,
): Promise<FeedResult> {
  const topic = await resolveTopic(db, input);

  const failed = jobs.get(topic.topicKey);
  if (failed && !failed.running && failed.error) {
    jobs.delete(topic.topicKey);
    throw failed.error;
  }

  const claimed = await withLock(`${input.userId}:${topic.topicKey}`, () => claim(db, input, topic));

  if (claimed) {
    // Top the bank up behind the student: the next exercises are being written while this one is solved.
    const ready = await readyCount(db, input.userId, topic);
    if (ready < PREFETCH_TARGET) ensureJob(db, input, topic, PREFETCH_TARGET - ready, deps, false);
    return claimed;
  }

  ensureJob(db, input, topic, PREFETCH_TARGET, deps, true);
  return { status: "generating", retryAfterMs: RETRY_AFTER_MS };
}
