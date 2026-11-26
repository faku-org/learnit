import type { Db } from "mongodb";
import { type AssessmentDoc, type AssessmentQuestion, bankFor } from "../db/integration";
import { type StudentAnswer, answerKindFor, gradeDeterministic, gradingSpecOf } from "../grading";
import { allNodes, matchSubject, slugify } from "../taxonomy";
import { HOUR, MAX_QUESTIONS, MIN_QUESTIONS, addMs, config, newId, newToken, sha256Hex } from "./config";

/**
 * The standard LearnIt evaluation (ADR 0003): questions come from the shared exercise bank for a subject, an
 * optional topic and a level, and are graded here, on the server, by the deterministic grading ladder. The
 * company does not define the questions and nothing calls an LLM at assessment time.
 */

type DbLike = Pick<Db, "collection">;
type Doc = Record<string, unknown>;

/** Modes the ladder settles without a model: the only ones an assessment can be graded on. */
const GRADABLE = new Set(["choice", "exact", "numeric"]);

export interface NewAssessment {
  subject: string;
  topic?: string | null;
  level: string;
  offerId?: string | null;
  consentId?: string | null;
}

export type CreateOutcome =
  | { ok: true; assessment: AssessmentDoc; code: string }
  | { ok: false; code: "unknown_subject" | "not_enough_questions"; available: number };

const strings = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? (value as string[]) : null;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function questionFrom(row: Doc): AssessmentQuestion | null {
  const spec = gradingSpecOf(row as Parameters<typeof gradingSpecOf>[0]);
  if (!GRADABLE.has(spec.mode)) return null;
  if (typeof row.question !== "string" || !row.question.trim()) return null;
  const options = strings(row.options);
  if (spec.mode === "choice" && (!options || options.length < 2)) return null;
  return {
    exerciseId: String(row._id),
    topic: typeof row.topic === "string" && row.topic.trim() ? row.topic.trim() : "General",
    type: typeof row.type === "string" ? row.type : "multiple_choice",
    question: row.question,
    options,
    sentence: typeof row.sentence === "string" ? row.sentence : null,
    blocks: Array.isArray(row.blocks) ? row.blocks : null,
    spec,
  };
}

/** The taxonomy node a caller's `subject` means: an id, or a name or alias. */
async function leafOf(db: DbLike, subject: string): Promise<{ leaf: string; name: string; taxonomy: string[] } | null> {
  const nodes = await allNodes(db as Db);
  const node = nodes.get(subject.trim().toLowerCase()) ?? (await matchSubject(db as Db, subject));
  if (!node) return null;
  const chain: string[] = [];
  for (let cursor: string | null = node.id, guard = 0; cursor && guard < 16; guard++) {
    chain.unshift(cursor);
    cursor = nodes.get(cursor)?.parentId ?? null;
  }
  return { leaf: node.id, name: node.name, taxonomy: chain };
}

export async function createAssessment(
  db: DbLike,
  caller: { label: string },
  input: NewAssessment,
  now = new Date(),
): Promise<CreateOutcome> {
  const resolved = (await leafOf(db, input.subject)) ?? { leaf: slugify(input.subject), name: input.subject, taxonomy: [slugify(input.subject)] };
  const level = input.level.trim().toLowerCase();
  const topic = input.topic?.trim() || null;

  const rows = await bankFor(db, { taxonomyLeaf: resolved.leaf, level });
  const pool = rows
    .filter((row) => !topic || (typeof row.topic === "string" && row.topic.trim().toLowerCase() === topic.toLowerCase()))
    .map(questionFrom)
    .filter((question): question is AssessmentQuestion => question !== null);

  if (pool.length < MIN_QUESTIONS) {
    return { ok: false, code: rows.length === 0 ? "unknown_subject" : "not_enough_questions", available: pool.length };
  }

  const code = newToken();
  const assessment: AssessmentDoc = {
    _id: newId(),
    codeHash: sha256Hex(code),
    createdBy: caller.label,
    subject: resolved.name,
    taxonomy: resolved.taxonomy,
    topic,
    level,
    offerId: input.offerId?.trim() || null,
    questions: shuffle(pool).slice(0, MAX_QUESTIONS),
    status: "pending",
    userId: null,
    consentId: input.consentId ?? null,
    score: null,
    passed: null,
    failedTopics: [],
    createdAt: now.toISOString(),
    expiresAt: addMs(now, config.assessmentHours() * HOUR).toISOString(),
    claimedAt: null,
    completedAt: null,
  };
  return { ok: true, assessment, code };
}

/** What the applicant sees: the question, never the answer key. */
export function publicQuestions(assessment: Pick<AssessmentDoc, "questions">) {
  return assessment.questions.map((question, index) => ({
    q: index,
    type: question.type,
    topic: question.topic,
    question: question.question,
    input: answerKindFor(question.spec.mode),
    ...(question.options ? { options: question.options } : {}),
    ...(question.sentence ? { sentence: question.sentence } : {}),
    ...(question.blocks ? { blocks: question.blocks } : {}),
  }));
}

export interface SubmittedAnswer {
  q: number;
  choice?: number | null;
  text?: string;
}

export interface Outcome {
  score: number;
  passed: boolean;
  failedTopics: string[];
}

/** Grades every question once. An unanswered question is a wrong one. */
export function gradeAssessment(assessment: Pick<AssessmentDoc, "questions">, answers: SubmittedAnswer[]): Outcome {
  const byQuestion = new Map(answers.map((answer) => [answer.q, answer]));
  const failed = new Set<string>();
  let right = 0;

  assessment.questions.forEach((question, index) => {
    const given = byQuestion.get(index);
    const answer: StudentAnswer =
      question.spec.mode === "choice"
        ? { kind: "choice", index: typeof given?.choice === "number" ? given.choice : null }
        : { kind: "text", value: given?.text ?? "" };
    const result = given ? gradeDeterministic(question.spec, answer) : null;
    if (result?.correct) right += 1;
    else failed.add(question.topic);
  });

  const total = assessment.questions.length;
  const score = total === 0 ? 0 : Math.round((right / total) * 1000) / 10;
  return { score, passed: score >= config.passScore(), failedTopics: [...failed].sort() };
}
