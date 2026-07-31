import type { GradingSpec, StudentAnswer } from "@shared/grading";
import { ChoiceAnswer } from "./ChoiceAnswer";
import { SetAnswer } from "./SetAnswer";
import { OrderAnswer } from "./OrderAnswer";
import { TextAnswer } from "./TextAnswer";
import { MathInput } from "./MathInput";

// One component per grading mode, behind a dispatcher.
//
// This used to be a conditional chain inside LearnPage, which was already at its
// limit at three answer types. Extracting it is what makes the remaining modes
// additions rather than another branch in a file that is hard to read.

/** The empty answer for a spec: what the field holds before the student types. */
export function initialAnswerFor(spec: GradingSpec): StudentAnswer {
  switch (spec.mode) {
    case "choice": return { kind: "choice", index: null };
    case "set": return { kind: "set", selections: {} };
    case "order": return { kind: "order", items: [] };
    default: return { kind: "text", value: "" };
  }
}

/** Whether there is enough of an answer to submit. Never judges correctness. */
export function isAnswerComplete(spec: GradingSpec, answer: StudentAnswer): boolean {
  switch (spec.mode) {
    case "choice": return answer.kind === "choice" && answer.index !== null;
    case "set":
      return (
        answer.kind === "set" &&
        spec.pairs.length > 0 &&
        Object.keys(answer.selections).length === spec.pairs.length
      );
    case "order":
      return answer.kind === "order" && answer.items.length === spec.items.length && spec.items.length > 0;
    default: return answer.kind === "text" && answer.value.trim().length > 0;
  }
}

export function AnswerArea({
  spec,
  value,
  onChange,
  onSubmit,
  submitted,
  correct,
  options = [],
  taxonomy,
}: {
  spec: GradingSpec;
  value: StudentAnswer;
  onChange: (next: StudentAnswer) => void;
  onSubmit: () => void;
  submitted: boolean;
  correct: boolean;
  /** Choices to render, for `choice` mode. */
  options?: string[];
  /** Drives the math palette's ordering. */
  taxonomy: string[];
}) {
  switch (spec.mode) {
    case "choice":
      return (
        <ChoiceAnswer
          options={options}
          correctIndex={spec.correctIndex}
          value={value}
          onChange={onChange}
          submitted={submitted}
        />
      );

    case "set":
      return <SetAnswer pairs={spec.pairs} value={value} onChange={onChange} submitted={submitted} />;

    case "order":
      return (
        <OrderAnswer items={spec.items} onChange={onChange} submitted={submitted} correct={correct} />
      );

    case "symbolic":
      return (
        <MathInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          submitted={submitted}
          taxonomy={taxonomy}
        />
      );

    case "numeric":
      return (
        <TextAnswer
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          submitted={submitted}
          unit={spec.unit}
        />
      );

    case "rubric":
      return (
        <TextAnswer
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          submitted={submitted}
          multiline
        />
      );

    case "exact":
      return <TextAnswer value={value} onChange={onChange} onSubmit={onSubmit} submitted={submitted} />;
  }
}
