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

export function buildPathPrompt(
  language: string,
  objective: string,
  timeframe: string,
  modules: number = 6,
): string {
  return `Create a ${modules}-module learning path for a student learning ${language}.
- Goal: ${objective}
- Timeframe: ${timeframe}

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

Instructions:
- Identify the word type (verb, noun, adjective, adverb, phrase, etc.)
- For VERBS: provide present tense conjugations for the main pronouns (4-6 forms max)
- For NOUNS: provide article + singular, plural form, and grammatical gender if applicable
- For ADJECTIVES: provide base, comparative, and superlative if the language has them
- For PHRASES or other types: return "conjugations": []
- Always provide a short, natural example sentence in ${language} and its ${nativeLanguage} translation

Return ONLY valid JSON:
{
  "type": "verb|noun|adjective|adverb|phrase|other",
  "conjugations": [
    { "form": "label in ${nativeLanguage}", "value": "form in ${language}" }
  ],
  "example": "natural example sentence in ${language}",
  "exampleTranslation": "translation of example in ${nativeLanguage}"
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

export function buildExercisePrompt(
  language: string,
  level: string,
  topic: string,
  type: ExerciseType,
  nativeLanguage = "english",
): string {
  const N = nativeLanguage;

  const typeInstructions: Record<ExerciseType, string> = {
    multiple_choice: `Create a multiple choice question that tests ${language} knowledge.
The question and all options must be in ${language}.
Return JSON:
{
  "type": "multiple_choice",
  "instruction": "Choose the correct answer (write instruction in ${N})",
  "question": "the question text in ${language}",
  "options": ["A) option in ${language}", "B) option", "C) option", "D) option"],
  "correctIndex": 0,
  "explanation": "Why this answer is correct (write explanation in ${N})"
}`,

    fill_blank: `Create a fill-in-the-blank exercise using a ${language} sentence.
The sentence must be in ${language} with ___ marking the blank.
Return JSON:
{
  "type": "fill_blank",
  "instruction": "Fill in the blank (write instruction in ${N})",
  "sentence": "A ${language} sentence with ___ where the blank goes",
  "correctAnswer": "the correct ${language} word or phrase",
  "hint": "optional hint written in ${N}",
  "explanation": "Why this answer is correct (write explanation in ${N})"
}`,

    translation: `Create a translation exercise. The student translates a sentence from ${N} into ${language}.
Return JSON:
{
  "type": "translation",
  "instruction": "Translate this sentence into ${language} (write instruction in ${N})",
  "sourceText": "A ${N} sentence appropriate for ${level} level",
  "sourceLanguage": "${N}",
  "targetLanguage": "${language}",
  "direction": "${N}_to_${language}",
  "correctAnswer": "the correct ${language} translation",
  "explanation": "Key grammar or vocabulary points (write in ${N})"
}`,

    conjugation: `Create a verb conjugation exercise for a ${language} verb.
Return JSON:
{
  "type": "conjugation",
  "instruction": "Conjugate the verb (write instruction in ${N})",
  "verb": "the ${language} verb in its base/infinitive form",
  "tense": "the required tense/mood in ${language}",
  "pronoun": "the required pronoun in ${language} if applicable",
  "correctAnswer": "the correct ${language} conjugation",
  "explanation": "Conjugation rule explanation (write in ${N})"
}`,

    matching: `Create a matching exercise pairing ${language} words with their ${N} meanings.
Return JSON:
{
  "type": "matching",
  "instruction": "Match the ${language} words to their ${N} meanings (write instruction in ${N})",
  "pairs": [
    { "left": "${language} word", "right": "${N} meaning" },
    { "left": "${language} word", "right": "${N} meaning" },
    { "left": "${language} word", "right": "${N} meaning" },
    { "left": "${language} word", "right": "${N} meaning" }
  ],
  "explanation": "Brief notes on the vocabulary (write in ${N})"
}`,
  };

  return `Generate a ${type} exercise for a student learning ${language}.
- Level: ${level}
- Topic: ${topic}
- Target language: ${language} — all ${language} content MUST be written in ${language}.
- Explanation language: ${N} — all instructions, hints, and explanations MUST be in ${N}.

${typeInstructions[type]}`;
}
