import { describe, expect, test } from "bun:test";
import { resolveSpec } from "../../api/src/domains";
import { CALIBRATION_SYSTEM_PROMPT, EXERCISE_SYSTEM_PROMPT, MODULE_TOPICS_SYSTEM_PROMPT, PATH_OUTLINE_SYSTEM_PROMPT } from "../../api/src/prompts";
import { CALIBRATION_ITEM_SYSTEM_PROMPT, generalExerciseSystemPrompt, generalModuleTopicsSystemPrompt, generalPathOutlineSystemPrompt, type SubjectContext } from "../../api/src/prompts-general";
import { calibrationStagePrompt, exercisePrompt, moduleTopicsPrompt, pathOutlinePrompt, pickNextType } from "../../api/src/prompt-router";
import type { ExerciseType } from "../../api/src/domains";

const languageCtx: SubjectContext = {
  subject: "German",
  taxonomy: ["language", "german"],
  breadcrumb: "Language / German",
  spec: resolveSpec(["language", "german"]),
  nativeLanguage: "english",
};

const mathCtx: SubjectContext = {
  subject: "Calculus",
  taxonomy: ["formal_science", "mathematics"],
  breadcrumb: "Formal Science / Mathematics",
  spec: resolveSpec(["formal_science", "mathematics"]),
  nativeLanguage: "english",
};

describe("pathOutlinePrompt", () => {
  test("a language path uses the language system prompt", () => {
    const pair = pathOutlinePrompt(languageCtx, {
      objective: "talk to locals",
      timeframe: "3 weeks",
      moduleCount: 4,
      startingLevel: "complete_beginner",
    });
    expect(pair.system).toBe(PATH_OUTLINE_SYSTEM_PROMPT);
    expect(pair.user).toContain("German");
  });

  test("a subject path uses the spec-aware system prompt", () => {
    const pair = pathOutlinePrompt(mathCtx, {
      objective: "master limits",
      timeframe: "6 weeks",
      moduleCount: 5,
      startingLevel: "some_basics",
    });
    expect(pair.system).toBe(generalPathOutlineSystemPrompt(mathCtx.spec));
    expect(pair.user).toContain("Calculus");
  });
});

describe("moduleTopicsPrompt", () => {
  test("routes on the prompt family", () => {
    const lang = moduleTopicsPrompt(languageCtx, {
      objective: "x", startingLevel: "complete_beginner",
      module: { name: "Basics", order: 0 },
      previousModules: [], nextModule: null, coveredTopics: [], performance: null,
    });
    expect(lang.system).toBe(MODULE_TOPICS_SYSTEM_PROMPT);

    const math = moduleTopicsPrompt(mathCtx, {
      objective: "x", startingLevel: "complete_beginner",
      module: { name: "Limits", order: 0 },
      previousModules: [], nextModule: null, coveredTopics: [], performance: null,
    });
    expect(math.system).toBe(generalModuleTopicsSystemPrompt(mathCtx.spec));
  });
});

describe("exercisePrompt", () => {
  test("routes on the prompt family", () => {
    const lang = exercisePrompt(languageCtx, { level: "beginner", topic: "Greetings", type: "fill_blank" });
    expect(lang.system).toBe(EXERCISE_SYSTEM_PROMPT);
    expect(lang.user).toContain("German");

    const math = exercisePrompt(mathCtx, { level: "beginner", topic: "Derivatives", type: "symbolic" });
    expect(math.system).toBe(generalExerciseSystemPrompt(mathCtx.spec));
  });
});

describe("calibrationStagePrompt", () => {
  test("routes on the prompt family", () => {
    const lang = calibrationStagePrompt(languageCtx, {
      probeLevel: "beginner", stage: 1, topics: [], usedTopics: [], askedQuestions: [], stageSize: 5,
    });
    expect(lang.system).toBe(CALIBRATION_SYSTEM_PROMPT);

    const math = calibrationStagePrompt(mathCtx, {
      probeLevel: "beginner", stage: 1, topics: ["limits"], usedTopics: [], askedQuestions: [], stageSize: 5,
    });
    expect(math.system).toBe(CALIBRATION_ITEM_SYSTEM_PROMPT);
    expect(math.user).toContain("limits");
  });
});

describe("pickNextType", () => {
  const spec = { exerciseTypes: ["a", "b", "c"] as unknown as ExerciseType[] };

  test("returns the first type when nothing has been seen", () => {
    expect(pickNextType(spec, []) as string).toBe("a");
  });

  test("picks the least-used type when one is over-represented", () => {
    expect(pickNextType(spec, ["a", "a"]) as string).toBe("b");
    expect(pickNextType(spec, ["a", "b", "b"]) as string).toBe("c");
  });

  test("breaks ties toward the earlier type in the pool", () => {
    expect(pickNextType(spec, ["a", "b", "c"]) as string).toBe("a");
  });

  test("ignores recent types outside the pool", () => {
    expect(pickNextType(spec, ["zzz", "a"]) as string).toBe("b");
  });
});
