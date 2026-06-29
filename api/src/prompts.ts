// --- Calibration ---
export const CALIBRATION_SYSTEM_PROMPT = `You are a language teacher creating a calibration quiz to assess a student's current level.
Generate clear, unambiguous multiple-choice questions that test language knowledge appropriate for the specified level.
Each question must have exactly one unambiguously correct answer.
Questions should cover a spread of topics so the result reflects real familiarity with the language.
IMPORTANT: Never repeat questions or vocabulary items used in previous attempts — always generate fresh content.`;

type CalibrationTargetLevel = "beginner" | "elementary" | "intermediate" | "advanced";

const CALIBRATION_TOPICS: Record<CalibrationTargetLevel, string[]> = {
  beginner: [
    "Numbers 1–10 (recognize or translate a number)",
    "Basic greetings (hello / goodbye / please / thank you)",
    "Subject pronouns (I / you / he / she / we / they)",
    "Colors (a common color word)",
    "Days of the week (name a specific day)",
    "Common nouns (family member, food item, or everyday object)",
    "Basic verb 'to be' or 'to have' in present tense",
    "Simple sentence comprehension (translate a 3–5 word phrase)",
  ],
  elementary: [
    "Present tense verb conjugation (regular verb, any pronoun)",
    "Definite and indefinite articles (gender agreement if applicable)",
    "Basic adjective agreement (masculine/feminine or plural forms)",
    "Common prepositions of place or time (in / on / at / from)",
    "Question formation (how to ask 'where', 'when', or 'what')",
    "Negation (how to say 'not' or form a negative sentence)",
    "Common everyday vocabulary in context (food, transport, or routines)",
    "Short dialogue comprehension (choose what a speaker means)",
  ],
  intermediate: [
    "Past tense usage (preterite vs imperfect, or simple past vs past continuous)",
    "Future or conditional tense (expressing plans or hypotheticals)",
    "Reflexive or modal verbs in context",
    "Relative clauses or subordinate clauses (who, which, that)",
    "Formal vs informal register (choose the appropriate form)",
    "Phrasal expressions or idiomatic phrases",
    "Reading comprehension — infer meaning from a short paragraph",
    "Complex sentence structure or word order rule",
  ],
  advanced: [
    "Subjunctive or conjunctive mood (trigger conditions and correct form)",
    "Passive voice construction",
    "Advanced idiomatic or colloquial expressions",
    "Nuance between near-synonyms (subtle meaning differences)",
    "Discourse connectors and cohesion (however / although / given that)",
    "Register and style — formal writing vs spoken register",
    "Complex reading comprehension — main idea of an authentic-level passage",
    "Advanced grammar edge case (irregular agreement, aspect, or case usage)",
  ],
};

export function buildCalibrationPrompt(
  language: string,
  nativeLanguage = "english",
  targetLevel: CalibrationTargetLevel = "beginner",
  attempt = 1,
): string {
  const N = nativeLanguage;
  const topics = CALIBRATION_TOPICS[targetLevel];
  const topicList = topics.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const attemptNote =
    attempt > 1
      ? `\nThis is recalibration attempt #${attempt}. You MUST use completely different words, sentences, and examples than previous attempts. Vary the specific items tested within each topic.`
      : "";

  return `Generate exactly 8 calibration questions to assess a student's ${language} level.
Target level being probed: ${targetLevel}.${attemptNote}

Cover these topic areas in order (one question per area):
${topicList}

Rules:
- All ${language} content MUST be written in ${language} script/characters.
- Instructions and option labels must be in ${N}.
- Each question has 4 options, exactly one correct.
- Difficulty should match the "${targetLevel}" level — not easier, not harder.
- Pick specific, concrete items to test (e.g. a specific verb, a specific noun) — do not test the same word twice.

Return ONLY valid JSON:
{
  "questions": [
    {
      "topic": "topic area name in ${N}",
      "question": "the ${language} word, phrase, or sentence being tested",
      "instruction": "short instruction in ${N} (e.g. 'What does this mean?', 'Which pronoun is correct?')",
      "options": ["option in ${N}", "option in ${N}", "option in ${N}", "option in ${N}"],
      "correctIndex": 0
    }
  ]
}`;
}

// --- Path Generation ---
export const PATH_SYSTEM_PROMPT = `You are an expert language teacher and curriculum designer.
You create structured, progressive learning paths tailored to the student's specific goal.

For each module, provide:
- A clear name describing the theme (in English, for navigation)
- A description of what the student will learn (in English)
- 3-5 specific topics, each with:
  - name: the specific skill/concept (in English)
  - order: numeric order within the module
  - description: what this topic covers (in English)

Make the path realistic and achievable within the timeframe.
Difficulty should ramp up gradually across modules.
Focus on practical, usable language rather than academic theory.`;

export type CalibrationLevel = "complete_beginner" | "some_basics" | "elementary" | "intermediate";

export function buildPathPrompt(
  language: string,
  objective: string,
  timeframe: string,
  modules: number = 6,
  startingLevel: CalibrationLevel = "complete_beginner",
): string {
  const levelNotes: Record<CalibrationLevel, string> = {
    complete_beginner: "The student is a complete beginner with no prior knowledge of ${language}. Start from absolute zero: alphabet/script, greetings, and basic vocabulary.",
    some_basics: "The student knows a few words and phrases but lacks structure. Module 1 should be a brief review of fundamentals; the real learning starts at Module 2.",
    elementary: "The student has elementary knowledge (greetings, numbers, basic vocabulary). Skip absolute-beginner content. Focus on building sentences and grammar from Module 1.",
    intermediate: "The student has solid elementary foundations. Start directly with grammar patterns, expanded vocabulary, and practical conversational structures.",
  };
  const levelNote = levelNotes[startingLevel].replace(/\$\{language\}/g, language);

  return `Create a ${modules}-module learning path for a student learning ${language}.
- Goal: ${objective}
- Timeframe: ${timeframe}
- Student level: ${startingLevel.replace(/_/g, " ")}

Level guidance: ${levelNote}

The path should teach ${language} specifically. Module names and topic names should reflect
real ${language} language skills (e.g. "Basic ${language} Greetings", "Present tense verbs in ${language}").

Return JSON in this exact format:
{
  "language": "${language}",
  "objective": "${objective}",
  "timeframe": "${timeframe}",
  "modules": [
    {
      "name": "Module name",
      "description": "What this module covers",
      "order": 1,
      "topics": [
        {
          "name": "Topic name",
          "order": 1,
          "description": "What this topic covers"
        }
      ]
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
