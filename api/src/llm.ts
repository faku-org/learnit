import OpenAI from "openai";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/";

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
  }: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model: "deepseek-v4-flash",
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
  opts?: { temperature?: number; maxTokens?: number }
): Promise<T> {
  const text = await generateCompletion(
    systemPrompt +
      "\nRespond ONLY with valid JSON. No markdown, no explanation, just the JSON object.",
    userPrompt,
    opts
  );

  // Strip markdown fences (handles ```json, ```, and any leading/trailing whitespace)
  let cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  // If there's still non-JSON preamble, extract the first JSON object or array
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) cleaned = match[1].trim();
  }

  return JSON.parse(cleaned) as T;
}
