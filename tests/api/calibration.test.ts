import { describe, expect, test } from "bun:test";
import { resolveSpec, type BlockKind } from "../../api/src/domains";
import { liftFences, sanitizeCalibrationQuestions } from "../../api/src/calibration";
import {
  calibrationBlockKinds,
  buildGeneralCalibrationStagePrompt,
  type SubjectContext,
} from "../../api/src/prompts-general";
import { calibrationStagePrompt } from "../../api/src/prompt-router";

// Placement questions used to be five strings. A programming subject showed its
// code as flat text; the question now carries content blocks (the same format
// the exercises use) and the server rebuilds them before they reach the client.

const CODE: BlockKind[] = ["code", "table"];
const PY = "def f(n):\n    if n < 2:\n        return n\n    return f(n - 1) + f(n - 2)";
const FENCE = "`".repeat(3);

const q = (over: Record<string, unknown> = {}) => ({
  topic: "recursion",
  question: "What does f(5) return?",
  instruction: "Pick one.",
  options: ["3", "5", "8", "13"],
  correctIndex: 1,
  ...over,
});

describe("sanitizeCalibrationQuestions", () => {
  test("keeps a code block with its whitespace and language", () => {
    const [out] = sanitizeCalibrationQuestions(
      [q({ blocks: [{ kind: "code", lang: "Python", value: PY }] })],
      CODE,
      4,
    );
    expect(out.blocks).toEqual([{ kind: "code", lang: "python", value: PY }]);
    expect(JSON.stringify(out.blocks)).toContain("\\n        return n");
  });

  test("a question without blocks stays plain text and gets no blocks key", () => {
    const [out] = sanitizeCalibrationQuestions([q()], CODE, 4);
    expect(out.question).toBe("What does f(5) return?");
    expect("blocks" in out).toBe(false);
  });

  test("a malformed block is dropped and the question survives as text", () => {
    const [out] = sanitizeCalibrationQuestions(
      [q({ blocks: [{ kind: "code" }, { kind: "code", value: 42 }, "nonsense", null] })],
      CODE,
      4,
    );
    expect(out.question).toBe("What does f(5) return?");
    expect("blocks" in out).toBe(false);
  });

  test("drops kinds the subject does not allow, including source claims", () => {
    const [out] = sanitizeCalibrationQuestions(
      [
        q({
          blocks: [
            { kind: "plot", spec: { type: "function", series: [{ expr: "x" }] } },
            { kind: "source", claim: { author: "Plato", work: "Republic" } },
            { kind: "code", lang: "python", value: "print(1)" },
          ],
        }),
      ],
      CODE,
      4,
    );
    expect(out.blocks).toEqual([{ kind: "code", lang: "python", value: "print(1)" }]);
  });

  test("never lets markup through: invented fields are dropped, html stays text", () => {
    const [out] = sanitizeCalibrationQuestions(
      [
        q({
          blocks: [
            {
              kind: "code",
              lang: "<script>",
              value: "<img src=x onerror=alert(1)>",
              html: "<b>x</b>",
              onclick: "x()",
            },
          ],
        }),
      ],
      CODE,
      4,
    );
    const block = out.blocks?.[0] as Record<string, unknown>;
    expect(block.lang).toBe("script");
    expect(block.value).toBe("<img src=x onerror=alert(1)>");
    expect(Object.keys(block).sort()).toEqual(["kind", "lang", "value"]);
  });

  test("lifts a markdown fence out of the question into a code block", () => {
    const [out] = sanitizeCalibrationQuestions(
      [q({ question: `What does this print?\n${FENCE}python\n${PY}\n${FENCE}` })],
      CODE,
      4,
    );
    expect(out.question).toBe("What does this print?");
    expect(out.blocks).toEqual([{ kind: "code", lang: "python", value: PY }]);
  });

  test("an unterminated fence is cut, not shown as backticks", () => {
    const [out] = sanitizeCalibrationQuestions(
      [q({ question: `Read this:\n${FENCE}python\nprint(1)` })],
      CODE,
      4,
    );
    expect(out.question).toBe("Read this:");
    expect(out.question).not.toContain("`");
  });

  test("a fence is left alone when the subject allows no code block", () => {
    const text = `Explain ${FENCE}x${FENCE} briefly`;
    expect(liftFences(text, ["table"])).toEqual({ question: text, blocks: [] });
  });

  test("keeps indentation and line breaks of a multi-line option", () => {
    const [out] = sanitizeCalibrationQuestions(
      [q({ options: ["    return n\n    pass", "x = 1", "y = 2", "z = 3"] })],
      CODE,
      4,
    );
    expect(out.options[0]).toBe("    return n\n    pass");
  });

  test("rejects a question whose correctIndex does not point at an option", () => {
    const bad = [
      q({ correctIndex: 4 }),
      q({ correctIndex: -1 }),
      q({ correctIndex: "1" }),
      q({ correctIndex: 1.5 }),
    ];
    expect(sanitizeCalibrationQuestions(bad, CODE, 4)).toEqual([]);
  });

  test("rejects a question that lost an option, since correctIndex would shift", () => {
    expect(
      sanitizeCalibrationQuestions([q({ options: ["a", "", "c", "d"], correctIndex: 2 })], CODE, 4),
    ).toEqual([]);
  });

  test("rejects a question with fewer than two options or no prose", () => {
    expect(
      sanitizeCalibrationQuestions([q({ options: ["only"], correctIndex: 0 })], CODE, 4),
    ).toEqual([]);
    expect(sanitizeCalibrationQuestions([q({ question: "  ", topic: "" })], CODE, 4)).toEqual([]);
  });

  test("falls back to the topic when a fence was the whole question", () => {
    const [out] = sanitizeCalibrationQuestions(
      [q({ question: `${FENCE}python\n${PY}\n${FENCE}` })],
      CODE,
      4,
    );
    expect(out.question).toBe("recursion");
    expect(out.blocks).toHaveLength(1);
  });

  test("caps the stage size and ignores non-arrays", () => {
    expect(sanitizeCalibrationQuestions([q(), q(), q()], CODE, 2)).toHaveLength(2);
    expect(sanitizeCalibrationQuestions("nope", CODE, 4)).toEqual([]);
    expect(sanitizeCalibrationQuestions(undefined, CODE, 4)).toEqual([]);
  });

  test("a language subject (no blocks allowed) still gets validated text questions", () => {
    const [out] = sanitizeCalibrationQuestions(
      [q({ blocks: [{ kind: "code", value: "x" }] })],
      [],
      4,
    );
    expect(out.options).toHaveLength(4);
    expect("blocks" in out).toBe(false);
  });
});

const ctxFor = (taxonomy: string[], subject: string): SubjectContext => ({
  subject,
  taxonomy,
  breadcrumb: taxonomy.join(" / "),
  spec: resolveSpec(taxonomy),
  nativeLanguage: "english",
});

const params = {
  probeLevel: "elementary" as const,
  stage: 1,
  topics: ["loops"],
  askedQuestions: [],
  stageSize: 4,
};

describe("calibration prompt", () => {
  const python = ctxFor(["computing", "programming", "python"], "Python");

  test("asks a programming subject for code blocks", () => {
    const prompt = buildGeneralCalibrationStagePrompt(python, params);
    expect(prompt).toContain('"kind": "code"');
    expect(prompt).toContain('"blocks": []');
    expect(prompt).toContain("Never paste code");
    expect(prompt).toContain("at most 12 lines");
  });

  test("offers formulas to a maths subject, and not code", () => {
    const math = ctxFor(["formal_science", "mathematics"], "Calculus");
    const prompt = buildGeneralCalibrationStagePrompt(math, params);
    expect(prompt).toContain('"kind": "latex"');
    expect(prompt).toContain("$x^2 + 1$");
    expect(prompt).not.toContain('"kind": "code"');
  });

  test("never offers source or text blocks", () => {
    for (const ctx of [
      python,
      ctxFor(["humanities", "history"], "History"),
      ctxFor(["social_science", "economics"], "Economics"),
    ]) {
      const kinds = calibrationBlockKinds(ctx.spec);
      expect(kinds).not.toContain("source" as BlockKind);
      expect(kinds).not.toContain("text" as BlockKind);
    }
  });

  test("a subject with only tables still gets a block section", () => {
    expect(calibrationBlockKinds(ctxFor(["humanities", "philosophy"], "Philosophy").spec)).toEqual([
      "table",
    ]);
  });

  test("the language family is untouched", () => {
    const german = ctxFor(["language", "german"], "German");
    const { user } = calibrationStagePrompt(german, { ...params, usedTopics: [] });
    expect(user).not.toContain("Supporting material");
    expect(user).not.toContain('"blocks"');
  });
});
