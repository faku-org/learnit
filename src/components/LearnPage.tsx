import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen,
  Shuffle,
  Check,
  X,
  RefreshCw,
  Loader2,
  HelpCircle,
  ArrowLeft,
  Languages,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  generateExercise,
  explainExercise,
  translateText,
  getCurrentPath,
  getPreferences,
  updateStreak,
} from "@/lib/api";
import { toast } from "sonner";

const EXERCISE_TYPES = ["multiple_choice", "fill_blank", "translation"] as const;
const QUEUE_SIZE = 2;

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

type CurrentPath = {
  language: string;
  modules: { topics?: { name: string }[] }[];
};

type Exercise = {
  _id?: string;
  type: string;
  instruction: string;
  question?: string;
  sentence?: string;
  sourceText?: string;
  options?: string[];
  correctIndex?: number;
  correctAnswer?: string;
  hint?: string;
  explanation?: string;
};

type ExplanationResponse = {
  correctAnswer: string;
  keyPoints: string[];
  explanation: string;
  example: string;
};

export function LearnPage() {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [prevExercise, setPrevExercise] = useState<Exercise | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nativeLanguage, setNativeLanguage] = useState("english");
  const [gaveUp, setGaveUp] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [detailedExpl, setDetailedExpl] = useState<ExplanationResponse | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [exerciseQueue, setExerciseQueue] = useState<Exercise[]>([]);

  // Refs let prefillQueue read fresh values without stale closures
  const queueRef = useRef<Exercise[]>([]);
  const currentPathRef = useRef<CurrentPath | null>(null);
  const nativeLangRef = useRef("english");
  const prefetchingRef = useRef(false);

  useEffect(() => {
    queueRef.current = exerciseQueue;
  }, [exerciseQueue]);

  const buildParams = useCallback(() => {
    const type = EXERCISE_TYPES[Math.floor(Math.random() * EXERCISE_TYPES.length)];
    const path = currentPathRef.current;
    const language = path?.language ?? "japanese";
    const allTopics = path?.modules.flatMap((m) => m.topics ?? []) ?? [];
    const topic =
      allTopics.length > 0
        ? allTopics[Math.floor(Math.random() * allTopics.length)].name
        : "greetings";
    return {
      language,
      level: "beginner" as const,
      topic,
      type,
      nativeLanguage: nativeLangRef.current,
    };
  }, []);

  const prefillQueue = useCallback(
    async (needed: number) => {
      if (prefetchingRef.current || needed <= 0) return;
      prefetchingRef.current = true;
      try {
        const results = await Promise.allSettled(
          Array.from({ length: needed }, () =>
            generateExercise(buildParams()).then((d) => d as unknown as Exercise),
          ),
        );
        const fetched = results
          .filter((r): r is PromiseFulfilledResult<Exercise> => r.status === "fulfilled")
          .map((r) => r.value);
        if (fetched.length > 0) {
          queueRef.current = [...queueRef.current, ...fetched];
          setExerciseQueue([...queueRef.current]);
        }
      } catch {
        // best-effort — silently ignore prefetch failures
      } finally {
        prefetchingRef.current = false;
      }
    },
    [buildParams],
  );

  useEffect(() => {
    Promise.allSettled([getCurrentPath(), getPreferences()]).then(
      ([pathResult, prefsResult]) => {
        if (pathResult.status === "fulfilled") {
          currentPathRef.current = pathResult.value as unknown as CurrentPath;
        }
        if (prefsResult.status === "fulfilled") {
          const lang = prefsResult.value.nativeLanguage;
          setNativeLanguage(lang);
          nativeLangRef.current = lang;
        }
        prefillQueue(QUEUE_SIZE);
      },
    );
  }, [prefillQueue]);

  const resetInteractionState = () => {
    setSubmitted(false);
    setSelectedAnswer(null);
    setTextAnswer("");
    setGaveUp(false);
    setExplaining(false);
    setDetailedExpl(null);
    setTranslation(null);
    setTranslating(false);
  };

  const fetchExercise = useCallback(async () => {
    if (exercise) setPrevExercise(exercise);
    resetInteractionState();
    setExercise(null);

    const queue = queueRef.current;
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      queueRef.current = rest;
      setExerciseQueue(rest);
      setExercise(next);
      const needed = QUEUE_SIZE - rest.length;
      if (needed > 0) prefillQueue(needed);
      return;
    }

    // Queue empty — generate synchronously with loading indicator
    setLoading(true);
    try {
      const data = await generateExercise(buildParams());
      setExercise(data as unknown as Exercise);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to generate exercise");
    } finally {
      setLoading(false);
    }
    prefillQueue(QUEUE_SIZE);
  }, [exercise, buildParams, prefillQueue]);

  const goToPrevious = useCallback(() => {
    if (!prevExercise) return;
    resetInteractionState();
    setExercise(prevExercise);
    setPrevExercise(null);
  }, [prevExercise]);

  const handleSubmit = () => {
    if (!exercise) return;
    let isCorrect = false;
    if (exercise.type === "multiple_choice") {
      isCorrect = selectedAnswer === (exercise.correctIndex ?? 0);
    } else {
      isCorrect =
        textAnswer.toLowerCase().trim() === (exercise.correctAnswer ?? "").toLowerCase().trim();
    }
    setCorrect(isCorrect);
    setSubmitted(true);
    if (isCorrect) updateStreak().catch(console.error);
  };

  const handleGiveUp = async () => {
    if (!exercise) return;
    setGaveUp(true);
    setExplaining(true);
    try {
      const result = await explainExercise({
        exercise: exercise as unknown as Record<string, unknown>,
        nativeLanguage,
      });
      setDetailedExpl(result);
    } catch {
      toast.error("Failed to generate explanation");
    } finally {
      setExplaining(false);
    }
  };

  const handleTranslate = async (text: string) => {
    if (translation) {
      setTranslation(null);
      return;
    }
    setTranslating(true);
    try {
      const result = await translateText({ text, targetLanguage: nativeLanguage });
      setTranslation(result.translation);
    } catch {
      toast.error("Translation failed");
    } finally {
      setTranslating(false);
    }
  };

  const canSubmit =
    exercise &&
    !submitted &&
    (exercise.type === "multiple_choice" ? selectedAnswer !== null : textAnswer.trim().length > 0);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="px-6 py-8 max-w-3xl mx-auto w-full"
    >
      <motion.h1 variants={itemVariants} className="font-display text-3xl text-foreground mb-2">
        Learn
      </motion.h1>
      <motion.p variants={itemVariants} className="text-muted-foreground mb-8">
        Practice with AI-generated exercises.
      </motion.p>

      {!exercise && !loading && (
        <motion.div variants={itemVariants}>
          <Card className="text-center py-12">
            <CardContent className="flex flex-col items-center gap-3">
              <BookOpen size={48} className="text-muted-foreground" />
              <p className="text-muted-foreground">Ready to practice?</p>
              <Button onClick={fetchExercise} size="lg" className="gap-2">
                <Shuffle size={16} />
                Generate Exercise
              </Button>
              {prevExercise && (
                <Button
                  onClick={goToPrevious}
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground mt-1"
                >
                  <ArrowLeft size={14} />
                  Resume previous exercise
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {loading && (
        <motion.div variants={itemVariants} className="text-center py-12">
          <Loader2 className="animate-spin mx-auto mb-4 text-accent" size={32} />
          <p className="text-muted-foreground">Generating exercise...</p>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {exercise && !loading && (
          <motion.div
            key={exercise._id ?? exercise.instruction}
            variants={containerVariants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest">
                    {exercise.type.replace(/_/g, " ")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-foreground text-lg">{exercise.instruction}</p>

                  {(() => {
                    const textToTranslate =
                      exercise.type === "multiple_choice"
                        ? exercise.question
                        : exercise.type === "fill_blank"
                          ? exercise.sentence
                          : null;
                    const displayText =
                      exercise.question ?? exercise.sentence ?? exercise.sourceText;
                    return (
                      <>
                        {displayText && (
                          <p className="text-foreground font-medium text-lg">{displayText}</p>
                        )}
                        {textToTranslate && !gaveUp && (
                          <div>
                            <button
                              onClick={() => handleTranslate(textToTranslate)}
                              disabled={translating}
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                            >
                              {translating ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : (
                                <Languages size={11} />
                              )}
                              {translating
                                ? "Translating..."
                                : translation
                                  ? "Hide translation"
                                  : "Translate"}
                            </button>
                            {translation && !translating && (
                              <p className="text-xs text-muted-foreground mt-1.5 pl-3 border-l-2 border-border">
                                {translation}
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {!gaveUp && exercise.type === "multiple_choice" && exercise.options && (
                    <div className="space-y-2">
                      {exercise.options.map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => !submitted && setSelectedAnswer(i)}
                          disabled={submitted}
                          className={[
                            "w-full text-left p-3 rounded-lg border transition-colors text-sm",
                            submitted && i === exercise.correctIndex
                              ? "border-accent bg-accent/10 text-accent"
                              : submitted && i === selectedAnswer && i !== exercise.correctIndex
                                ? "border-red-500/30 bg-red-500/5 text-red-400"
                                : selectedAnswer === i
                                  ? "border-primary bg-primary/10"
                                  : "border-border hover:border-primary/30",
                          ].join(" ")}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {!gaveUp &&
                    (exercise.type === "fill_blank" || exercise.type === "translation") && (
                      <input
                        type="text"
                        value={textAnswer}
                        onChange={(e) => setTextAnswer(e.target.value)}
                        disabled={submitted}
                        placeholder="Type your answer..."
                        className="w-full p-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary disabled:opacity-50 text-sm"
                        onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
                      />
                    )}

                  {exercise.hint && !submitted && !gaveUp && (
                    <p className="text-xs text-muted-foreground">Hint: {exercise.hint}</p>
                  )}

                  {!submitted && !gaveUp && (
                    <div className="flex gap-2 items-center">
                      <Button onClick={handleSubmit} disabled={!canSubmit} className="flex-1">
                        Check Answer
                      </Button>
                      <Button
                        onClick={handleGiveUp}
                        variant="ghost"
                        className="text-muted-foreground gap-1.5 shrink-0"
                      >
                        <HelpCircle size={14} />
                        I don't know
                      </Button>
                    </div>
                  )}

                  {submitted && (
                    <div className="space-y-3">
                      <div
                        className={[
                          "flex items-center gap-2 p-3 rounded-lg",
                          correct ? "bg-accent/10 text-accent" : "bg-red-500/10 text-red-400",
                        ].join(" ")}
                      >
                        {correct ? <Check size={16} /> : <X size={16} />}
                        <span className="text-sm">{correct ? "Correct!" : "Not quite"}</span>
                      </div>
                      {!correct && exercise.correctAnswer && (
                        <p className="text-sm">
                          <span className="text-muted-foreground">Answer: </span>
                          <span className="text-accent">{exercise.correctAnswer}</span>
                        </p>
                      )}
                      {exercise.explanation && (
                        <p className="text-xs text-muted-foreground">{exercise.explanation}</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          onClick={fetchExercise}
                          variant="outline"
                          className="flex-1 gap-2"
                        >
                          <RefreshCw size={14} />
                          Next Exercise
                        </Button>
                        {prevExercise && (
                          <Button
                            onClick={goToPrevious}
                            variant="ghost"
                            className="gap-1.5 text-muted-foreground shrink-0"
                          >
                            <ArrowLeft size={14} />
                            Previous
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {gaveUp && (
                    <div className="space-y-4">
                      {explaining && (
                        <div className="text-center py-6">
                          <Loader2
                            className="animate-spin mx-auto mb-3 text-accent"
                            size={22}
                          />
                          <p className="text-xs text-muted-foreground">
                            Generating explanation...
                          </p>
                        </div>
                      )}
                      {detailedExpl && !explaining && (
                        <>
                          <div className="p-3 rounded-lg bg-accent/10">
                            <p className="text-xs text-muted-foreground mb-1">Correct answer</p>
                            <p className="text-accent font-medium">
                              {detailedExpl.correctAnswer}
                            </p>
                          </div>
                          {detailedExpl.keyPoints.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-2">Key points</p>
                              <ul className="space-y-1.5">
                                {detailedExpl.keyPoints.map((pt, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm">
                                    <span className="text-accent mt-0.5 shrink-0">&bull;</span>
                                    {pt}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <p className="text-sm text-muted-foreground">
                            {detailedExpl.explanation}
                          </p>
                          {detailedExpl.example && (
                            <div className="p-3 rounded-lg bg-secondary">
                              <p className="text-xs text-muted-foreground mb-1">Example</p>
                              <p className="text-sm text-foreground">{detailedExpl.example}</p>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button
                              onClick={fetchExercise}
                              variant="outline"
                              className="flex-1 gap-2"
                            >
                              <RefreshCw size={14} />
                              Continue
                            </Button>
                            {prevExercise && (
                              <Button
                                onClick={goToPrevious}
                                variant="ghost"
                                className="gap-1.5 text-muted-foreground shrink-0"
                              >
                                <ArrowLeft size={14} />
                                Previous
                              </Button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
