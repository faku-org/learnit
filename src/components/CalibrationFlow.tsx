import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, ChevronRight, Loader2, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { generateCalibrationQuestions, type CalibrationLevel, type CalibrationQuestion } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" as const } },
};

type ProjectionAnswers = {
  motivation: string;
  dailyTime: string;
  priorExposure: string;
};

const MOTIVATIONS = [
  { value: "travel", labelKey: "calibration.motivationTravel" },
  { value: "work", labelKey: "calibration.motivationWork" },
  { value: "culture", labelKey: "calibration.motivationCulture" },
  { value: "personal", labelKey: "calibration.motivationPersonal" },
];

const DAILY_TIMES = [
  { value: "5-10", labelKey: "calibration.dailyTime5_10" },
  { value: "15-30", labelKey: "calibration.dailyTime15_30" },
  { value: "30-60", labelKey: "calibration.dailyTime30_60" },
  { value: "60+", labelKey: "calibration.dailyTime60Plus" },
];

const PRIOR_EXPOSURES = [
  { value: "none", labelKey: "calibration.priorNone" },
  { value: "little", labelKey: "calibration.priorLittle" },
  { value: "some", labelKey: "calibration.priorSome" },
  { value: "more", labelKey: "calibration.priorMore" },
];

type TargetLevel = "beginner" | "elementary" | "intermediate" | "advanced";

function priorExposureToTargetLevel(priorExposure: string): TargetLevel {
  if (priorExposure === "some") return "elementary";
  if (priorExposure === "more") return "intermediate";
  return "beginner";
}

function scoreToLevel(correct: number, total: number, priorExposure: string): CalibrationLevel {
  const pct = correct / total;
  if (priorExposure === "none" || pct < 0.25) return "complete_beginner";
  if (pct < 0.5) return "some_basics";
  if (pct < 0.75) return "elementary";
  return "intermediate";
}

const LEVEL_KEYS: Record<CalibrationLevel, string> = {
  complete_beginner: "completeBeginner",
  some_basics: "someBasics",
  elementary: "elementary",
  intermediate: "intermediate",
};

type Step = "projection" | "quiz" | "result";

type Props = {
  language: string;
  nativeLanguage?: string;
  onComplete: (level: CalibrationLevel, projection: ProjectionAnswers) => void;
  onSkip: () => void;
};

export function CalibrationFlow({ language, nativeLanguage = "english", onComplete, onSkip }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("projection");
  const [projection, setProjection] = useState<Partial<ProjectionAnswers>>({});
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [questions, setQuestions] = useState<CalibrationQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [level, setLevel] = useState<CalibrationLevel | null>(null);
  const [attempt, setAttempt] = useState(1);

  const projectionDone =
    projection.motivation && projection.dailyTime && projection.priorExposure;

  const startQuiz = async (attemptNumber = 1) => {
    setLoadingQuiz(true);
    const targetLevel = priorExposureToTargetLevel(projection.priorExposure ?? "none");
    try {
      const data = await generateCalibrationQuestions({
        language,
        nativeLanguage,
        targetLevel,
        attempt: attemptNumber,
      });
      setQuestions(data.questions);
      setCurrentQ(0);
      setAnswers([]);
      setSelectedOption(null);
      setRevealed(false);
      setLevel(null);
      setStep("quiz");
    } catch {
      toast.error(t("calibration.toastQuizError"));
    } finally {
      setLoadingQuiz(false);
    }
  };

  const reveal = (chosenIndex: number) => {
    const newAnswers = [...answers, chosenIndex];
    setAnswers(newAnswers);
    setRevealed(true);
  };

  const confirmAnswer = () => {
    if (selectedOption === null) return;
    reveal(selectedOption);
  };

  const dontKnow = () => {
    setSelectedOption(null);
    reveal(-1);
  };

  const nextQuestion = () => {
    if (currentQ + 1 >= questions.length) {
      // answers already contains all responses including current question (pushed in reveal())
      const correctCount = answers.filter((a, i) => a === questions[i].correctIndex).length;
      const computed = scoreToLevel(correctCount, questions.length, projection.priorExposure ?? "none");
      setLevel(computed);
      setStep("result");
    } else {
      setCurrentQ((q) => q + 1);
      setSelectedOption(null);
      setRevealed(false);
    }
  };

  const handleUseLevel = () => {
    if (!level) return;
    onComplete(level, projection as ProjectionAnswers);
  };

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {/* Projection step */}
        {step === "projection" && (
          <motion.div
            key="projection"
            variants={containerVariants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -10 }}
            className="space-y-5"
          >
            <motion.div variants={itemVariants}>
              <p className="text-sm text-muted-foreground mb-1">
                {t("calibration.personalize", { language })}
              </p>
            </motion.div>

            <ProjectionSection
              title={t("calibration.whyLearning")}
              options={MOTIVATIONS}
              value={projection.motivation}
              onChange={(v) => setProjection((p) => ({ ...p, motivation: v }))}
            />
            <ProjectionSection
              title={t("calibration.dailyTimeQuestion")}
              options={DAILY_TIMES}
              value={projection.dailyTime}
              onChange={(v) => setProjection((p) => ({ ...p, dailyTime: v }))}
            />
            <ProjectionSection
              title={t("calibration.priorExposureQuestion", { language })}
              options={PRIOR_EXPOSURES}
              value={projection.priorExposure}
              onChange={(v) => setProjection((p) => ({ ...p, priorExposure: v }))}
            />

            <motion.div variants={itemVariants} className="flex gap-2 pt-1">
              <Button
                onClick={() => startQuiz(attempt)}
                disabled={!projectionDone || loadingQuiz}
                className="flex-1 gap-2"
              >
                {loadingQuiz ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <ChevronRight size={15} />
                )}
                {loadingQuiz ? t("calibration.loadingQuiz") : t("calibration.takeQuiz")}
              </Button>
              <Button variant="ghost" onClick={onSkip} className="text-muted-foreground shrink-0">
                {t("common.skip")}
              </Button>
            </motion.div>
          </motion.div>
        )}

        {/* Quiz step */}
        {step === "quiz" && questions.length > 0 && (
          <motion.div
            key={`quiz-${currentQ}`}
            variants={containerVariants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <motion.div variants={itemVariants} className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">
                {t("calibration.questionCounter", { current: currentQ + 1, total: questions.length })}
              </p>
              <div className="flex gap-1">
                {questions.map((_, i) => (
                  <div
                    key={i}
                    className={[
                      "h-1 rounded-full transition-all",
                      i < currentQ
                        ? answers[i] === questions[i].correctIndex
                          ? "w-4 bg-accent"
                          : "w-4 bg-red-400/60"
                        : i === currentQ
                          ? "w-4 bg-primary"
                          : "w-2 bg-border",
                    ].join(" ")}
                  />
                ))}
              </div>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest">
                    {questions[currentQ].topic}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-2xl font-display text-foreground mb-1">
                      {questions[currentQ].question}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {questions[currentQ].instruction}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {questions[currentQ].options.map((opt, i) => {
                      const isCorrect = i === questions[currentQ].correctIndex;
                      const isSelected = selectedOption === i;
                      return (
                        <button
                          key={i}
                          onClick={() => !revealed && setSelectedOption(i)}
                          disabled={revealed}
                          className={[
                            "w-full text-left p-3 rounded-lg border transition-colors text-sm flex items-center justify-between",
                            revealed && isCorrect
                              ? "border-accent bg-accent/10 text-accent"
                              : revealed && isSelected && !isCorrect
                                ? "border-red-500/30 bg-red-500/5 text-red-400"
                                : isSelected && !revealed
                                  ? "border-primary bg-primary/10"
                                  : "border-border hover:border-primary/30",
                          ].join(" ")}
                        >
                          <span>{opt}</span>
                          {revealed && isCorrect && <Check size={14} />}
                        </button>
                      );
                    })}
                  </div>

                  {!revealed ? (
                    <div className="flex gap-2">
                      <Button
                        onClick={confirmAnswer}
                        disabled={selectedOption === null}
                        className="flex-1"
                      >
                        {t("common.confirm")}
                      </Button>
                      <Button
                        onClick={dontKnow}
                        variant="ghost"
                        className="text-muted-foreground shrink-0"
                      >
                        {t("calibration.dontKnow")}
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={nextQuestion} className="w-full gap-2">
                      {currentQ + 1 >= questions.length ? t("calibration.seeResults") : t("common.next")}
                      <ChevronRight size={14} />
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}

        {/* Result step */}
        {step === "result" && level && (
          <motion.div
            key="result"
            variants={containerVariants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <motion.div variants={itemVariants}>
              <Card className="border-accent/30 bg-accent/5">
                <CardContent className="pt-5 space-y-2">
                  <p className="text-xs text-accent uppercase tracking-widest font-semibold">
                    {t("calibration.calibrationComplete")}
                  </p>
                  <p className="text-xl font-display text-foreground">
                    {t(`calibration.levels.${LEVEL_KEYS[level]}.label`)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t(`calibration.levels.${LEVEL_KEYS[level]}.description`)}
                  </p>
                  <div className="pt-1 text-xs text-muted-foreground/60">
                    {t("calibration.correctCount", {
                      correct: answers.filter((a, i) => a === questions[i].correctIndex).length,
                      total: questions.length,
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={itemVariants} className="flex gap-2">
              <Button onClick={handleUseLevel} className="flex-1 gap-2">
                <Check size={14} />
                {t("calibration.generatePath")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  const next = attempt + 1;
                  setAttempt(next);
                  startQuiz(next);
                }}
                disabled={loadingQuiz}
                className="text-muted-foreground gap-1.5 shrink-0"
                title={t("calibration.redoTitle")}
              >
                {loadingQuiz ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type ProjectionSectionProps = {
  title: string;
  options: { value: string; labelKey: string }[];
  value: string | undefined;
  onChange: (v: string) => void;
};

function ProjectionSection({ title, options, value, onChange }: ProjectionSectionProps) {
  const { t } = useTranslation();
  return (
    <motion.div variants={itemVariants} className="space-y-2">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={[
              "text-left p-2.5 rounded-lg border text-sm transition-colors",
              value === opt.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
            ].join(" ")}
          >
            {t(opt.labelKey)}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
