import { useState } from "react";
import { motion } from "motion/react";
import { Compass, ArrowRight, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ScopeReport } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";

interface Props {
  report: ScopeReport;
  /** Called with a rewritten objective once the goal has been narrowed. */
  onResolve: (objective: string) => void;
  onSkip: () => void;
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" as const } },
};

/**
 * Narrows a goal too broad to plan around.
 *
 * "Learn physics" produces ten shallow modules and teaches nothing. Rather than
 * failing or silently guessing, the system asks the few questions that turn it
 * into something a curriculum can be built from.
 */
export function ScopingQuiz({ report, onResolve, onSkip }: Props) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState<Record<string, string>>({});

  const tooNarrow = report.breadth === "narrow";
  const answered = report.questions.filter(
    (q) => answers[q.id] || freeText[q.id]?.trim(),
  ).length;
  const canSubmit = report.questions.length === 0 || answered > 0;

  const submit = () => {
    // The rewritten objective is assembled client-side from what the student
    // actually picked, so path generation never has to re-ask.
    const parts = report.questions
      .map((q) => {
        const value = freeText[q.id]?.trim() || answers[q.id];
        return value ? `${q.question} ${value}` : null;
      })
      .filter(Boolean);
    const base = report.suggestedObjective ?? "";
    onResolve([base, ...parts].filter(Boolean).join(". "));
  };

  return (
    <motion.div initial="hidden" animate="show" className="space-y-4">
      <motion.div variants={itemVariants} className="flex items-start gap-2">
        {tooNarrow ? (
          <Maximize2 size={15} className="text-accent shrink-0 mt-0.5" />
        ) : (
          <Compass size={15} className="text-accent shrink-0 mt-0.5" />
        )}
        <div>
          <p className="text-sm text-foreground font-medium">
            {t(tooNarrow ? "scoping.titleNarrow" : "scoping.titleBroad")}
          </p>
          {report.reason && (
            <p className="text-xs text-muted-foreground mt-0.5">{report.reason}</p>
          )}
        </div>
      </motion.div>

      {report.questions.map((q) => (
        <motion.div key={q.id} variants={itemVariants} className="space-y-2">
          <p className="text-xs text-foreground">{q.question}</p>
          <div className="flex flex-wrap gap-1.5">
            {q.options.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  setAnswers((prev) => ({ ...prev, [q.id]: opt }));
                  setFreeText((prev) => ({ ...prev, [q.id]: "" }));
                }}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg border text-xs transition-colors",
                  answers[q.id] === opt
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                {opt}
              </button>
            ))}
          </div>
          {q.allowsFreeText && (
            <Input
              placeholder={t("scoping.orDescribe")}
              value={freeText[q.id] ?? ""}
              onChange={(e) => {
                setFreeText((prev) => ({ ...prev, [q.id]: e.target.value }));
                if (e.target.value) setAnswers((prev) => ({ ...prev, [q.id]: "" }));
              }}
              className="text-xs h-8"
            />
          )}
        </motion.div>
      ))}

      {report.suggestedObjective && (
        <motion.div
          variants={itemVariants}
          className="rounded-lg bg-secondary/50 border border-border p-2.5"
        >
          <p className="text-[11px] text-muted-foreground mb-0.5">{t("scoping.suggested")}</p>
          <p className="text-xs text-foreground">{report.suggestedObjective}</p>
        </motion.div>
      )}

      <motion.div variants={itemVariants} className="flex gap-2">
        <Button onClick={submit} disabled={!canSubmit} className="flex-1 gap-2">
          {t("scoping.continue")}
          <ArrowRight size={14} />
        </Button>
        <Button variant="ghost" onClick={onSkip} className="text-muted-foreground text-xs">
          {t("scoping.keepAsIs")}
        </Button>
      </motion.div>
    </motion.div>
  );
}
