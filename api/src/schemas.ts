import { z } from "zod";

// === Taxonomy-aware subject identity ===
//
// `language` is superseded by `subject` plus a taxonomy lineage, but nothing
// reads the old field directly any more: `subjectOf` supplies the fallback so
// documents written before the migration keep resolving untouched.

export const CalibrationLevelSchema = z.enum([
  "complete_beginner",
  "some_basics",
  "elementary",
  "intermediate",
]);

export const SubjectSchema = z.object({
  subject: z.string().min(1),
  /** Root-to-leaf taxonomy ids, e.g. ["social_science","economics","macroeconomics"]. */
  taxonomy: z.array(z.string().min(1)).min(1),
  /** Denormalized last element of `taxonomy`, indexed for cheap filtering. */
  taxonomyLeaf: z.string().min(1),
});

export type SubjectIdentity = z.infer<typeof SubjectSchema>;

/** A path document as stored, tolerating pre-migration shapes. */
type LegacyPathLike = {
  subject?: string;
  language?: string;
  taxonomy?: string[];
  taxonomyLeaf?: string;
};

/**
 * Subject identity for a stored path, whether or not the migration has run.
 * A pre-migration language path resolves to the same taxonomy the migration
 * would have written, so the script is an optimization rather than a
 * prerequisite.
 */
export function subjectOf(path: LegacyPathLike): SubjectIdentity {
  const subject = path.subject ?? path.language ?? "General";
  if (path.taxonomy && path.taxonomy.length > 0) {
    return {
      subject,
      taxonomy: path.taxonomy,
      taxonomyLeaf: path.taxonomyLeaf ?? path.taxonomy[path.taxonomy.length - 1],
    };
  }
  const leaf = (path.language ?? subject).toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return { subject, taxonomy: ["language", leaf], taxonomyLeaf: leaf };
}

/**
 * Which partition of the shared exercise bank a path draws from.
 *
 * Deliberately NOT the taxonomy leaf. A path created as "aleman" has a bank full
 * of `aleman:...` keys but classifies to the node `german`; deriving the key
 * from the leaf would silently orphan every exercise already generated for it.
 * So the bank key is pinned once, at creation, and never recomputed.
 *
 * New paths pin it to the taxonomy leaf, so everyone studying German shares one
 * bank whatever they typed. Pre-existing paths keep the name they were created
 * with, which is what their stored keys were built from.
 */
export function bankKeyOf(path: LegacyPathLike & { bankKey?: string }): string {
  if (path.bankKey) return path.bankKey;
  const legacy = path.language ?? path.subject;
  if (legacy) return legacy.toLowerCase();
  return subjectOf(path).taxonomyLeaf;
}

/**
 * Shared-bank key for an exercise. Unchanged in shape from the original
 * `${language}:${topic}:${level}`.
 */
export function topicKeyOf(bankKey: string, topic: string, level: string): string {
  return `${bankKey.toLowerCase()}:${topic.toLowerCase()}:${level}`;
}

// === Goal ===
export const GoalSchema = z.object({
  language: z.string().min(1, "Language is required"),
  objective: z.string().min(1, "Objective is required"),
  timeframe: z.string().optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  active: z.boolean().default(true),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Goal = z.infer<typeof GoalSchema>;

// === Module (part of the learning path) ===
export const ModuleSchema = z.object({
  goalId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  order: z.number(),
  status: z.enum(["locked", "available", "completed"]).default("locked"),
});

export type Module = z.infer<typeof ModuleSchema>;

// === Topic (within a module) ===
export const TopicSchema = z.object({
  moduleId: z.string(),
  name: z.string(),
  order: z.number(),
  status: z.enum(["locked", "available", "completed"]).default("locked"),
});

export type Topic = z.infer<typeof TopicSchema>;

// === Exercise ===
export const ExerciseSchema = z.object({
  topicId: z.string().optional(),
  type: z.enum(["multiple_choice", "fill_blank", "translation", "matching", "speaking"]),
  question: z.string(),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string(),
  hint: z.string().optional(),
  explanation: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  createdAt: z.string().optional(),
});

export type Exercise = z.infer<typeof ExerciseSchema>;

// === Session ===
export const SessionSchema = z.object({
  date: z.string(),
  exercisesCompleted: z.number().default(0),
  exercisesCorrect: z.number().default(0),
  duration: z.number().default(0),
  topics: z.array(z.string()).default([]),
});

export type Session = z.infer<typeof SessionSchema>;

// === Streak ===
export const StreakSchema = z.object({
  currentStreak: z.number().default(0),
  longestStreak: z.number().default(0),
  lastSessionDate: z.string().nullable().default(null),
});

export type Streak = z.infer<typeof StreakSchema>;

// === Vocabulary ===
export const VocabularySchema = z.object({
  word: z.string(),
  meaning: z.string(),
  language: z.string(),
  notes: z.string().optional(),
  context: z.string().optional(),
  createdAt: z.string().optional(),
});

export type Vocabulary = z.infer<typeof VocabularySchema>;

// === Attempt (append-only log of every answered exercise) ===
//
// Every field added after the original seven is optional with a default, so
// documents written before the taxonomy work still parse and the existing stats
// aggregation still reads them.
export const AttemptSchema = z.object({
  userId: z.string(),
  pathId: z.string().nullable().default(null),
  moduleIndex: z.number(),
  topicIndex: z.number(),
  topicName: z.string().default(""),
  moduleName: z.string().default(""),
  exerciseId: z.string(),
  exerciseType: z.string().default("unknown"),
  pass: z.number().default(1),
  outcome: z.enum(["correct", "wrong", "gave_up"]),
  durationMs: z.number().default(0),
  points: z.number().default(0),
  createdAt: z.string(),

  /** Named concepts this attempt exercised. Populated from the exercise. */
  conceptIds: z.array(z.string()).default([]),
  /** MindVault `certeza`, 1-4. Null when the student was not asked. */
  confidence: z.number().min(1).max(4).nullable().default(null),
  gradingMode: z.string().default("exact"),
  /** Partial credit, 0-1. Binary outcomes record 1 or 0. */
  score: z.number().min(0).max(1).default(0),
  examId: z.string().nullable().default(null),

  /** MindVault "contexto": the situation this memory was formed in. */
  context: z
    .object({
      sessionPosition: z.number(),
      timeOfDay: z.number().min(0).max(23),
      daysSinceTopicFirstSeen: z.number(),
      afterGiveUp: z.boolean(),
      inExam: z.boolean(),
    })
    .optional(),
});

export type Attempt = z.infer<typeof AttemptSchema>;

// === Topic session (one pass over a topic; a "lesson" run) ===
export const TopicSessionSchema = z.object({
  userId: z.string(),
  pathId: z.string().nullable().default(null),
  moduleIndex: z.number(),
  topicIndex: z.number(),
  topicName: z.string().default(""),
  moduleName: z.string().default(""),
  pass: z.number().default(1),
  startedAt: z.string(),
  completedAt: z.string().nullable().default(null),
  total: z.number().default(0),
  correct: z.number().default(0),
  wrong: z.number().default(0),
  gaveUp: z.number().default(0),
  durationMs: z.number().default(0),
  points: z.number().default(0),
  errorsByType: z.record(z.string(), z.number()).default({}),
});

export type TopicSession = z.infer<typeof TopicSessionSchema>;

// === Preferences ===
export const PreferencesSchema = z.object({
  activePathId: z.string().nullable().default(null),
  nativeLanguage: z.string().default("english"),
});

export type Preferences = z.infer<typeof PreferencesSchema>;
