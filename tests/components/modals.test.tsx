import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useMsw } from "@tests/msw";
import "@/lib/i18n";
import { FeedbackModal } from "@/components/FeedbackModal";
import { LessonSummary } from "@/components/LessonSummary";
import { SectionSummary } from "@/components/SectionSummary";

const server = useMsw();

afterEach(() => cleanup());

describe("FeedbackModal", () => {
  test("renders the three rating options", () => {
    render(<FeedbackModal exerciseCount={7} onClose={() => {}} />);
    expect(screen.getByText("Too easy")).toBeInTheDocument();
    expect(screen.getByText("Just right")).toBeInTheDocument();
    expect(screen.getByText("Too hard")).toBeInTheDocument();
  });

  test("submit stays disabled until a rating is chosen, then posts it", async () => {
    let posted: unknown = null;
    server.use(
      http.post("http://localhost:3001/api/feedback", async ({ request }) => {
        posted = (await request.json()) as unknown;
        return HttpResponse.json({ ok: true, difficultyBias: 0.1 });
      }),
    );
    const user = userEvent.setup();
    let closed = false;
    render(<FeedbackModal exerciseCount={7} onClose={() => (closed = true)} />);

    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();
    await user.click(screen.getByText("Just right"));
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(posted).toEqual({ rating: "just_right", exerciseCount: 7 });
    expect(closed).toBe(true);
  });
});

describe("LessonSummary", () => {
  test("renders points, accuracy, and improvement", () => {
    render(
      <LessonSummary
        summary={{
          pass: 1, topicName: "Greetings", total: 10, correct: 8, wrong: 2, gaveUp: 0,
          durationMs: 300_000, accuracy: 0.8, points: 40, mostCommonErrorType: null,
          improvement: { previousAccuracy: 0.6, delta: 0.2 },
        }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Lesson complete")).toBeInTheDocument();
    expect(screen.getByText("+40")).toBeInTheDocument();
    expect(screen.getByText("8 of 10 correct")).toBeInTheDocument();
    expect(screen.getByText(/Improved/)).toBeInTheDocument();
    expect(screen.getByText("5m")).toBeInTheDocument();
  });

  test("renders the continue target and closes", async () => {
    const user = userEvent.setup();
    let closed = false;
    render(
      <LessonSummary
        summary={{ pass: 1, topicName: "Greetings", total: 1, correct: 1, wrong: 0, gaveUp: 0, durationMs: 0, accuracy: 1, points: 10, mostCommonErrorType: null, improvement: null }}
        nextTopicName="Numbers"
        onClose={() => (closed = true)}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Continue to Numbers" }));
    expect(closed).toBe(true);
  });
});

describe("SectionSummary", () => {
  test("renders the section totals and bonus", () => {
    render(
      <SectionSummary
        summary={{
          moduleName: "Basics", lessonsCompleted: 2, totalPoints: 80, bonus: 10, total: 20,
          correct: 16, accuracy: 0.8, durationMs: 600_000,
          hardestTopic: { topicName: "Numbers", accuracy: 0.5 },
        }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Section complete")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByText("Includes a +10 section bonus.")).toBeInTheDocument();
    expect(screen.getByText("16 of 20 correct")).toBeInTheDocument();
    expect(screen.getByText("Toughest lesson:")).toBeInTheDocument();
    expect(screen.getByText("10m")).toBeInTheDocument();
  });
});
