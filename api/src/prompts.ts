// --- Calibration ---
export const CALIBRATION_SYSTEM_PROMPT = `You are a language teacher running an adaptive placement test.
You generate one short stage of the test at a time, at the exact difficulty level requested.
Each question must have exactly one unambiguously correct answer and no trick wording.
Calibrate strictly to the requested level: an "elementary" stage must not contain "intermediate" content, and vice versa.
Never reuse a word, phrase, or sentence that has already been tested in this session.`;

export type CalibrationProbeLevel = "beginner" | "elementary" | "intermediate" | "advanced";

export const CALIBRATION_PROBE_LEVELS: CalibrationProbeLevel[] = [
  "beginner",
  "elementary",
  "intermediate",
  "advanced",
];

/** Questions per adaptive stage. */
export const CALIBRATION_STAGE_SIZE = 4;
/** Hard ceiling on stages so a session always terminates. */
export const CALIBRATION_MAX_STAGES = 3;

const CALIBRATION_TOPICS: Record<CalibrationProbeLevel, string[]> = {
  beginner: [
    "Numbers 1–10 (recognize a number)",
    "Numbers 11–100 (recognize a number)",
    "Basic greetings (hello / goodbye / good morning)",
    "Courtesy words (please / thank you / sorry / excuse me)",
    "Subject pronouns (I / you / he / she / we / they)",
    "Colors (a common color word)",
    "Days of the week (name a specific day)",
    "Months or seasons (name a specific one)",
    "Family members (mother / brother / grandparent)",
    "Food and drink nouns (a common everyday item)",
    "Everyday objects (house, book, car, water)",
    "Body parts or clothing (a common item)",
    "Verb 'to be' in present tense",
    "Verb 'to have' in present tense",
    "Simple sentence comprehension (understand a 3–5 word phrase)",
    "Yes/no and basic question words (what / where)",
  ],
  elementary: [
    "Present tense conjugation of a regular verb",
    "Present tense conjugation of a common irregular verb",
    "Definite articles (gender agreement if applicable)",
    "Indefinite articles (gender agreement if applicable)",
    "Adjective agreement (masculine/feminine forms)",
    "Adjective agreement (singular/plural forms)",
    "Plural noun formation",
    "Prepositions of place (in / on / under / next to)",
    "Prepositions of time (at / on / in / from … to)",
    "Question formation (where / when / why / how)",
    "Negation (forming a negative sentence)",
    "Possessives (my / your / his / her)",
    "Telling the time or stating a date",
    "Everyday vocabulary in context (food, transport, routines)",
    "Short dialogue comprehension (what does the speaker mean)",
    "Basic word order in a statement",
  ],
  intermediate: [
    "Past tense — perfective vs imperfective aspect (or simple past vs continuous)",
    "Past tense conjugation of an irregular verb",
    "Future tense (expressing plans or predictions)",
    "Conditional mood (expressing hypotheticals)",
    "Reflexive verbs in context",
    "Modal verbs (must / can / should) in context",
    "Relative clauses (who / which / that)",
    "Subordinate clauses and conjunctions (because / when / if)",
    "Formal vs informal register (choose the appropriate form)",
    "Common phrasal or idiomatic expressions",
    "Comparatives and superlatives",
    "Object pronouns (direct and indirect)",
    "Reading comprehension — infer meaning from a short paragraph",
    "Word order in complex sentences",
    "Imperative mood (giving instructions)",
    "Quantifiers and indefinite pronouns (some / any / none / each)",
  ],
  advanced: [
    "Subjunctive or conjunctive mood — trigger conditions and correct form",
    "Subjunctive or conjunctive mood — past or imperfect form",
    "Passive voice construction",
    "Reported (indirect) speech",
    "Advanced idiomatic or colloquial expressions",
    "Nuance between near-synonyms (subtle meaning differences)",
    "Discourse connectors and cohesion (however / although / given that)",
    "Register and style — formal writing vs spoken register",
    "Complex reading comprehension — main idea of an authentic-level passage",
    "Inference and tone — what the writer implies but does not state",
    "Irregular agreement or case usage edge case",
    "Aspect, mood, or tense sequencing in a multi-clause sentence",
    "Verb–preposition collocations",
    "Nominalization and abstract vocabulary",
    "Set phrases and fixed expressions with non-literal meaning",
  ],
};

/** Fisher–Yates on a copy — sampling happens server-side so variety never depends on the model. */
function sample<T>(pool: T[], n: number): T[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export type CalibrationStageParams = {
  language: string;
  nativeLanguage?: string;
  probeLevel: CalibrationProbeLevel;
  stage: number;
  /** Topic areas already used in this session, so stages never overlap. */
  usedTopics?: string[];
  /** Question texts already shown, so items are never repeated. */
  askedQuestions?: string[];
};

export function buildCalibrationStagePrompt({
  language,
  nativeLanguage = "english",
  probeLevel,
  stage,
  usedTopics = [],
  askedQuestions = [],
}: CalibrationStageParams): string {
  const N = nativeLanguage;
  const pool = CALIBRATION_TOPICS[probeLevel];
  const used = new Set(usedTopics);
  const available = pool.filter((t) => !used.has(t));
  const chosen = sample(available.length >= CALIBRATION_STAGE_SIZE ? available : pool, CALIBRATION_STAGE_SIZE);
  const topicList = chosen.map((t, i) => `${i + 1}. ${t}`).join("\n");

  const exclusion =
    askedQuestions.length > 0
      ? `\nAlready tested in this session — do NOT reuse any of these items or close variants:\n${askedQuestions
          .map((q) => `- ${q}`)
          .join("\n")}\n`
      : "";

  return `Generate stage ${stage} of an adaptive ${language} placement test: exactly ${CALIBRATION_STAGE_SIZE} questions.
Difficulty for this stage: ${probeLevel}. Every question must sit squarely at that level.
${exclusion}
Cover these topic areas, one question each, in order:
${topicList}

Rules:
- The "topic" and "instruction" fields are meta-guidance for the student and go in ${N}.
- Everything else — "question" AND all 4 "options" — MUST be entirely in ${language}, written in
  ${language} script/characters. This applies even to meaning/comprehension questions: instead of
  translating to ${N}, phrase them as "What does this mean?" with 4 ${language} synonyms or
  definitions as options (one correct, 3 plausible distractors), never a ${N} translation.
- Each question has 4 options, exactly one correct.
- The 3 wrong options must be plausible at this level, not obviously absurd.
- Pick specific, concrete items to test — do not test the same word twice.

Return ONLY valid JSON:
{
  "questions": [
    {
      "topic": "topic area name in ${N}",
      "question": "the ${language} word, phrase, or sentence being tested",
      "instruction": "short instruction in ${N} (e.g. 'What does this mean?', 'Which pronoun is correct?')",
      "options": ["option in ${language}", "option in ${language}", "option in ${language}", "option in ${language}"],
      "correctIndex": 0
    }
  ]
}`;
}

// --- Path Generation ---
export type CalibrationLevel = "complete_beginner" | "some_basics" | "elementary" | "intermediate";

const LEVEL_NOTES: Record<CalibrationLevel, string> = {
  complete_beginner:
    "The student is a complete beginner with no prior knowledge of {language}. Start from absolute zero: alphabet/script, greetings, and basic vocabulary.",
  some_basics:
    "The student knows a few words and phrases but lacks structure. Module 1 should be a brief review of fundamentals; the real learning starts at Module 2.",
  elementary:
    "The student has elementary knowledge (greetings, numbers, basic vocabulary). Skip absolute-beginner content. Focus on building sentences and grammar from Module 1.",
  intermediate:
    "The student has solid elementary foundations. Start directly with grammar patterns, expanded vocabulary, and practical conversational structures.",
};

function levelNote(startingLevel: CalibrationLevel, language: string): string {
  return LEVEL_NOTES[startingLevel].replace(/\{language\}/g, language);
}

// Stage 1: the outline. Headers only — cheap enough to cover a long path in one call.
export const PATH_OUTLINE_SYSTEM_PROMPT = `You are an expert language teacher and curriculum designer.
You design the high-level arc of a learning path: an ordered list of modules, each with a name, a short description, and a one-line focus.
Do NOT write individual lesson topics — those are designed later, once the student's real performance is known.
Difficulty must ramp gradually and every module must build on the ones before it.
Focus on practical, usable language rather than academic theory.`;

export function buildPathOutlinePrompt(
  language: string,
  objective: string,
  timeframe: string,
  moduleCount: number,
  startingLevel: CalibrationLevel,
): string {
  return `Design the module outline for a ${language} learning path.
- Goal: ${objective}
- Timeframe: ${timeframe}
- Student level: ${startingLevel.replace(/_/g, " ")}
- Number of modules: exactly ${moduleCount}

Level guidance: ${levelNote(startingLevel, language)}

Module names must reflect real ${language} skills (e.g. "Basic ${language} Greetings", "Present Tense Verbs in ${language}").
The arc should carry the student from their current level all the way to the stated goal across ${moduleCount} modules.

Return ONLY valid JSON:
{
  "language": "${language}",
  "objective": "${objective}",
  "timeframe": "${timeframe}",
  "modules": [
    {
      "name": "Module name",
      "description": "What this module covers, in one or two sentences",
      "focus": "The single core skill this module builds, in a few words",
      "order": 1
    }
  ]
}`;
}

// Stage 2: topics for one module, generated on demand from actual performance.
export const MODULE_TOPICS_SYSTEM_PROMPT = `You are an expert language teacher designing the lessons inside a single module of a learning path.
You are given the module's theme, what the student has already covered, and how they have actually been performing.
Adapt: if the student is struggling, slow the ramp and reinforce; if they are breezing through, raise the ceiling and add depth.
Each topic must be a specific, teachable skill — not a vague theme.`;

export type ModulePerformance = {
  /** Fraction of exercises answered correctly across prior modules, 0–1. */
  accuracy: number;
  /** Number of exercises the accuracy is based on. */
  answered: number;
};

export function describePerformance(perf: ModulePerformance | null): string {
  if (!perf || perf.answered < 5) {
    return "No meaningful performance data yet — pitch this module at the expected level for its position in the path.";
  }
  const pct = Math.round(perf.accuracy * 100);
  if (perf.accuracy >= 0.85) {
    return `The student is answering ${pct}% correctly across ${perf.answered} exercises — they are ahead of pace. Raise the difficulty: denser topics, less review, more challenging structures than this module's position would normally call for.`;
  }
  if (perf.accuracy >= 0.65) {
    return `The student is answering ${pct}% correctly across ${perf.answered} exercises — on pace. Keep the standard ramp for this module's position.`;
  }
  if (perf.accuracy >= 0.45) {
    return `The student is answering ${pct}% correctly across ${perf.answered} exercises — struggling somewhat. Soften the ramp: smaller steps, and fold a review of the previous module's weak points into the first topic.`;
  }
  return `The student is answering ${pct}% correctly across ${perf.answered} exercises — struggling badly. Prioritize consolidation: keep topics narrow and concrete, revisit fundamentals from earlier modules, and avoid introducing more than one new structure per topic.`;
}

export type ModuleTopicsParams = {
  language: string;
  objective: string;
  startingLevel: CalibrationLevel;
  module: { name: string; description?: string; focus?: string; order: number };
  /** Names of every module before this one, in order. */
  previousModules: string[];
  /** Name of the module that follows, so this one lands the student in the right place. */
  nextModule: string | null;
  /** Topic names already taught, so nothing is repeated. */
  coveredTopics: string[];
  performance: ModulePerformance | null;
};

export function buildModuleTopicsPrompt({
  language,
  objective,
  startingLevel,
  module,
  previousModules,
  nextModule,
  coveredTopics,
  performance,
}: ModuleTopicsParams): string {
  const already =
    previousModules.length > 0
      ? `Modules already completed (do not re-teach these as new material):\n${previousModules
          .map((m, i) => `${i + 1}. ${m}`)
          .join("\n")}`
      : "This is the very first module of the path.";

  const covered =
    coveredTopics.length > 0
      ? `\n\nTopics already taught — do NOT repeat any of these:\n${coveredTopics.map((t) => `- ${t}`).join("\n")}`
      : "";

  const lands = nextModule
    ? `\n\nAfter this module the student moves on to "${nextModule}", so this module must leave them ready for it.`
    : "\n\nThis is the final module of the path — it should consolidate everything into the stated goal.";

  return `Design the topics for module ${module.order} of a ${language} learning path.
- Overall goal: ${objective}
- Student's starting level: ${startingLevel.replace(/_/g, " ")}
- Module name: ${module.name}
- Module description: ${module.description ?? ""}
- Module focus: ${module.focus ?? module.name}

${already}${covered}${lands}

Performance so far: ${describePerformance(performance)}

Level guidance: ${levelNote(startingLevel, language)}

Produce 3–5 topics. Each topic is one concrete ${language} skill the student can practice with exercises.
Topic names and descriptions in English (they are used for navigation); the language being taught is ${language}.

Return ONLY valid JSON:
{
  "topics": [
    {
      "name": "Topic name",
      "order": 1,
      "description": "What this topic covers and why it comes here"
    }
  ]
}`;
}

// --- Vocabulary Enrichment ---
export const VOCAB_ENRICH_SYSTEM_PROMPT = `You are a language teacher enriching vocabulary entries with grammatical context and natural usage examples. Be concise and pedagogically useful.`;

export function buildVocabEnrichPrompt(
  word: string,
  meaning: string,
  language: string,
  nativeLanguage = "english",
): string {
  return `Enrich this vocabulary entry for a ${language} learner.

Word: "${word}"
Meaning: "${meaning}" (in ${nativeLanguage})
Language: ${language}

Step 1 — Classify the word. Set "type" to exactly one of these strings:
  "verb"      → action or state word (laufen, être, 食べる)
  "noun"      → person, place, thing, concept (Hund, maison, 猫)
  "adjective" → describes a noun (schnell, beau, 速い)
  "adverb"    → modifies a verb or adjective (sehr, vite, とても)
  "article"   → definite or indefinite article (der/die/das, el/la, le/la, il/la)
  "phrase"    → multi-word expression (au revoir, por favor)
  "other"     → only if none of the above fit (particles, conjunctions, prepositions)

Step 2 — Fill "conjugations" with the most useful grammatical forms for the identified type:
  verb      → present tense conjugations for main pronouns (4-6 forms) PLUS past participle and simple past (1st person) if the language has them. Form label in ${nativeLanguage}, value in ${language}.
  noun      → article+word (if applicable), plural, and gender. E.g. [{"form":"singular","value":"der Hund"},{"form":"plural","value":"die Hunde"},{"form":"gender","value":"masculine"}]
  adjective → base, comparative, superlative if the language has them.
  article   → all gender/number forms of this article. E.g. for Spanish "el": [{"form":"masc. singular","value":"el"},{"form":"fem. singular","value":"la"},{"form":"masc. plural","value":"los"},{"form":"fem. plural","value":"las"}]. For German include nominative forms at minimum: [{"form":"masc.","value":"der"},{"form":"fem.","value":"die"},{"form":"neut.","value":"das"},{"form":"plural","value":"die"}]. Form labels in ${nativeLanguage}, values in ${language}.
  adverb / phrase / other → return "conjugations": []

Step 3 — Provide a short natural example sentence in ${language} and its ${nativeLanguage} translation.

Return ONLY valid JSON (no extra keys, no markdown):
{
  "type": "<verb|noun|adjective|adverb|article|phrase|other>",
  "conjugations": [
    { "form": "label in ${nativeLanguage}", "value": "form in ${language}" }
  ],
  "example": "example sentence in ${language}",
  "exampleTranslation": "translation in ${nativeLanguage}"
}`;
}

// --- Exercise Explanation ---
export const EXPLAIN_SYSTEM_PROMPT = `You are an expert language teacher giving a student a clear, encouraging explanation when they don't know an answer.
Focus on the underlying concept, not just the answer.
Be concise but thorough. Use the student's native language as specified.`;

export function buildExplainPrompt(
  exercise: Record<string, unknown>,
  nativeLanguage = "english",
): string {
  const type = exercise.type as string;
  const correctAnswer =
    type === "multiple_choice"
      ? (exercise.options as string[])?.[
          (exercise.correctIndex as number) ?? 0
        ]
      : exercise.correctAnswer;

  const lines: string[] = [
    `A student couldn't answer this exercise. Provide a clear explanation in ${nativeLanguage}.`,
    ``,
    `Exercise type: ${type}`,
    `Instruction: ${exercise.instruction}`,
  ];
  if (exercise.question) lines.push(`Question: ${exercise.question}`);
  if (exercise.sentence) lines.push(`Sentence: ${exercise.sentence}`);
  if (exercise.sourceText) lines.push(`Text: ${exercise.sourceText}`);
  if (type === "multiple_choice" && exercise.options)
    lines.push(`Options: ${(exercise.options as string[]).join(" / ")}`);
  lines.push(`Correct answer: ${String(correctAnswer ?? "")}`);
  lines.push(
    ``,
    `Return ONLY valid JSON. Write all explanations in ${nativeLanguage}. Target-language content stays in the target language:`,
    `{"correctAnswer":"the correct answer","keyPoints":["key concept 1","key concept 2","key concept 3"],"explanation":"clear explanation of the concept and why this answer is correct","example":"an additional example sentence in the target language"}`,
  );
  return lines.join("\n");
}

// --- Exercise Generation ---
export const EXERCISE_SYSTEM_PROMPT = `You are an expert language teacher creating exercises for a student.
Generate exercises that are challenging but approachable.
The exercise should teach, not just test.
Always provide clear instructions in English.
Always include the correct answer and a brief explanation in English.

CRITICAL: The exercise content — sentences, words, questions, and answer options — must use
the target language being studied. Do NOT write the exercise in English unless the task is
explicitly to translate FROM English into the target language.`;

export type ExerciseType =
  | "multiple_choice"
  | "fill_blank"
  | "translation"
  | "conjugation"
  | "matching";

export type WordMeaning = {
  word: string;
  infinitive: string;
  meaning: string;
};

export function buildExercisePrompt(
  language: string,
  level: string,
  topic: string,
  type: ExerciseType,
  nativeLanguage = "english",
  difficultyNote?: string,
): string {
  const N = nativeLanguage;

  const wordMeaningsSchema = `"wordMeanings": [
    {
      "word": "exact form as it appears in the target-language text",
      "infinitive": "dictionary/base form in ${language}",
      "meaning": "meaning in ${N} for this context"
    }
  ]`;

  const wordMeaningsNote = `For "wordMeanings": include 3–6 key vocabulary items (nouns, verbs, adjectives) from the target-language text shown to the student. Use the exact form as written in the text, plus the base/infinitive form, plus the contextual meaning in ${N}. Skip particles, articles, and trivial words unless they are the learning focus.`;

  const typeInstructions: Record<ExerciseType, string> = {
    multiple_choice: `Create a multiple choice question that tests ${language} knowledge.
The question and all options must be in ${language}.
Return JSON:
{
  "type": "multiple_choice",
  "icon": "a single PascalCase Lucide icon name that best represents what this exercise is about (e.g. UtensilsCrossed, MapPin, Heart, Clock, Users)",
  "context": "One sentence in ${N}: what real-life scenario this exercise represents AND what specific grammar/vocabulary concept it tests. E.g. 'Comparing two objects — tests German comparative adjectives (alt → älter)'",
  "instruction": "Choose the correct answer (write instruction in ${N})",
  "question": "the question text in ${language}",
  "options": ["A) option in ${language}", "B) option", "C) option", "D) option"],
  "correctIndex": 0,
  "explanation": "Why this answer is correct (write explanation in ${N})",
  ${wordMeaningsSchema}
}
${wordMeaningsNote} Annotate words from the "question" field.`,

    fill_blank: `Create a fill-in-the-blank exercise using a ${language} sentence.
The sentence must be in ${language} with ___ marking the blank.
Return JSON:
{
  "type": "fill_blank",
  "icon": "a single PascalCase Lucide icon name that best represents what this exercise is about (e.g. UtensilsCrossed, MapPin, Heart, Clock, Users)",
  "context": "One sentence in ${N}: what real-life scenario this exercise represents AND what specific grammar/vocabulary concept it tests. E.g. 'Describing your weekend plans — tests future tense formation'",
  "instruction": "Fill in the blank (write instruction in ${N})",
  "sentence": "A ${language} sentence with ___ where the blank goes",
  "correctAnswer": "the correct ${language} word or phrase",
  "hint": "optional hint written in ${N}",
  "explanation": "Why this answer is correct (write explanation in ${N})",
  ${wordMeaningsSchema}
}
${wordMeaningsNote} Annotate words from the "sentence" field (exclude the ___ position itself).`,

    translation: `Create a translation exercise. The student translates a sentence from ${N} into ${language}.
Return JSON:
{
  "type": "translation",
  "icon": "a single PascalCase Lucide icon name that best represents what this exercise is about (e.g. UtensilsCrossed, MapPin, Heart, Clock, Users)",
  "context": "One sentence in ${N}: what real-life scenario this exercise represents AND what specific grammar/vocabulary concept it tests. E.g. 'Asking for directions on the street — tests question word order and modal verbs'",
  "instruction": "Translate this sentence into ${language} (write instruction in ${N})",
  "sourceText": "A ${N} sentence appropriate for ${level} level",
  "sourceLanguage": "${N}",
  "targetLanguage": "${language}",
  "direction": "${N}_to_${language}",
  "correctAnswer": "the correct ${language} translation",
  "explanation": "Key grammar or vocabulary points (write in ${N})",
  "wordMeanings": []
}`,

    conjugation: `Create a verb conjugation exercise for a ${language} verb.
Return JSON:
{
  "type": "conjugation",
  "icon": "a single PascalCase Lucide icon name that best represents what this exercise is about (e.g. UtensilsCrossed, MapPin, Heart, Clock, Users)",
  "context": "One sentence in ${N}: what real-life scenario this exercise represents AND what specific grammar/vocabulary concept it tests. E.g. 'Talking about daily habits — tests present tense conjugation of regular verbs'",
  "instruction": "Conjugate the verb (write instruction in ${N})",
  "verb": "the ${language} verb in its base/infinitive form",
  "tense": "the required tense/mood in ${language}",
  "pronoun": "the required pronoun in ${language} if applicable",
  "correctAnswer": "the correct ${language} conjugation",
  "explanation": "Conjugation rule explanation (write in ${N})",
  "wordMeanings": [
    { "word": "the verb as shown", "infinitive": "base form in ${language}", "meaning": "meaning in ${N}" }
  ]
}`,

    matching: `Create a matching exercise pairing ${language} words with their ${N} meanings.
Return JSON:
{
  "type": "matching",
  "icon": "a single PascalCase Lucide icon name that best represents what this exercise is about (e.g. UtensilsCrossed, MapPin, Heart, Clock, Users)",
  "context": "One sentence in ${N}: what real-life scenario this exercise represents AND what specific grammar/vocabulary concept it tests. E.g. 'Shopping for groceries — introduces common food nouns and their genders'",
  "instruction": "Match the ${language} words to their ${N} meanings (write instruction in ${N})",
  "pairs": [
    { "left": "${language} word", "right": "${N} meaning" },
    { "left": "${language} word", "right": "${N} meaning" },
    { "left": "${language} word", "right": "${N} meaning" },
    { "left": "${language} word", "right": "${N} meaning" }
  ],
  "explanation": "Brief notes on the vocabulary (write in ${N})",
  "wordMeanings": []
}`,
  };

  const difficultySection = difficultyNote ? `\nDIFFICULTY NOTE: ${difficultyNote}\n` : "";

  return `Generate a ${type} exercise for a student learning ${language}.
- Level: ${level}
- Topic: ${topic}
- Target language: ${language} — all ${language} content MUST be written in ${language}.
- Explanation language: ${N} — all instructions, hints, and explanations MUST be in ${N}.
${difficultySection}
${typeInstructions[type]}`;
}
