const API = "http://localhost:3001";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((error as { error?: string }).error || "Request failed");
  }
  return res.json() as Promise<T>;
}

// Goals
export const getGoals = () => request<Record<string, unknown>[]>("/api/goals");
export const createGoal = (data: { language: string; objective: string; level: string }) =>
  request("/api/goals", { method: "POST", body: JSON.stringify(data) });

// Path
export const generatePath = (data: {
  language: string;
  objective: string;
  timeframe: string;
  modules?: number;
}) =>
  request<Record<string, unknown>>("/api/path/generate", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getCurrentPath = () => request<Record<string, unknown>>("/api/path/current");
export const getPaths = () => request<Record<string, unknown>[]>("/api/paths");
export const deletePath = (id: string) =>
  request(`/api/path/${id}`, { method: "DELETE" });
export const getPreferences = () =>
  request<{ activePathId: string | null; nativeLanguage: string }>("/api/preferences");
export const updatePreferences = (data: {
  activePathId?: string | null;
  nativeLanguage?: string;
}) =>
  request<{ activePathId: string | null; nativeLanguage: string }>("/api/preferences", {
    method: "POST",
    body: JSON.stringify(data),
  });

// Exercises
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

// Correction
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
  request<Progress>("/api/progress", {
    method: "POST",
    body: JSON.stringify(data),
  });

// Streak
export const getStreak = () =>
  request<{ currentStreak: number; longestStreak: number; lastSessionDate: string | null }>(
    "/api/streak",
  );
export const updateStreak = () =>
  request<Record<string, unknown>>("/api/streak/update", { method: "POST" });

// Vocabulary
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
