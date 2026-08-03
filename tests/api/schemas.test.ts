import { describe, expect, test } from "bun:test";
import {
  AttemptSchema,
  GoalSchema,
  PreferencesSchema,
  SubjectSchema,
  StreakSchema,
  VocabularySchema,
  bankKeyOf,
  subjectOf,
  topicKeyOf,
} from "../../api/src/schemas";

describe("subjectOf", () => {
  test("prefers a taxonomy lineage when present", () => {
    expect(subjectOf({ subject: "Economics", taxonomy: ["social_science", "economics"], taxonomyLeaf: "economics" })).toEqual({
      subject: "Economics",
      taxonomy: ["social_science", "economics"],
      taxonomyLeaf: "economics",
    });
  });

  test("derives the leaf from the taxonomy when absent", () => {
    expect(subjectOf({ taxonomy: ["social_science", "economics"] })).toMatchObject({
      subject: "General",
      taxonomyLeaf: "economics",
    });
  });

  test("maps a legacy language path to the language branch", () => {
    expect(subjectOf({ language: "Aleman" })).toEqual({
      subject: "Aleman",
      taxonomy: ["language", "aleman"],
      taxonomyLeaf: "aleman",
    });
  });

  test("maps a legacy subject path to the language branch too", () => {
    expect(subjectOf({ subject: "Macroeconomics" })).toEqual({
      subject: "Macroeconomics",
      taxonomy: ["language", "macroeconomics"],
      taxonomyLeaf: "macroeconomics",
    });
  });

  test("defaults to General with no signal", () => {
    expect(subjectOf({})).toEqual({
      subject: "General",
      taxonomy: ["language", "general"],
      taxonomyLeaf: "general",
    });
  });
});

describe("bankKeyOf", () => {
  test("uses a pinned bank key over everything", () => {
    expect(bankKeyOf({ subject: "German", bankKey: "german" })).toBe("german");
  });

  test("falls back to the legacy language name", () => {
    expect(bankKeyOf({ language: "Aleman" })).toBe("aleman");
  });

  test("falls back to the legacy subject name", () => {
    expect(bankKeyOf({ subject: "Economics" })).toBe("economics");
  });

  test("derives the bank key from the taxonomy leaf as a last resort", () => {
    expect(bankKeyOf({ taxonomy: ["social_science", "economics"] })).toBe("economics");
  });
});

describe("topicKeyOf", () => {
  test("lowercases bank and topic but preserves the level verbatim", () => {
    expect(topicKeyOf("German", "The Weather", "Beginner")).toBe("german:the weather:Beginner");
  });
});

describe("Zod schemas", () => {
  test("SubjectSchema accepts a valid identity and rejects a short one", () => {
    const ok = SubjectSchema.safeParse({ subject: "x", taxonomy: ["a"], taxonomyLeaf: "a" });
    expect(ok.success).toBe(true);
    const bad = SubjectSchema.safeParse({ subject: "", taxonomy: [], taxonomyLeaf: "" });
    expect(bad.success).toBe(false);
  });

  test("GoalSchema applies defaults and rejects an empty objective", () => {
    const parsed = GoalSchema.parse({ language: "german", objective: "talk" });
    expect(parsed.level).toBe("beginner");
    expect(parsed.active).toBe(true);
    expect(GoalSchema.safeParse({ language: "german", objective: "" }).success).toBe(false);
  });

  test("StreakSchema defaults and accepts null lastSessionDate", () => {
    const parsed = StreakSchema.parse({});
    expect(parsed.currentStreak).toBe(0);
    expect(parsed.lastSessionDate).toBeNull();
  });

  test("VocabularySchema rejects a missing meaning", () => {
    expect(VocabularySchema.safeParse({ word: "Haus", language: "german" }).success).toBe(false);
  });

  test("PreferencesSchema defaults nativeLanguage", () => {
    expect(PreferencesSchema.parse({}).nativeLanguage).toBe("english");
  });

  test("AttemptSchema accepts a minimal legacy attempt and applies defaults", () => {
    const parsed = AttemptSchema.parse({
      userId: "u1",
      moduleIndex: 0,
      topicIndex: 0,
      exerciseId: "e1",
      outcome: "correct",
      createdAt: "2026-08-03",
    });
    expect(parsed.pathId).toBeNull();
    expect(parsed.pass).toBe(1);
    expect(parsed.score).toBe(0);
    expect(parsed.conceptIds).toEqual([]);
    expect(parsed.context).toBeUndefined();
  });

  test("AttemptSchema rejects an out-of-range confidence", () => {
    const result = AttemptSchema.safeParse({
      userId: "u1",
      moduleIndex: 0,
      topicIndex: 0,
      exerciseId: "e1",
      outcome: "wrong",
      createdAt: "2026-08-03",
      confidence: 9,
    });
    expect(result.success).toBe(false);
  });
});
