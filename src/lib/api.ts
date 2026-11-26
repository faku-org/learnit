/**
 * The API is same-origin: the browser sends the HttpOnly session cookie by itself, nothing is kept in
 * `localStorage`. In dev the Astro server proxies `/api` to the API (see astro.config.mjs). Resolved against the
 * page origin so the URL is absolute, which is also what the test runner's fetch needs.
 */
export const apiUrl = (path: string): string =>
  typeof window === "undefined" ? path : new URL(path, window.location.origin).href;

async function fail(res: Response): Promise<never> {
  const error = await res.json().catch(() => ({ error: res.statusText }));
  throw new Error((error as { error?: string }).error || "Request failed");
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) return fail(res);
  return res.json() as Promise<T>;
}

/** Like `request`, but for multipart bodies — omits the JSON Content-Type so the
 * browser sets its own `multipart/form-data; boundary=...`. */
async function requestForm<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(apiUrl(path), { method: "POST", credentials: "include", body: formData });
  if (!res.ok) return fail(res);
  return res.json() as Promise<T>;
}

// ── Account ───────────────────────────────────────────────────────────────────

export type AccountUser = {
  id: string;
  handle: string;
  displayName: string;
  hasPassword: boolean;
  hasEmail: boolean;
  totpEnabled: boolean;
  recoveryCodesLeft: number;
  createdAt: string;
};

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const getMe = () => request<{ user: AccountUser }>("/api/me");

export const registerAccount = (data: {
  handle: string;
  displayName: string;
  password: string;
  email?: string;
}) => post<{ user: AccountUser; recoveryCodes: string[] }>("/api/auth/register", data);

export type LoginResult = { status: "ok"; user: AccountUser } | { status: "totp_required" };

export const loginAccount = (data: { handle: string; password: string }) =>
  post<LoginResult>("/api/auth/login", data);
export const verifyTotpCode = (code: string) =>
  post<{ status: "ok"; user: AccountUser }>("/api/auth/2fa/verify", { code });
export const recoverAccount = (data: { handle: string; code: string }) =>
  post<{ status: "ok"; user: AccountUser }>("/api/auth/2fa/recover", data);
export const logoutAccount = () => post<{ status: "ok" }>("/api/auth/logout");

export const startTotpSetup = () =>
  post<{ secret: string; otpauth: string }>("/api/auth/2fa/setup", {});
export const confirmTotpSetup = (code: string) =>
  post<{ status: "ok"; totpEnabled: true }>("/api/auth/2fa/setup", { code });
export const disableTotp = (password: string) =>
  post<{ status: "ok"; totpEnabled: false }>("/api/auth/2fa/disable", { password });
export const regenerateRecoveryCodes = (password: string) =>
  post<{ recoveryCodes: string[] }>("/api/me/recovery-codes", { password });
export const deleteAccount = (data: { confirm: string; password?: string }) =>
  request<{ status: "ok" }>("/api/me", { method: "DELETE", body: JSON.stringify(data) });

// ── Goals ─────────────────────────────────────────────────────────────────────

export const getGoals = () => request<Record<string, unknown>[]>("/api/goals");
export const createGoal = (data: { language: string; objective: string; level: string }) =>
  request("/api/goals", { method: "POST", body: JSON.stringify(data) });

export type CalibrationLevel = "complete_beginner" | "some_basics" | "elementary" | "intermediate";

export type CalibrationProbeLevel = "beginner" | "elementary" | "intermediate" | "advanced";

export type CalibrationQuestion = {
  topic: string;
  question: string;
  instruction: string;
  options: string[];
  correctIndex: number;
};

/** One stage of the adaptive placement test. The caller picks the next probeLevel. */
export const generateCalibrationStage = (data: {
  subject: string;
  taxonomyLeaf?: string;
  nativeLanguage?: string;
  probeLevel: CalibrationProbeLevel;
  stage: number;
  usedTopics?: string[];
  askedQuestions?: string[];
}) =>
  request<{ probeLevel: CalibrationProbeLevel; stage: number; questions: CalibrationQuestion[] }>(
    "/api/calibration/stage",
    { method: "POST", body: JSON.stringify(data) },
  );

// ── Taxonomy ──────────────────────────────────────────────────────────────────

export type Classification = {
  taxonomy: string[];
  taxonomyLeaf: string;
  breadcrumb: string;
  confidence: number;
  matchedOffline: boolean;
  createdNode: string | null;
};

/** Place a subject in the tree. The breadcrumb is shown for the user to correct. */
export const classifySubject = (data: { subject: string; objective?: string }) =>
  request<Classification>("/api/taxonomy/classify", {
    method: "POST",
    body: JSON.stringify(data),
  });

export type ScopeReport = {
  breadth: "too_broad" | "workable" | "narrow";
  reason: string;
  questions: { id: string; question: string; options: string[]; allowsFreeText: boolean }[];
  suggestedObjective: string | null;
};

/** Judge whether a goal is narrow enough to plan. Never blocks: failure reads as workable. */
export const checkScope = (data: { subject: string; objective: string }) =>
  request<ScopeReport>("/api/taxonomy/scope", {
    method: "POST",
    body: JSON.stringify(data),
  });

export type TaxonomyNodeDTO = {
  id: string;
  parentId: string | null;
  name: string;
  depth: number;
  pathCount: number;
};

export const getTaxonomyTree = () => request<TaxonomyNodeDTO[]>("/api/taxonomy/tree");

// ── Path ──────────────────────────────────────────────────────────────────────

export type PathTopic = {
  name: string;
  order: number;
  description?: string;
  concepts?: string[];
};

export const generatePath = (data: {
  subject: string;
  taxonomyLeaf?: string;
  objective: string;
  timeframe: string;
  modules?: number;
  startingLevel?: CalibrationLevel;
}) =>
  request<Record<string, unknown>>("/api/path/generate", {
    method: "POST",
    body: JSON.stringify(data),
  });

/** Fill in the topics of an outlined module. Idempotent — safe to call twice. */
export const hydrateModuleTopics = (pathId: string, order: number) =>
  request<{ order: number; topics: PathTopic[]; cached: boolean }>(
    `/api/path/${pathId}/module/${order}/topics`,
    { method: "POST" },
  );

export const getCurrentPath = () => request<Record<string, unknown>>("/api/path/current");
export const getPaths = () => request<Record<string, unknown>[]>("/api/paths");
export const deletePath = (id: string) => request(`/api/path/${id}`, { method: "DELETE" });

export const getPreferences = () =>
  request<{ activePathId: string | null; nativeLanguage: string; difficultyBias: number }>(
    "/api/preferences",
  );
export const updatePreferences = (data: {
  activePathId?: string | null;
  nativeLanguage?: string;
  difficultyBias?: number;
}) =>
  request<{ activePathId: string | null; nativeLanguage: string; difficultyBias: number }>(
    "/api/preferences",
    { method: "POST", body: JSON.stringify(data) },
  );

// ── Exercises ─────────────────────────────────────────────────────────────────

export const generateExercise = (data: {
  subject: string;
  taxonomyLeaf?: string;
  level: string;
  topic: string;
  type: string;
  nativeLanguage?: string;
}) =>
  request<Record<string, unknown>>("/api/exercises/generate", {
    method: "POST",
    body: JSON.stringify(data),
  });

export type NextExerciseParams = {
  subject: string;
  taxonomyLeaf?: string;
  /** The path's pinned exercise-bank partition. Never derive this. */
  bankKey?: string;
  topic: string;
  level?: string;
  nativeLanguage?: string;
};

/** One answer from `/api/exercises/next`: an exercise, or "nothing yet, it is being generated". */
export type NextExerciseReply =
  | { status: "ready"; exercise: Record<string, unknown> }
  | { status: "generating"; retryAfterMs: number };

/**
 * Ask once. The server never waits for a model: it answers from the exercise bank at once, or says it has
 * started generating (`_status: "generating"`, HTTP 202) and to ask again in `retryAfterMs`.
 */
export const getNextExerciseOnce = async (
  params: NextExerciseParams,
): Promise<NextExerciseReply> => {
  const qs = new URLSearchParams({
    subject: params.subject,
    topic: params.topic,
    level: params.level ?? "beginner",
    nativeLanguage: params.nativeLanguage ?? "english",
  });
  // Sending the leaf lets the server skip classification entirely, which is the
  // difference between a cached lookup and an LLM call on every exercise.
  if (params.taxonomyLeaf) qs.set("taxonomyLeaf", params.taxonomyLeaf);
  if (params.bankKey) qs.set("bankKey", params.bankKey);
  const body = await request<Record<string, unknown>>(`/api/exercises/next?${qs}`);
  if (body._status === "generating") {
    const wait = Number(body.retryAfterMs);
    return { status: "generating", retryAfterMs: Number.isFinite(wait) && wait > 0 ? wait : 1500 };
  }
  return { status: "ready", exercise: body };
};

export type NextExerciseOptions = {
  /** Called once, the first time the server says the exercise is being generated rather than loaded. */
  onGenerating?: () => void;
  /** Give up (throw) after this long. Generation is slow, but not unbounded. */
  maxWaitMs?: number;
  /** Test seam: replaces the wait between polls. */
  sleep?: (ms: number) => Promise<void>;
};

const MAX_POLL_MS = 3000;

/** The next exercise, polling while the server generates it. Resolves with the exercise itself. */
export const getNextExercise = async (
  params: NextExerciseParams,
  {
    onGenerating,
    maxWaitMs = 180_000,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  }: NextExerciseOptions = {},
): Promise<Record<string, unknown>> => {
  const startedAt = Date.now();
  let announced = false;
  for (;;) {
    const reply = await getNextExerciseOnce(params);
    if (reply.status === "ready") return reply.exercise;
    if (!announced) {
      announced = true;
      onGenerating?.();
    }
    if (Date.now() - startedAt >= maxWaitMs) throw new Error("Exercise generation timed out");
    await sleep(Math.min(reply.retryAfterMs, MAX_POLL_MS));
  }
};

/**
 * Records the SM-2 update, and — when the path context is supplied — an entry in
 * the attempt log that every statistic is derived from.
 */
export const recordAnswer = (data: {
  exerciseId: string;
  correct: boolean;
  quality?: number;
  pathId?: string | null;
  moduleIndex?: number;
  topicIndex?: number;
  topicName?: string;
  moduleName?: string;
  exerciseType?: string;
  durationMs?: number;
  gaveUp?: boolean;
  /** MindVault `certeza`, 1-4. Omitted when the student was not asked. */
  confidence?: number | null;
  conceptIds?: string[];
  gradingMode?: string;
  score?: number;
  /** True when the semantic rung overturned a deterministic mismatch. */
  semanticOverride?: boolean;
  /** Which rung of the grading ladder settled it. */
  gradedVia?: string;
  examId?: string | null;
  sessionPosition?: number;
  afterGiveUp?: boolean;
  inExam?: boolean;
}) =>
  request<{
    points?: number;
    sessionTotals?: { total: number; correct: number; points: number; pass: number };
  }>("/api/exercises/answer", {
    method: "POST",
    body: JSON.stringify(data),
  });

export type SemanticVerdict = {
  correct: boolean;
  equivalence: "exact" | "equivalent" | "partial" | "wrong";
  note: string;
  misconception?: string;
  cached: boolean;
};

/**
 * Rung 4 of the grading ladder. Only ever called after the deterministic rungs
 * missed, so it can overturn a wrong to a right and never the reverse.
 */
export const gradeSemantic = (data: {
  question: string;
  expected: string;
  actual: string;
  taxonomy: string[];
  gradingMode: string;
  nativeLanguage?: string;
}) =>
  request<SemanticVerdict>("/api/grade/semantic", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const translateText = (data: { text: string; targetLanguage?: string }) =>
  request<{ translation: string }>("/api/translate", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const explainExercise = (data: {
  exercise: Record<string, unknown>;
  nativeLanguage?: string;
}) =>
  request<{
    correctAnswer: string;
    keyPoints: string[];
    explanation: string;
    example: string;
  }>("/api/exercises/explain", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const submitFeedback = (data: {
  rating: "too_easy" | "just_right" | "too_hard";
  exerciseCount?: number;
}) =>
  request<{ ok: boolean; difficultyBias: number }>("/api/feedback", {
    method: "POST",
    body: JSON.stringify(data),
  });

// ── Correction ────────────────────────────────────────────────────────────────

export const correctText = (data: { text: string; language: string; context?: string }) =>
  request<Record<string, unknown>>("/api/correct", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getExercises = (params?: {
  topic?: string;
  language?: string;
  type?: string;
  q?: string;
  limit?: number;
  skip?: number;
}) => {
  const qs = new URLSearchParams();
  if (params?.topic) qs.set("topic", params.topic);
  if (params?.language) qs.set("language", params.language);
  if (params?.type) qs.set("type", params.type);
  if (params?.q) qs.set("q", params.q);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.skip != null) qs.set("skip", String(params.skip));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request<{ exercises: Record<string, unknown>[]; total: number }>(
    `/api/exercises${suffix}`,
  );
};

// ── Progress ──────────────────────────────────────────────────────────────────

export type Progress = {
  pathId: string | null;
  currentModuleIndex: number;
  currentTopicIndex: number;
  completedTopics: string[];
  topicStats: Record<string, { total: number; correct: number }>;
};

export const getProgress = (pathId?: string) => {
  const suffix = pathId ? `?pathId=${encodeURIComponent(pathId)}` : "";
  return request<Progress>(`/api/progress${suffix}`);
};

export const saveProgress = (data: Partial<Progress>) =>
  request<Progress>("/api/progress", { method: "POST", body: JSON.stringify(data) });

// ── Stats ─────────────────────────────────────────────────────────────────────

export type LessonSummary = {
  pass: number;
  topicName: string;
  total: number;
  correct: number;
  wrong: number;
  gaveUp: number;
  durationMs: number;
  accuracy: number;
  points: number;
  mostCommonErrorType: string | null;
  improvement: { previousAccuracy: number; delta: number } | null;
};

export type SectionSummary = {
  moduleName: string;
  lessonsCompleted: number;
  totalPoints: number;
  bonus: number;
  total: number;
  correct: number;
  accuracy: number;
  durationMs: number;
  hardestTopic: { topicName: string; accuracy: number } | null;
};

type TopicRef = { topicName: string; moduleIndex: number; topicIndex: number };

export type Recommendation = {
  kind: "revisit" | "needs_explanation" | "keep_practicing" | "on_track" | "get_started";
  topicName?: string;
  moduleIndex?: number;
  topicIndex?: number;
  message: string;
};

export type StatsOverview = {
  totalPoints: number;
  totalAnswered: number;
  accuracy: number;
  totalTimeMs: number;
  topicsCompleted: number;
  mostCommonErrorType: string | null;
  hardestTopics: (TopicRef & { accuracy: number; total: number })[];
  mostGaveUp: (TopicRef & { gaveUp: number })[];
  mostRepeated: (TopicRef & { passes: number })[];
  biggestImprovements: (TopicRef & { from: number; to: number; delta: number })[];
  recommendations: Recommendation[];
};

export const completeTopic = (data: {
  pathId?: string | null;
  moduleIndex: number;
  topicIndex: number;
}) =>
  request<LessonSummary>("/api/stats/topic/complete", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const completeModule = (data: { pathId?: string | null; moduleIndex: number }) =>
  request<SectionSummary>("/api/stats/module/complete", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getStatsOverview = (pathId?: string) => {
  const suffix = pathId ? `?pathId=${encodeURIComponent(pathId)}` : "";
  return request<StatsOverview>(`/api/stats/overview${suffix}`);
};

// ── Streak ────────────────────────────────────────────────────────────────────

export const getStreak = () =>
  request<{ currentStreak: number; longestStreak: number; lastSessionDate: string | null }>(
    "/api/streak",
  );
export const updateStreak = () =>
  request<Record<string, unknown>>("/api/streak/update", { method: "POST" });

// ── Vocabulary ────────────────────────────────────────────────────────────────

export const getVocabulary = () => request<Record<string, unknown>[]>("/api/vocabulary");
export const addVocabulary = (data: { word: string; meaning: string; language: string }) =>
  request<Record<string, unknown>>("/api/vocabulary", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const enrichVocabulary = (
  id: string,
  data: { word: string; meaning: string; language: string; nativeLanguage?: string },
) =>
  request<{
    type: string;
    conjugations: { form: string; value: string }[];
    example: string;
    exampleTranslation: string;
  }>(`/api/vocabulary/${id}/enrich`, { method: "POST", body: JSON.stringify(data) });
export const deleteVocabulary = (id: string) =>
  request(`/api/vocabulary/${id}`, { method: "DELETE" });

// ── Speak (voice practice, powered by xAI) ────────────────────────────────────

/** Fetches synthesized speech as a playable blob. `language` is the app's
 * language name (e.g. "japanese"), not a BCP-47 code — the backend maps it. */
export async function synthesizeSpeech(
  text: string,
  language: string,
  voice?: string,
): Promise<Blob> {
  const res = await fetch(apiUrl("/api/speak/tts"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language, voice }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((error as { error?: string }).error || "TTS failed");
  }
  return res.blob();
}

export const getRealtimeVoiceToken = () =>
  request<{ value: string; expires_at: number }>("/api/speak/realtime-token", { method: "POST" });

export const transcribeSpeech = (audio: Blob, language?: string, filename = "speech.webm") => {
  const formData = new FormData();
  formData.append("audio", audio, filename);
  if (language) formData.append("language", language);
  return requestForm<{ transcript: string }>("/api/speak/transcribe", formData);
};

export type SpeakScenario = {
  situation: string;
  prompt: string;
  sampleResponse: string;
};

export const generateSpeakScenario = (data: {
  language: string;
  level?: string;
  topic?: string;
  nativeLanguage?: string;
}) =>
  request<SpeakScenario>("/api/speak/scenario", {
    method: "POST",
    body: JSON.stringify(data),
  });

export type SpeakGrade = {
  correct: boolean;
  feedback: string;
  corrected: string | null;
};

export const gradeSpeakResponse = (data: {
  language: string;
  situation: string;
  prompt: string;
  transcript: string;
  nativeLanguage?: string;
}) =>
  request<SpeakGrade>("/api/speak/grade", {
    method: "POST",
    body: JSON.stringify(data),
  });
