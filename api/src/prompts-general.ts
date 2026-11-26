// Prompt builders for every subject that is not a language.
//
// The language builders in prompts.ts are left untouched, so a language path
// produces byte-identical output to what it did before this refactor. Anything
// else routes here, where the domain spec supplies the persona, the allowed
// content blocks, and the generation rules.

import type {
  CalibrationLevel,
  CalibrationProbeLevel,
  DomainSpec,
  ExerciseType,
  GradingMode,
  ModulePerformance,
} from "./domains";

export type SubjectContext = {
  /** What the student typed, e.g. "Macroeconomics". */
  subject: string;
  /** Root-to-leaf taxonomy ids. */
  taxonomy: string[];
  /** Human-readable lineage, e.g. "Social Science / Economics / Macroeconomics". */
  breadcrumb: string;
  spec: DomainSpec;
  /** Language every instruction and explanation is written in. */
  nativeLanguage: string;
};

function rulesBlock(spec: DomainSpec): string {
  if (spec.rules.length === 0) return "";
  return `\nRules for this subject area:\n${spec.rules.map((r) => `- ${r}`).join("\n")}\n`;
}

// ── Content block schema ──────────────────────────────────────────────────────

const BLOCK_SCHEMAS: Record<string, string> = {
  text: `{ "kind": "text", "value": "prose in NATIVE" }`,
  latex: `{ "kind": "latex", "value": "x^2 + 2x + 1", "display": true }
      LaTeX body only, no surrounding $ or \\[ \\]. "display" true for its own line, false for inline.`,
  plot: `{ "kind": "plot", "spec": {
        "type": "function" | "scatter" | "vector" | "bar" | "number_line",
        "domain": [-5, 5], "range": [-10, 10], "xLabel": "x", "yLabel": "f(x)", "grid": true,
        "series": [{ "label": "f", "expr": "x^2 - 3*x", "style": "solid" }],
        "markers": [{ "x": 1.5, "y": -2.25, "label": "minimum" }]
      } }
      "expr" may use + - * / ^ ( ), the variable x, and: sin cos tan asin acos atan exp ln log sqrt abs floor ceil.
      Use "points": [[x,y],...] for scatter and "vectors": [{"from":[0,0],"to":[3,4]}] for vector plots.`,
  diagram: `{ "kind": "diagram", "spec": {
        "viewBox": [0, 0, 200, 150],
        "elements": [
          { "t": "line", "x1": 20, "y1": 100, "x2": 120, "y2": 100, "arrow": "end", "label": "F" },
          { "t": "circle", "cx": 20, "cy": 100, "r": 8, "fill": true },
          { "t": "label", "x": 70, "y": 90, "text": "F = ma", "latex": true }
        ]
      } }
      Primitives: line, circle, rect, arc, polygon, label. Coordinates are numbers inside viewBox.`,
  source: `{ "kind": "source", "claim": {
        "author": "Thucydides", "work": "History of the Peloponnesian War",
        "locus": "1.22", "date": "c. 400 BC", "lang": "grc",
        "passage": "the opening words of the passage you intend to quote"
      } }
      Supply the CLAIM only. The passage is retrieved and verified server-side before the
      student sees it. Never write out a quotation you are not certain exists verbatim.`,
  code: `{ "kind": "code", "lang": "python", "value": "def f(n):\\n    return n * 2", "highlight": [2] }`,
  table: `{ "kind": "table", "headers": ["Year", "GDP"], "rows": [["2020", "1.2"], ["2021", "1.4"]], "caption": "optional" }`,
};

/** Corpora the verification pipeline can actually check a citation against. */
const PROVIDER_CORPORA: Record<string, string> = {
  perseus: "Perseus (canonical Greek and Latin: Homer, Herodotus, Thucydides, Plato, Xenophon, the tragedians, Caesar, Cicero, Virgil, Horace, Ovid, Sallust, Lucretius, Catullus, Seneca, Suetonius)",
  wikisource: "Wikisource (public-domain works and documents in many languages)",
  gutenberg: "Project Gutenberg (full public-domain books)",
  crossref: "Crossref (journal articles by DOI)",
  openalex: "OpenAlex (academic works)",
  arxiv: "arXiv (preprints by id)",
};

function blocksSection(spec: DomainSpec, nativeLanguage: string): string {
  const allowed = spec.blocks.filter((b) => BLOCK_SCHEMAS[b]);
  const schemas = allowed
    .map((b) => `  - ${BLOCK_SCHEMAS[b].replace(/NATIVE/g, nativeLanguage)}`)
    .join("\n");

  // Telling the generator which corpora are consulted raises the share of
  // citations that survive verification, which is the difference between an
  // exercise that has a source block and one whose source block was dropped.
  const corpora = allowed.includes("source")
    ? spec.sourceProviders.map((id) => PROVIDER_CORPORA[id]).filter(Boolean)
    : [];
  const corporaNote =
    corpora.length > 0
      ? `\n\nA source claim is checked against these corpora, and the block is DROPPED if it cannot be found:
${corpora.map((c) => `  - ${c}`).join("\n")}
Cite something these actually hold, give the locus in the work's own numbering
(e.g. "1.22", "Book 3, chapter 4"), and set "passage" to the opening words as
they truly appear. A citation you are not certain of costs the student the block.`
      : "";

  return `"blocks" is an ordered array presenting the problem. Allowed kinds for this subject:
${schemas}

Never emit raw HTML or raw SVG in any field. Every visual is a declarative spec from the list above.${corporaNote}`;
}

// ── Grading schema ────────────────────────────────────────────────────────────

const GRADING_SCHEMAS: Record<GradingMode, string> = {
  exact: `{ "mode": "exact", "answer": "the answer", "accept": ["equivalent phrasing", "..."] }`,
  numeric: `{ "mode": "numeric", "value": 9.81, "tolerance": 0.05, "relative": false, "unit": "m/s^2", "sigFigs": 3 }`,
  choice: `{ "mode": "choice", "correctIndex": 0 }`,
  set: `{ "mode": "set", "pairs": [{ "left": "term", "right": "match" }] }`,
  order: `{ "mode": "order", "items": ["first", "second", "third"] }`,
  symbolic: `{ "mode": "symbolic", "latex": "x^2+2x+1", "variables": ["x"] }`,
  rubric: `{ "mode": "rubric", "passScore": 0.6, "modelAnswer": "a complete correct answer",
      "criteria": [{ "id": "c1", "description": "identifies the mechanism", "weight": 0.5 }] }`,
};

/** Which grading mode each exercise type must use. */
export const TYPE_GRADING: Record<ExerciseType, GradingMode> = {
  multiple_choice: "choice",
  cloze: "exact",
  short_answer: "rubric",
  matching: "set",
  ordering: "order",
  flashcard: "exact",
  fill_blank: "exact",
  translation: "exact",
  conjugation: "exact",
  reading_comprehension: "choice",
  word_order: "order",
  numeric: "numeric",
  symbolic: "symbolic",
  derivation_order: "order",
  plot_reading: "choice",
  unit_conversion: "numeric",
  source_analysis: "rubric",
  chronology: "order",
  argument_reconstruction: "rubric",
  compare_contrast: "rubric",
  code_output: "exact",
  code_fix: "rubric",
  complexity: "exact",
};

// ── Per-type guidance ─────────────────────────────────────────────────────────

const TYPE_GUIDANCE: Partial<Record<ExerciseType, string>> = {
  multiple_choice: `Four options. Exactly one correct. The three distractors must be plausible to a student who half-understands the concept, never absurd. Put the options in an "options" array of strings alongside "blocks".`,
  cloze: `Present a statement with ___ marking the removed term. The removed term must be the load-bearing one, not an incidental word.`,
  short_answer: `Ask for two or three sentences of reasoning. The rubric criteria must reward the reasoning, not keyword matching.`,
  matching: `Four to six pairs. Every right-hand item must be plausible for more than one left-hand item, or the exercise is trivial.`,
  ordering: `Five to seven items with exactly one defensible order.`,
  numeric: `State the required units and precision in the instruction. Choose numbers that make the arithmetic incidental to the concept.`,
  symbolic: `The answer is an expression, not a number. Set "variables" to every free variable.`,
  derivation_order: `Give the steps of a derivation out of order. Each step must follow only from the ones before it, so exactly one ordering is valid.`,
  plot_reading: `Put the plot in "blocks" and ask a question whose answer is read off the plot rather than computed from a formula.`,
  unit_conversion: `Cross at least two unit systems or two orders of magnitude, so the conversion is the point.`,
  source_analysis: `Put a source block in "blocks" and ask what the passage claims, assumes, or implies. Never ask a question answerable without reading it.`,
  chronology: `Order events by date. Include at least one pair close enough in time that the ordering is not obvious.`,
  argument_reconstruction: `Present an argument in prose. Ask the student to separate premises from conclusion and name the inference.`,
  compare_contrast: `Name two positions, models, or periods. Ask for one substantive similarity and one substantive difference.`,
  code_output: `Deterministic only: no randomness, no wall-clock time, no unordered iteration. Under 25 lines.`,
  code_fix: `Present code with exactly one bug. The rubric rewards naming the bug and its fix, not rewriting the program.`,
  complexity: `Ask for time or space complexity in big-O. Set "answer" to the canonical form, e.g. "O(n log n)".`,
  flashcard: `A single term and its definition. Use only for genuinely atomic recall.`,
};

// ── Exercise generation ───────────────────────────────────────────────────────

export function generalExerciseSystemPrompt(spec: DomainSpec): string {
  return `${spec.persona}

You produce one exercise at a time as a single JSON object.
The exercise must teach, not merely test: a student who works through it should
understand something they did not before, whether or not they answer correctly.`;
}

export function buildGeneralExercisePrompt(
  ctx: SubjectContext,
  params: {
    level: string;
    topic: string;
    type: ExerciseType;
    difficultyNote?: string;
    /** Misconceptions to target, supplied during remediation. */
    misconceptions?: string[];
  },
): string {
  const N = ctx.nativeLanguage;
  const { level, topic, type, difficultyNote, misconceptions } = params;
  const grading = TYPE_GRADING[type];
  const guidance = TYPE_GUIDANCE[type] ?? "";

  const difficultySection = difficultyNote ? `\nDIFFICULTY NOTE: ${difficultyNote}\n` : "";
  const misconceptionSection =
    misconceptions && misconceptions.length > 0
      ? `\nThis student has shown these specific misunderstandings. Target them directly:\n${misconceptions
          .map((m) => `- ${m}`)
          .join("\n")}\n`
      : "";

  return `Generate one ${type} exercise.

- Subject: ${ctx.subject}
- Subject area: ${ctx.breadcrumb}
- Topic: ${topic}
- Level: ${level}
- Write ALL instructions, explanations, and prose in ${N}.
${rulesBlock(ctx.spec)}${difficultySection}${misconceptionSection}
Type guidance: ${guidance}

${blocksSection(ctx.spec, N)}

Return ONLY valid JSON in exactly this shape:
{
  "type": "${type}",
  "icon": "a single PascalCase Lucide icon name representing the subject matter (e.g. Sigma, Atom, Scale, Landmark, Binary)",
  "context": "one sentence in ${N}: the real situation this represents AND the specific concept it tests",
  "instruction": "what the student must do, in ${N}",
  "blocks": [ ... ],${type === "multiple_choice" || type === "plot_reading" || type === "reading_comprehension" ? `\n  "options": ["option in ${N}", "option", "option", "option"],` : ""}
  "grading": ${GRADING_SCHEMAS[grading]},
  "explanation": "why the answer is correct and what principle it rests on, in ${N}",
  "concepts": ["the one to three named concepts this exercise exercises"]
}`;
}

// ── Path outline ──────────────────────────────────────────────────────────────

export function generalPathOutlineSystemPrompt(spec: DomainSpec): string {
  return `${spec.persona}

You are designing the high-level arc of a learning path: an ordered list of modules,
each with a name, a short description, and a one-line focus.
Do NOT write individual lesson topics. Those are designed later, once the student's
real performance is known.
Difficulty must ramp gradually and every module must build on the ones before it.
Favour genuine understanding over coverage: a shorter path the student actually
masters beats a broad survey they forget.`;
}

const LEVEL_NOTES_GENERAL: Record<CalibrationLevel, string> = {
  complete_beginner:
    "The student is starting from zero in {subject}. Begin with the vocabulary and the core objects of the field before any technique.",
  some_basics:
    "The student has scattered exposure to {subject} but no structure. Module 1 should consolidate the fragments into a frame; real progress starts at Module 2.",
  elementary:
    "The student knows the fundamentals of {subject}. Skip introductory material and start building on it directly.",
  intermediate:
    "The student has solid foundations in {subject}. Start with the substantive machinery of the field rather than its preliminaries.",
};

export function buildGeneralPathOutlinePrompt(
  ctx: SubjectContext,
  params: {
    objective: string;
    timeframe: string;
    moduleCount: number;
    startingLevel: CalibrationLevel;
    /** Concepts carried over from a sibling path. See taxonomy transfer. */
    knownConcepts?: string[];
  },
): string {
  const { objective, timeframe, moduleCount, startingLevel, knownConcepts } = params;
  const levelNote = LEVEL_NOTES_GENERAL[startingLevel].replace(/\{subject\}/g, ctx.subject);

  const transfer =
    knownConcepts && knownConcepts.length > 0
      ? `\nThe student has ALREADY MASTERED these concepts in a related subject. Do not
re-teach them. Where a module would have covered them, either skip it, compress it
into a short review folded into another module, or reframe it toward what is genuinely
new in this subject:
${knownConcepts.map((c) => `- ${c}`).join("\n")}
`
      : "";

  return `Design the module outline for a learning path in ${ctx.subject}.

- Subject area: ${ctx.breadcrumb}
- Goal: ${objective}
- Timeframe: ${timeframe}
- Student level: ${startingLevel.replace(/_/g, " ")}
- Number of modules: exactly ${moduleCount}

Level guidance: ${levelNote}
${transfer}${rulesBlock(ctx.spec)}
Module names must name real skills or bodies of knowledge in ${ctx.subject}, not generic
headings like "Introduction" or "Advanced Topics".
The arc should carry the student from their current level to the stated goal across ${moduleCount} modules.

Write everything in ${ctx.nativeLanguage}.

Return ONLY valid JSON:
{
  "subject": "${ctx.subject}",
  "objective": "${objective}",
  "modules": [
    {
      "name": "Module name",
      "description": "What this module covers, in one or two sentences",
      "focus": "The single core capability this module builds, in a few words",
      "order": 1
    }
  ]
}`;
}

// ── Module topics ─────────────────────────────────────────────────────────────

export function generalModuleTopicsSystemPrompt(spec: DomainSpec): string {
  return `${spec.persona}

You design the lessons inside a single module of a learning path.
You are given the module's theme, what the student has already covered, and how they
have actually been performing.
Adapt: if the student is struggling, slow the ramp and reinforce; if they are ahead,
raise the ceiling and add depth.
Each topic must be a specific, teachable skill, not a vague theme.`;
}

export function buildGeneralModuleTopicsPrompt(
  ctx: SubjectContext,
  params: {
    objective: string;
    startingLevel: CalibrationLevel;
    module: { name: string; description?: string; focus?: string; order: number };
    previousModules: string[];
    nextModule: string | null;
    coveredTopics: string[];
    performance: ModulePerformance | null;
    /** Verbatim guidance carried out of the previous section exam. */
    assessmentGuidance?: string;
  },
): string {
  const {
    objective, startingLevel, module, previousModules, nextModule, coveredTopics,
    performance, assessmentGuidance,
  } = params;

  const already =
    previousModules.length > 0
      ? `Modules already completed (do not re-teach these as new material):\n${previousModules
          .map((m, i) => `${i + 1}. ${m}`)
          .join("\n")}`
      : "This is the very first module of the path.";

  const covered =
    coveredTopics.length > 0
      ? `\n\nTopics already taught, do NOT repeat any of these:\n${coveredTopics.map((t) => `- ${t}`).join("\n")}`
      : "";

  const lands = nextModule
    ? `\n\nAfter this module the student moves on to "${nextModule}", so this module must leave them ready for it.`
    : "\n\nThis is the final module of the path. It should consolidate everything into the stated goal.";

  const guidance = assessmentGuidance ? `\n\n${assessmentGuidance}\n` : "";

  return `Design the topics for module ${module.order} of a learning path in ${ctx.subject}.

- Subject area: ${ctx.breadcrumb}
- Overall goal: ${objective}
- Student's starting level: ${startingLevel.replace(/_/g, " ")}
- Module name: ${module.name}
- Module description: ${module.description ?? ""}
- Module focus: ${module.focus ?? module.name}

${already}${covered}${lands}

Performance so far: ${describePerformanceGeneral(performance)}${guidance}
${rulesBlock(ctx.spec)}
Produce 3 to 5 topics. Each topic is one concrete skill the student can practice with exercises.
For each topic also name the underlying concepts it rests on, and any prerequisite
relationships among those concepts.

Write everything in ${ctx.nativeLanguage}.

Return ONLY valid JSON:
{
  "topics": [
    {
      "name": "Topic name",
      "order": 1,
      "description": "What this topic covers and why it comes here",
      "concepts": ["named concept", "another"]
    }
  ],
  "prerequisites": [
    { "from": "concept that must come first", "to": "concept that depends on it" }
  ]
}`;
}

export function describePerformanceGeneral(perf: ModulePerformance | null): string {
  if (!perf || perf.answered < 5) {
    return "No meaningful performance data yet. Pitch this module at the expected level for its position in the path.";
  }
  const pct = Math.round(perf.accuracy * 100);
  if (perf.accuracy >= 0.85) {
    return `The student is answering ${pct}% correctly across ${perf.answered} exercises. They are ahead of pace. Raise the difficulty: denser topics, less review, more challenging material than this module's position would normally call for.`;
  }
  if (perf.accuracy >= 0.65) {
    return `The student is answering ${pct}% correctly across ${perf.answered} exercises. On pace. Keep the standard ramp for this module's position.`;
  }
  if (perf.accuracy >= 0.45) {
    return `The student is answering ${pct}% correctly across ${perf.answered} exercises. Struggling somewhat. Soften the ramp: smaller steps, and fold a review of the previous module's weak points into the first topic.`;
  }
  return `The student is answering ${pct}% correctly across ${perf.answered} exercises. Struggling badly. Prioritize consolidation: keep topics narrow and concrete, revisit fundamentals from earlier modules, and introduce at most one new idea per topic.`;
}

// ── Calibration blueprint ─────────────────────────────────────────────────────

export const CALIBRATION_BLUEPRINT_SYSTEM_PROMPT = `You design placement tests.
Given a subject, you produce the topic areas a placement test should probe at each of
four difficulty levels. You are not writing questions, only naming what to test.
Each probe topic must be specific enough that a question writer knows exactly what to ask.`;

export function buildCalibrationBlueprintPrompt(ctx: SubjectContext): string {
  return `Design the probe topics for a placement test in ${ctx.subject}.

Subject area: ${ctx.breadcrumb}

Produce 6 to 8 probe topics for each of four levels:
- beginner: someone who has never studied ${ctx.subject} could still guess at one or two
- elementary: the first things anyone learns in ${ctx.subject}
- intermediate: the working machinery of the field
- advanced: what separates a confident practitioner from a competent one

Each probe topic is a short phrase naming a specific testable thing, not a broad area.
Write them in ${ctx.nativeLanguage}.

Return ONLY valid JSON:
{
  "levels": {
    "beginner": ["probe topic", "..."],
    "elementary": ["probe topic", "..."],
    "intermediate": ["probe topic", "..."],
    "advanced": ["probe topic", "..."]
  }
}`;
}

export const CALIBRATION_ITEM_SYSTEM_PROMPT = `You write placement test questions.
Each question has exactly one unambiguously correct answer and no trick wording.
Calibrate strictly to the requested level.
Never reuse a question already asked in this session.`;

export function buildGeneralCalibrationStagePrompt(
  ctx: SubjectContext,
  params: {
    probeLevel: CalibrationProbeLevel;
    stage: number;
    topics: string[];
    askedQuestions: string[];
    stageSize: number;
  },
): string {
  const { probeLevel, stage, topics, askedQuestions, stageSize } = params;
  const topicList = topics.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const exclusion =
    askedQuestions.length > 0
      ? `\nAlready asked in this session, do NOT reuse these or close variants:\n${askedQuestions
          .map((q) => `- ${q}`)
          .join("\n")}\n`
      : "";

  return `Generate stage ${stage} of a placement test in ${ctx.subject}: exactly ${stageSize} questions.
Difficulty for this stage: ${probeLevel}. Every question must sit squarely at that level.

Subject area: ${ctx.breadcrumb}
${exclusion}
Cover these probe topics, one question each, in order:
${topicList}

Rules:
- Each question has 4 options, exactly one correct.
- The 3 wrong options must be plausible at this level, not obviously absurd.
- Test something specific. Do not test the same idea twice.
- Write everything in ${ctx.nativeLanguage}.

Return ONLY valid JSON:
{
  "questions": [
    {
      "topic": "probe topic name",
      "question": "the question",
      "instruction": "short instruction, e.g. 'Which of these is correct?'",
      "options": ["option", "option", "option", "option"],
      "correctIndex": 0
    }
  ]
}`;
}

// ── Subject classification and scoping ────────────────────────────────────────

export const CLASSIFY_SYSTEM_PROMPT = `You place a subject of study into a fixed taxonomy tree.
You return the deepest existing node that genuinely fits. Only propose a new node when
nothing at the third level is a reasonable home, and then propose exactly one.`;

export function buildClassifyPrompt(
  subject: string,
  objective: string,
  candidates: { id: string; name: string; lineage: string }[],
): string {
  const list = candidates.map((c) => `- ${c.id}  (${c.lineage})`).join("\n");
  return `Place this subject in the taxonomy.

Subject: "${subject}"
Stated goal: "${objective}"

Existing nodes (id, then its lineage):
${list}

Pick the deepest node that genuinely fits. If none of the third-level nodes is a
reasonable home, pick the best second-level node as the parent and propose ONE new
child under it.

Return ONLY valid JSON:
{
  "taxonomyLeaf": "the id of the chosen existing node, or the id of the node you propose",
  "confidence": 0.0,
  "proposed": null
}

If you are proposing a new node, set "proposed" instead of null:
{
  "taxonomyLeaf": "byzantine_sigillography",
  "confidence": 0.8,
  "proposed": { "id": "byzantine_sigillography", "parentId": "history", "name": "Byzantine Sigillography", "aliases": [] }
}

The "id" must be lowercase with underscores. "parentId" MUST be one of the ids listed above.`;
}

export const SCOPE_CHECK_SYSTEM_PROMPT = `You judge whether a stated learning goal is
narrow enough to build a real curriculum around.
"Learn physics" is too broad: it would produce ten shallow modules and teach nothing.
"Kirchhoff's laws" is too narrow: it is one topic, not a curriculum.
You are generous. Only flag a goal when it genuinely cannot be planned as stated.`;

export function buildScopeCheckPrompt(subject: string, objective: string, nativeLanguage: string): string {
  return `Judge the scope of this learning goal.

Subject: "${subject}"
Goal: "${objective}"

If it is too broad, write 3 to 5 questions that would narrow it down: which subfield,
what level, what the student wants to do with it, what they already know.
If it is too narrow, say what it should widen to.
Write all questions and options in ${nativeLanguage}.

Return ONLY valid JSON:
{
  "breadth": "too_broad" | "workable" | "narrow",
  "reason": "one sentence in ${nativeLanguage}",
  "questions": [
    {
      "id": "subfield",
      "question": "question text",
      "options": ["option", "option", "option"],
      "allowsFreeText": true
    }
  ],
  "suggestedObjective": "a rewritten goal, or null if the goal is already workable"
}

Return an empty "questions" array when breadth is "workable".`;
}
