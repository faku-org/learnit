// Placement-test questions, rebuilt before they reach the client.
//
// A question used to be five strings and a number. A programming or maths
// subject needs a code sample or a formula next to it, and the same content
// blocks the exercises use (blocks.ts) are the format for that, so there is one
// renderer and one whitelist instead of a second one for calibration.
//
// The generator is not trusted. Every field is re-read, `blocks` goes through
// the same `sanitizeBlocks` gate as an exercise, and anything that does not fit
// degrades to the plain-text question rather than failing the stage.

import { sanitizeBlocks, type ContentBlock } from "./blocks";
import type { BlockKind } from "./domains";

export type CalibrationQuestion = {
  topic: string;
  question: string;
  instruction: string;
  options: string[];
  correctIndex: number;
  /** Code, formula, table or figure the question is about. Absent for plain prose. */
  blocks?: ContentBlock[];
};

const MAX_PROSE = 600;
const MAX_OPTION = 400;
const MAX_OPTIONS = 6;
const MAX_OPTION_LINES = 8;

// Control characters other than tab and newline have no use here.
// eslint-disable-next-line no-control-regex -- matching them is the point
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Prose, collapsed to one trimmed string. Whitespace inside is kept as the
 * model wrote it because the client renders with `white-space: pre-wrap`.
 */
function prose(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const cleaned = v.replace(CONTROL, "").trim();
  return cleaned.length > 0 ? cleaned.slice(0, max) : null;
}

/**
 * An answer option. Unlike `prose` it keeps leading indentation on its first
 * line, because an option that is a line of code is meaningless without it, and
 * it caps the line count so an option cannot become a whole program.
 */
function option(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const cleaned = v.replace(CONTROL, "").replace(/^\n+/, "").trimEnd();
  if (cleaned.trim().length === 0) return null;
  return cleaned.split("\n").slice(0, MAX_OPTION_LINES).join("\n").slice(0, MAX_OPTION);
}

const FENCE = /```([A-Za-z0-9+#_-]*)[^\S\n]*\n([\s\S]*?)```/g;

/**
 * Models habitually write markdown fences into a question even when told to use
 * blocks. When that happens and code blocks are allowed, lift each fence into a
 * real code block and keep the surrounding prose as the question, so the code
 * still renders monospaced with its indentation instead of as a run of text.
 */
export function liftFences(
  question: string,
  allowed: BlockKind[],
): { question: string; blocks: unknown[] } {
  if (!allowed.includes("code") || !question.includes("```")) return { question, blocks: [] };
  const blocks: unknown[] = [];
  const text = question.replace(FENCE, (_m, lang: string, body: string) => {
    blocks.push({ kind: "code", lang: lang || "text", value: body.replace(/\n+$/, "") });
    return "";
  });
  // An unterminated fence is cut here rather than shown as backticks.
  const cleaned = text.replace(/```[\s\S]*$/, "").trim();
  return { question: cleaned, blocks };
}

/**
 * Validate one stage of generated questions.
 *
 * A question is dropped only when it cannot be answered: no prose, fewer than
 * two options, or a `correctIndex` outside them. A malformed or forbidden block
 * is dropped alone, leaving the question as plain text.
 */
export function sanitizeCalibrationQuestions(
  raw: unknown,
  allowed: BlockKind[],
  limit: number,
): CalibrationQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: CalibrationQuestion[] = [];
  for (const item of raw) {
    if (out.length >= limit) break;
    if (typeof item !== "object" || item === null) continue;
    const q = item as Record<string, unknown>;

    const options = (Array.isArray(q.options) ? q.options.slice(0, MAX_OPTIONS) : [])
      .map(option)
      .filter((o): o is string => o !== null);
    // Dropping an option shifts the indices after it, so a question that lost
    // one cannot trust `correctIndex`. Reject it instead of grading wrongly.
    const declared = Array.isArray(q.options) ? Math.min(q.options.length, MAX_OPTIONS) : 0;
    if (options.length < 2 || options.length !== declared) continue;

    const index = typeof q.correctIndex === "number" ? q.correctIndex : Number.NaN;
    if (!Number.isInteger(index) || index < 0 || index >= options.length) continue;

    const rawQuestion = prose(q.question, MAX_PROSE * 4) ?? "";
    const lifted = liftFences(rawQuestion, allowed);
    const topic = prose(q.topic, 120) ?? "";
    const questionText = prose(lifted.question, MAX_PROSE) ?? topic;
    if (!questionText) continue;

    const blocks = sanitizeBlocks(
      Array.isArray(q.blocks) && q.blocks.length > 0 ? q.blocks : lifted.blocks,
      allowed,
    );

    out.push({
      topic,
      question: questionText,
      instruction: prose(q.instruction, 200) ?? "",
      options,
      correctIndex: index,
      ...(blocks.length > 0 ? { blocks } : {}),
    });
  }
  return out;
}
