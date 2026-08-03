import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setSession } from "@/lib/auth";
import { useMsw } from "@tests/msw";
import "@/lib/i18n";
import { ExercisesPage } from "@/components/ExercisesPage";

const server = useMsw();

afterEach(() => cleanup());
beforeEach(() => {
  setSession("tok", { userId: "u1", email: "a@b.c" });
});

const exercises = [
  {
    _id: "e1",
    type: "multiple_choice",
    topic: "Greetings",
    language: "German",
    level: "beginner",
    instruction: "Pick the greeting",
    question: "How do you say hello?",
    correctAnswer: "Hallo",
    createdAt: "2026-08-01",
  },
  {
    _id: "e2",
    type: "translation",
    topic: "Numbers",
    language: "German",
    level: "beginner",
    instruction: "Translate",
    sentence: "One is eins",
    createdAt: "2026-08-02",
  },
];

function seed(ex = exercises, total = 2) {
  server.use(
    http.get("http://localhost:3001/api/exercises", () =>
      HttpResponse.json({ exercises: ex, total }),
    ),
  );
}

describe("ExercisesPage", () => {
  test("lists exercises and the total count", async () => {
    seed();
    render(<ExercisesPage />);
    expect(await screen.findByText("How do you say hello?")).toBeInTheDocument();
    expect(screen.getByText("One is eins")).toBeInTheDocument();
    expect(screen.getByText("2 exercises")).toBeInTheDocument();
  });

  test("shows the empty state with no exercises", async () => {
    seed([], 0);
    render(<ExercisesPage />);
    expect(await screen.findByText(/No exercises yet/)).toBeInTheDocument();
  });

  test("shows the no-matches state when filtering", async () => {
    seed([], 0);
    const user = userEvent.setup();
    render(<ExercisesPage />);
    await user.type(screen.getByPlaceholderText("Search by topic or keyword..."), "zzz");
    expect(await screen.findByText(/No exercises match/)).toBeInTheDocument();
  });

  test("expanding a card reveals the answer", async () => {
    seed();
    const user = userEvent.setup();
    render(<ExercisesPage />);
    const card = await screen.findByText("How do you say hello?");
    await user.click(card.closest(".rounded-xl") as HTMLElement);
    expect(screen.getByText("Answer:")).toBeInTheDocument();
    expect(screen.getByText("Hallo")).toBeInTheDocument();
  });

  test("a type filter refetches with the type", async () => {
    let seen: URLSearchParams | null = null;
    server.use(
      http.get("http://localhost:3001/api/exercises", ({ request }) => {
        seen = new URLSearchParams(new URL(request.url).search);
        return HttpResponse.json({ exercises: [exercises[0]], total: 1 });
      }),
    );
    const user = userEvent.setup();
    render(<ExercisesPage />);
    await screen.findByText("How do you say hello?");

    await user.click(screen.getByRole("button", { name: "Multiple choice" }));
    await waitFor(() => expect(seen?.get("type")).toBe("multiple_choice"));
  });
});
