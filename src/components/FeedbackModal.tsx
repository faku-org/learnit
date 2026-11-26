import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { TrendingDown, Minus, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitFeedback } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";

type Rating = "too_easy" | "just_right" | "too_hard";

type Props = {
  exerciseCount: number;
  onClose: () => void;
};

const OPTIONS: { rating: Rating; labelKey: string; descriptionKey: string; icon: React.ReactNode }[] = [
  {
    rating: "too_easy",
    labelKey: "feedback.tooEasyLabel",
    descriptionKey: "feedback.tooEasyDesc",
    icon: <TrendingUp size={18} />,
  },
  {
    rating: "just_right",
    labelKey: "feedback.justRightLabel",
    descriptionKey: "feedback.justRightDesc",
    icon: <Minus size={18} />,
  },
  {
    rating: "too_hard",
    labelKey: "feedback.tooHardLabel",
    descriptionKey: "feedback.tooHardDesc",
    icon: <TrendingDown size={18} />,
  },
];

export function FeedbackModal({ exerciseCount, onClose }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Rating | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await submitFeedback({ rating: selected, exerciseCount });
      const messageKeys: Record<Rating, string> = {
        too_easy: "feedback.toastTooEasy",
        just_right: "feedback.toastJustRight",
        too_hard: "feedback.toastTooHard",
      };
      toast.success(t(messageKeys[selected]));
      onClose();
    } catch {
      toast.error(t("feedback.toastError"));
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
          className="w-full max-w-md bg-card border border-border rounded-2xl p-6 space-y-5"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-foreground">{t("feedback.title")}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("feedback.subtitle", { count: exerciseCount })}
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
            {OPTIONS.map(({ rating, labelKey, descriptionKey, icon }) => (
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
                  <p className="text-sm font-medium text-foreground">{t(labelKey)}</p>
                  <p className="text-xs text-muted-foreground">{t(descriptionKey)}</p>
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
              {submitting ? t("common.saving") : t("feedback.submit")}
            </Button>
            <Button variant="ghost" onClick={onClose} className="text-muted-foreground">
              {t("common.skip")}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
