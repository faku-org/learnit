import { useMemo, useState } from "react";
import type { StudentAnswer } from "@shared/grading";

/** Match each left-hand term to a right-hand one. Tap left, then tap its match. */
export function SetAnswer({
  pairs,
  value,
  onChange,
  submitted,
}: {
  pairs: { left: string; right: string }[];
  value: StudentAnswer;
  onChange: (next: StudentAnswer) => void;
  submitted: boolean;
}) {
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const selections = value.kind === "set" ? value.selections : {};

  const rightOptions = useMemo(() => {
    const rights = pairs.map((p) => p.right);
    for (let i = rights.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rights[i], rights[j]] = [rights[j], rights[i]];
    }
    return rights;
  }, [pairs]);

  const handleLeft = (left: string): void => {
    if (submitted) return;
    if (selections[left]) {
      const next = { ...selections };
      delete next[left];
      onChange({ kind: "set", selections: next });
      setSelectedLeft(null);
      return;
    }
    setSelectedLeft((prev) => (prev === left ? null : left));
  };

  const handleRight = (right: string): void => {
    if (submitted || !selectedLeft) return;
    const next = { ...selections };
    // A right-hand item can only be spent once, so claiming it releases it from
    // whatever it was matched to before.
    for (const key of Object.keys(next)) {
      if (next[key] === right) delete next[key];
    }
    next[selectedLeft] = right;
    onChange({ kind: "set", selections: next });
    setSelectedLeft(null);
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        {pairs.map((p) => {
          const matched = selections[p.left];
          const isCorrectPair = submitted && matched === p.right;
          return (
            <button
              key={p.left}
              onClick={() => handleLeft(p.left)}
              disabled={submitted}
              className={[
                "w-full text-left p-2.5 rounded-lg border text-sm transition-colors",
                submitted
                  ? isCorrectPair
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-red-500/30 bg-red-500/5 text-red-400"
                  : selectedLeft === p.left
                    ? "border-primary bg-primary/10"
                    : matched
                      ? "border-accent/40 bg-accent/5"
                      : "border-border hover:border-primary/30",
              ].join(" ")}
            >
              {p.left}
              {matched && <span className="text-muted-foreground"> &rarr; {matched}</span>}
            </button>
          );
        })}
      </div>
      <div className="space-y-2">
        {rightOptions.map((r) => {
          const usedBy = Object.entries(selections).find(([, v]) => v === r)?.[0];
          return (
            <button
              key={r}
              onClick={() => handleRight(r)}
              disabled={submitted || !selectedLeft}
              className={[
                "w-full text-left p-2.5 rounded-lg border text-sm transition-colors",
                usedBy
                  ? "border-accent/40 bg-accent/5 text-muted-foreground"
                  : "border-border hover:border-primary/30",
                submitted || (!selectedLeft && !usedBy) ? "opacity-50" : "",
              ].join(" ")}
            >
              {r}
            </button>
          );
        })}
      </div>
    </div>
  );
}
