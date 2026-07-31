import { useTranslation } from "react-i18next";
import type { StudentAnswer } from "@shared/grading";

/**
 * A free-text answer. One line for a word or a quantity, a textarea when the
 * question asks for reasoning.
 *
 * The unit hint matters more than it looks: a numeric answer graded without one
 * is graded on a number whose meaning the student had to guess.
 */
export function TextAnswer({
  value,
  onChange,
  onSubmit,
  submitted,
  multiline = false,
  unit,
  placeholder,
}: {
  value: StudentAnswer;
  onChange: (next: StudentAnswer) => void;
  onSubmit: () => void;
  submitted: boolean;
  multiline?: boolean;
  unit?: string;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const text = value.kind === "text" ? value.value : "";
  const shared =
    "w-full p-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary disabled:opacity-50 text-sm";

  if (multiline) {
    return (
      <textarea
        value={text}
        onChange={(e) => onChange({ kind: "text", value: e.target.value })}
        disabled={submitted}
        rows={4}
        placeholder={placeholder ?? t("learn.explainAnswerPlaceholder")}
        className={`${shared} resize-y leading-relaxed`}
      />
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={text}
        onChange={(e) => onChange({ kind: "text", value: e.target.value })}
        disabled={submitted}
        placeholder={placeholder ?? t("learn.typeAnswerPlaceholder")}
        className={`${shared} ${unit ? "pr-16" : ""}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !submitted && text.trim().length > 0) onSubmit();
        }}
      />
      {unit && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
          {unit}
        </span>
      )}
    </div>
  );
}
