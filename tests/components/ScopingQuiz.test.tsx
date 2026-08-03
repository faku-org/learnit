import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/lib/i18n";
import { ScopingQuiz } from "@/components/ScopingQuiz";
import type { ScopeReport } from "@/lib/api";

afterEach(() => cleanup());

const broadReport: ScopeReport = {
  breadth: "too_broad",
  reason: "Too much ground to cover at once.",
  questions: [
    {
      id: "q1",
      question: "What focus are you after?",
      options: ["Conversation", "Reading"],
      allowsFreeText: true,
    },
  ],
  suggestedObjective: "Communicate in everyday situations",
};

describe("ScopingQuiz", () => {
  test("shows the broad title and reason", () => {
    render(<ScopingQuiz report={broadReport} onResolve={() => {}} onSkip={() => {}} />);
    expect(screen.getByText("That is a big subject")).toBeInTheDocument();
    expect(screen.getByText("Too much ground to cover at once.")).toBeInTheDocument();
  });

  test("a narrow report shows the narrow title", () => {
    render(
      <ScopingQuiz
        report={{ ...broadReport, breadth: "narrow" }}
        onResolve={() => {}}
        onSkip={() => {}}
      />,
    );
    expect(screen.getByText("That is quite specific")).toBeInTheDocument();
  });

  test("submitting assembles the refined objective from answers", async () => {
    const user = userEvent.setup();
    let resolved = "";
    render(<ScopingQuiz report={broadReport} onResolve={(o) => (resolved = o)} onSkip={() => {}} />);

    const continueBtn = screen.getByRole("button", { name: /Continue/ });
    expect(continueBtn).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Conversation" }));
    await user.click(continueBtn);

    expect(resolved).toBe("Communicate in everyday situations. What focus are you after? Conversation");
  });

  test("free text overrides a chosen option", async () => {
    const user = userEvent.setup();
    let resolved = "";
    render(<ScopingQuiz report={broadReport} onResolve={(o) => (resolved = o)} onSkip={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Conversation" }));
    await user.type(screen.getByPlaceholderText("Or describe it yourself"), "Business German");
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(resolved).toContain("Business German");
  });

  test("skip keeps the goal as written", async () => {
    const user = userEvent.setup();
    let skipped = false;
    render(<ScopingQuiz report={broadReport} onResolve={() => {}} onSkip={() => (skipped = true)} />);
    await user.click(screen.getByRole("button", { name: /Keep as is/ }));
    expect(skipped).toBe(true);
  });
});
