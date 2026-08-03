import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import "@/lib/i18n";
import type { GradingSpec, StudentAnswer } from "@shared/grading";
import {
  AnswerArea,
  initialAnswerFor,
  isAnswerComplete,
} from "@/components/answers/AnswerArea";

afterEach(() => cleanup());

function Harness({
  spec,
  options,
  report,
}: {
  spec: GradingSpec;
  options?: string[];
  report: (answer: StudentAnswer) => void;
}) {
  const [value, setValue] = useState<StudentAnswer>(initialAnswerFor(spec));
  const [submitted, setSubmitted] = useState(false);
  const handleChange = (next: StudentAnswer) => {
    setValue(next);
    report(next);
  };
  return (
    <AnswerArea
      spec={spec}
      value={value}
      onChange={handleChange}
      onSubmit={() => setSubmitted(true)}
      submitted={submitted}
      correct={false}
      options={options}
      taxonomy={["formal_science", "mathematics"]}
    />
  );
}

describe("initialAnswerFor", () => {
  test("returns the empty answer for every mode", () => {
    expect(initialAnswerFor({ mode: "choice", correctIndex: 0 })).toEqual({ kind: "choice", index: null });
    expect(initialAnswerFor({ mode: "set", pairs: [] })).toEqual({ kind: "set", selections: {} });
    expect(initialAnswerFor({ mode: "order", items: [] })).toEqual({ kind: "order", items: [] });
    expect(initialAnswerFor({ mode: "exact", answer: "x" })).toEqual({ kind: "text", value: "" });
    expect(initialAnswerFor({ mode: "numeric", value: 1 })).toEqual({ kind: "text", value: "" });
  });
});

describe("isAnswerComplete", () => {
  test("a choice needs a selected index", () => {
    const spec: GradingSpec = { mode: "choice", correctIndex: 1 };
    expect(isAnswerComplete(spec, { kind: "choice", index: null })).toBe(false);
    expect(isAnswerComplete(spec, { kind: "choice", index: 0 })).toBe(true);
  });

  test("a set needs every pair matched", () => {
    const spec: GradingSpec = { mode: "set", pairs: [{ left: "a", right: "1" }, { left: "b", right: "2" }] };
    expect(isAnswerComplete(spec, { kind: "set", selections: { a: "1" } })).toBe(false);
    expect(isAnswerComplete(spec, { kind: "set", selections: { a: "1", b: "2" } })).toBe(true);
    expect(isAnswerComplete(spec, { kind: "set", selections: {} })).toBe(false);
  });

  test("an order needs all items placed", () => {
    const spec: GradingSpec = { mode: "order", items: ["ich", "gehe"] };
    expect(isAnswerComplete(spec, { kind: "order", items: ["ich"] })).toBe(false);
    expect(isAnswerComplete(spec, { kind: "order", items: ["ich", "gehe"] })).toBe(true);
    expect(isAnswerComplete(spec, { kind: "order", items: [] })).toBe(false);
  });

  test("text needs non-whitespace content", () => {
    const spec: GradingSpec = { mode: "exact", answer: "x" };
    expect(isAnswerComplete(spec, { kind: "text", value: "   " })).toBe(false);
    expect(isAnswerComplete(spec, { kind: "text", value: "Haus" })).toBe(true);
  });
});

describe("AnswerArea dispatches by mode", () => {
  test("renders the choice buttons for choice mode", () => {
    const spec: GradingSpec = { mode: "choice", correctIndex: 0 };
    render(<AnswerArea spec={spec} value={{ kind: "choice", index: null }} onChange={() => {}} onSubmit={() => {}} submitted={false} correct={false} options={["a", "b"]} taxonomy={[]} />);
    expect(screen.getByRole("button", { name: "a" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "b" })).toBeInTheDocument();
  });

  test("renders a unit hint for numeric mode", () => {
    const spec: GradingSpec = { mode: "numeric", value: 9.81, unit: "m/s" };
    render(<AnswerArea spec={spec} value={{ kind: "text", value: "" }} onChange={() => {}} onSubmit={() => {}} submitted={false} correct={false} options={[]} taxonomy={[]} />);
    expect(screen.getByText("m/s")).toBeInTheDocument();
  });

  test("renders a textarea for rubric mode", () => {
    const spec: GradingSpec = { mode: "rubric", modelAnswer: "x", criteria: [], passScore: 0.6 };
    render(<AnswerArea spec={spec} value={{ kind: "text", value: "" }} onChange={() => {}} onSubmit={() => {}} submitted={false} correct={false} options={[]} taxonomy={[]} />);
    expect(screen.getByRole("textbox").tagName).toBe("TEXTAREA");
  });
});

describe("ChoiceAnswer", () => {
  test("clicking an option emits that index", async () => {
    const user = userEvent.setup();
    const seen: StudentAnswer[] = [];
    render(<Harness spec={{ mode: "choice", correctIndex: 2 }} options={["A", "B", "C"]} report={(a) => seen.push(a)} />);
    await user.click(screen.getByRole("button", { name: "B" }));
    expect(seen.at(-1)).toEqual({ kind: "choice", index: 1 });
  });

  test("options are disabled after submit", async () => {
    const user = userEvent.setup();
    const spec: GradingSpec = { mode: "choice", correctIndex: 0 };
    const { rerender } = render(<AnswerArea spec={spec} value={{ kind: "choice", index: null }} onChange={() => {}} onSubmit={() => {}} submitted={false} correct={false} options={["A"]} taxonomy={[]} />);
    await user.click(screen.getByRole("button", { name: "A" }));
    rerender(<AnswerArea spec={spec} value={{ kind: "choice", index: 0 }} onChange={() => {}} onSubmit={() => {}} submitted correct={false} options={["A"]} taxonomy={[]} />);
    expect(screen.getByRole("button", { name: "A" })).toBeDisabled();
  });
});

describe("TextAnswer", () => {
  test("typing emits the text value", async () => {
    const user = userEvent.setup();
    const seen: StudentAnswer[] = [];
    render(<Harness spec={{ mode: "exact", answer: "x" }} report={(a) => seen.push(a)} />);
    await user.type(screen.getByRole("textbox"), "Haus");
    expect(seen.at(-1)).toEqual({ kind: "text", value: "Haus" });
  });

  test("Enter submits only when there is text", async () => {
    const user = userEvent.setup();
    let submitted = 0;
    const spec: GradingSpec = { mode: "exact", answer: "x" };
    const { rerender } = render(
      <AnswerArea spec={spec} value={{ kind: "text", value: "" }} onChange={() => {}} onSubmit={() => submitted++} submitted={false} correct={false} options={[]} taxonomy={[]} />,
    );
    await user.keyboard("{Enter}");
    expect(submitted).toBe(0);
    rerender(
      <AnswerArea spec={spec} value={{ kind: "text", value: "Haus" }} onChange={() => {}} onSubmit={() => submitted++} submitted={false} correct={false} options={[]} taxonomy={[]} />,
    );
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Enter}");
    expect(submitted).toBe(1);
  });

  test("shows a unit hint next to the input", async () => {
    render(
      <AnswerArea spec={{ mode: "numeric", value: 9.81, unit: "m/s2" }} value={{ kind: "text", value: "" }} onChange={() => {}} onSubmit={() => {}} submitted={false} correct={false} options={[]} taxonomy={[]} />,
    );
    expect(screen.getByText("m/s2")).toBeInTheDocument();
  });
});

describe("OrderAnswer", () => {
  test("tapping tiles emits the arranged order, and tapping again removes", async () => {
    const user = userEvent.setup();
    const seen: StudentAnswer[] = [];
    render(<Harness spec={{ mode: "order", items: ["ich", "gehe", "nach"] }} report={(a) => seen.push(a)} />);
    await user.click(screen.getByRole("button", { name: "gehe" }));
    await user.click(screen.getByRole("button", { name: "nach" }));
    expect(seen.at(-1)).toEqual({ kind: "order", items: ["gehe", "nach"] });
    await user.click(screen.getByRole("button", { name: "gehe" }));
    expect(seen.at(-1)).toEqual({ kind: "order", items: ["nach"] });
  });
});

describe("SetAnswer", () => {
  test("tapping a left term then its match emits the selection", async () => {
    const user = userEvent.setup();
    const seen: StudentAnswer[] = [];
    render(<Harness spec={{ mode: "set", pairs: [{ left: "a", right: "1" }, { left: "b", right: "2" }] }} report={(a) => seen.push(a)} />);
    await user.click(screen.getByRole("button", { name: "a" }));
    await user.click(screen.getByRole("button", { name: "1" }));
    expect(seen.at(-1)).toEqual({ kind: "set", selections: { a: "1" } });
  });

  test("tapping a matched left term again unmatches it", async () => {
    const user = userEvent.setup();
    const seen: StudentAnswer[] = [];
    render(<Harness spec={{ mode: "set", pairs: [{ left: "a", right: "1" }] }} report={(a) => seen.push(a)} />);
    await user.click(screen.getByRole("button", { name: "a" }));
    await user.click(screen.getByRole("button", { name: "1" }));
    await user.click(screen.getByRole("button", { name: /^a/ }));
    expect(seen.at(-1)).toEqual({ kind: "set", selections: {} });
  });
});

describe("MathInput", () => {
  test("typing text emits it and Enter submits", async () => {
    const user = userEvent.setup();
    const seen: StudentAnswer[] = [];
    render(<Harness spec={{ mode: "symbolic", latex: "x^2", variables: ["x"] }} report={(a) => seen.push(a)} />);
    const box = screen.getByRole("textbox");
    await user.type(box, "x^2");
    expect(seen.at(-1)?.kind === "text" ? (seen.at(-1) as { value: string }).value : "").toContain("x");
    await user.keyboard("{Enter}");
  });

  test("auto-braces an exponent", async () => {
    const user = userEvent.setup();
    const seen: StudentAnswer[] = [];
    render(<Harness spec={{ mode: "symbolic", latex: "x", variables: [] }} report={(a) => seen.push(a)} />);
    const box = screen.getByRole("textbox");
    await user.type(box, "^");
    const last = seen.at(-1);
    expect(last).toEqual({ kind: "text", value: "^{}" });
  });
});
