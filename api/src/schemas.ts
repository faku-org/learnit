import { z } from "zod";

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

// === Preferences ===
export const PreferencesSchema = z.object({
  activePathId: z.string().nullable().default(null),
  nativeLanguage: z.string().default("english"),
});

export type Preferences = z.infer<typeof PreferencesSchema>;
