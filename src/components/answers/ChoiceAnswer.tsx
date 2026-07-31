import type { StudentAnswer } from "@shared/grading";

export function ChoiceAnswer({
  options,
  correctIndex,
  value,
  onChange,
  submitted,
}: {
  options: string[];
  correctIndex: number;
  value: StudentAnswer;
  onChange: (next: StudentAnswer) => void;
  submitted: boolean;
}) {
  const selected = value.kind === "choice" ? value.index : null;

  return (
    <div className="space-y-2">
      {options.map((opt, i) => (
        <button
          key={i}
          onClick={() => !submitted && onChange({ kind: "choice", index: i })}
          disabled={submitted}
          className={[
            "w-full text-left p-3 rounded-lg border transition-colors text-sm",
            submitted && i === correctIndex
              ? "border-accent bg-accent/10 text-accent"
              : submitted && i === selected && i !== correctIndex
                ? "border-red-500/30 bg-red-500/5 text-red-400"
                : selected === i
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/30",
          ].join(" ")}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
