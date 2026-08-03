import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
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
    http.post("http://localhost:3001/api/calibration/stage", async ({ request }) => {
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
