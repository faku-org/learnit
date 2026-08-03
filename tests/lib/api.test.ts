import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  addVocabulary,
  checkScope,
  classifySubject,
  completeModule,
  completeTopic,
  createGoal,
  deletePath,
  deleteVocabulary,
  enrichVocabulary,
  explainExercise,
  generateCalibrationStage,
  generateExercise,
  generatePath,
  generateSpeakScenario,
  getCurrentPath,
  getExercises,
  getGoals,
  getMe,
  getNextExercise,
  getPaths,
  getPreferences,
  getProgress,
  getRealtimeVoiceToken,
  getStatsOverview,
  getStreak,
  getTaxonomyTree,
  getVocabulary,
  gradeSemantic,
  gradeSpeakResponse,
  hydrateModuleTopics,
  recordAnswer,
  saveProgress,
  submitFeedback,
  synthesizeSpeech,
  transcribeSpeech,
  translateText,
  updatePreferences,
  updateStreak,
} from "@/lib/api";
import { handlers } from "@tests/handlers";

const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => localStorage.clear());

describe("request", () => {
  test("returns the typed JSON body", async () => {
    const me = await getMe();
    expect(me).toEqual({ _id: "u1", email: "a@b.c", name: "Anna" });
  });

  test("throws the server's error message on a 4xx", async () => {
    server.use(http.post("http://localhost:3001/api/goals", () => HttpResponse.json({ error: "name required" }, { status: 400 })));
    await expect(createGoal({ language: "german", objective: "x", level: "beginner" })).rejects.toThrow("name required");
  });

  test("throws the status text when the error body is not JSON", async () => {
    server.use(
      http.get("http://localhost:3001/api/goals", () =>
        HttpResponse.text("Bad Gateway", { status: 502 }),
      ),
    );
    await expect(getGoals()).rejects.toThrow("Bad Gateway");
  });

  test("throws a generic message when the body has no error field", async () => {
    server.use(
      http.get("http://localhost:3001/api/goals", () => HttpResponse.json({ other: true }, { status: 500 })),
    );
    await expect(getGoals()).rejects.toThrow("Request failed");
  });

  test("surfaces a network failure instead of swallowing it", async () => {
    server.use(http.get("http://localhost:3001/api/goals", () => HttpResponse.error()));
    await expect(getGoals()).rejects.toThrow();
  });
});

describe("auth headers", () => {
  test("sends a Bearer token when one is stored", async () => {
    let seen: string | null = null;
    server.use(
      http.get("http://localhost:3001/api/auth/me", ({ request }) => {
        seen = request.headers.get("authorization");
        return HttpResponse.json({ _id: "u1" });
      }),
    );
    localStorage.setItem("learnit_token", "tok-1");
    await getMe();
    expect(seen ?? "").toBe("Bearer tok-1");
  });

  test("sends no Authorization header when no token is stored", async () => {
    let seen: string | null = null;
    server.use(
      http.get("http://localhost:3001/api/auth/me", ({ request }) => {
        seen = request.headers.get("authorization");
        return HttpResponse.json({ _id: "u1" });
      }),
    );
    await getMe();
    expect(seen).toBeNull();
  });

  test("always sends a JSON content type", async () => {
    let seen: string | null = null;
    server.use(
      http.post("http://localhost:3001/api/goals", ({ request }) => {
        seen = request.headers.get("content-type");
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    await createGoal({ language: "german", objective: "x", level: "beginner" });
    expect(seen ?? "").toContain("application/json");
  });
});

describe("query building", () => {
  test("getNextExercise sets defaults and appends optional params", async () => {
    let url = "";
    server.use(
      http.get("http://localhost:3001/api/exercises/next", ({ request }) => {
        url = request.url;
        return HttpResponse.json({ _id: "e1" });
      }),
    );
    await getNextExercise({
      subject: "german",
      taxonomyLeaf: "german",
      bankKey: "b1",
      topic: "Greetings",
    });
    const params = new URLSearchParams(new URL(url).search);
    expect(params.get("subject")).toBe("german");
    expect(params.get("taxonomyLeaf")).toBe("german");
    expect(params.get("bankKey")).toBe("b1");
    expect(params.get("topic")).toBe("Greetings");
    expect(params.get("level")).toBe("beginner");
    expect(params.get("nativeLanguage")).toBe("english");
  });

  test("getExercises omits empty params and renders no query string", async () => {
    let url = "";
    server.use(
      http.get("http://localhost:3001/api/exercises", ({ request }) => {
        url = request.url;
        return HttpResponse.json({ exercises: [], total: 0 });
      }),
    );
    await getExercises();
    expect(url).toBe("http://localhost:3001/api/exercises");
  });

  test("getExercises encodes each provided filter", async () => {
    let url = "";
    server.use(
      http.get("http://localhost:3001/api/exercises", ({ request }) => {
        url = request.url;
        return HttpResponse.json({ exercises: [], total: 0 });
      }),
    );
    await getExercises({ topic: "a b", type: "numeric", q: "find", limit: 10, skip: 5 });
    const params = new URLSearchParams(new URL(url).search);
    expect(params.get("topic")).toBe("a b");
    expect(params.get("type")).toBe("numeric");
    expect(params.get("q")).toBe("find");
    expect(params.get("limit")).toBe("10");
    expect(params.get("skip")).toBe("5");
  });

  test("getProgress appends an encoded pathId", async () => {
    let url = "";
    server.use(
      http.get("http://localhost:3001/api/progress", ({ request }) => {
        url = request.url;
        return HttpResponse.json({ pathId: "p1", currentModuleIndex: 0, currentTopicIndex: 0, completedTopics: [], topicStats: {} });
      }),
    );
    await getProgress("p 1/x");
    expect(url).toBe(`http://localhost:3001/api/progress?pathId=${encodeURIComponent("p 1/x")}`);
  });
});

describe("typed calls", () => {
  test("calibration stage returns the question shape", async () => {
    const res = await generateCalibrationStage({ subject: "german", probeLevel: "beginner", stage: 1 });
    expect(res.questions[0]).toHaveProperty("options");
  });

  test("classifySubject returns the classification", async () => {
    const res = await classifySubject({ subject: "Economics" });
    expect(res.taxonomyLeaf).toBe("economics");
    expect(res.matchedOffline).toBe(true);
  });

  test("checkScope returns a scope report", async () => {
    const res = await checkScope({ subject: "Economics", objective: "x" });
    expect(res.breadth).toBe("workable");
  });

  test("generatePath posts the payload", async () => {
    const res = await generatePath({ subject: "Economics", objective: "x", timeframe: "3 weeks" });
    expect(res).toHaveProperty("_id");
  });

  test("hydrateModuleTopics posts to the module route", async () => {
    const res = await hydrateModuleTopics("p1", 0);
    expect(res.cached).toBe(false);
  });

  test("recordAnswer returns points and session totals", async () => {
    const res = await recordAnswer({ exerciseId: "e1", correct: true });
    expect(res.sessionTotals?.pass).toBe(1);
  });

  test("gradeSemantic returns a verdict with a cache flag", async () => {
    const res = await gradeSemantic({ question: "q", expected: "e", actual: "a", taxonomy: [], gradingMode: "exact" });
    expect(res.cached).toBe(true);
  });

  test("speak scenario and grading return their shapes", async () => {
    const scenario = await generateSpeakScenario({ language: "german" });
    expect(scenario.prompt).toBe("p");
    const grade = await gradeSpeakResponse({ language: "german", situation: "s", prompt: "p", transcript: "t" });
    expect(grade.correct).toBe(true);
  });

  test("vocabulary enrich and delete hit the right routes", async () => {
    const enriched = await enrichVocabulary("v1", { word: "Haus", meaning: "house", language: "german" });
    expect(enriched.example).toBe("Das Haus");
    await expect(deleteVocabulary("v1")).resolves.toBeDefined();
  });

  test("stats completions and overview resolve", async () => {
    const topic = await completeTopic({ moduleIndex: 0, topicIndex: 0 });
    expect(topic.accuracy).toBe(0.8);
    const module = await completeModule({ moduleIndex: 0 });
    expect(module.totalPoints).toBe(40);
    const overview = await getStatsOverview("p1");
    expect(overview.totalAnswered).toBe(5);
  });

  test("preferences load and save", async () => {
    const loaded = await getPreferences();
    expect(loaded.activePathId).toBe("p1");
    const saved = await updatePreferences({ difficultyBias: 0.2 });
    expect(saved.difficultyBias).toBe(0);
  });

  test("explainExercise and submitFeedback resolve their shapes", async () => {
    const explained = await explainExercise({ exercise: {} });
    expect(explained.correctAnswer).toBe("42");
    const feedback = await submitFeedback({ rating: "just_right" });
    expect(feedback.ok).toBe(true);
  });
});

describe("multipart and binary", () => {
  test("transcribeSpeech posts a FormData body without a JSON content type", async () => {
    let body: FormData | null = null;
    let contentType: string | null = null;
    server.use(
      http.post("http://localhost:3001/api/speak/transcribe", async ({ request }) => {
        contentType = request.headers.get("content-type");
        body = await request.formData();
        return HttpResponse.json({ transcript: "Hallo" });
      }),
    );
    const audio = new Blob(["fake-audio"], { type: "audio/webm" });
    const res = await transcribeSpeech(audio, "german");
    expect(res.transcript).toBe("Hallo");
    expect(contentType ?? "").not.toContain("application/json");
    expect(body).not.toBeNull();
    expect(body!.get("audio")).toBeInstanceOf(Blob);
  });

  test("synthesizeSpeech returns a blob and throws on failure", async () => {
    const blob = await synthesizeSpeech("Hallo", "german");
    expect(blob).toBeInstanceOf(Blob);
    server.use(
      http.post("http://localhost:3001/api/speak/tts", () => HttpResponse.json({ error: "no voice" }, { status: 500 })),
    );
    await expect(synthesizeSpeech("Hallo", "german")).rejects.toThrow("no voice");
  });

  test("realtime voice token resolves", async () => {
    const res = await getRealtimeVoiceToken();
    expect(res.expires_at).toBe(123);
  });
});

describe("remaining typed calls smoke", () => {
  test("goal, streak, path, vocabulary and tree helpers resolve", async () => {
    await expect(createGoal({ language: "german", objective: "x", level: "beginner" })).resolves.toBeDefined();
    const streak = await getStreak();
    expect(streak.currentStreak).toBe(3);
    const updated = await updateStreak();
    expect(updated).toHaveProperty("currentStreak");
    const current = await getCurrentPath();
    expect(current._id).toBe("p1");
    const paths = await getPaths();
    expect(paths).toHaveLength(1);
    await expect(deletePath("p1")).resolves.toBeDefined();
    const vocab = await getVocabulary();
    expect(vocab[0].word).toBe("Haus");
    await expect(addVocabulary({ word: "Haus", meaning: "house", language: "german" })).resolves.toBeDefined();
    const tree = await getTaxonomyTree();
    expect(tree).toEqual([]);
    await expect(saveProgress({ pathId: "p1" })).resolves.toBeDefined();
    const translated = await translateText({ text: "hello" });
    expect(translated.translation).toBe("Hola");
    await expect(completeModule({ moduleIndex: 0 })).resolves.toBeDefined();
    await expect(generateExercise({ subject: "german", level: "beginner", topic: "t", type: "cloze" })).resolves.toBeDefined();
  });
});
