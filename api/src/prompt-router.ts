// Single entry point for prompt construction.
//
// Routes on the resolved domain spec's prompt family. The `language` family
// calls the original builders with their original arguments, so a language path
// produces byte-identical prompts to what it produced before the taxonomy
// refactor. Every other family routes to prompts-general.ts.

import type {
  CalibrationLevel,
  CalibrationProbeLevel,
  ExerciseType,
  ModulePerformance,
} from "./domains";
import {
  CALIBRATION_SYSTEM_PROMPT,
  EXERCISE_SYSTEM_PROMPT,
  MODULE_TOPICS_SYSTEM_PROMPT,
  PATH_OUTLINE_SYSTEM_PROMPT,
  buildCalibrationStagePrompt,
  buildExercisePrompt,
  buildModuleTopicsPrompt,
  buildPathOutlinePrompt,
  type LanguageExerciseType,
} from "./prompts";
import {
  CALIBRATION_ITEM_SYSTEM_PROMPT,
  buildGeneralCalibrationStagePrompt,
  buildGeneralExercisePrompt,
  buildGeneralModuleTopicsPrompt,
  buildGeneralPathOutlinePrompt,
  generalExerciseSystemPrompt,
  generalModuleTopicsSystemPrompt,
  generalPathOutlineSystemPrompt,
  type SubjectContext,
} from "./prompts-general";

export type { SubjectContext };

/** A system prompt paired with the user prompt it belongs to. */
export type PromptPair = { system: string; user: string };

const isLanguage = (ctx: SubjectContext) => ctx.spec.promptFamily === "language";

// ── Path outline ──────────────────────────────────────────────────────────────

export function pathOutlinePrompt(
  ctx: SubjectContext,
  params: {
    objective: string;
    timeframe: string;
    moduleCount: number;
    startingLevel: CalibrationLevel;
    knownConcepts?: string[];
  },
): PromptPair {
  if (isLanguage(ctx)) {
    return {
      system: PATH_OUTLINE_SYSTEM_PROMPT,
      user: buildPathOutlinePrompt(
        ctx.subject,
        params.objective,
        params.timeframe,
        params.moduleCount,
        params.startingLevel,
      ),
    };
  }
  return {
    system: generalPathOutlineSystemPrompt(ctx.spec),
    user: buildGeneralPathOutlinePrompt(ctx, params),
  };
}

// ── Module topics ─────────────────────────────────────────────────────────────

export function moduleTopicsPrompt(
  ctx: SubjectContext,
  params: {
    objective: string;
    startingLevel: CalibrationLevel;
    module: { name: string; description?: string; focus?: string; order: number };
    previousModules: string[];
    nextModule: string | null;
    coveredTopics: string[];
    performance: ModulePerformance | null;
    assessmentGuidance?: string;
  },
): PromptPair {
  if (isLanguage(ctx)) {
    return {
      system: MODULE_TOPICS_SYSTEM_PROMPT,
      user: buildModuleTopicsPrompt({
        language: ctx.subject,
        objective: params.objective,
        startingLevel: params.startingLevel,
        module: params.module,
        previousModules: params.previousModules,
        nextModule: params.nextModule,
        coveredTopics: params.coveredTopics,
        performance: params.performance,
      }),
    };
  }
  return {
    system: generalModuleTopicsSystemPrompt(ctx.spec),
    user: buildGeneralModuleTopicsPrompt(ctx, params),
  };
}

// ── Exercises ─────────────────────────────────────────────────────────────────

export function exercisePrompt(
  ctx: SubjectContext,
  params: {
    level: string;
    topic: string;
    type: ExerciseType;
    difficultyNote?: string;
    misconceptions?: string[];
  },
): PromptPair {
  if (isLanguage(ctx)) {
    return {
      system: EXERCISE_SYSTEM_PROMPT,
      user: buildExercisePrompt(
        ctx.subject,
        params.level,
        params.topic,
        params.type as LanguageExerciseType,
        ctx.nativeLanguage,
        params.difficultyNote,
      ),
    };
  }
  return {
    system: generalExerciseSystemPrompt(ctx.spec),
    user: buildGeneralExercisePrompt(ctx, params),
  };
}

// ── Calibration ───────────────────────────────────────────────────────────────

export function calibrationStagePrompt(
  ctx: SubjectContext,
  params: {
    probeLevel: CalibrationProbeLevel;
    stage: number;
    /** Probe topics for this stage. Ignored by the language family, which owns its pools. */
    topics: string[];
    usedTopics: string[];
    askedQuestions: string[];
    stageSize: number;
  },
): PromptPair {
  if (isLanguage(ctx)) {
    return {
      system: CALIBRATION_SYSTEM_PROMPT,
      user: buildCalibrationStagePrompt({
        language: ctx.subject,
        nativeLanguage: ctx.nativeLanguage,
        probeLevel: params.probeLevel,
        stage: params.stage,
        usedTopics: params.usedTopics,
        askedQuestions: params.askedQuestions,
      }),
    };
  }
  return {
    system: CALIBRATION_ITEM_SYSTEM_PROMPT,
    user: buildGeneralCalibrationStagePrompt(ctx, {
      probeLevel: params.probeLevel,
      stage: params.stage,
      topics: params.topics,
      askedQuestions: params.askedQuestions,
      stageSize: params.stageSize,
    }),
  };
}

// ── Type rotation ─────────────────────────────────────────────────────────────

/**
 * Least-recently-used pick from the spec's rotation pool, so a student sees
 * variety without the server having to remember more than the last few types.
 */
export function pickNextType(spec: { exerciseTypes: ExerciseType[] }, recent: string[]): ExerciseType {
  const pool = spec.exerciseTypes;
  const counts = new Map<ExerciseType, number>(pool.map((t) => [t, 0]));
  for (const t of recent) {
    const key = t as ExerciseType;
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return pool.reduce((a, b) => ((counts.get(a) ?? 0) <= (counts.get(b) ?? 0) ? a : b));
}
