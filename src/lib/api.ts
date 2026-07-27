import { getAuthHeaders } from "./auth";

const API = `http://localhost:${import.meta.env.PUBLIC_API_PORT ?? 3001}`;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const authHeaders = getAuthHeaders();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(options?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((error as { error?: string }).error || "Request failed");
  }
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const getMe = () =>
  request<{ _id: string; email: string; name: string; picture?: string }>("/api/auth/me");

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
  language: string;
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

// ── Path ──────────────────────────────────────────────────────────────────────

export type PathTopic = { name: string; order: number; description?: string };

export const generatePath = (data: {
  language: string;
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
  language: string;
  level: string;
  topic: string;
  type: string;
  nativeLanguage?: string;
}) =>
  request<Record<string, unknown>>("/api/exercises/generate", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getNextExercise = (params: {
  language: string;
  topic: string;
  level?: string;
  nativeLanguage?: string;
}) => {
  const qs = new URLSearchParams({
    language: params.language,
    topic: params.topic,
    level: params.level ?? "beginner",
    nativeLanguage: params.nativeLanguage ?? "english",
  });
  return request<Record<string, unknown>>(`/api/exercises/next?${qs}`);
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
}) =>
  request<{
    points?: number;
    sessionTotals?: { total: number; correct: number; points: number; pass: number };
  }>("/api/exercises/answer", {
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
