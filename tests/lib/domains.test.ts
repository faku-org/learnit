import { describe, expect, test } from "bun:test";
import {
  breadcrumbOf,
  childrenOf,
  isLanguagePath,
  subjectNameOf,
  taxonomyOf,
  type TaxonomyNode,
} from "@/lib/domains";

const NODES: Map<string, TaxonomyNode> = new Map([
  ["language", { id: "language", parentId: null, name: "Language", depth: 0, pathCount: 10 }],
  ["german", { id: "german", parentId: "language", name: "German", depth: 1, pathCount: 5 }],
  ["social_science", { id: "social_science", parentId: null, name: "Social Science", depth: 0, pathCount: 3 }],
  ["economics", { id: "economics", parentId: "social_science", name: "Economics", depth: 1, pathCount: 2 }],
]);

describe("isLanguagePath", () => {
  test("true when the path starts with language", () => {
    expect(isLanguagePath(["language", "german"])).toBe(true);
  });

  test("false for a non-language root", () => {
    expect(isLanguagePath(["social_science", "economics"])).toBe(false);
  });

  test("false for an empty or missing taxonomy", () => {
    expect(isLanguagePath([])).toBe(false);
    expect(isLanguagePath(undefined)).toBe(false);
  });
});

describe("breadcrumbOf", () => {
  test("joins names root-to-leaf", () => {
    expect(breadcrumbOf(["social_science", "economics"], NODES)).toBe("Social Science / Economics");
  });

  test("falls back to the id when a node is missing", () => {
    expect(breadcrumbOf(["social_science", "unknown"], NODES)).toBe("Social Science / unknown");
  });

  test("joins an empty path to an empty string", () => {
    expect(breadcrumbOf([], NODES)).toBe("");
  });
});

describe("childrenOf", () => {
  test("returns name-sorted direct children", () => {
    expect(childrenOf(null, NODES).map((n) => n.id)).toEqual(["language", "social_science"]);
  });

  test("returns no children for a leaf", () => {
    expect(childrenOf("german", NODES)).toEqual([]);
  });
});

describe("taxonomyOf", () => {
  test("prefers the taxonomy field", () => {
    expect(taxonomyOf({ taxonomy: ["social_science", "economics"], subject: "Math" })).toEqual([
      "social_science",
      "economics",
    ]);
  });

  test("falls back to a language field", () => {
    expect(taxonomyOf({ language: "German" })).toEqual(["language", "german"]);
  });

  test("falls back to a subject field", () => {
    expect(taxonomyOf({ subject: "Macroeconomics" })).toEqual(["language", "macroeconomics"]);
  });

  test("returns general when there is no signal", () => {
    expect(taxonomyOf({})).toEqual(["general"]);
  });

  test("ignores an empty taxonomy array and falls back", () => {
    expect(taxonomyOf({ taxonomy: [], language: "Spanish" })).toEqual(["language", "spanish"]);
  });
});

describe("subjectNameOf", () => {
  test("prefers subject over language", () => {
    expect(subjectNameOf({ subject: "Macroeconomics", language: "German" })).toBe("Macroeconomics");
  });

  test("falls back to language", () => {
    expect(subjectNameOf({ language: "German" })).toBe("German");
  });

  test("returns an empty string when neither is present", () => {
    expect(subjectNameOf({})).toBe("");
  });
});
