// Grading, as a ladder rather than a single check.
//
//   1. deterministic    exact / numeric / choice / set / order      instant, free
//   2. normalization    case, punctuation, articles, LaTeX forms,   instant, free
//                       unit handling, significant figures
//   3. symbolic         parse both sides and sample them            instant, free
//   4. semantic         one flash call, ONLY on a miss              ~400ms, cheap
//   5. rubric           genuinely open answers                      batched
//
// This file is rungs 1 to 3. It is pure, dependency-free, and imported by both
// the client (which grades optimistically for instant feedback) and the server
// (which is authoritative). They must never disagree, which is why there is one
// copy of it rather than two that drift.
//
// The rung that matters most in daily use is 2. Today a student who writes
// "Auto" against an expected "das Auto", or 9.8 against 9.81, is simply told
// they are wrong. That is the single largest source of false negatives in the
// system, and every mastery number downstream inherits it.

import type { GradingMode } from "./domains";
import { evalExpr, freeVariables, parseExpr } from "./expr";

// ── Specs ─────────────────────────────────────────────────────────────────────

export type NormalizeStrength = "strict" | "loose" | "language";

export type GradingSpec =
  | { mode: "exact"; answer: string; accept?: string[]; normalize?: NormalizeStrength }
  | { mode: "numeric"; value: number; tolerance?: number; relative?: boolean; unit?: string; sigFigs?: number }
  | { mode: "choice"; correctIndex: number }
  | { mode: "set"; pairs: { left: string; right: string }[] }
  | { mode: "order"; items: string[] }
  | { mode: "symbolic"; latex: string; variables: string[] }
  | { mode: "rubric"; criteria: { id: string; description: string; weight: number }[];
      modelAnswer: string; passScore: number };

/** What the student actually produced, in the shape the input component holds it. */
export type StudentAnswer =
  | { kind: "text"; value: string }
  | { kind: "choice"; index: number | null }
  | { kind: "set"; selections: Record<string, string> }
  | { kind: "order"; items: string[] };

/**
 * Which rung settled the grade. Recorded on every attempt so the ladder's
 * behaviour is measurable rather than assumed: a rising share of `semantic`
 * means the deterministic rungs are missing cases they should be catching.
 */
export type GradingVia =
  | "exact"
  | "normalized"
  | "numeric"
  | "symbolic"
  | "structural"
  | "semantic"
  | "unresolved";

export type GradeResult = {
  correct: boolean;
  /** Partial credit, 0-1. Binary rungs return 1 or 0. */
  score: number;
  mode: GradingMode;
  via: GradingVia;
  /**
   * True when the deterministic ladder could not settle it and only a semantic
   * check or a rubric call can. The caller decides whether to spend the call.
   */
  needsSemantic: boolean;
  /** Human-readable expected answer, for the report line and the semantic prompt. */
  expected: string;
};

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Leading determiners, by the languages the app actually teaches. Only ever
 * applied to the FIRST token, so "the" inside a sentence is untouched and an
 * exercise that tests word order is unaffected.
 */
const LEADING_ARTICLES = new Set([
  // english
  "a", "an", "the",
  // german
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "eines",
  // spanish
  "el", "la", "los", "las", "un", "una", "unos", "unas",
  // french
  "le", "les", "des", "du", "de",
  // italian
  "il", "lo", "i", "gli", "uno",
  // portuguese
  "o", "os", "as", "um", "uma",
  // dutch
  "de", "het", "een",
]);

/** Case, punctuation, and whitespace only. The floor every comparison stands on. */
export function normalizeLoose(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[.,!?;:'"()«»„“”‘’\-–—_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Folds the orthographic variation a student is not being tested on: umlauts
 * written out as digraphs, accents dropped on a keyboard that has none.
 * Deliberately applied to BOTH sides, so it can only ever admit an answer, never
 * reject one that strict comparison would have accepted.
 */
export function foldOrthography(text: string): string {
  return text
    .replace(/ß/g, "ss")
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** The expected answer with a leading determiner removed, or null if it has none. */
function withoutLeadingArticle(normalized: string): string | null {
  const tokens = normalized.split(" ");
  if (tokens.length < 2) return null;
  return LEADING_ARTICLES.has(tokens[0]) ? tokens.slice(1).join(" ") : null;
}

/**
 * True when two normalized strings differ only by a leading determiner.
 *
 * This is the "das Auto" / "Auto" case, and it is deliberately narrow: it
 * tolerates an article being OMITTED on one side, never one being wrong on both.
 * "der Katze" against "die Katze" stays wrong, which matters because for a
 * German path the article often IS the thing being tested.
 */
function articleEquivalent(a: string, b: string): boolean {
  const aStripped = withoutLeadingArticle(a);
  const bStripped = withoutLeadingArticle(b);
  if (aStripped !== null && aStripped === b) return true;
  return bStripped !== null && bStripped === a;
}

// ── Numeric ───────────────────────────────────────────────────────────────────

const NUMBER_PATTERN = /-?\d+(?:[.,]\d+)?(?:\s*[eE]\s*[+-]?\d+)?/;

/**
 * The numeric value in a free-text answer, plus whatever unit trailed it.
 * Accepts a comma decimal separator, scientific notation, a bare fraction, and
 * the usual `x10^n` spellings, because students type all of them.
 */
export function parseQuantity(text: string): { value: number; unit: string } | null {
  const cleaned = text
    .trim()
    .replace(/\s*[×x]\s*10\s*\^?\s*(-?\d+)/i, "e$1")
    .replace(/\s*·\s*10\s*\^?\s*(-?\d+)/i, "e$1");

  const fraction = cleaned.match(/^(-?\d+(?:[.,]\d+)?)\s*\/\s*(-?\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (fraction) {
    const numerator = Number(fraction[1].replace(",", "."));
    const denominator = Number(fraction[2].replace(",", "."));
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return { value: numerator / denominator, unit: normalizeUnit(fraction[3]) };
    }
  }

  const match = cleaned.match(NUMBER_PATTERN);
  if (!match) return null;
  const value = Number(match[0].replace(",", ".").replace(/\s+/g, ""));
  if (!Number.isFinite(value)) return null;
  return { value, unit: normalizeUnit(cleaned.slice(match.index! + match[0].length)) };
}

/** Collapses the spellings of a unit that mean the same thing to a grader. */
export function normalizeUnit(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\^?[²2]\b/g, "2")
    .replace(/\^?[³3]\b/g, "3")
    .replace(/[·⋅*]/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/[^a-z0-9/^ -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * How far off an answer may be. An explicit tolerance wins; otherwise the
 * significant-figure count sets it, and failing that a small relative window,
 * because an answer rounded one digit differently is not a wrong answer.
 */
function toleranceFor(spec: Extract<GradingSpec, { mode: "numeric" }>): number {
  if (typeof spec.tolerance === "number" && spec.tolerance > 0) {
    return spec.relative ? Math.abs(spec.value) * spec.tolerance : spec.tolerance;
  }
  if (typeof spec.sigFigs === "number" && spec.sigFigs > 0 && spec.value !== 0) {
    const magnitude = Math.floor(Math.log10(Math.abs(spec.value)));
    // Half a unit in the last significant place, the usual rounding convention.
    return 0.5 * Math.pow(10, magnitude - spec.sigFigs + 1);
  }
  const DEFAULT_RELATIVE = 0.005;
  return Math.max(Math.abs(spec.value) * DEFAULT_RELATIVE, 1e-9);
}

// ── Symbolic ──────────────────────────────────────────────────────────────────

/**
 * LaTeX reduced to the arithmetic grammar `expr.ts` parses. Structural forms
 * only: fractions, roots, powers, and the multiplication signs. Anything it
 * cannot rewrite it leaves alone, and the parse then fails, which is the correct
 * outcome for an expression this comparison has no business judging.
 */
export function latexToExpr(latex: string): string {
  let s = latex.trim().replace(/^\$+|\$+$/g, "");
  s = s
    .replace(/\\left|\\right/g, "")
    .replace(/\\!|\\,|\\;|\\:|\\quad|\\qquad/g, " ")
    .replace(/\\displaystyle/g, "")
    .replace(/\\(?:d|t)frac/g, "\\frac")
    .replace(/\\cdot|\\times/g, "*")
    .replace(/\\div/g, "/")
    .replace(/\\pi/g, "pi")
    .replace(/\\(sin|cos|tan|arcsin|arccos|arctan|exp|ln|log|sqrt|abs)/g, "$1")
    .replace(/arcsin/g, "asin").replace(/arccos/g, "acos").replace(/arctan/g, "atan");

  s = expandFractions(s);
  s = expandRoots(s);
  // \frac and \sqrt are gone, so any brace left is grouping.
  s = s.replace(/[{}]/g, (c) => (c === "{" ? "(" : ")"));
  return insertImplicitMultiplication(s);
}

/** `\frac{a}{b}` -> `((a)/(b))`, innermost first so nesting resolves. */
function expandFractions(input: string): string {
  let s = input;
  for (let guard = 0; guard < 20; guard++) {
    const at = s.indexOf("\\frac");
    if (at === -1) break;
    const first = readGroup(s, at + 5);
    if (!first) break;
    const second = readGroup(s, first.end);
    if (!second) break;
    s = `${s.slice(0, at)}((${first.body})/(${second.body}))${s.slice(second.end)}`;
  }
  return s;
}

/** `\sqrt{a}` -> `sqrt(a)`, and `\sqrt[n]{a}` -> `((a)^(1/(n)))`. */
function expandRoots(input: string): string {
  let s = input;
  for (let guard = 0; guard < 20; guard++) {
    const at = s.indexOf("sqrt[");
    if (at === -1) break;
    const close = s.indexOf("]", at);
    if (close === -1) break;
    const degree = s.slice(at + 5, close);
    const body = readGroup(s, close + 1);
    if (!body) break;
    s = `${s.slice(0, at)}((${body.body})^(1/(${degree})))${s.slice(body.end)}`;
  }
  return s;
}

/** The braced group starting at `from`, with the index just past its close. */
function readGroup(s: string, from: number): { body: string; end: number } | null {
  if (s[from] !== "{") return null;
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return { body: s.slice(from + 1, i), end: i + 1 };
    }
  }
  return null;
}

const FUNCTION_NAMES = new Set([
  "sin", "cos", "tan", "asin", "acos", "atan",
  "exp", "ln", "log", "sqrt", "abs", "floor", "ceil",
]);

/**
 * `2x` and `x(x+1)` are how people write mathematics and are not in the parser's
 * grammar, so the multiplication they imply is made explicit here.
 */
function insertImplicitMultiplication(input: string): string {
  let s = input
    .replace(/(\d)\s*\(/g, "$1*(")
    .replace(/\)\s*(\d)/g, ")*$1")
    .replace(/\)\s*\(/g, ")*(")
    .replace(/(\d)\s*([a-zA-Z_])/g, "$1*$2")
    .replace(/\)\s*([a-zA-Z_])/g, ")*$1");
  // An identifier immediately before "(" is either a call or a product.
  s = s.replace(/([a-zA-Z_][a-zA-Z_0-9]*)\s*\(/g, (whole, name: string) =>
    FUNCTION_NAMES.has(name.toLowerCase()) ? `${name}(` : `${name}*(`,
  );
  return s;
}

const SAMPLE_POINTS = 12;
const MIN_AGREEMENTS = 5;
const SYMBOLIC_TOLERANCE = 1e-6;

/**
 * Structural equivalence by sampling: parse both sides, evaluate them at a
 * spread of points, and treat agreement everywhere as equality. This is what
 * catches `(x+1)^2` against `x^2+2x+1` without spending an LLM call.
 *
 * Returns null when either side does not parse, or when too few points produced
 * a defined value on both, so the caller escalates rather than guessing.
 */
export function symbolicallyEqual(aSrc: string, bSrc: string, variables: string[]): boolean | null {
  const a = parseExpr(latexToExpr(aSrc));
  const b = parseExpr(latexToExpr(bSrc));
  if (!a || !b) return null;

  const names = [...new Set([...variables.map((v) => v.toLowerCase()), ...freeVariables(a), ...freeVariables(b)])];
  if (names.length === 0) {
    const left = evalExpr(a, {});
    const right = evalExpr(b, {});
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    return closeEnough(left, right);
  }

  let compared = 0;
  for (let i = 0; i < SAMPLE_POINTS; i++) {
    const bindings: Record<string, number> = {};
    // Positive, irrational-ish, and spread out: keeps ln and sqrt in their
    // domains while avoiding the points where distinct functions coincide.
    for (let j = 0; j < names.length; j++) {
      bindings[names[j]] = 0.37 + i * 0.41 + j * 0.13;
    }
    const left = evalExpr(a, bindings);
    const right = evalExpr(b, bindings);
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
    if (!closeEnough(left, right)) return false;
    compared++;
  }
  return compared >= MIN_AGREEMENTS ? true : null;
}

function closeEnough(a: number, b: number): boolean {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= SYMBOLIC_TOLERANCE * scale;
}

// ── The ladder ────────────────────────────────────────────────────────────────

const miss = (mode: GradingMode, expected: string, needsSemantic: boolean): GradeResult => ({
  correct: false, score: 0, mode, via: needsSemantic ? "unresolved" : "structural", needsSemantic, expected,
});

const hit = (mode: GradingMode, via: GradingVia, expected: string): GradeResult => ({
  correct: true, score: 1, mode, via, needsSemantic: false, expected,
});

/**
 * Rungs 1 to 3. Never spends a network call and never blocks.
 *
 * A `needsSemantic` result is a "not yet", not a "no": the caller may either
 * escalate to `/api/grade/semantic` or accept the miss. Note the direction that
 * escalation is allowed to run — a deterministic MATCH is never sent for review,
 * so the semantic rung can only ever overturn a wrong to a right. That keeps its
 * failure mode benign.
 */
export function gradeDeterministic(spec: GradingSpec, answer: StudentAnswer): GradeResult {
  switch (spec.mode) {
    case "choice": {
      const expected = `#${spec.correctIndex + 1}`;
      if (answer.kind !== "choice" || answer.index === null) return miss("choice", expected, false);
      return answer.index === spec.correctIndex
        ? hit("choice", "structural", expected)
        : miss("choice", expected, false);
    }

    case "set": {
      const expected = spec.pairs.map((p) => `${p.left} → ${p.right}`).join(", ");
      if (answer.kind !== "set" || spec.pairs.length === 0) return miss("set", expected, false);
      const matched = spec.pairs.filter(
        (p) => normalizeLoose(answer.selections[p.left] ?? "") === normalizeLoose(p.right),
      ).length;
      // Partial credit is real information here: four of five pairs right is
      // not the same performance as none, and the exam report reads `score`.
      const score = matched / spec.pairs.length;
      return {
        correct: matched === spec.pairs.length,
        score, mode: "set", via: "structural", needsSemantic: false, expected,
      };
    }

    case "order": {
      const expected = spec.items.join(" ");
      if (answer.kind !== "order") return miss("order", expected, false);
      const exact =
        answer.items.length === spec.items.length &&
        answer.items.every((item, i) => normalizeLoose(item) === normalizeLoose(spec.items[i]));
      if (exact) return hit("order", "structural", expected);
      const inPlace = answer.items.filter(
        (item, i) => i < spec.items.length && normalizeLoose(item) === normalizeLoose(spec.items[i]),
      ).length;
      return {
        correct: false,
        score: spec.items.length === 0 ? 0 : inPlace / spec.items.length,
        mode: "order", via: "structural", needsSemantic: false, expected,
      };
    }

    case "numeric": {
      const expected = spec.unit ? `${spec.value} ${spec.unit}` : String(spec.value);
      if (answer.kind !== "text") return miss("numeric", expected, false);
      const quantity = parseQuantity(answer.value);
      // No number at all is a prose answer to a numeric question; the semantic
      // rung can still recognize "twice the previous value" as correct.
      if (!quantity) return miss("numeric", expected, true);
      const within = Math.abs(quantity.value - spec.value) <= toleranceFor(spec);
      if (!within) return miss("numeric", expected, false);
      const wantedUnit = normalizeUnit(spec.unit ?? "");
      // Right number, differently spelled unit: not something to decide here.
      if (wantedUnit && quantity.unit && quantity.unit !== wantedUnit) {
        return miss("numeric", expected, true);
      }
      return hit("numeric", "numeric", expected);
    }

    case "symbolic": {
      const expected = spec.latex;
      if (answer.kind !== "text" || answer.value.trim().length === 0) {
        return miss("symbolic", expected, false);
      }
      if (normalizeLatexSurface(answer.value) === normalizeLatexSurface(spec.latex)) {
        return hit("symbolic", "normalized", expected);
      }
      const equal = symbolicallyEqual(answer.value, spec.latex, spec.variables ?? []);
      if (equal === true) return hit("symbolic", "symbolic", expected);
      // Unparseable on either side is genuine ambiguity, which is exactly what
      // rung 4 exists for. A clean parse that disagrees is simply wrong.
      return miss("symbolic", expected, equal === null);
    }

    case "rubric":
      return miss("rubric", spec.modelAnswer, true);

    case "exact": {
      const expected = spec.answer;
      if (answer.kind !== "text") return miss("exact", expected, false);
      const candidates = [spec.answer, ...(spec.accept ?? [])];
      const given = answer.value.trim();
      if (given.length === 0) return miss("exact", expected, false);

      if (candidates.some((c) => c.trim() === given)) return hit("exact", "exact", expected);

      const strength = spec.normalize ?? "language";
      if (strength === "strict") return miss("exact", expected, true);

      const givenLoose = normalizeLoose(given);
      if (candidates.some((c) => normalizeLoose(c) === givenLoose)) {
        return hit("exact", "normalized", expected);
      }
      if (strength === "language") {
        const givenFolded = foldOrthography(givenLoose);
        for (const candidate of candidates) {
          const candidateLoose = normalizeLoose(candidate);
          if (foldOrthography(candidateLoose) === givenFolded) return hit("exact", "normalized", expected);
          if (articleEquivalent(givenLoose, candidateLoose)) return hit("exact", "normalized", expected);
          if (articleEquivalent(givenFolded, foldOrthography(candidateLoose))) {
            return hit("exact", "normalized", expected);
          }
        }
      }
      return miss("exact", expected, true);
    }
  }
}

/** Surface-level LaTeX equality, before any parsing is attempted. */
function normalizeLatexSurface(latex: string): string {
  return latex
    .replace(/^\$+|\$+$/g, "")
    .replace(/\\left|\\right/g, "")
    .replace(/\\!|\\,|\\;|\\:|\\quad|\\qquad/g, "")
    .replace(/\\(?:d|t)frac/g, "\\frac")
    .replace(/\\cdot/g, "*")
    .replace(/\s+/g, "")
    .trim();
}

// ── Reading a spec off an exercise ────────────────────────────────────────────

type LegacyExercise = {
  type?: string;
  grading?: unknown;
  correctIndex?: number;
  correctAnswer?: string;
  sentence?: string;
  words?: string[];
  pairs?: { left: string; right: string }[];
  options?: string[];
};

const MODES = new Set<GradingMode>(["exact", "numeric", "set", "order", "choice", "rubric", "symbolic"]);

/**
 * Re-read a `grading` object from an exercise document, coercing every field.
 * Returns null when the shape is not usable, so the caller falls back to the
 * legacy fields rather than grading against a half-formed spec.
 */
export function parseGradingSpec(raw: unknown): GradingSpec | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const g = raw as Record<string, unknown>;
  const mode = g.mode;
  if (typeof mode !== "string" || !MODES.has(mode as GradingMode)) return null;

  switch (mode as GradingMode) {
    case "exact": {
      if (typeof g.answer !== "string" || g.answer.trim() === "") return null;
      const accept = Array.isArray(g.accept)
        ? g.accept.filter((a): a is string => typeof a === "string" && a.trim() !== "")
        : undefined;
      const normalize =
        g.normalize === "strict" || g.normalize === "loose" || g.normalize === "language"
          ? g.normalize
          : undefined;
      return { mode: "exact", answer: g.answer, accept, normalize };
    }
    case "numeric": {
      const value = Number(g.value);
      if (!Number.isFinite(value)) return null;
      const tolerance = Number(g.tolerance);
      const sigFigs = Number(g.sigFigs);
      return {
        mode: "numeric",
        value,
        tolerance: Number.isFinite(tolerance) && tolerance > 0 ? tolerance : undefined,
        relative: g.relative === true,
        unit: typeof g.unit === "string" ? g.unit : undefined,
        sigFigs: Number.isFinite(sigFigs) && sigFigs > 0 ? Math.round(sigFigs) : undefined,
      };
    }
    case "choice": {
      const correctIndex = Number(g.correctIndex);
      if (!Number.isInteger(correctIndex) || correctIndex < 0) return null;
      return { mode: "choice", correctIndex };
    }
    case "set": {
      if (!Array.isArray(g.pairs)) return null;
      const pairs = g.pairs
        .map((p) => (typeof p === "object" && p !== null ? (p as Record<string, unknown>) : null))
        .filter((p): p is Record<string, unknown> => p !== null)
        .filter((p) => typeof p.left === "string" && typeof p.right === "string")
        .map((p) => ({ left: p.left as string, right: p.right as string }));
      return pairs.length > 0 ? { mode: "set", pairs } : null;
    }
    case "order": {
      const items = Array.isArray(g.items)
        ? g.items.filter((i): i is string => typeof i === "string")
        : [];
      return items.length > 0 ? { mode: "order", items } : null;
    }
    case "symbolic": {
      if (typeof g.latex !== "string" || g.latex.trim() === "") return null;
      const variables = Array.isArray(g.variables)
        ? g.variables.filter((v): v is string => typeof v === "string")
        : [];
      return { mode: "symbolic", latex: g.latex, variables };
    }
    case "rubric": {
      if (typeof g.modelAnswer !== "string" || g.modelAnswer.trim() === "") return null;
      const criteria = (Array.isArray(g.criteria) ? g.criteria : [])
        .map((c) => (typeof c === "object" && c !== null ? (c as Record<string, unknown>) : null))
        .filter((c): c is Record<string, unknown> => c !== null)
        .map((c, i) => ({
          id: typeof c.id === "string" ? c.id : `c${i + 1}`,
          description: typeof c.description === "string" ? c.description : "",
          weight: Number.isFinite(Number(c.weight)) ? Number(c.weight) : 1,
        }))
        .filter((c) => c.description !== "");
      const passScore = Number(g.passScore);
      return {
        mode: "rubric",
        criteria,
        modelAnswer: g.modelAnswer,
        passScore: Number.isFinite(passScore) && passScore > 0 ? passScore : 0.6,
      };
    }
  }
}

/**
 * The grading spec for any exercise, new or old.
 *
 * A document generated after Phase 2 carries `grading`. Everything already in
 * the shared bank carries `correctIndex` / `correctAnswer` / `pairs` / `words`
 * instead, and is translated here rather than backfilled, so there is exactly
 * one grading path and no migration to run.
 */
export function gradingSpecOf(exercise: LegacyExercise): GradingSpec {
  const declared = parseGradingSpec(exercise.grading);
  if (declared) return declared;

  const type = exercise.type ?? "";
  if (type === "multiple_choice" || type === "reading_comprehension" || type === "plot_reading") {
    return { mode: "choice", correctIndex: exercise.correctIndex ?? 0 };
  }
  if (type === "matching" && exercise.pairs && exercise.pairs.length > 0) {
    return { mode: "set", pairs: exercise.pairs };
  }
  if (type === "word_order" && exercise.words && exercise.words.length > 0) {
    return { mode: "order", items: exercise.words };
  }
  const answer = exercise.correctAnswer ?? "";
  const accept: string[] = [];
  // A fill-in-the-blank has always accepted the whole sentence as well as the
  // missing token. Preserved verbatim: it is behaviour students rely on.
  if (type === "fill_blank" && exercise.sentence && answer) {
    accept.push(exercise.sentence.replace(/___/g, answer));
  }
  return { mode: "exact", answer, accept, normalize: "language" };
}

/** Which input component a spec needs, independent of the exercise's type name. */
export function answerKindFor(mode: GradingMode): StudentAnswer["kind"] {
  switch (mode) {
    case "choice": return "choice";
    case "set": return "set";
    case "order": return "order";
    default: return "text";
  }
}

/** Flattens an answer for the attempt log and the semantic grader's prompt. */
export function answerToText(answer: StudentAnswer, options?: string[]): string {
  switch (answer.kind) {
    case "text": return answer.value;
    case "choice":
      if (answer.index === null) return "";
      return options?.[answer.index] ?? `#${answer.index + 1}`;
    case "order": return answer.items.join(" ");
    case "set":
      return Object.entries(answer.selections).map(([l, r]) => `${l} → ${r}`).join(", ");
  }
}
