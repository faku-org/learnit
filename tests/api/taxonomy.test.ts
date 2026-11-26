import { describe, expect, test } from "bun:test";
import { relate, slugify, transferPolicy } from "../../api/src/taxonomy";

describe("slugify", () => {
  test("lowercases and joins words with underscores", () => {
    expect(slugify("Macro Economics")).toBe("macro_economics");
  });

  test("strips combining diacritics", () => {
    expect(slugify("Cálculo")).toBe("calculo");
    expect(slugify("Düsseldorf")).toBe("dusseldorf");
  });

  test("collapses runs of non-alphanumeric characters", () => {
    expect(slugify("a--b__c")).toBe("a_b_c");
  });

  test("trims leading and trailing separators", () => {
    expect(slugify("  Hello World!  ")).toBe("hello_world");
  });

  test("returns an empty string when nothing usable remains", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("relate", () => {
  test("identical lineages share everything at zero distance", () => {
    const r = relate(["a", "b", "c"], ["a", "b", "c"]);
    expect(r.sharedAncestor).toBe("c");
    expect(r.commonDepth).toBe(3);
    expect(r.distance).toBe(0);
  });

  test("finds the deepest shared ancestor", () => {
    const r = relate(["language", "german"], ["language", "spanish"]);
    expect(r.sharedAncestor).toBe("language");
    expect(r.commonDepth).toBe(1);
    expect(r.distance).toBe(2);
  });

  test("sibling leaves share a level-2 ancestor", () => {
    const r = relate(["ss", "economics", "macro"], ["ss", "economics", "micro"]);
    expect(r.sharedAncestor).toBe("economics");
    expect(r.commonDepth).toBe(2);
    expect(r.distance).toBe(2);
  });

  test("disjoint lineages share nothing", () => {
    const r = relate(["language", "german"], ["formal_science", "math"]);
    expect(r.sharedAncestor).toBeNull();
    expect(r.commonDepth).toBe(0);
    expect(r.distance).toBe(4);
  });

  test("one lineage is a prefix of the other", () => {
    const r = relate(["a", "b"], ["a", "b", "c"]);
    expect(r.sharedAncestor).toBe("b");
    expect(r.commonDepth).toBe(2);
    expect(r.distance).toBe(1);
  });
});

describe("transferPolicy", () => {
  test("identical subjects transfer fully at the lowest floor", () => {
    const p = transferPolicy(["language", "german"], ["language", "german"]);
    expect(p.mode).toBe("full");
    expect(p.masteryFloor).toBe(0.35);
  });

  test("siblings under a level-2 node transfer fully at a higher floor", () => {
    const p = transferPolicy(["ss", "economics", "macro"], ["ss", "economics", "micro"]);
    expect(p.mode).toBe("full");
    expect(p.masteryFloor).toBe(0.5);
  });

  test("same root only transfers partially at a demanding floor", () => {
    const p = transferPolicy(["ss", "economics"], ["ss", "psychology"]);
    expect(p.mode).toBe("partial");
    expect(p.masteryFloor).toBe(0.75);
  });

  test("unrelated subjects transfer nothing", () => {
    const p = transferPolicy(["language", "german"], ["formal_science", "math"]);
    expect(p.mode).toBe("none");
    expect(p.masteryFloor).toBe(1);
  });
});
