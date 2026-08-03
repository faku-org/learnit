import { http, HttpResponse } from "msw";

const base = "http://localhost:3001";

export const handlers = [
  http.get(`${base}/api/auth/me`, () =>
    HttpResponse.json({ _id: "u1", email: "a@b.c", name: "Anna" }),
  ),
  http.get(`${base}/api/goals`, () => HttpResponse.json([{ id: "g1", language: "german" }])),
  http.post(`${base}/api/goals`, () => HttpResponse.json({ id: "g2" }, { status: 201 })),
  http.get(`${base}/api/streak`, () =>
    HttpResponse.json({ currentStreak: 3, longestStreak: 5, lastSessionDate: "2026-08-02" }),
  ),
  http.post(`${base}/api/streak/update`, () =>
    HttpResponse.json({ currentStreak: 4, longestStreak: 5 }),
  ),
  http.get(`${base}/api/vocabulary`, () => HttpResponse.json([{ id: "v1", word: "Haus" }])),
  http.post(`${base}/api/vocabulary`, () => HttpResponse.json({ id: "v2" }, { status: 201 })),
  http.post(`${base}/api/vocabulary/:id/enrich`, () =>
    HttpResponse.json({ type: "noun", conjugations: [], example: "Das Haus", exampleTranslation: "The house" }),
  ),
  http.delete(`${base}/api/vocabulary/:id`, () => HttpResponse.json({ ok: true })),
  http.post(`${base}/api/calibration/stage`, () =>
    HttpResponse.json({
      probeLevel: "beginner",
      stage: 1,
      questions: [{ topic: "x", question: "q", instruction: "i", options: ["a"], correctIndex: 0 }],
    }),
  ),
  http.post(`${base}/api/taxonomy/classify`, () =>
    HttpResponse.json({
      taxonomy: ["social_science", "economics"],
      taxonomyLeaf: "economics",
      breadcrumb: "Social Science / Economics",
      confidence: 0.9,
      matchedOffline: true,
      createdNode: null,
    }),
  ),
  http.post(`${base}/api/taxonomy/scope`, () =>
    HttpResponse.json({ breadth: "workable", reason: "ok", questions: [], suggestedObjective: null }),
  ),
  http.get(`${base}/api/taxonomy/tree`, () => HttpResponse.json([])),
  http.post(`${base}/api/path/generate`, () => HttpResponse.json({ _id: "p1", modules: [] })),
  http.post(`${base}/api/path/:id/module/:order/topics`, () =>
    HttpResponse.json({ order: 0, topics: [], cached: false }),
  ),
  http.get(`${base}/api/path/current`, () => HttpResponse.json({ _id: "p1" })),
  http.get(`${base}/api/paths`, () => HttpResponse.json([{ _id: "p1" }])),
  http.delete(`${base}/api/path/:id`, () => HttpResponse.json({ ok: true })),
  http.get(`${base}/api/preferences`, () =>
    HttpResponse.json({ activePathId: "p1", nativeLanguage: "english", difficultyBias: 0 }),
  ),
  http.post(`${base}/api/preferences`, () =>
    HttpResponse.json({ activePathId: "p1", nativeLanguage: "english", difficultyBias: 0 }),
  ),
  http.post(`${base}/api/exercises/generate`, () => HttpResponse.json({ _id: "e1" })),
  http.get(`${base}/api/exercises/next`, () => HttpResponse.json({ _id: "e1" })),
  http.get(`${base}/api/exercises`, () => HttpResponse.json({ exercises: [], total: 0 })),
  http.post(`${base}/api/exercises/answer`, () =>
    HttpResponse.json({ points: 10, sessionTotals: { total: 1, correct: 1, points: 10, pass: 1 } }),
  ),
  http.post(`${base}/api/grade/semantic`, () =>
    HttpResponse.json({ correct: true, equivalence: "equivalent", note: "ok", cached: true }),
  ),
  http.post(`${base}/api/exercises/explain`, () =>
    HttpResponse.json({ correctAnswer: "42", keyPoints: [], explanation: "x", example: "y" }),
  ),
  http.post(`${base}/api/feedback`, () => HttpResponse.json({ ok: true, difficultyBias: 0.1 })),
  http.post(`${base}/api/translate`, () => HttpResponse.json({ translation: "Hola" })),
  http.post(`${base}/api/correct`, () => HttpResponse.json({ corrected: "text" })),
  http.get(`${base}/api/progress`, () =>
    HttpResponse.json({ pathId: "p1", currentModuleIndex: 0, currentTopicIndex: 0, completedTopics: [], topicStats: {} }),
  ),
  http.post(`${base}/api/progress`, () =>
    HttpResponse.json({ pathId: "p1", currentModuleIndex: 0, currentTopicIndex: 0, completedTopics: [], topicStats: {} }),
  ),
  http.post(`${base}/api/stats/topic/complete`, () =>
    HttpResponse.json({
      pass: 1, topicName: "t", total: 5, correct: 4, wrong: 1, gaveUp: 0, durationMs: 100,
      accuracy: 0.8, points: 40, mostCommonErrorType: null, improvement: null,
    }),
  ),
  http.post(`${base}/api/stats/module/complete`, () =>
    HttpResponse.json({
      moduleName: "m", lessonsCompleted: 1, totalPoints: 40, bonus: 0, total: 5, correct: 4,
      accuracy: 0.8, durationMs: 100, hardestTopic: null,
    }),
  ),
  http.get(`${base}/api/stats/overview`, () =>
    HttpResponse.json({
      totalPoints: 40, totalAnswered: 5, accuracy: 0.8, totalTimeMs: 100, topicsCompleted: 1,
      mostCommonErrorType: null, hardestTopics: [], mostGaveUp: [], mostRepeated: [],
      biggestImprovements: [], recommendations: [],
    }),
  ),
  http.post(`${base}/api/speak/tts`, () =>
    HttpResponse.arrayBuffer(new ArrayBuffer(8), { headers: { "Content-Type": "audio/mpeg" } }),
  ),
  http.post(`${base}/api/speak/transcribe`, () => HttpResponse.json({ transcript: "Hallo" })),
  http.post(`${base}/api/speak/realtime-token`, () =>
    HttpResponse.json({ value: "tok", expires_at: 123 }),
  ),
  http.post(`${base}/api/speak/scenario`, () =>
    HttpResponse.json({ situation: "s", prompt: "p", sampleResponse: "r" }),
  ),
  http.post(`${base}/api/speak/grade`, () =>
    HttpResponse.json({ correct: true, feedback: "good", corrected: null }),
  ),
];
