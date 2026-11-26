import { describe, expect, test } from "bun:test";
import { formatDelta, formatDuration, formatExerciseType, formatPercent } from "@/lib/format";

describe("formatPercent", () => {
  test("rounds to a whole percent", () => {
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(0.3333)).toBe("33%");
  });

  test("handles the extremes", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1)).toBe("100%");
  });
});

describe("formatDuration", () => {
  test("shows seconds under a minute", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(0)).toBe("0s");
  });

  test("shows minutes between a minute and an hour", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(12 * 60_000)).toBe("12m");
  });

  test("shows hours, omitting the minutes when exact", () => {
    expect(formatDuration(60 * 60_000)).toBe("1h");
    expect(formatDuration(2 * 60 * 60_000)).toBe("2h");
  });

  test("shows hours plus minutes when not exact", () => {
    expect(formatDuration(60 * 60_000 + 20 * 60_000)).toBe("1h 20m");
  });

  test("stays in minutes just below the hour boundary", () => {
    expect(formatDuration(59 * 60_000 + 30_000)).toBe("59m");
  });

  test("tips into whole hours exactly at 60 minutes", () => {
    expect(formatDuration(60 * 60_000)).toBe("1h");
  });
});

describe("formatExerciseType", () => {
  test("turns snake_case into a capitalized label", () => {
    expect(formatExerciseType("reading_comprehension")).toBe("Reading comprehension");
    expect(formatExerciseType("multiple_choice")).toBe("Multiple choice");
  });

  test("handles a single word", () => {
    expect(formatExerciseType("numeric")).toBe("Numeric");
  });

  test("handles an empty string", () => {
    expect(formatExerciseType("")).toBe("");
  });
});

describe("formatDelta", () => {
  test("prepends a plus for positive deltas", () => {
    expect(formatDelta(0.5)).toBe("+50%");
  });

  test("uses a minus for negative deltas", () => {
    expect(formatDelta(-0.25)).toBe("-25%");
  });

  test("shows zero without a sign", () => {
    expect(formatDelta(0)).toBe("+0%");
  });
});
