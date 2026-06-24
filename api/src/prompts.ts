// --- Path Generation ---
export const PATH_SYSTEM_PROMPT = `You are an expert language teacher and curriculum designer.
You create structured, progressive learning paths tailored to the student's specific goal.

For each module, provide:
- A clear name describing the theme
- A description of what the student will learn
- 3-5 specific topics, each with:
  - name: the specific skill/concept
  - order: numeric order within the module
  - description: what this topic covers

Make the path realistic and achievable within the timeframe.
Difficulty should ramp up gradually across modules.
Focus on practical, usable language rather than academic theory.`;

export function buildPathPrompt(
  language: string,
  objective: string,
  timeframe: string,
  modules: number = 6
): string {
  return `Create a ${modules}-module learning path for:
- Language: ${language}
- Goal: ${objective}
- Timeframe: ${timeframe}

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

// --- Exercise Generation ---
export const EXERCISE_SYSTEM_PROMPT = `You are an expert language teacher creating exercises for a student.
Generate exercises that are challenging but approachable.
The exercise should teach, not just test.
Always provide clear instructions.
Always include the correct answer and a brief explanation of why it's correct.`;

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
  type: ExerciseType
): string {
  const typeInstructions: Record<ExerciseType, string> = {
    multiple_choice: `Create a multiple choice question.
Return JSON:
{
  "type": "multiple_choice",
  "instruction": "Choose the correct answer",
  "question": "the question text",
  "options": ["A) option1", "B) option2", "C) option3", "D) option4"],
  "correctIndex": 0,
  "explanation": "Why this answer is correct"
}`,
    fill_blank: `Create a fill-in-the-blank exercise.
Return JSON:
{
  "type": "fill_blank",
  "instruction": "Fill in the blank",
  "sentence": "The sentence with ___ where the blank goes",
  "correctAnswer": "the correct word or phrase",
  "hint": "optional hint",
  "explanation": "Why this answer is correct"
}`,
    translation: `Create a translation exercise. The student must translate a sentence.
Return JSON:
{
  "type": "translation",
  "instruction": "Translate the following sentence",
  "sourceText": "text to translate",
  "sourceLanguage": "${language}",
  "targetLanguage": "english",
  "direction": "from or to",
  "correctAnswer": "the correct translation",
  "explanation": "Key points about this translation"
}`,
    conjugation: `Create a verb conjugation exercise.
Return JSON:
{
  "type": "conjugation",
  "instruction": "Conjugate the verb",
  "verb": "the verb in its base form",
  "tense": "the required tense/mood",
  "pronoun": "the required pronoun if applicable",
  "correctAnswer": "the correct conjugation",
  "explanation": "Conjugation rule explanation"
}`,
    matching: `Create a matching exercise.
Return JSON:
{
  "type": "matching",
  "instruction": "Match the items",
  "pairs": [
    { "left": "word or phrase", "right": "its match" },
    { "left": "word or phrase", "right": "its match" },
    { "left": "word or phrase", "right": "its match" },
    { "left": "word or phrase", "right": "its match" }
  ],
  "explanation": "Brief explanation of the matches"
}`,
  };

  return `Generate a ${type} exercise.
- Language: ${language}
- Level: ${level}
- Topic: ${topic}

${typeInstructions[type]}`;
}
