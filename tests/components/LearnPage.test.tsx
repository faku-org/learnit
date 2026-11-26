import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setSession } from "@/lib/auth";
import { testUser } from "@tests/handlers";
import { useMsw } from "@tests/msw";
import "@/lib/i18n";
import { LearnPage } from "@/components/LearnPage";

const server = useMsw();

afterEach(() => cleanup());
beforeEach(() => {
  setSession(testUser);
});

const path = {
  _id: "p1",
  subject: "German",
  taxonomy: ["language", "german"],
  taxonomyLeaf: "german",
  bankKey: "german",
  modules: [
    {
      name: "Basics",
      order: 0,
      topics: [{ name: "Greetings", order: 0 }, { name: "Numbers", order: 1 }],
    },
  ],
};

const progress = {
  pathId: "p1",
  currentModuleIndex: 0,
  currentTopicIndex: 0,
  completedTopics: [] as string[],
  topicStats: {} as Record<string, { total: number; correct: number }>,
};

const choiceExercise = {
  _id: "e1",
  type: "multiple_choice",
  instruction: "How do you say hello?",
  options: ["Hallo", "Danke"],
  correctIndex: 0,
  correctAnswer: "Hallo",
};

describe("LearnPage", () => {
  test("shows the ready state with the roadmap once the path loads", async () => {
    server.use(
      http.get("http://localhost/api/path/current", () => HttpResponse.json(path)),
      http.get("http://localhost/api/preferences", () =>
        HttpResponse.json({ activePathId: "p1", nativeLanguage: "english", difficultyBias: 0 }),
      ),
      http.get("http://localhost/api/progress", () => HttpResponse.json(progress)),
      http.get("http://localhost/api/exercises/next", () => HttpResponse.json(choiceExercise)),
    );

    render(<LearnPage />);
    expect(await screen.findByRole("button", { name: "Start Exercise" })).toBeInTheDocument();
    expect(screen.getAllByText("Basics").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Greetings").length).toBeGreaterThan(0);
  });

  test("starting an exercise, answering correctly, and submitting shows feedback", async () => {
    server.use(
      http.get("http://localhost/api/path/current", () => HttpResponse.json(path)),
      http.get("http://localhost/api/preferences", () =>
        HttpResponse.json({ activePathId: "p1", nativeLanguage: "english", difficultyBias: 0 }),
      ),
      http.get("http://localhost/api/progress", () => HttpResponse.json(progress)),
      http.get("http://localhost/api/exercises/next", () => HttpResponse.json(choiceExercise)),
      http.post("http://localhost/api/streak/update", () =>
        HttpResponse.json({ currentStreak: 1, longestStreak: 1 }),
      ),
      http.post("http://localhost/api/exercises/answer", () =>
        HttpResponse.json({ points: 10, sessionTotals: { total: 1, correct: 1, points: 10, pass: 1 } }),
      ),
    );

    const user = userEvent.setup();
    render(<LearnPage />);
    await user.click(await screen.findByRole("button", { name: "Start Exercise" }));
    expect(await screen.findByText("How do you say hello?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hallo" }));
    await user.click(screen.getByRole("button", { name: "Check Answer" }));
    expect(await screen.findByText("Correct!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next Exercise" })).toBeInTheDocument();
  });

  test("says it is generating while the server generates, then shows the exercise", async () => {
    let polls = 0;
    server.use(
      http.get("http://localhost/api/path/current", () => HttpResponse.json(path)),
      http.get("http://localhost/api/preferences", () =>
        HttpResponse.json({ activePathId: "p1", nativeLanguage: "english", difficultyBias: 0 }),
      ),
      http.get("http://localhost/api/progress", () => HttpResponse.json(progress)),
      http.get("http://localhost/api/exercises/next", () => {
        polls += 1;
        if (polls < 3) {
          return HttpResponse.json({ _status: "generating", retryAfterMs: 20 }, { status: 202 });
        }
        return HttpResponse.json({ ...choiceExercise, _status: "ready", _delivery: "cached" });
      }),
    );

    const user = userEvent.setup();
    render(<LearnPage />);
    await user.click(await screen.findByRole("button", { name: "Start Exercise" }));

    expect(await screen.findByText("Generating exercises...")).toBeInTheDocument();
    expect(screen.queryByText("Loading exercise...")).not.toBeInTheDocument();
    expect(await screen.findByText("How do you say hello?")).toBeInTheDocument();
    expect(polls).toBeGreaterThanOrEqual(3);
  });

  test("a cached exercise never shows the generating text", async () => {
    server.use(
      http.get("http://localhost/api/path/current", () => HttpResponse.json(path)),
      http.get("http://localhost/api/preferences", () =>
        HttpResponse.json({ activePathId: "p1", nativeLanguage: "english", difficultyBias: 0 }),
      ),
      http.get("http://localhost/api/progress", () => HttpResponse.json(progress)),
      http.get("http://localhost/api/exercises/next", () =>
        HttpResponse.json({ ...choiceExercise, _status: "ready", _delivery: "cached" }),
      ),
    );

    const user = userEvent.setup();
    render(<LearnPage />);
    await user.click(await screen.findByRole("button", { name: "Start Exercise" }));
    expect(await screen.findByText("How do you say hello?")).toBeInTheDocument();
    expect(screen.queryByText("Generating exercises...")).not.toBeInTheDocument();
  });

  test("a wrong answer shows the expected answer and does not advance", async () => {
    server.use(
      http.get("http://localhost/api/path/current", () => HttpResponse.json(path)),
      http.get("http://localhost/api/preferences", () =>
        HttpResponse.json({ activePathId: "p1", nativeLanguage: "english", difficultyBias: 0 }),
      ),
      http.get("http://localhost/api/progress", () => HttpResponse.json(progress)),
      http.get("http://localhost/api/exercises/next", () => HttpResponse.json(choiceExercise)),
      http.post("http://localhost/api/exercises/answer", () =>
        HttpResponse.json({ points: 0, sessionTotals: { total: 1, correct: 0, points: 0, pass: 0 } }),
      ),
    );

    const user = userEvent.setup();
    render(<LearnPage />);
    await user.click(await screen.findByRole("button", { name: "Start Exercise" }));
    await user.click(await screen.findByRole("button", { name: "Danke" }));
    await user.click(screen.getByRole("button", { name: "Check Answer" }));
    expect(await screen.findByText("Not quite")).toBeInTheDocument();
    expect(screen.getByText("Hallo")).toBeInTheDocument();
  });

  test("give up fetches an explanation", async () => {
    server.use(
      http.get("http://localhost/api/path/current", () => HttpResponse.json(path)),
      http.get("http://localhost/api/preferences", () =>
        HttpResponse.json({ activePathId: "p1", nativeLanguage: "english", difficultyBias: 0 }),
      ),
      http.get("http://localhost/api/progress", () => HttpResponse.json(progress)),
      http.get("http://localhost/api/exercises/next", () => HttpResponse.json(choiceExercise)),
      http.post("http://localhost/api/exercises/answer", () =>
        HttpResponse.json({ points: 0, sessionTotals: { total: 1, correct: 0, points: 0, pass: 0 } }),
      ),
      http.post("http://localhost/api/exercises/explain", () =>
        HttpResponse.json({
          correctAnswer: "Hallo",
          keyPoints: ["It means hello"],
          explanation: "A greeting.",
          example: "Hallo, wie geht's?",
        }),
      ),
    );

    const user = userEvent.setup();
    render(<LearnPage />);
    await user.click(await screen.findByRole("button", { name: "Start Exercise" }));
    await user.click(await screen.findByRole("button", { name: "I don't know" }));
    expect(await screen.findByText("Correct answer")).toBeInTheDocument();
    expect(screen.getByText("A greeting.")).toBeInTheDocument();
  });
});
