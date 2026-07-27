const XAI_API_KEY = process.env.XAI_API_KEY ?? "";
const XAI_BASE_URL = "https://api.x.ai/v1";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return { Authorization: `Bearer ${XAI_API_KEY}`, ...extra };
}

// TTS and Speech-to-Speech require BCP-47 codes; Spanish and Portuguese need a
// region. Languages xAI doesn't officially list (dutch, swedish, polish) fall
// back to "auto" detection rather than a guessed, possibly-rejected code.
const TTS_LANGUAGE_CODES: Record<string, string> = {
  japanese: "ja", chinese: "zh", korean: "ko", spanish: "es-ES", french: "fr",
  german: "de", italian: "it", portuguese: "pt-BR", russian: "ru", arabic: "ar-SA",
  hindi: "hi", english: "en",
};

// The STT endpoint transcribes any language regardless of this hint — it only
// enables number/currency formatting — and it accepts plain codes for every
// language this app supports, including dutch/swedish/polish.
const STT_LANGUAGE_CODES: Record<string, string> = {
  japanese: "ja", chinese: "zh", korean: "ko", spanish: "es", french: "fr",
  german: "de", italian: "it", portuguese: "pt", russian: "ru", arabic: "ar",
  hindi: "hi", dutch: "nl", swedish: "sv", polish: "pl", turkish: "tr", english: "en",
};

export function ttsLanguageCode(language: string): string {
  return TTS_LANGUAGE_CODES[language.toLowerCase()] ?? "auto";
}

export function sttLanguageCode(language: string): string | undefined {
  return STT_LANGUAGE_CODES[language.toLowerCase()];
}

export type XaiSpeechResult = { buffer: ArrayBuffer; contentType: string };

export async function synthesizeSpeechXai(
  text: string,
  language: string,
  voice = "eve",
): Promise<XaiSpeechResult> {
  const res = await fetch(`${XAI_BASE_URL}/tts`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ text, voice_id: voice, language: ttsLanguageCode(language) }),
  });
  if (!res.ok) {
    throw new Error(`xAI TTS failed: ${res.status} ${await res.text()}`);
  }
  return { buffer: await res.arrayBuffer(), contentType: res.headers.get("content-type") ?? "audio/mpeg" };
}

export async function transcribeSpeechXai(audio: File, language?: string): Promise<string> {
  const form = new FormData();
  const code = language ? sttLanguageCode(language) : undefined;
  if (code) {
    form.append("language", code);
    form.append("format", "true");
  }
  form.append("file", audio, audio.name || "speech.webm");

  const res = await fetch(`${XAI_BASE_URL}/stt`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    throw new Error(`xAI STT failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { text: string };
  return data.text;
}

export type RealtimeClientSecret = { value: string; expires_at: number };

export async function createRealtimeTokenXai(): Promise<RealtimeClientSecret> {
  const res = await fetch(`${XAI_BASE_URL}/realtime/client_secrets`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ expires_after: { seconds: 300 } }),
  });
  if (!res.ok) {
    throw new Error(`xAI realtime token request failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as RealtimeClientSecret;
}
