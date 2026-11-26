import { afterEach, describe, expect, test } from "bun:test";
import { BASE_SPEC, clearSpecCache, isLanguagePath, resolveSpec } from "../../api/src/domains";

afterEach(() => clearSpecCache());

describe("isLanguagePath", () => {
  test("true when the root is language", () => {
    expect(isLanguagePath(["language", "german"])).toBe(true);
  });

  test("false for any other root and for an empty lineage", () => {
    expect(isLanguagePath(["formal_science", "mathematics"])).toBe(false);
    expect(isLanguagePath([])).toBe(false);
  });
});

describe("resolveSpec", () => {
  test("returns the base spec for an unknown lineage", () => {
    const spec = resolveSpec(["made_up"]);
    expect(spec.promptFamily).toBe("general");
    expect(spec.exerciseTypes).toEqual(BASE_SPEC.exerciseTypes);
    expect(spec.sourceProviders).toEqual([]);
  });

  test("mounts speak, vocabulary, and tts for a language path", () => {
    const spec = resolveSpec(["language", "german"]);
    expect(spec.promptFamily).toBe("language");
    expect(spec.features).toEqual({ speak: true, vocabulary: true, tts: true });
    expect(spec.sourceProviders).toContain("gutenberg");
    expect(spec.defaultGrading).toBe("exact");
  });

  test("a classical language appends its providers and drops speak", () => {
    const spec = resolveSpec(["language", "latin"]);
    expect(spec.sourceProviders).toEqual(["wikisource", "gutenberg", "perseus"]);
    expect(spec.features.speak).toBe(false);
    expect(spec.features.vocabulary).toBe(true);
  });

  test("deepest fragment wins per field along the lineage", () => {
    const spec = resolveSpec(["formal_science", "mathematics"]);
    expect(spec.promptFamily).toBe("quantitative");
    expect(spec.exerciseTypes).toContain("plot_reading");
    expect(spec.blocks).toContain("plot");
    expect(spec.defaultGrading).toBe("symbolic");
  });

  test("child fragments append to what the parent declared", () => {
    const spec = resolveSpec(["formal_science", "geometry"]);
    expect(spec.promptFamily).toBe("quantitative");
    expect(spec.blocks).toEqual(["text", "table", "latex", "diagram", "plot"]);
  });

  test("memoizes results per lineage", () => {
    const a = resolveSpec(["language", "german"]);
    const b = resolveSpec(["language", "german"]);
    expect(a).toBe(b);
  });

  test("clearSpecCache forces a fresh merge", () => {
    const a = resolveSpec(["language", "german"]);
    clearSpecCache();
    const b = resolveSpec(["language", "german"]);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
