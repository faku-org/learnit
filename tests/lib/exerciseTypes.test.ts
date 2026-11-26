import { describe, expect, test } from "bun:test";
import i18next from "@/lib/i18n";
import type { ExerciseType } from "@shared/domains";
import { EXERCISE_TYPE_KEYS } from "@/lib/exerciseTypes";

// Compile-time check: the client registry must cover every server type, so a
// new exercise type fails typecheck until it gets a label here.
const REGISTRY = EXERCISE_TYPE_KEYS satisfies Record<ExerciseType, string>;

describe("exercise type registry", () => {
  test("maps every server exercise type to an i18n key", () => {
    const expected: ExerciseType[] = [
      "multiple_choice", "cloze", "short_answer", "matching", "ordering", "flashcard",
      "fill_blank", "translation", "conjugation", "reading_comprehension", "word_order",
      "numeric", "symbolic", "derivation_order", "plot_reading", "unit_conversion",
      "source_analysis", "chronology", "argument_reconstruction", "compare_contrast",
      "code_output", "code_fix", "complexity",
    ];
    expect(Object.keys(REGISTRY).sort()).toEqual([...expected].sort());
  });

  test("resolves to a real label in both languages", () => {
    for (const key of ["en", "es"] as const) {
      const t = i18next.getFixedT(key);
      for (const i18nKey of Object.values(REGISTRY)) {
        const label = t(i18nKey);
        expect(label, `${i18nKey} in ${key}`).not.toBe(i18nKey);
        expect(label.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
