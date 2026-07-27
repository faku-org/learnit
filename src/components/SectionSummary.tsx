import { motion, AnimatePresence } from "motion/react";
import { Trophy, Clock, BookOpen, Flag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccuracyRing, StatTile, accuracyTone } from "@/components/StatTile";
import { formatDuration, formatPercent } from "@/lib/format";
import type { SectionSummary as Summary } from "@/lib/api";

type Props = {
  summary: Summary;
  onClose: () => void;
};

export function SectionSummary({ summary, onClose }: Props) {
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
          className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 space-y-5"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2">
              <Flag size={16} className="text-accent shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-foreground">Section complete</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{summary.moduleName}</p>
              </div>
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
                <span className="font-display text-xl leading-none">{summary.totalPoints}</span>
                <span className="text-muted-foreground text-xs">points</span>
              </p>
              {summary.bonus > 0 && (
                <p className="text-xs text-accent">Includes a +{summary.bonus} section bonus.</p>
              )}
              <p className="text-xs text-muted-foreground">
                {summary.correct} of {summary.total} correct
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatTile
              icon={<BookOpen size={11} />}
              label="Lessons"
              value={summary.lessonsCompleted}
              sub="completed"
            />
            <StatTile
              icon={<Clock size={11} />}
              label="Time"
              value={formatDuration(summary.durationMs)}
            />
          </div>

          {summary.hardestTopic && (
            <p className="text-xs text-muted-foreground">
              Toughest lesson:{" "}
              <span className="text-foreground">{summary.hardestTopic.topicName}</span>{" "}
              <span className={accuracyTone(summary.hardestTopic.accuracy)}>
                ({formatPercent(summary.hardestTopic.accuracy)})
              </span>
            </p>
          )}

          <Button onClick={onClose} className="w-full">
            Start next section
          </Button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
