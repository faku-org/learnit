import { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, ChevronRight, Loader2, RotateCcw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  generateCalibrationStage,
  type CalibrationLevel,
  type CalibrationProbeLevel,
  type CalibrationQuestion,
} from "@/lib/api";
import { toast } from "sonner";

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" as const } },
};

type ProjectionAnswers = {
  dailyTime: string;
  priorExposure: string;
  selfRating: string;
};

const DAILY_TIMES = [
  { value: "5-10", label: "5–10 min / day" },
  { value: "15-30", label: "15–30 min / day" },
  { value: "30-60", label: "30–60 min / day" },
  { value: "60+", label: "1 hour+ / day" },
];

const PRIOR_EXPOSURES = [
  { value: "none", label: "Never studied it" },
  { value: "little", label: "A few words/phrases" },
  { value: "some", label: "Basics (greetings, numbers, colors)" },
  { value: "more", label: "Simple sentences and conversations" },
];

// Self-qualification, in the student's own words. Indices line up 1:1 with
// CalibrationLevel (see CALIBRATION_LEVEL_INDEX) so the result can be compared
// directly against what the placement test measures.
const SELF_RATINGS = [
  { value: "poor", label: "Not good, honestly" },
  { value: "okay", label: "Okay, I get by" },
  { value: "good", label: "Pretty good" },
  { value: "great", label: "Very good / fluent" },
];

// ── Adaptive ladder ───────────────────────────────────────────────────────────

const PROBE_LEVELS: CalibrationProbeLevel[] = [
  "beginner",
  "elementary",
  "intermediate",
  "advanced",
];
const LEVEL_INDEX: Record<CalibrationProbeLevel, number> = {
  beginner: 0,
  elementary: 1,
  intermediate: 2,
  advanced: 3,
};

const MAX_STAGES = 3;

type StageResult = {
  probeLevel: CalibrationProbeLevel;
  correct: number;
  total: number;
};

function priorExposureToProbeLevel(priorExposure: string): CalibrationProbeLevel {
  if (priorExposure === "some") return "elementary";
  if (priorExposure === "more") return "intermediate";
  return "beginner";
}

const SELF_RATING_INDEX: Record<string, number> = { poor: 0, okay: 1, good: 2, great: 3 };

function selfRatingToProbeLevel(selfRating: string): CalibrationProbeLevel {
  return PROBE_LEVELS[SELF_RATING_INDEX[selfRating] ?? 0];
}

/**
 * Combine prior exposure and self-rating into a starting difficulty. Take
 * whichever signal is more confident — understating the start just costs one
 * extra stage climbing the ladder, but understating it twice (from both
 * questions agreeing on "beginner" for someone who is actually intermediate)
 * would waste a whole stage confirming what the student already told us.
 */
function startingProbeLevel(priorExposure: string, selfRating: string): CalibrationProbeLevel {
  const fromExposure = LEVEL_INDEX[priorExposureToProbeLevel(priorExposure)];
  const fromSelf = LEVEL_INDEX[selfRatingToProbeLevel(selfRating)];
  return PROBE_LEVELS[Math.max(fromExposure, fromSelf)];
}

/** Step the difficulty ladder: ace a stage and it climbs, bomb it and it drops. */
function nextProbeLevel(current: CalibrationProbeLevel, pct: number): CalibrationProbeLevel {
  const i = LEVEL_INDEX[current];
  if (pct >= 0.75) return PROBE_LEVELS[Math.min(PROBE_LEVELS.length - 1, i + 1)];
  if (pct <= 0.25) return PROBE_LEVELS[Math.max(0, i - 1)];
  return current;
}

/**
 * Ability estimate on the probe-level scale. Each stage contributes its own
 * difficulty offset by how far above/below 50% the student scored; later stages
 * weigh more because the ladder has converged closer to their true level by then.
 */
function estimateAbility(stages: StageResult[]): number {
  let weighted = 0;
  let weight = 0;
  stages.forEach((s, i) => {
    const w = i + 1;
    const pct = s.total > 0 ? s.correct / s.total : 0;
    weighted += w * (LEVEL_INDEX[s.probeLevel] + pct - 0.5);
    weight += w;
  });
  return weight > 0 ? weighted / weight : 0;
}

function abilityToLevel(ability: number): CalibrationLevel {
  if (ability < 0) return "complete_beginner";
  if (ability < 0.9) return "some_basics";
  if (ability < 1.5) return "elementary";
  return "intermediate";
}

// Shares the 0–3 scale with SELF_RATING_INDEX, so the measured level and the
// student's own self-qualification can be compared directly.
const CALIBRATION_LEVEL_INDEX: Record<CalibrationLevel, number> = {
  complete_beginner: 0,
  some_basics: 1,
  elementary: 2,
  intermediate: 3,
};

type SelfAssessmentVerdict = "matched" | "underestimated" | "overestimated";

function compareSelfAssessment(selfRating: string, level: CalibrationLevel): SelfAssessmentVerdict {
  const selfIdx = SELF_RATING_INDEX[selfRating] ?? 0;
  const measuredIdx = CALIBRATION_LEVEL_INDEX[level];
  if (measuredIdx > selfIdx) return "underestimated";
  if (measuredIdx < selfIdx) return "overestimated";
  return "matched";
}

const LEVEL_LABELS: Record<CalibrationLevel, { label: string; description: string }> = {
  complete_beginner: {
    label: "Complete Beginner",
    description: "Your path starts from zero — alphabet, basic phrases, and core vocabulary.",
  },
  some_basics: {
    label: "Some Basics",
    description: "You know a few things. Your path skips absolute basics and focuses on building structure.",
  },
  elementary: {
    label: "Elementary",
    description: "Solid foundation. Your path jumps into grammar patterns and practical sentences.",
  },
  intermediate: {
    label: "Intermediate",
    description: "You already have foundations. Your path focuses on fluency and complex structures.",
  },
};

const PROBE_LABELS: Record<CalibrationProbeLevel, string> = {
  beginner: "Beginner",
  elementary: "Elementary",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

type Step = "projection" | "quiz" | "adapting" | "result";

type Props = {
  language: string;
  nativeLanguage?: string;
  onComplete: (level: CalibrationLevel, projection: ProjectionAnswers) => void;
  onSkip: () => void;
};

export function CalibrationFlow({ language, nativeLanguage = "english", onComplete, onSkip }: Props) {
  const [step, setStep] = useState<Step>("projection");
  const [projection, setProjection] = useState<Partial<ProjectionAnswers>>({});
  const [loading, setLoading] = useState(false);

  const [probeLevel, setProbeLevel] = useState<CalibrationProbeLevel>("beginner");
  const [stage, setStage] = useState(1);
  const [stages, setStages] = useState<StageResult[]>([]);
  const [questions, setQuestions] = useState<CalibrationQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [level, setLevel] = useState<CalibrationLevel | null>(null);
  const [direction, setDirection] = useState<"up" | "down" | "same" | null>(null);

  // Accumulated across every stage and every retake, so no item is ever repeated.
  const askedQuestionsRef = useRef<string[]>([]);
  const usedTopicsRef = useRef<string[]>([]);

  const projectionDone =
    projection.dailyTime && projection.priorExposure && projection.selfRating;

  const loadStage = async (nextStage: number, nextLevel: CalibrationProbeLevel) => {
    setLoading(true);
    try {
      const data = await generateCalibrationStage({
        language,
        nativeLanguage,
        probeLevel: nextLevel,
        stage: nextStage,
        usedTopics: usedTopicsRef.current,
        askedQuestions: askedQuestionsRef.current.slice(-24),
      });
      askedQuestionsRef.current.push(...data.questions.map((q) => q.question));
      usedTopicsRef.current.push(...data.questions.map((q) => q.topic));
      setQuestions(data.questions);
      setProbeLevel(nextLevel);
      setStage(nextStage);
      setCurrentQ(0);
      setAnswers([]);
      setSelectedOption(null);
      setRevealed(false);
      setStep("quiz");
      return true;
    } catch {
      toast.error("Failed to generate calibration questions. Try again.");
      setStep(nextStage === 1 ? "projection" : "quiz");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const startQuiz = (showAdapting = false) => {
    setStages([]);
    setLevel(null);
    setDirection(null);
    usedTopicsRef.current = [];
    if (showAdapting) setStep("adapting");
    loadStage(
      1,
      startingProbeLevel(projection.priorExposure ?? "none", projection.selfRating ?? "poor"),
    );
  };

  const reveal = (chosenIndex: number) => {
    setAnswers((prev) => [...prev, chosenIndex]);
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

  const finish = (allStages: StageResult[]) => {
    setLevel(abilityToLevel(estimateAbility(allStages)));
    setStep("result");
  };

  const nextQuestion = async () => {
    if (currentQ + 1 < questions.length) {
      setCurrentQ((q) => q + 1);
      setSelectedOption(null);
      setRevealed(false);
      return;
    }

    // Stage complete — score it and decide whether to probe again.
    const correct = answers.filter((a, i) => a === questions[i]?.correctIndex).length;
    const result: StageResult = { probeLevel, correct, total: questions.length };
    const allStages = [...stages, result];
    setStages(allStages);

    const pct = questions.length > 0 ? correct / questions.length : 0;
    const nextLevel = nextProbeLevel(probeLevel, pct);
    // Stop at the ceiling, or once the ladder settles on a level (needs 2+ stages
    // of evidence before we trust that it has converged).
    const converged = nextLevel === probeLevel && allStages.length >= 2;
    if (allStages.length >= MAX_STAGES || converged) {
      finish(allStages);
      return;
    }

    setDirection(
      LEVEL_INDEX[nextLevel] > LEVEL_INDEX[probeLevel]
        ? "up"
        : LEVEL_INDEX[nextLevel] < LEVEL_INDEX[probeLevel]
          ? "down"
          : "same",
    );
    setStep("adapting");
    const ok = await loadStage(allStages.length + 1, nextLevel);
    if (!ok) finish(allStages);
  };

  const totalCorrect = stages.reduce((n, s) => n + s.correct, 0);
  const totalAsked = stages.reduce((n, s) => n + s.total, 0);

  const selfAssessment =
    level && projection.selfRating
      ? compareSelfAssessment(projection.selfRating, level)
      : null;
  const selfRatingLabel = SELF_RATINGS.find((r) => r.value === projection.selfRating)?.label;

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
                A few quick questions to personalize your {language} path.
              </p>
            </motion.div>

            <ProjectionSection
              title="How much time can you dedicate daily?"
              options={DAILY_TIMES}
              value={projection.dailyTime}
              onChange={(v) => setProjection((p) => ({ ...p, dailyTime: v }))}
            />
            <ProjectionSection
              title="Prior exposure to {language}?"
              titleLanguage={language}
              options={PRIOR_EXPOSURES}
              value={projection.priorExposure}
              onChange={(v) => setProjection((p) => ({ ...p, priorExposure: v }))}
            />
            <ProjectionSection
              title="Be honest — how would you rate your {language}?"
              titleLanguage={language}
              options={SELF_RATINGS}
              value={projection.selfRating}
              onChange={(v) => setProjection((p) => ({ ...p, selfRating: v }))}
            />

            <motion.div variants={itemVariants} className="flex gap-2 pt-1">
              <Button
                onClick={() => startQuiz()}
                disabled={!projectionDone || loading}
                className="flex-1 gap-2"
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <ChevronRight size={15} />
                )}
                {loading ? "Building your quiz..." : "Take calibration quiz"}
              </Button>
              <Button variant="ghost" onClick={onSkip} className="text-muted-foreground shrink-0">
                Skip
              </Button>
            </motion.div>
          </motion.div>
        )}

        {/* Between stages — the ladder is moving */}
        {step === "adapting" && (
          <motion.div
            key="adapting"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card>
              <CardContent className="pt-6 pb-6 flex flex-col items-center gap-3 text-center">
                <Loader2 size={20} className="animate-spin text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground flex items-center justify-center gap-1.5">
                    {direction === "up" && <TrendingUp size={14} className="text-accent" />}
                    {direction === "down" && <TrendingDown size={14} className="text-primary" />}
                    {direction === "same" && <Minus size={14} className="text-muted-foreground" />}
                    {direction === "up"
                      ? "Stepping the difficulty up"
                      : direction === "down"
                        ? "Stepping the difficulty down"
                        : direction === "same"
                          ? "Confirming your level"
                          : "Building your calibration quiz"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {direction
                      ? "Writing fresh questions based on how you just did."
                      : "Writing a fresh set of questions."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Quiz step */}
        {step === "quiz" && questions.length > 0 && (
          <motion.div
            key={`quiz-${stage}-${currentQ}`}
            variants={containerVariants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <motion.div variants={itemVariants} className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">
                Stage {stage}
                <span className="text-muted-foreground/50"> / {MAX_STAGES}</span>
                <span className="text-primary ml-2 normal-case tracking-normal">
                  {PROBE_LABELS[probeLevel]}
                </span>
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

                  {revealed && (
                    <p
                      className={[
                        "text-xs font-medium",
                        selectedOption === questions[currentQ].correctIndex
                          ? "text-accent"
                          : selectedOption === null
                            ? "text-muted-foreground"
                            : "text-red-400",
                      ].join(" ")}
                    >
                      {selectedOption === questions[currentQ].correctIndex
                        ? "Correct!"
                        : selectedOption === null
                          ? "You said: I don't know — marked as wrong."
                          : "Not quite — here's the correct answer."}
                    </p>
                  )}

                  <div className="space-y-2">
                    {questions[currentQ].options.map((opt, i) => {
                      const isCorrect = i === questions[currentQ].correctIndex;
                      const isSelected = selectedOption === i;
                      // A correct option the student actually picked gets the full
                      // celebratory treatment. A correct option merely being *shown*
                      // after a wrong guess or "I don't know" must look distinctly
                      // different — otherwise every reveal looks like a win, which is
                      // exactly what was making "I don't know" read as correct.
                      const gotItRight = revealed && isCorrect && isSelected;
                      const shownAsAnswer = revealed && isCorrect && !isSelected;
                      const gotItWrong = revealed && isSelected && !isCorrect;
                      return (
                        <button
                          key={i}
                          onClick={() => !revealed && setSelectedOption(i)}
                          disabled={revealed}
                          className={[
                            "w-full text-left p-3 rounded-lg border transition-colors text-sm flex items-center justify-between",
                            gotItRight
                              ? "border-accent bg-accent/10 text-accent"
                              : shownAsAnswer
                                ? "border-accent/30 bg-transparent text-muted-foreground"
                                : gotItWrong
                                  ? "border-red-500/30 bg-red-500/5 text-red-400"
                                  : isSelected && !revealed
                                    ? "border-primary bg-primary/10"
                                    : "border-border hover:border-primary/30",
                          ].join(" ")}
                        >
                          <span>{opt}</span>
                          {gotItRight && <Check size={14} />}
                          {shownAsAnswer && (
                            <span className="text-[10px] uppercase tracking-wide text-accent/70 shrink-0">
                              Correct answer
                            </span>
                          )}
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
                        Confirm
                      </Button>
                      <Button
                        onClick={dontKnow}
                        variant="ghost"
                        className="text-muted-foreground shrink-0"
                      >
                        I don't know
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={nextQuestion} disabled={loading} className="w-full gap-2">
                      {loading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <>
                          {currentQ + 1 >= questions.length ? "Finish stage" : "Next"}
                          <ChevronRight size={14} />
                        </>
                      )}
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
                    Calibration complete
                  </p>
                  <p className="text-xl font-display text-foreground">
                    {LEVEL_LABELS[level].label}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {LEVEL_LABELS[level].description}
                  </p>

                  <div className="pt-2 space-y-1">
                    {stages.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground/50 w-12 shrink-0">
                          Stage {i + 1}
                        </span>
                        <span className="text-muted-foreground flex-1">
                          {PROBE_LABELS[s.probeLevel]}
                        </span>
                        <span
                          className={
                            s.correct / s.total >= 0.75
                              ? "text-accent"
                              : s.correct / s.total <= 0.25
                                ? "text-red-400/80"
                                : "text-muted-foreground"
                          }
                        >
                          {s.correct}/{s.total}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-1 text-xs text-muted-foreground/60">
                    {totalCorrect} / {totalAsked} correct overall
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {selfAssessment && selfRatingLabel && (
              <motion.div variants={itemVariants}>
                <Card>
                  <CardContent className="pt-4 pb-4 flex items-start gap-2.5">
                    {selfAssessment === "matched" && (
                      <Check size={15} className="text-accent shrink-0 mt-0.5" />
                    )}
                    {selfAssessment === "underestimated" && (
                      <TrendingUp size={15} className="text-accent shrink-0 mt-0.5" />
                    )}
                    {selfAssessment === "overestimated" && (
                      <TrendingDown size={15} className="text-primary shrink-0 mt-0.5" />
                    )}
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      You rated yourself{" "}
                      <span className="text-foreground font-medium">
                        "{selfRatingLabel.toLowerCase()}"
                      </span>
                      .{" "}
                      {selfAssessment === "matched" &&
                        "Spot on — that's exactly what the test found."}
                      {selfAssessment === "underestimated" &&
                        "You're actually further along than that — nice."}
                      {selfAssessment === "overestimated" &&
                        "The test placed you a bit earlier — that gap is exactly what this path will close."}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            <motion.div variants={itemVariants} className="flex gap-2">
              <Button
                onClick={() => onComplete(level, projection as ProjectionAnswers)}
                className="flex-1 gap-2"
              >
                <Check size={14} />
                Generate my path
              </Button>
              <Button
                variant="ghost"
                onClick={() => startQuiz(true)}
                disabled={loading}
                className="text-muted-foreground gap-1.5 shrink-0"
                title="Redo quiz with new questions"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
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
  titleLanguage?: string;
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (v: string) => void;
};

function ProjectionSection({ title, titleLanguage, options, value, onChange }: ProjectionSectionProps) {
  const displayTitle = titleLanguage ? title.replace("{language}", titleLanguage) : title;
  return (
    <motion.div variants={itemVariants} className="space-y-2">
      <p className="text-sm font-medium text-foreground">{displayTitle}</p>
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
            {opt.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
