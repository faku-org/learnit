// Domain specification, resolved by inheritance along a taxonomy lineage.
//
// Each taxonomy node may contribute a fragment. Fragments merge root-to-leaf
// with the child winning, so `formal_science` can declare "formulas must be
// latex blocks" once and `calculus` adds only what is specific to calculus.
// Most leaves contribute nothing, which is what lets the tree be deep without
// this file becoming unmaintainable.

// ── Shared vocabulary ─────────────────────────────────────────────────────────

export type ExerciseType =
  // shared across domains
  | "multiple_choice"
  | "cloze"
  | "short_answer"
  | "matching"
  | "ordering"
  | "flashcard"
  // language (existing names kept so the exercise bank stays valid)
  | "fill_blank"
  | "translation"
  | "conjugation"
  | "reading_comprehension"
  | "word_order"
  // quantitative
  | "numeric"
  | "symbolic"
  | "derivation_order"
  | "plot_reading"
  | "unit_conversion"
  // humanities
  | "source_analysis"
  | "chronology"
  | "argument_reconstruction"
  | "compare_contrast"
  // computing
  | "code_output"
  | "code_fix"
  | "complexity";

export type BlockKind = "text" | "latex" | "plot" | "diagram" | "source" | "code" | "table";

export type GradingMode =
  | "exact"
  | "numeric"
  | "set"
  | "order"
  | "choice"
  | "rubric"
  | "symbolic";

/** Level a path starts at, as measured by calibration. */
export type CalibrationLevel = "complete_beginner" | "some_basics" | "elementary" | "intermediate";

/** Difficulty rung the adaptive placement ladder is currently probing. */
export type CalibrationProbeLevel = "beginner" | "elementary" | "intermediate" | "advanced";

export type ModulePerformance = {
  /** Fraction of exercises answered correctly across prior modules, 0-1. */
  accuracy: number;
  /** Number of exercises the accuracy is based on. */
  answered: number;
};

export type SourceProviderId =
  | "perseus"
  | "wikisource"
  | "gutenberg"
  | "crossref"
  | "openalex"
  | "arxiv"
  | "xai_search"
  | "duckduckgo";

/**
 * Which family of prompt builders a subject uses.
 *
 * `language` routes to the pre-existing builders verbatim. That is deliberate:
 * the acceptance test for this refactor is that a language path produces
 * byte-identical prompts to what it produced before, and the surest way to
 * guarantee that is to leave its code path untouched.
 */
export type PromptFamily = "language" | "quantitative" | "humanities" | "code" | "general";

export type DomainSpec = {
  promptFamily: PromptFamily;
  /** Rotation pool for exercise variety. pickNextType draws from this. */
  exerciseTypes: ExerciseType[];
  /** Content blocks the generator may emit. Anything else is rejected. */
  blocks: BlockKind[];
  /** Grading mode when the exercise type does not dictate one. */
  defaultGrading: GradingMode;
  /** Tutor persona, injected into generation system prompts. Unused by `language`. */
  persona: string;
  /** Generation constraints, concatenated root-first. */
  rules: string[];
  /** Which optional surfaces mount for paths in this branch. */
  features: { speak: boolean; vocabulary: boolean; tts: boolean };
  /** Retrieval backends consulted when a source block is requested. */
  sourceProviders: SourceProviderId[];
};

export type DomainFragment = Partial<Omit<DomainSpec, "rules">> & { rules?: string[] };

// ── Base ──────────────────────────────────────────────────────────────────────

export const BASE_SPEC: DomainSpec = {
  promptFamily: "general",
  exerciseTypes: ["multiple_choice", "cloze", "short_answer", "matching", "ordering", "flashcard"],
  blocks: ["text", "table"],
  defaultGrading: "exact",
  persona:
    "You are an expert tutor. You teach for understanding rather than recall, " +
    "and every exercise should make the student reason rather than remember.",
  rules: [
    "The exercise must teach, not merely test.",
    "State exactly one unambiguously correct answer.",
    "Never write a question whose answer is guessable from the phrasing alone.",
  ],
  features: { speak: false, vocabulary: false, tts: false },
  sourceProviders: [],
};

// ── Fragments, keyed by taxonomy node id ──────────────────────────────────────

export const FRAGMENTS: Record<string, DomainFragment> = {
  // ── language ────────────────────────────────────────────────────────────────
  language: {
    promptFamily: "language",
    exerciseTypes: [
      "multiple_choice",
      "fill_blank",
      "translation",
      "conjugation",
      "matching",
      "reading_comprehension",
      "word_order",
    ],
    blocks: ["text", "source"],
    defaultGrading: "exact",
    // Verbatim from the original EXERCISE_SYSTEM_PROMPT. Unused at runtime for
    // this family (the language builders carry their own copy), kept here so the
    // registry describes every branch uniformly.
    persona: `You are an expert language teacher creating exercises for a student.
Generate exercises that are challenging but approachable.
The exercise should teach, not just test.
Always provide clear instructions in English.
Always include the correct answer and a brief explanation in English.

CRITICAL: The exercise content - sentences, words, questions, and answer options - must use
the target language being studied. Do NOT write the exercise in English unless the task is
explicitly to translate FROM English into the target language.`,
    rules: [],
    features: { speak: true, vocabulary: true, tts: true },
    sourceProviders: ["wikisource", "gutenberg"],
  },

  // Classical languages read primary texts rather than order coffee.
  latin: { sourceProviders: ["perseus", "wikisource"], features: { speak: false, vocabulary: true, tts: false } },
  ancient_greek: { sourceProviders: ["perseus", "wikisource"], features: { speak: false, vocabulary: true, tts: false } },

  // ── formal science ──────────────────────────────────────────────────────────
  formal_science: {
    promptFamily: "quantitative",
    exerciseTypes: [
      "numeric",
      "symbolic",
      "derivation_order",
      "multiple_choice",
      "short_answer",
      "cloze",
    ],
    blocks: ["text", "latex", "table"],
    defaultGrading: "symbolic",
    persona:
      "You are a mathematics tutor who teaches through worked reasoning, never " +
      "through memorized procedure. You expect the student to justify a result, " +
      "not merely produce it.",
    rules: [
      "Every formula, equation, or symbolic expression MUST be a latex block. Never inline it as plain text.",
      "A derivation exercise must have exactly one valid ordering of its steps.",
      "State any assumption the problem relies on rather than leaving it implicit.",
    ],
    sourceProviders: ["arxiv"],
  },
  mathematics: {
    exerciseTypes: ["numeric", "symbolic", "derivation_order", "plot_reading", "multiple_choice", "short_answer"],
    blocks: ["text", "latex", "plot", "diagram", "table"],
    defaultGrading: "symbolic",
  },
  statistics: { defaultGrading: "numeric", exerciseTypes: ["numeric", "plot_reading", "short_answer", "multiple_choice"] },
  probability: { defaultGrading: "numeric" },
  geometry: { blocks: ["text", "latex", "diagram", "plot", "table"] },
  logic: {
    exerciseTypes: ["derivation_order", "argument_reconstruction", "multiple_choice", "short_answer", "symbolic"],
    rules: ["Notation must be introduced before it is used. Do not assume a specific textbook's conventions."],
  },

  // ── natural science ─────────────────────────────────────────────────────────
  natural_science: {
    promptFamily: "quantitative",
    exerciseTypes: ["numeric", "multiple_choice", "short_answer", "unit_conversion", "cloze", "ordering"],
    blocks: ["text", "latex", "diagram", "plot", "table"],
    defaultGrading: "numeric",
    persona:
      "You are a science tutor who grounds every abstraction in a physical " +
      "situation the student can picture, and who treats units and orders of " +
      "magnitude as part of the answer rather than decoration.",
    rules: [
      "Every numeric answer MUST state its units and the precision expected.",
      "Prefer a concrete physical setup over an abstract statement of the law.",
      "When a quantity is measured rather than derived, say so.",
    ],
    sourceProviders: ["crossref", "openalex", "arxiv"],
  },
  physics: {
    exerciseTypes: ["numeric", "symbolic", "derivation_order", "plot_reading", "multiple_choice", "short_answer"],
    rules: ["Draw the free-body or field configuration as a diagram block whenever forces or fields are involved."],
  },
  chemistry: {
    exerciseTypes: ["numeric", "unit_conversion", "multiple_choice", "short_answer", "ordering", "matching"],
    rules: ["Balance every equation shown, and state phase labels where they matter."],
  },
  biology: {
    exerciseTypes: ["multiple_choice", "short_answer", "matching", "ordering", "cloze", "compare_contrast"],
    defaultGrading: "rubric",
    blocks: ["text", "diagram", "table"],
  },

  // ── social science ──────────────────────────────────────────────────────────
  social_science: {
    promptFamily: "general",
    exerciseTypes: ["multiple_choice", "short_answer", "compare_contrast", "matching", "cloze", "plot_reading"],
    blocks: ["text", "table", "plot", "source"],
    defaultGrading: "rubric",
    persona:
      "You are a social science tutor who insists on the distinction between a " +
      "model and the world it describes, and who asks the student to say which " +
      "assumptions a conclusion rests on.",
    rules: [
      "Name the model or framework a question operates within rather than presenting it as neutral fact.",
      "Where evidence is contested, say that it is contested.",
    ],
    sourceProviders: ["crossref", "openalex"],
  },
  economics: {
    exerciseTypes: ["numeric", "plot_reading", "short_answer", "multiple_choice", "compare_contrast", "symbolic"],
    blocks: ["text", "latex", "plot", "table"],
    defaultGrading: "numeric",
    rules: ["Curve-shifting questions must specify which curve moves, in which direction, and why."],
  },
  law: {
    exerciseTypes: ["source_analysis", "argument_reconstruction", "compare_contrast", "short_answer", "multiple_choice"],
    blocks: ["text", "source", "table"],
    defaultGrading: "rubric",
    rules: ["Cite the statute, article, or decision a question turns on. Never invent a citation."],
    sourceProviders: ["wikisource", "xai_search"],
  },
  psychology: { defaultGrading: "rubric", exerciseTypes: ["multiple_choice", "short_answer", "compare_contrast", "matching"] },

  // ── humanities ──────────────────────────────────────────────────────────────
  humanities: {
    promptFamily: "humanities",
    exerciseTypes: [
      "source_analysis",
      "chronology",
      "compare_contrast",
      "multiple_choice",
      "short_answer",
      "argument_reconstruction",
    ],
    blocks: ["text", "source", "table"],
    defaultGrading: "rubric",
    persona:
      "You are a humanities tutor who teaches from primary sources and insists " +
      "that every claim be grounded in cited evidence. You are more interested " +
      "in how the student reads a text than in whether they recall a date.",
    rules: [
      "Prefer a real primary source excerpt over paraphrase, attributed to author, work, and approximate date.",
      "When the source is not in the student's language, supply both the original and a translation.",
      "Never present a contested interpretation as settled fact.",
      "Never invent a quotation, a source, or an attribution.",
    ],
    sourceProviders: ["wikisource", "gutenberg", "xai_search"],
  },
  history: {
    exerciseTypes: ["source_analysis", "chronology", "compare_contrast", "multiple_choice", "short_answer"],
    rules: ["Anchor every question in a specific time and place rather than a general period."],
  },
  ancient_history: { sourceProviders: ["perseus", "wikisource", "xai_search"] },
  classics: {
    sourceProviders: ["perseus", "wikisource", "gutenberg"],
    rules: ["Quote from the original Greek or Latin with a facing translation whenever the passage is short enough."],
  },
  philosophy: {
    exerciseTypes: ["argument_reconstruction", "source_analysis", "compare_contrast", "short_answer", "multiple_choice"],
    rules: ["An argument-reconstruction exercise must separate premises from conclusion explicitly."],
  },
  literature: { exerciseTypes: ["source_analysis", "compare_contrast", "short_answer", "multiple_choice", "cloze"] },
  music_theory: {
    promptFamily: "general",
    exerciseTypes: ["multiple_choice", "short_answer", "ordering", "matching", "cloze"],
    blocks: ["text", "diagram", "table"],
    defaultGrading: "exact",
  },

  // ── computing ───────────────────────────────────────────────────────────────
  computing: {
    promptFamily: "code",
    exerciseTypes: ["code_output", "code_fix", "multiple_choice", "short_answer", "complexity", "ordering"],
    blocks: ["text", "code", "table", "diagram"],
    defaultGrading: "exact",
    persona:
      "You are a programming tutor who teaches the model behind the syntax. You " +
      "prefer a short program the student must reason about over a definition " +
      "they must recall.",
    rules: [
      "Every code sample MUST be a code block with its language set, and must run as written.",
      "Predict-the-output exercises must be deterministic. No randomness, no wall-clock time, no unordered iteration.",
      "Keep samples under 25 lines.",
    ],
    sourceProviders: ["arxiv"],
  },
  ai_ml: {
    exerciseTypes: ["numeric", "symbolic", "short_answer", "multiple_choice", "code_output", "plot_reading"],
    blocks: ["text", "latex", "code", "plot", "table"],
    defaultGrading: "numeric",
  },
  algorithms: { exerciseTypes: ["complexity", "code_output", "ordering", "short_answer", "multiple_choice"] },
  cryptography: { blocks: ["text", "latex", "code", "table"], defaultGrading: "numeric" },

  // ── practical ───────────────────────────────────────────────────────────────
  practical: {
    promptFamily: "general",
    exerciseTypes: ["multiple_choice", "ordering", "short_answer", "matching", "flashcard"],
    blocks: ["text", "diagram", "table"],
    defaultGrading: "exact",
    persona:
      "You are a practical instructor. You teach procedure through decisions the " +
      "student has to make, not through steps they have to memorize.",
    rules: ["Ground every question in a situation the student would actually face."],
  },
  business: {
    exerciseTypes: ["numeric", "multiple_choice", "short_answer", "compare_contrast"],
    blocks: ["text", "table", "plot"],
    defaultGrading: "numeric",
  },
  chess: { exerciseTypes: ["multiple_choice", "ordering", "short_answer"], blocks: ["text", "diagram"] },

  general: {},
};

// ── Resolution ────────────────────────────────────────────────────────────────

function mergeFragment(base: DomainSpec, fragment: DomainFragment): DomainSpec {
  return {
    promptFamily: fragment.promptFamily ?? base.promptFamily,
    // Child-first ordering, deduped: a leaf's preferred types lead the rotation
    // while the parent's remain available for variety.
    exerciseTypes: dedupe([...(fragment.exerciseTypes ?? []), ...base.exerciseTypes]),
    blocks: dedupe([...base.blocks, ...(fragment.blocks ?? [])]),
    defaultGrading: fragment.defaultGrading ?? base.defaultGrading,
    persona: fragment.persona ?? base.persona,
    rules: [...base.rules, ...(fragment.rules ?? [])],
    features: fragment.features ?? base.features,
    sourceProviders: dedupe([...base.sourceProviders, ...(fragment.sourceProviders ?? [])]),
  };
}

function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}

const resolveCache = new Map<string, DomainSpec>();

/**
 * Merge every fragment along a root-to-leaf lineage. Memoized: the tree changes
 * only when the classifier invents a node, and this runs on every generation.
 */
export function resolveSpec(taxonomy: string[]): DomainSpec {
  const key = taxonomy.join(">");
  const hit = resolveCache.get(key);
  if (hit) return hit;

  let spec = BASE_SPEC;
  for (const id of taxonomy) {
    const fragment = FRAGMENTS[id];
    if (fragment) spec = mergeFragment(spec, fragment);
  }
  resolveCache.set(key, spec);
  return spec;
}

export function clearSpecCache(): void {
  resolveCache.clear();
}

/** True when a path should mount Speak, Vocabulary, and the TTS affordances. */
export function isLanguagePath(taxonomy: string[]): boolean {
  return taxonomy[0] === "language";
}
