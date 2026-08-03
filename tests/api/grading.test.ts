import { describe, expect, test } from "bun:test";
import { evalExpr, parseExpr } from "../../api/src/expr";
import {
  answerKindFor,
  answerToText,
  gradeDeterministic,
  gradingSpecOf,
  latexToExpr,
  parseGradingSpec,
  parseQuantity,
  symbolicallyEqual,
  type GradingSpec,
} from "../../api/src/grading";
import { sanitizeBlocks } from "../../api/src/blocks";

const text = (value: string) => ({ kind: "text" as const, value });

describe("expr", () => {
  const at = (src: string, x: number): number => {
    const tree = parseExpr(src);
    expect(tree).not.toBeNull();
    return evalExpr(tree!, { x });
  };

  test("respects precedence and associativity", () => {
    expect(at("2+3*4", 0)).toBe(14);
    expect(at("2^3^2", 0)).toBe(512);
    expect(at("-2^2", 0)).toBe(-4);
    expect(at("(2+3)*4", 0)).toBe(20);
  });

  test("evaluates functions and constants", () => {
    expect(at("sqrt(16)", 0)).toBe(4);
    expect(at("ln(e)", 0)).toBeCloseTo(1, 10);
    expect(at("cos(0)+sin(0)", 0)).toBe(1);
  });

  test("binds the variable", () => {
    expect(at("x^2-3*x", 4)).toBe(4);
  });

  test("rejects anything outside the grammar", () => {
    // The whole point: none of these may reach an evaluator.
    expect(parseExpr("alert(1)")).toBeNull();
    expect(parseExpr("x; drop")).toBeNull();
    expect(parseExpr("2+")).toBeNull();
    expect(parseExpr("(1+2")).toBeNull();
    expect(parseExpr("1+2)")).toBeNull();
    expect(parseExpr("2 2")).toBeNull();
  });
});

describe("exact grading", () => {
  const spec: GradingSpec = { mode: "exact", answer: "das Auto", normalize: "language" };

  test("accepts the answer without its article", () => {
    const result = gradeDeterministic(spec, text("Auto"));
    expect(result.correct).toBe(true);
    expect(result.via).toBe("normalized");
  });

  test("accepts case and punctuation drift", () => {
    expect(gradeDeterministic(spec, text("  das auto. ")).correct).toBe(true);
  });

  test("accepts an umlaut written as a digraph", () => {
    const umlaut: GradingSpec = { mode: "exact", answer: "die Tür", normalize: "language" };
    expect(gradeDeterministic(umlaut, text("die Tuer")).correct).toBe(true);
  });

  test("still fails the wrong article", () => {
    const result = gradeDeterministic(
      { mode: "exact", answer: "die Katze", normalize: "language" },
      text("der Katze"),
    );
    expect(result.correct).toBe(false);
    // Wrong, but not confidently wrong: the semantic rung gets a look.
    expect(result.needsSemantic).toBe(true);
  });

  test("strict normalization skips the folding entirely", () => {
    const strict: GradingSpec = { mode: "exact", answer: "das Auto", normalize: "strict" };
    expect(gradeDeterministic(strict, text("Auto")).correct).toBe(false);
  });
});

describe("numeric grading", () => {
  test("reads the quantity out of free text", () => {
    expect(parseQuantity("9,81 m/s^2")).toEqual({ value: 9.81, unit: "m/s2" });
    expect(parseQuantity("3/4")?.value).toBeCloseTo(0.75, 10);
    expect(parseQuantity("6.02 x 10^23")?.value).toBeCloseTo(6.02e23, 10);
    expect(parseQuantity("no number here")).toBeNull();
  });

  test("accepts an answer rounded one digit differently", () => {
    const spec: GradingSpec = { mode: "numeric", value: 9.81 };
    expect(gradeDeterministic(spec, text("9.8")).correct).toBe(true);
  });

  test("rejects a genuinely different number", () => {
    const spec: GradingSpec = { mode: "numeric", value: 9.81 };
    const result = gradeDeterministic(spec, text("10.5"));
    expect(result.correct).toBe(false);
    expect(result.needsSemantic).toBe(false);
  });

  test("significant figures set the window when no tolerance is given", () => {
    const spec: GradingSpec = { mode: "numeric", value: 6.674, sigFigs: 4 };
    expect(gradeDeterministic(spec, text("6.6743")).correct).toBe(true);
    expect(gradeDeterministic(spec, text("6.7")).correct).toBe(false);
  });

  test("a differently spelled unit escalates rather than failing", () => {
    const spec: GradingSpec = { mode: "numeric", value: 9.81, unit: "m/s^2" };
    expect(gradeDeterministic(spec, text("9.81 m s^-2")).needsSemantic).toBe(true);
    expect(gradeDeterministic(spec, text("9.81 m/s2")).correct).toBe(true);
  });
});

describe("symbolic grading", () => {
  test("rewrites LaTeX into the parser's grammar", () => {
    expect(parseExpr(latexToExpr("\\frac{x+1}{2x-3}"))).not.toBeNull();
    expect(parseExpr(latexToExpr("\\sqrt{x^2+1}"))).not.toBeNull();
    expect(parseExpr(latexToExpr("2\\cdot x \\left( x+1 \\right)"))).not.toBeNull();
  });

  test("recognizes an expanded product", () => {
    expect(symbolicallyEqual("(x+1)^2", "x^2+2x+1", ["x"])).toBe(true);
  });

  test("recognizes a rewritten fraction", () => {
    expect(symbolicallyEqual("\\frac{1}{2}x", "x/2", ["x"])).toBe(true);
  });

  test("separates genuinely different expressions", () => {
    expect(symbolicallyEqual("(x+1)^2", "x^2+1", ["x"])).toBe(false);
  });

  test("escalates when a side does not parse", () => {
    const spec: GradingSpec = { mode: "symbolic", latex: "x^2+2x+1", variables: ["x"] };
    const result = gradeDeterministic(spec, text("the square of x plus one"));
    expect(result.correct).toBe(false);
    expect(result.needsSemantic).toBe(true);
  });

  test("grades an equivalent answer correct", () => {
    const spec: GradingSpec = { mode: "symbolic", latex: "x^2+2x+1", variables: ["x"] };
    expect(gradeDeterministic(spec, text("\\left(x+1\\right)^2")).correct).toBe(true);
  });
});

describe("structural grading", () => {
  test("choice is index equality", () => {
    const spec: GradingSpec = { mode: "choice", correctIndex: 2 };
    expect(gradeDeterministic(spec, { kind: "choice", index: 2 }).correct).toBe(true);
    expect(gradeDeterministic(spec, { kind: "choice", index: 0 }).correct).toBe(false);
    expect(gradeDeterministic(spec, { kind: "choice", index: null }).correct).toBe(false);
  });

  test("matching awards partial credit", () => {
    const spec: GradingSpec = {
      mode: "set",
      pairs: [
        { left: "a", right: "1" },
        { left: "b", right: "2" },
        { left: "c", right: "3" },
        { left: "d", right: "4" },
      ],
    };
    const result = gradeDeterministic(spec, {
      kind: "set",
      selections: { a: "1", b: "2", c: "3", d: "9" },
    });
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0.75);
  });

  test("ordering compares position by position", () => {
    const spec: GradingSpec = { mode: "order", items: ["ich", "gehe", "nach", "Hause"] };
    expect(gradeDeterministic(spec, { kind: "order", items: ["ich", "gehe", "nach", "Hause"] }).correct)
      .toBe(true);
    expect(gradeDeterministic(spec, { kind: "order", items: ["gehe", "ich", "nach", "Hause"] }).score)
      .toBe(0.5);
  });
});

describe("legacy exercises", () => {
  test("a multiple-choice document grades on correctIndex", () => {
    const spec = gradingSpecOf({ type: "multiple_choice", correctIndex: 1 });
    expect(spec).toEqual({ mode: "choice", correctIndex: 1 });
  });

  test("a fill-in-the-blank still accepts the whole sentence", () => {
    const spec = gradingSpecOf({
      type: "fill_blank",
      correctAnswer: "Auto",
      sentence: "Das ___ ist rot",
    });
    expect(gradeDeterministic(spec, text("Das Auto ist rot")).correct).toBe(true);
    expect(gradeDeterministic(spec, text("Auto")).correct).toBe(true);
  });

  test("a declared spec wins over the legacy fields", () => {
    const spec = gradingSpecOf({
      type: "numeric",
      grading: { mode: "numeric", value: 42 },
      correctAnswer: "nonsense",
    });
    expect(spec.mode).toBe("numeric");
  });

  test("a matching exercise maps to a set spec", () => {
    const spec = gradingSpecOf({ type: "matching", pairs: [{ left: "a", right: "1" }] });
    expect(spec).toEqual({ mode: "set", pairs: [{ left: "a", right: "1" }] });
  });

  test("a word_order exercise maps to an order spec", () => {
    const spec = gradingSpecOf({ type: "word_order", words: ["ich", "gehe"] });
    expect(spec).toEqual({ mode: "order", items: ["ich", "gehe"] });
  });

  test("an unknown type falls back to an exact spec", () => {
    const spec = gradingSpecOf({ type: "flashcard", correctAnswer: "42" });
    expect(spec.mode).toBe("exact");
    expect((spec as Extract<GradingSpec, { mode: "exact" }>).answer).toBe("42");
  });

  test("a fill-in-the-blank without a sentence still grades the token", () => {
    const spec = gradingSpecOf({ type: "fill_blank", correctAnswer: "Auto" });
    expect(gradeDeterministic(spec, text("Auto")).correct).toBe(true);
  });
});

describe("parseGradingSpec", () => {
  test("rejects non-objects and arrays", () => {
    expect(parseGradingSpec(null)).toBeNull();
    expect(parseGradingSpec("x")).toBeNull();
    expect(parseGradingSpec([{ mode: "exact" }])).toBeNull();
  });

  test("rejects an unknown mode", () => {
    expect(parseGradingSpec({ mode: "guess" })).toBeNull();
  });

  test("parses an exact spec and filters the accept list", () => {
    expect(parseGradingSpec({ mode: "exact", answer: "x" })).toEqual({ mode: "exact", answer: "x", accept: undefined, normalize: undefined });
    expect(parseGradingSpec({ mode: "exact", answer: "x", accept: ["y", 3, ""], normalize: "loose" })).toEqual({
      mode: "exact", answer: "x", accept: ["y"], normalize: "loose",
    });
  });

  test("rejects an exact spec with a blank answer", () => {
    expect(parseGradingSpec({ mode: "exact", answer: "  " })).toBeNull();
  });

  test("parses a numeric spec with validated tolerance and sig figs", () => {
    expect(parseGradingSpec({ mode: "numeric", value: 9.81, tolerance: 0.01, relative: true, unit: "m/s^2" })).toMatchObject({
      mode: "numeric", value: 9.81, tolerance: 0.01, relative: true, unit: "m/s^2",
    });
    expect(parseGradingSpec({ mode: "numeric", value: 9.81, tolerance: -1, sigFigs: 4.7 })).toMatchObject({
      tolerance: undefined, sigFigs: 5,
    });
  });

  test("rejects a numeric spec without a finite value", () => {
    expect(parseGradingSpec({ mode: "numeric", value: "abc" })).toBeNull();
  });

  test("parses a choice spec and rejects a negative index", () => {
    expect(parseGradingSpec({ mode: "choice", correctIndex: 2 })).toEqual({ mode: "choice", correctIndex: 2 });
    expect(parseGradingSpec({ mode: "choice", correctIndex: -1 })).toBeNull();
    expect(parseGradingSpec({ mode: "choice", correctIndex: 1.5 })).toBeNull();
  });

  test("parses a set spec and drops malformed pairs", () => {
    expect(parseGradingSpec({ mode: "set", pairs: [{ left: "a", right: "1" }, { right: "2" }, "x"] })).toEqual({
      mode: "set", pairs: [{ left: "a", right: "1" }],
    });
    expect(parseGradingSpec({ mode: "set", pairs: [{ right: "2" }] })).toBeNull();
  });

  test("parses an order spec and filters non-strings", () => {
    expect(parseGradingSpec({ mode: "order", items: ["a", 3, "b"] })).toEqual({ mode: "order", items: ["a", "b"] });
    expect(parseGradingSpec({ mode: "order", items: [] })).toBeNull();
  });

  test("parses a symbolic spec", () => {
    expect(parseGradingSpec({ mode: "symbolic", latex: "x^2", variables: ["x"] })).toEqual({
      mode: "symbolic", latex: "x^2", variables: ["x"],
    });
    expect(parseGradingSpec({ mode: "symbolic", latex: " " })).toBeNull();
  });

  test("parses a rubric spec with criteria normalization", () => {
    const spec = parseGradingSpec({
      mode: "rubric",
      modelAnswer: "limit exists",
      criteria: [{ id: "c1", description: "uses definition", weight: 2 }, { description: "" }, null],
      passScore: 0.7,
    });
    expect(spec).toMatchObject({ mode: "rubric", modelAnswer: "limit exists", passScore: 0.7 });
    const rubric = spec as Extract<GradingSpec, { mode: "rubric" }> | null;
    expect(rubric?.criteria).toHaveLength(1);
    expect(rubric?.criteria[0]).toEqual({ id: "c1", description: "uses definition", weight: 2 });
    expect(parseGradingSpec({ mode: "rubric", modelAnswer: "" })).toBeNull();
  });
});

describe("answerKindFor", () => {
  test("maps structural modes to their input kinds", () => {
    expect(answerKindFor("choice")).toBe("choice");
    expect(answerKindFor("set")).toBe("set");
    expect(answerKindFor("order")).toBe("order");
  });

  test("maps every text-driven mode to text", () => {
    expect(answerKindFor("exact")).toBe("text");
    expect(answerKindFor("numeric")).toBe("text");
    expect(answerKindFor("symbolic")).toBe("text");
    expect(answerKindFor("rubric")).toBe("text");
  });
});

describe("answerToText", () => {
  test("flattens each answer kind", () => {
    expect(answerToText({ kind: "text", value: "Haus" })).toBe("Haus");
    expect(answerToText({ kind: "choice", index: 2 }, ["a", "b", "c"])).toBe("c");
    expect(answerToText({ kind: "order", items: ["ich", "gehe"] })).toBe("ich gehe");
    expect(answerToText({ kind: "set", selections: { a: "1", b: "2" } })).toBe("a → 1, b → 2");
  });

  test("a null choice index resolves via options or a position label", () => {
    expect(answerToText({ kind: "choice", index: null })).toBe("");
    expect(answerToText({ kind: "choice", index: 2 })).toBe("#3");
  });
});

describe("block sanitizing", () => {
  test("drops kinds the domain does not allow", () => {
    const blocks = sanitizeBlocks(
      [{ kind: "latex", value: "x^2" }, { kind: "code", lang: "js", value: "1" }],
      ["text", "latex"],
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("latex");
  });

  test("never passes an unknown field through", () => {
    const blocks = sanitizeBlocks(
      [{ kind: "text", value: "hi", onClick: "alert(1)", __proto__: { polluted: true } }],
      ["text"],
    );
    expect(blocks[0]).toEqual({ kind: "text", value: "hi" });
  });

  test("drops a series whose expression does not parse", () => {
    const blocks = sanitizeBlocks(
      [{ kind: "plot", spec: { type: "function", series: [{ expr: "fetch('/x')" }] } }],
      ["plot"],
    );
    expect(blocks).toHaveLength(0);
  });

  test("refuses a non-http source link", () => {
    const blocks = sanitizeBlocks(
      [{ kind: "source", claim: { author: "Thucydides", url: "javascript:alert(1)" } }],
      ["source"],
    );
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as { ref: { url?: string } }).ref.url).toBeUndefined();
  });

  test("keeps only recognized diagram primitives", () => {
    const blocks = sanitizeBlocks(
      [{
        kind: "diagram",
        spec: {
          viewBox: [0, 0, 100, 100],
          elements: [
            { t: "line", x1: 0, y1: 0, x2: 10, y2: 10 },
            { t: "script", src: "evil.js" },
          ],
        },
      }],
      ["diagram"],
    );
    expect((blocks[0] as { spec: { elements: unknown[] } }).spec.elements).toHaveLength(1);
  });
});
