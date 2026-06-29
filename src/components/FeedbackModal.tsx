import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { TrendingDown, Minus, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitFeedback } from "@/lib/api";
import { toast } from "sonner";

type Rating = "too_easy" | "just_right" | "too_hard";

type Props = {
  exerciseCount: number;
  onClose: () => void;
};

const OPTIONS: { rating: Rating; label: string; description: string; icon: React.ReactNode }[] = [
  {
    rating: "too_easy",
    label: "Too easy",
    description: "I'm breezing through these",
    icon: <TrendingUp size={18} />,
  },
  {
    rating: "just_right",
    label: "Just right",
    description: "Good challenge, I'm learning",
    icon: <Minus size={18} />,
  },
  {
    rating: "too_hard",
    label: "Too hard",
    description: "I'm struggling a lot",
    icon: <TrendingDown size={18} />,
  },
];

export function FeedbackModal({ exerciseCount, onClose }: Props) {
  const [selected, setSelected] = useState<Rating | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await submitFeedback({ rating: selected, exerciseCount });
      const messages: Record<Rating, string> = {
        too_easy: "Got it — exercises will get harder.",
        just_right: "Great, keeping it at this level.",
        too_hard: "Got it — exercises will get easier.",
      };
      toast.success(messages[selected]);
      onClose();
    } catch {
      toast.error("Failed to save feedback");
    } finally {
      setSubmitting(false);
    }
  };

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
            <div>
              <h3 className="font-semibold text-foreground">How are the exercises?</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                After {exerciseCount} exercises — help us calibrate difficulty.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors -mt-1 -mr-1 p-1"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-2">
            {OPTIONS.map(({ rating, label, description, icon }) => (
              <button
                key={rating}
                onClick={() => setSelected(rating)}
                className={[
                  "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors",
                  selected === rating
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border hover:border-primary/30 text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                <span
                  className={selected === rating ? "text-primary" : "text-muted-foreground"}
                >
                  {icon}
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSubmit}
              disabled={!selected || submitting}
              className="flex-1"
            >
              {submitting ? "Saving..." : "Submit"}
            </Button>
            <Button variant="ghost" onClick={onClose} className="text-muted-foreground">
              Skip
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
