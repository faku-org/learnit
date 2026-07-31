import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CalibrationFlow } from "./CalibrationFlow";
import "@/lib/i18n";

// The projective questions open every path, and their ANSWERS used to be
// written for someone learning a language: "travel and tourism", "a few
// words/phrases", "fluent". A student starting Macroeconomics was picking from
// a menu that had nothing to do with the subject.

const render = (taxonomy: string[] | undefined, subject: string): string =>
  renderToStaticMarkup(
    <CalibrationFlow
      subject={subject}
      taxonomy={taxonomy}
      onComplete={() => {}}
      onSkip={() => {}}
    />,
  );

describe("projective questions for a non-language subject", () => {
  const html = render(["social_science", "economics", "macroeconomics"], "Macroeconomics");

  test("names the subject in every question that mentions one", () => {
    expect(html).toContain("How much Macroeconomics do you already know?");
    expect(html).toContain("How would you rate yourself in Macroeconomics?");
  });

  test("offers reasons that apply to a subject, not to a language", () => {
    expect(html).toContain("An exam or certification");
    expect(html).toContain("Curiosity, I want to understand it");
    expect(html).not.toContain("Travel &amp; tourism");
    expect(html).not.toContain("Personal connection or family");
  });

  test("offers prior-exposure answers that apply to a subject", () => {
    expect(html).toContain("I know the core ideas and vocabulary");
    expect(html).not.toContain("A few words/phrases");
    expect(html).not.toContain("greetings, numbers, colors");
  });

  test("does not ask whether the student is fluent in economics", () => {
    expect(html).toContain("Very good / I can teach it");
    expect(html).not.toContain("fluent");
  });
});

describe("a language path keeps the copy it always had", () => {
  const html = render(["language", "german"], "German");

  test("keeps the language-specific reasons", () => {
    expect(html).toContain("Travel &amp; tourism");
    expect(html).toContain("Personal connection or family");
  });

  test("keeps the language-specific prior-exposure answers", () => {
    expect(html).toContain("A few words/phrases");
    expect(html).toContain("greetings, numbers, colors");
  });

  test("keeps fluency as the top self-rating", () => {
    expect(html).toContain("Very good / fluent");
  });
});

describe("before classification resolves", () => {
  test("falls back to the general copy, which reads correctly either way", () => {
    const html = render(undefined, "Macroeconomics");
    expect(html).toContain("An exam or certification");
    expect(html).not.toContain("Travel &amp; tourism");
  });
});
