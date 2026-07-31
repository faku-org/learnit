import { motion, AnimatePresence } from "motion/react";
import { Trophy, Clock, AlertCircle, TrendingUp, HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccuracyRing, StatTile } from "@/components/StatTile";
import { formatDelta, formatDuration, formatExerciseType, formatPercent } from "@/lib/format";
import type { LessonSummary as Summary } from "@/lib/api";

type Props = {
  summary: Summary;
  nextTopicName?: string | null;
  onClose: () => void;
};

export function LessonSummary({ summary, nextTopicName, onClose }: Props) {
  const { improvement } = summary;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="w-full max-w-md bg-card border border-border rounded-2xl p-6 space-y-5"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Lesson complete</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {summary.topicName}
                {summary.pass > 1 && ` · pass ${summary.pass}`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors -mt-1 -mr-1 p-1"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex items-center gap-5">
            <AccuracyRing accuracy={summary.accuracy} />
            <div className="flex-1 space-y-1.5">
              <p className="flex items-center gap-2 text-sm text-foreground">
                <Trophy size={14} className="text-accent shrink-0" />
                <span className="font-display text-xl leading-none">+{summary.points}</span>
                <span className="text-muted-foreground text-xs">points</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {summary.correct} of {summary.total} correct
              </p>
            </div>
          </div>

          {improvement && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-accent/10 border border-accent/20">
              <TrendingUp size={14} className="text-accent shrink-0 mt-0.5" />
              <p className="text-xs text-accent">
                {improvement.delta >= 0 ? "Improved " : "Down "}
                <span className="font-medium">{formatDelta(improvement.delta)}</span> since your
                last pass ({formatPercent(improvement.previousAccuracy)} →{" "}
                {formatPercent(summary.accuracy)}).
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <StatTile
              icon={<Clock size={11} />}
              label="Time"
              value={formatDuration(summary.durationMs)}
            />
            <StatTile
              icon={<HelpCircle size={11} />}
              label="Didn't know"
              value={summary.gaveUp}
              sub={summary.gaveUp === 1 ? "time" : "times"}
            />
          </div>

          {summary.mostCommonErrorType && (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertCircle size={12} className="shrink-0 mt-0.5 text-red-400/70" />
              Most common slip:{" "}
              <span className="text-foreground">
                {formatExerciseType(summary.mostCommonErrorType)}
              </span>
            </p>
          )}

          <Button onClick={onClose} className="w-full">
            {nextTopicName ? `Continue to ${nextTopicName}` : "Continue"}
          </Button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
