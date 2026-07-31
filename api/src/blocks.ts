// Content blocks: the structured body of an exercise.
//
// An exercise used to be a flat bag of optional strings, which is enough for
// "translate this sentence" and nothing else. A physics problem needs a formula
// and a free-body diagram; a history problem needs a cited excerpt.
//
// SECURITY, and the reason this file is a whitelist rather than a schema:
// exercises land in a bank SHARED ACROSS USERS. A generator that can emit markup
// is stored XSS against everyone who later draws that exercise. So no block may
// carry raw SVG, raw HTML, or anything that reaches `eval` or `new Function`.
// Every block is a declarative spec whose every field is a number or a string
// that lands in a text node, and `sanitizeBlocks` is the gate: whatever the
// model produced, only values that fit these shapes are stored.

import type { BlockKind } from "./domains";
import { parseExpr } from "./expr";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlotType = "function" | "scatter" | "vector" | "bar" | "number_line";

export type PlotSeries = {
  label?: string;
  /** Expression in x, parsed by expr.ts. Never evaluated as JavaScript. */
  expr?: string;
  points?: [number, number][];
  vectors?: { from: [number, number]; to: [number, number]; label?: string }[];
  style?: "solid" | "dashed";
};

export type PlotSpec = {
  type: PlotType;
  domain?: [number, number];
  range?: [number, number];
  xLabel?: string;
  yLabel?: string;
  grid?: boolean;
  series: PlotSeries[];
  markers?: { x: number; y: number; label?: string }[];
};

export type DiagramElement =
  | { t: "line"; x1: number; y1: number; x2: number; y2: number;
      arrow?: "end" | "both" | "none"; dashed?: boolean; label?: string }
  | { t: "circle"; cx: number; cy: number; r: number; fill?: boolean; label?: string }
  | { t: "rect"; x: number; y: number; w: number; h: number; label?: string }
  | { t: "arc"; cx: number; cy: number; r: number; start: number; end: number; label?: string }
  | { t: "polygon"; points: [number, number][]; fill?: boolean; label?: string }
  | { t: "label"; x: number; y: number; text: string; latex?: boolean };

export type DiagramSpec = {
  viewBox: [number, number, number, number];
  elements: DiagramElement[];
};

/**
 * Reference to a verified source.
 *
 * The generator only ever proposes a `claim`. `resolveSourceBlocks` retrieves
 * and verifies it against a real corpus and rewrites the block with this shape,
 * or drops the block. So `verified` is true for everything that reaches the
 * bank — the flag exists because documents written before the pipeline existed
 * do not have that guarantee and must be labelled accordingly.
 */
export type SourceRef = {
  sourceId?: string;
  /** Which corpus confirmed this. Shown in the provenance line. */
  provider?: string;
  author?: string;
  work?: string;
  locus?: string;
  date?: string;
  lang?: string;
  text?: string;
  translation?: string;
  /** True when the translation was generated rather than retrieved. */
  translationMachine?: boolean;
  url?: string;
  license?: string;
  verified: boolean;
  excerptStart?: number;
  excerptEnd?: number;
  showTranslation: boolean;
};

export type ContentBlock =
  | { kind: "text"; value: string }
  | { kind: "latex"; value: string; display?: boolean }
  | { kind: "plot"; spec: PlotSpec }
  | { kind: "diagram"; spec: DiagramSpec }
  | { kind: "source"; ref: SourceRef }
  | { kind: "code"; lang: string; value: string; highlight?: number[] }
  | { kind: "table"; headers: string[]; rows: string[][]; caption?: string };

// ── Limits ────────────────────────────────────────────────────────────────────
//
// Caps are generous enough that no legitimate exercise hits them and tight
// enough that a runaway generation cannot store a megabyte per document.

const MAX_BLOCKS = 12;
const MAX_TEXT = 4000;
const MAX_LABEL = 200;
const MAX_SERIES = 6;
const MAX_POINTS = 400;
const MAX_ELEMENTS = 80;
const MAX_ROWS = 40;
const MAX_COLS = 10;
const MAX_CODE_LINES = 60;

// ── Primitive coercion ────────────────────────────────────────────────────────

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  // Control characters other than tab and newline have no legitimate use here
  // and are the usual vehicle for smuggling something past a later consumer.
  // eslint-disable-next-line no-control-regex -- matching them is the point
  const cleaned = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, max);
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function pair(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const a = num(v[0]);
  const b = num(v[1]);
  return a === null || b === null ? null : [a, b];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function arr(v: unknown, max: number): unknown[] {
  return Array.isArray(v) ? v.slice(0, max) : [];
}

// ── Per-kind sanitizers ───────────────────────────────────────────────────────

function sanitizeText(raw: Record<string, unknown>): ContentBlock | null {
  const value = str(raw.value, MAX_TEXT);
  return value ? { kind: "text", value } : null;
}

function sanitizeLatex(raw: Record<string, unknown>): ContentBlock | null {
  const value = str(raw.value, MAX_TEXT);
  if (!value) return null;
  // The renderer runs KaTeX in throw-on-error-off mode, so a malformed body
  // degrades to its own source text rather than breaking the exercise.
  return { kind: "latex", value, display: bool(raw.display) };
}

const PLOT_TYPES = new Set<PlotType>(["function", "scatter", "vector", "bar", "number_line"]);

function sanitizePlot(raw: Record<string, unknown>): ContentBlock | null {
  const spec = isRecord(raw.spec) ? raw.spec : null;
  if (!spec) return null;
  const type = typeof spec.type === "string" && PLOT_TYPES.has(spec.type as PlotType)
    ? (spec.type as PlotType)
    : "function";

  const series: PlotSeries[] = [];
  for (const rawSeries of arr(spec.series, MAX_SERIES)) {
    if (!isRecord(rawSeries)) continue;
    const s: PlotSeries = {};
    const label = str(rawSeries.label, MAX_LABEL);
    if (label) s.label = label;
    const expr = str(rawSeries.expr, 500);
    // An expression that does not parse would render as an empty curve with no
    // explanation, so it is dropped here and the series keeps only its label.
    if (expr && parseExpr(expr)) s.expr = expr;
    const points = arr(rawSeries.points, MAX_POINTS)
      .map(pair)
      .filter((p): p is [number, number] => p !== null);
    if (points.length > 0) s.points = points;
    const vectors = arr(rawSeries.vectors, MAX_SERIES * 4)
      .map((v) => {
        if (!isRecord(v)) return null;
        const from = pair(v.from);
        const to = pair(v.to);
        if (!from || !to) return null;
        const vlabel = str(v.label, MAX_LABEL);
        return vlabel ? { from, to, label: vlabel } : { from, to };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
    if (vectors.length > 0) s.vectors = vectors;
    if (rawSeries.style === "dashed") s.style = "dashed";
    else if (rawSeries.style === "solid") s.style = "solid";
    if (s.expr || s.points || s.vectors) series.push(s);
  }
  if (series.length === 0) return null;

  const out: PlotSpec = { type, series };
  const domain = pair(spec.domain);
  if (domain && domain[0] < domain[1]) out.domain = domain;
  const range = pair(spec.range);
  if (range && range[0] < range[1]) out.range = range;
  const xLabel = str(spec.xLabel, MAX_LABEL);
  if (xLabel) out.xLabel = xLabel;
  const yLabel = str(spec.yLabel, MAX_LABEL);
  if (yLabel) out.yLabel = yLabel;
  if (typeof spec.grid === "boolean") out.grid = spec.grid;

  const markers = arr(spec.markers, 20)
    .map((m) => {
      if (!isRecord(m)) return null;
      const x = num(m.x);
      const y = num(m.y);
      if (x === null || y === null) return null;
      const label = str(m.label, MAX_LABEL);
      return label ? { x, y, label } : { x, y };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);
  if (markers.length > 0) out.markers = markers;

  return { kind: "plot", spec: out };
}

function sanitizeDiagramElement(raw: unknown): DiagramElement | null {
  if (!isRecord(raw)) return null;
  const label = str(raw.label, MAX_LABEL) ?? undefined;
  switch (raw.t) {
    case "line": {
      const x1 = num(raw.x1), y1 = num(raw.y1), x2 = num(raw.x2), y2 = num(raw.y2);
      if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
      const arrow = raw.arrow === "end" || raw.arrow === "both" || raw.arrow === "none"
        ? raw.arrow
        : undefined;
      return { t: "line", x1, y1, x2, y2, arrow, dashed: bool(raw.dashed), label };
    }
    case "circle": {
      const cx = num(raw.cx), cy = num(raw.cy), r = num(raw.r);
      if (cx === null || cy === null || r === null || r <= 0) return null;
      return { t: "circle", cx, cy, r, fill: bool(raw.fill), label };
    }
    case "rect": {
      const x = num(raw.x), y = num(raw.y), w = num(raw.w), h = num(raw.h);
      if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) return null;
      return { t: "rect", x, y, w, h, label };
    }
    case "arc": {
      const cx = num(raw.cx), cy = num(raw.cy), r = num(raw.r);
      const start = num(raw.start), end = num(raw.end);
      if (cx === null || cy === null || r === null || start === null || end === null) return null;
      if (r <= 0) return null;
      return { t: "arc", cx, cy, r, start, end, label };
    }
    case "polygon": {
      const points = arr(raw.points, 60).map(pair).filter((p): p is [number, number] => p !== null);
      if (points.length < 3) return null;
      return { t: "polygon", points, fill: bool(raw.fill), label };
    }
    case "label": {
      const x = num(raw.x), y = num(raw.y);
      const text = str(raw.text, MAX_LABEL);
      if (x === null || y === null || !text) return null;
      return { t: "label", x, y, text, latex: bool(raw.latex) };
    }
    default:
      return null;
  }
}

function sanitizeDiagram(raw: Record<string, unknown>): ContentBlock | null {
  const spec = isRecord(raw.spec) ? raw.spec : null;
  if (!spec) return null;
  const box = arr(spec.viewBox, 4).map(num);
  const viewBox: [number, number, number, number] =
    box.length === 4 && box.every((n): n is number => n !== null)
      ? [box[0] as number, box[1] as number, box[2] as number, box[3] as number]
      : [0, 0, 200, 150];
  if (viewBox[2] <= 0 || viewBox[3] <= 0) return null;
  const elements = arr(spec.elements, MAX_ELEMENTS)
    .map(sanitizeDiagramElement)
    .filter((e): e is DiagramElement => e !== null);
  return elements.length > 0 ? { kind: "diagram", spec: { viewBox, elements } } : null;
}

function sanitizeSource(raw: Record<string, unknown>): ContentBlock | null {
  // The generator emits `claim`; a verified block carries `ref`. Both shapes
  // land here so a block survives Phase 3 arriving without a re-generation.
  const body = isRecord(raw.ref) ? raw.ref : isRecord(raw.claim) ? raw.claim : null;
  if (!body) return null;
  const ref: SourceRef = {
    verified: body.verified === true,
    showTranslation: body.showTranslation === true,
    ...(body.translationMachine === true ? { translationMachine: true } : {}),
  };
  const textFields: [keyof SourceRef & string, number][] = [
    ["sourceId", 128],
    ["provider", 32],
    ["author", MAX_LABEL],
    ["work", MAX_LABEL],
    ["locus", MAX_LABEL],
    ["date", MAX_LABEL],
    ["lang", 16],
    ["text", MAX_TEXT],
    ["translation", MAX_TEXT],
    ["license", MAX_LABEL],
  ];
  const writable = ref as Record<string, string | number | boolean>;
  for (const [key, max] of textFields) {
    const v = str(body[key], max);
    if (v) writable[key] = v;
  }
  const url = str(body.url, 500);
  // Only the two schemes a citation link can legitimately use, so a stored
  // `javascript:` href can never reach an anchor.
  if (url && (url.startsWith("https://") || url.startsWith("http://"))) ref.url = url;
  const start = num(body.excerptStart);
  const end = num(body.excerptEnd);
  if (start !== null && end !== null && end > start) {
    ref.excerptStart = start;
    ref.excerptEnd = end;
  }
  // A source block with neither an identity nor a text says nothing.
  if (!ref.sourceId && !ref.text && !ref.author && !ref.work) return null;
  return { kind: "source", ref };
}

function sanitizeCode(raw: Record<string, unknown>): ContentBlock | null {
  const value = str(raw.value, MAX_TEXT);
  if (!value) return null;
  const lines = value.split("\n").slice(0, MAX_CODE_LINES).join("\n");
  const lang = (str(raw.lang, 32) ?? "text").toLowerCase().replace(/[^a-z0-9+#_-]/g, "");
  const highlight = arr(raw.highlight, 40)
    .map(num)
    .filter((n): n is number => n !== null && n > 0)
    .map((n) => Math.floor(n));
  return {
    kind: "code",
    lang: lang || "text",
    value: lines,
    ...(highlight.length > 0 ? { highlight } : {}),
  };
}

function sanitizeTable(raw: Record<string, unknown>): ContentBlock | null {
  const headers = arr(raw.headers, MAX_COLS).map((h) => str(h, MAX_LABEL) ?? "");
  if (headers.length === 0) return null;
  const rows = arr(raw.rows, MAX_ROWS)
    .map((row) =>
      arr(row, MAX_COLS)
        .map((cell) => str(cell, MAX_LABEL) ?? "")
        .slice(0, headers.length),
    )
    .filter((row) => row.length > 0);
  if (rows.length === 0) return null;
  const caption = str(raw.caption, MAX_LABEL);
  return { kind: "table", headers, rows, ...(caption ? { caption } : {}) };
}

const SANITIZERS: Record<BlockKind, (raw: Record<string, unknown>) => ContentBlock | null> = {
  text: sanitizeText,
  latex: sanitizeLatex,
  plot: sanitizePlot,
  diagram: sanitizeDiagram,
  source: sanitizeSource,
  code: sanitizeCode,
  table: sanitizeTable,
};

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Rebuild a block array from whatever the generator returned, keeping only
 * values that fit the declared shapes and only kinds the domain spec allows.
 *
 * Nothing is trusted and nothing is passed through: every field on every block
 * is re-read and re-typed, so a property the model invented cannot survive into
 * the shared bank. A block that cannot be rebuilt is dropped, which degrades the
 * exercise to prose rather than failing generation.
 */
export function sanitizeBlocks(raw: unknown, allowed: BlockKind[]): ContentBlock[] {
  if (!Array.isArray(raw)) return [];
  const permitted = new Set<BlockKind>(allowed);
  const out: ContentBlock[] = [];
  for (const item of raw.slice(0, MAX_BLOCKS)) {
    if (!isRecord(item)) continue;
    const kind = item.kind;
    if (typeof kind !== "string" || !permitted.has(kind as BlockKind)) continue;
    const sanitizer = SANITIZERS[kind as BlockKind];
    if (!sanitizer) continue;
    const block = sanitizer(item);
    if (block) out.push(block);
  }
  return out;
}

/** True when an exercise carries a structured body rather than legacy strings. */
export function hasBlocks(value: unknown): value is ContentBlock[] {
  return Array.isArray(value) && value.length > 0;
}
