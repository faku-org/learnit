import OpenAI from "openai";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/";

// Flash: high-volume calls (exercises, calibration, validation, explanations)
// Pro:   one-time quality calls (path generation)
export const FLASH_MODEL = "deepseek-v4-flash";
export const PRO_MODEL = "deepseek-v4-pro";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: DEEPSEEK_API_KEY,
      baseURL: DEEPSEEK_BASE_URL,
    });
  }
  return client;
}

export async function generateCompletion(
  systemPrompt: string,
  userPrompt: string,
  {
    temperature = 0.7,
    maxTokens = 4096,
    model = FLASH_MODEL,
  }: { temperature?: number; maxTokens?: number; model?: string } = {},
): Promise<string> {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
  });

  return response.choices[0]?.message?.content ?? "";
}

export async function generateJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  opts?: { temperature?: number; maxTokens?: number; model?: string },
): Promise<T> {
  const text = await generateCompletion(
    systemPrompt +
      "\nRespond ONLY with valid JSON. No markdown, no explanation, just the JSON object.",
    userPrompt,
    opts,
  );

  let cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) cleaned = match[1].trim();
  }

  return JSON.parse(cleaned) as T;
}

export type ValidationResult = {
  valid: boolean;
  issues: string[];
  corrected: Record<string, unknown> | null;
};

export async function validateExercise(
  exercise: Record<string, unknown>,
  language: string,
  level: string,
  topic: string,
): Promise<ValidationResult> {
  const systemPrompt = `You are a language exercise quality reviewer. Verify that an exercise is:
1. Well-formed (all required fields present and non-empty)
2. Solvable (has exactly one unambiguous correct answer)
3. Level-appropriate for the stated difficulty
4. Linguistically correct in the target language

Return ONLY valid JSON: { "valid": true|false, "issues": [], "corrected": {...} | null }
If valid is true, issues must be empty and corrected must be null.
If valid is false, list issues and provide a corrected version if fixable.`;

  const userPrompt = `Review this ${language} exercise at ${level} level, topic "${topic}":
${JSON.stringify(exercise, null, 2)}`;

  try {
    return await generateJSON<ValidationResult>(systemPrompt, userPrompt, {
      temperature: 0.2,
      maxTokens: 2048,
      model: FLASH_MODEL,
    });
  } catch {
    // If validation itself fails, treat as valid to avoid blocking the user
    return { valid: true, issues: [], corrected: null };
  }
}
