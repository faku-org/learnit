import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useMsw } from "@tests/msw";
import "@/lib/i18n";
import { CalibrationFlow } from "@/components/CalibrationFlow";

const server = useMsw();

afterEach(() => cleanup());

// One question per stage; the stage number comes from the request body.
function stubStages() {
  server.use(
    http.post("http://localhost/api/calibration/stage", async ({ request }) => {
      const body = (await request.json()) as { stage?: number };
      const stage = body.stage ?? 1;
      return HttpResponse.json({
        probeLevel: "intermediate",
        stage,
        questions: [
          {
            topic: `Topic ${stage}`,
            question: `Question ${stage}`,
            instruction: "Pick the right option.",
            options: ["Alpha", "Beta"],
            correctIndex: 0,
          },
        ],
      });
    }),
  );
}

async function answerProjection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Curiosity, I want to understand it" }));
  await user.click(screen.getByRole("button", { name: "15–30 min / day" }));
  await user.click(screen.getByRole("button", { name: "I know the core ideas and vocabulary" }));
  await user.click(screen.getByRole("button", { name: "Pretty good" }));
}

describe("CalibrationFlow interaction", () => {
  test("skip calls onSkip without starting the quiz", async () => {
    const user = userEvent.setup();
    let skipped = false;
    render(<CalibrationFlow subject="Macroeconomics" onComplete={() => {}} onSkip={() => (skipped = true)} />);
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(skipped).toBe(true);
  });

  test("the take-quiz button stays disabled until the projection is complete", async () => {
    stubStages();
    const user = userEvent.setup();
    render(<CalibrationFlow subject="Macroeconomics" onComplete={() => {}} onSkip={() => {}} />);
    expect(screen.getByRole("button", { name: "Take calibration quiz" })).toBeDisabled();
    await answerProjection(user);
    expect(screen.getByRole("button", { name: "Take calibration quiz" })).toBeEnabled();
  });

  test("answering the ladder calls onComplete with a level", async () => {
    stubStages();
    const user = userEvent.setup();
    let completed: { level: string; projection: Record<string, string> } | null = null;
    render(
      <CalibrationFlow
        subject="Macroeconomics"
        onComplete={(level, projection) => (completed = { level, projection })}
        onSkip={() => {}}
      />,
    );

    await answerProjection(user);
    await user.click(screen.getByRole("button", { name: "Take calibration quiz" }));

    for (const stage of [1, 2]) {
      expect(await screen.findByText(`Question ${stage}`)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Alpha" }));
      await user.click(screen.getByRole("button", { name: "Confirm" }));
      await user.click(screen.getByRole("button", { name: "See results" }));
    }

    expect(await screen.findByText("Calibration complete")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate my path" }));
    expect(completed).not.toBeNull();
    expect(completed!.projection.dailyTime).toBe("15-30");
  });

  test("a wrong answer moves the ladder down rather than hanging", async () => {
    stubStages();
    const user = userEvent.setup();
    let completed = false;
    render(
      <CalibrationFlow
        subject="Macroeconomics"
        onComplete={() => (completed = true)}
        onSkip={() => {}}
      />,
    );

    await answerProjection(user);
    await user.click(screen.getByRole("button", { name: "Take calibration quiz" }));

    // Wrong on the first stage pushes the ladder down, so it takes three stages.
    for (const stage of [1, 2, 3]) {
      expect(await screen.findByText(`Question ${stage}`)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: stage === 1 ? "Beta" : "Alpha" }));
      await user.click(screen.getByRole("button", { name: "Confirm" }));
      await user.click(screen.getByRole("button", { name: "See results" }));
    }

    expect(await screen.findByText("Calibration complete")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate my path" }));
    expect(completed).toBe(true);
  });
});

const SAMPLE = "def f(n):\n    if n < 2:\n        return n\n    return f(n - 1)";

function stubQuestion(question: Record<string, unknown>) {
  server.use(
    http.post("http://localhost/api/calibration/stage", () =>
      HttpResponse.json({ probeLevel: "intermediate", stage: 1, questions: [question] }),
    ),
  );
}

async function openQuiz() {
  const user = userEvent.setup();
  render(<CalibrationFlow subject="Python" onComplete={() => {}} onSkip={() => {}} />);
  await answerProjection(user);
  await user.click(screen.getByRole("button", { name: "Take calibration quiz" }));
  return user;
}

describe("CalibrationFlow rich questions", () => {
  test("a code block renders monospaced with its indentation", async () => {
    stubQuestion({
      topic: "recursion",
      question: "What does f(1) return?",
      instruction: "Pick one.",
      options: ["0", "1"],
      correctIndex: 1,
      blocks: [{ kind: "code", lang: "python", value: SAMPLE }],
    });
    await openQuiz();
    await screen.findByText("What does f(1) return?");

    const group = screen.getByRole("group", { name: "Material for this question" });
    expect(group.querySelector("pre code.font-mono")).not.toBeNull();
    const indented = [...group.querySelectorAll("span.whitespace-pre")].find((s) =>
      s.textContent?.includes("        return n"),
    );
    expect(indented).toBeDefined();
    expect(group.textContent).toContain("python");
  });

  test("a plain question renders no material group", async () => {
    stubQuestion({
      topic: "t",
      question: "A plain question",
      instruction: "Pick one.",
      options: ["Alpha", "Beta"],
      correctIndex: 0,
    });
    await openQuiz();
    await screen.findByText("A plain question");
    expect(screen.queryByRole("group", { name: "Material for this question" })).toBeNull();
  });

  test("inline math in the question and in an option goes through KaTeX", async () => {
    stubQuestion({
      topic: "algebra",
      question: "What is the derivative of $x^2$?",
      instruction: "Pick one.",
      options: ["$2x$", "$x$"],
      correctIndex: 0,
    });
    await openQuiz();
    await waitFor(() =>
      expect(document.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(3),
    );
    // One formula in the question, one in each option.
    expect(document.querySelectorAll("button .katex").length).toBe(2);
  });

  test("a multi-line option renders as code and can be chosen", async () => {
    const option = "    return n\n    pass";
    stubQuestion({
      topic: "recursion",
      question: "Which body is correct?",
      instruction: "Pick one.",
      options: [option, "x = 1"],
      correctIndex: 0,
    });
    const user = await openQuiz();
    await screen.findByText("Which body is correct?");

    const code = document.querySelector("button code.whitespace-pre");
    expect(code).not.toBeNull();
    expect(code!.textContent).toBe(option);

    await user.click(code!.closest("button")!);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
  });
});
