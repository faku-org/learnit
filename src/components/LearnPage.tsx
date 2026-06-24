import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Map,
  ChevronRight,
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
  getProgress,
  saveProgress,
  type Progress,
} from "@/lib/api";
import { PathRoadmap, type RoadmapModule } from "@/components/PathRoadmap";
import { toast } from "sonner";

const EXERCISE_TYPES = ["multiple_choice", "fill_blank", "translation"] as const;
const QUEUE_SIZE = 2;
const CORRECT_TO_ADVANCE = 3;

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

type CurrentPath = {
  _id: string;
  language: string;
  modules: RoadmapModule[];
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

// Normalize answer text for comparison.
// - Strips punctuation and normalizes whitespace for all languages.
// - For German: accepts plain ASCII substitutes (ä/ae→a, ö/oe→o, ü/ue→u, ß→ss).
function normalizeAnswer(text: string, language: string): string {
  let s = text
    .toLowerCase()
    .replace(/[.,!?;:'"()«»„""\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (language.toLowerCase() !== "german") return s;
  return s
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u");
}

type ExplanationResponse = {
  correctAnswer: string;
  keyPoints: string[];
  explanation: string;
  example: string;
};

function advanceTopic(progress: Progress, modules: RoadmapModule[]): Progress {
  const completed = [
    ...progress.completedTopics,
    `${progress.currentModuleIndex}-${progress.currentTopicIndex}`,
  ];
  let modIdx = progress.currentModuleIndex;
  let topIdx = progress.currentTopicIndex + 1;
  while (modIdx < modules.length) {
    const topics = modules[modIdx].topics ?? [];
    if (topIdx < topics.length) {
      return { ...progress, completedTopics: completed, currentModuleIndex: modIdx, currentTopicIndex: topIdx };
    }
    modIdx++;
    topIdx = 0;
  }
  // All done — stay at last position
  return {
    ...progress,
    completedTopics: completed,
    currentModuleIndex: progress.currentModuleIndex,
    currentTopicIndex: progress.currentTopicIndex,
  };
}

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
  const [currentPath, setCurrentPath] = useState<CurrentPath | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [activeTopicKey, setActiveTopicKey] = useState<string | null>(null);
  const [showRoadmap, setShowRoadmap] = useState(true);
  const [justAdvanced, setJustAdvanced] = useState(false);

  const queueRef = useRef<Exercise[]>([]);
  const currentPathRef = useRef<CurrentPath | null>(null);
  const nativeLangRef = useRef("english");
  const prefetchingRef = useRef(false);
  const progressRef = useRef<Progress | null>(null);
  const activeTopicRef = useRef<string | null>(null);

  useEffect(() => { queueRef.current = exerciseQueue; }, [exerciseQueue]);
  useEffect(() => { currentPathRef.current = currentPath; }, [currentPath]);
  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { activeTopicRef.current = activeTopicKey; }, [activeTopicKey]);

  const currentTopicName = useMemo(() => {
    if (!currentPath || !progress) return null;
    if (activeTopicKey) {
      const [mIdx, tIdx] = activeTopicKey.split("-").map(Number);
      return currentPath.modules[mIdx]?.topics?.[tIdx]?.name ?? null;
    }
    return (
      currentPath.modules[progress.currentModuleIndex]?.topics?.[
        progress.currentTopicIndex
      ]?.name ?? null
    );
  }, [currentPath, progress, activeTopicKey]);

  const buildParams = useCallback(() => {
    const type = EXERCISE_TYPES[Math.floor(Math.random() * EXERCISE_TYPES.length)];
    const path = currentPathRef.current;
    const language = path?.language ?? "japanese";
    const prog = progressRef.current;
    const activeKey = activeTopicRef.current;

    let topic = "greetings";
    if (path && prog) {
      if (activeKey) {
        const [mIdx, tIdx] = activeKey.split("-").map(Number);
        topic = path.modules[mIdx]?.topics?.[tIdx]?.name ?? topic;
      } else {
        topic =
          path.modules[prog.currentModuleIndex]?.topics?.[prog.currentTopicIndex]?.name ?? topic;
      }
    } else if (path) {
      const allTopics = path.modules.flatMap((m) => m.topics ?? []);
      if (allTopics.length > 0) {
        topic = allTopics[Math.floor(Math.random() * allTopics.length)].name;
      }
    }

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
        // best-effort
      } finally {
        prefetchingRef.current = false;
      }
    },
    [buildParams],
  );

  useEffect(() => {
    Promise.allSettled([getCurrentPath(), getPreferences()]).then(
      async ([pathResult, prefsResult]) => {
        let pathId: string | undefined;
        if (pathResult.status === "fulfilled") {
          const path = pathResult.value as unknown as CurrentPath;
          setCurrentPath(path);
          pathId = path._id;
        }
        if (prefsResult.status === "fulfilled") {
          const lang = prefsResult.value.nativeLanguage;
          setNativeLanguage(lang);
          nativeLangRef.current = lang;
        }
        if (pathId) {
          const prog = await getProgress(pathId).catch(() => null);
          if (prog) {
            setProgress(prog);
          }
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
    setJustAdvanced(false);

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

  const persistProgress = useCallback(async (newProg: Progress) => {
    try {
      await saveProgress(newProg);
    } catch {
      // non-critical
    }
  }, []);

  const handleCorrectAnswer = useCallback(() => {
    const prog = progressRef.current;
    const path = currentPathRef.current;
    if (!prog || !path) return;

    const isOnCurrentTopic =
      activeTopicRef.current === null ||
      activeTopicRef.current === `${prog.currentModuleIndex}-${prog.currentTopicIndex}`;

    if (!isOnCurrentTopic) return; // reviewing — don't track progression

    const key = `${prog.currentModuleIndex}-${prog.currentTopicIndex}`;
    const stats = prog.topicStats[key] ?? { total: 0, correct: 0 };
    const newCorrect = stats.correct + 1;

    let newProg: Progress = {
      ...prog,
      topicStats: {
        ...prog.topicStats,
        [key]: { total: stats.total + 1, correct: newCorrect },
      },
    };

    if (newCorrect >= CORRECT_TO_ADVANCE) {
      newProg = advanceTopic(newProg, path.modules);
      setActiveTopicKey(null);
      setJustAdvanced(true);
      // Clear queue so next exercises use the new topic
      queueRef.current = [];
      setExerciseQueue([]);
    }

    setProgress(newProg);
    persistProgress(newProg);
  }, [persistProgress]);

  const handleWrongAnswer = useCallback(() => {
    const prog = progressRef.current;
    if (!prog) return;
    const isOnCurrentTopic =
      activeTopicRef.current === null ||
      activeTopicRef.current === `${prog.currentModuleIndex}-${prog.currentTopicIndex}`;
    if (!isOnCurrentTopic) return;

    const key = `${prog.currentModuleIndex}-${prog.currentTopicIndex}`;
    const stats = prog.topicStats[key] ?? { total: 0, correct: 0 };
    const newProg = {
      ...prog,
      topicStats: {
        ...prog.topicStats,
        [key]: { total: stats.total + 1, correct: stats.correct },
      },
    };
    setProgress(newProg);
    persistProgress(newProg);
  }, [persistProgress]);

  const handleSubmit = () => {
    if (!exercise) return;
    let isCorrect = false;
    if (exercise.type === "multiple_choice") {
      isCorrect = selectedAnswer === (exercise.correctIndex ?? 0);
    } else {
      const lang = currentPath?.language ?? "";
      const input = normalizeAnswer(textAnswer, lang);
      const answer = normalizeAnswer(exercise.correctAnswer ?? "", lang);
      isCorrect = input === answer;
      // For fill_blank: also accept the full sentence with the blank filled in
      if (!isCorrect && exercise.type === "fill_blank" && exercise.sentence) {
        const full = exercise.sentence.replace(/___/g, exercise.correctAnswer ?? "");
        isCorrect = input === normalizeAnswer(full, lang);
      }
    }
    setCorrect(isCorrect);
    setSubmitted(true);
    if (isCorrect) {
      updateStreak().catch(console.error);
      handleCorrectAnswer();
    } else {
      handleWrongAnswer();
    }
  };

  const handleGiveUp = async () => {
    if (!exercise) return;
    setGaveUp(true);
    handleWrongAnswer();
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

  const handleTopicSelect = useCallback(
    (moduleIdx: number, topicIdx: number, _topicName: string) => {
      const key = `${moduleIdx}-${topicIdx}`;
      setActiveTopicKey(key);
      // Clear queue so next exercise uses the selected topic
      queueRef.current = [];
      setExerciseQueue([]);
      resetInteractionState();
      setExercise(null);
      setPrevExercise(null);
      setJustAdvanced(false);
    },
    [],
  );

  const canSubmit =
    exercise &&
    !submitted &&
    (exercise.type === "multiple_choice" ? selectedAnswer !== null : textAnswer.trim().length > 0);

  const hasPath = Boolean(currentPath);

  return (
    <div className="flex">
      {/* Roadmap sidebar */}
      <AnimatePresence>
        {hasPath && showRoadmap && currentPath && progress && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 272, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="shrink-0 border-r border-border overflow-x-hidden overflow-y-auto sticky top-0 h-screen"
          >
            <div className="w-[272px] py-8 px-4">
              <PathRoadmap
                language={currentPath.language}
                modules={currentPath.modules}
                progress={progress}
                activeTopicKey={
                  activeTopicKey ??
                  `${progress.currentModuleIndex}-${progress.currentTopicIndex}`
                }
                correctToAdvance={CORRECT_TO_ADVANCE}
                onTopicSelect={handleTopicSelect}
              />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main area */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex-1 px-6 py-8 overflow-y-auto"
      >
        <div className="max-w-2xl mx-auto w-full">
          <motion.div variants={itemVariants} className="flex items-start justify-between mb-2">
            <div>
              <h1 className="font-display text-3xl text-foreground">Learn</h1>
              {currentTopicName && (
                <p className="text-muted-foreground text-sm mt-1">
                  Practicing:{" "}
                  <span className="text-foreground font-medium">{currentTopicName}</span>
                </p>
              )}
            </div>
            {hasPath && (
              <button
                onClick={() => setShowRoadmap((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
              >
                <Map size={13} />
                {showRoadmap ? "Hide map" : "Show map"}
              </button>
            )}
          </motion.div>

          {justAdvanced && (
            <motion.div
              variants={itemVariants}
              className="mb-4 p-3 rounded-lg bg-accent/10 border border-accent/20 flex items-center gap-2"
            >
              <Check size={14} className="text-accent shrink-0" />
              <p className="text-sm text-accent">
                Topic complete! Moving to{" "}
                <span className="font-medium">{currentTopicName}</span>.
              </p>
            </motion.div>
          )}

          {!exercise && !loading && (
            <motion.div variants={itemVariants} className="mt-6">
              <Card className="text-center py-12">
                <CardContent className="flex flex-col items-center gap-3">
                  <BookOpen size={48} className="text-muted-foreground" />
                  <p className="text-muted-foreground">
                    {currentTopicName
                      ? `Ready to practice ${currentTopicName}?`
                      : "Ready to practice?"}
                  </p>
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
                className="space-y-4 mt-4"
              >
                <motion.div variants={itemVariants}>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest flex items-center justify-between">
                        <span>{exercise.type.replace(/_/g, " ")}</span>
                        {currentTopicName && (
                          <span className="flex items-center gap-1 normal-case font-normal text-[11px]">
                            <ChevronRight size={10} />
                            {currentTopicName}
                          </span>
                        )}
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
                              correct
                                ? "bg-accent/10 text-accent"
                                : "bg-red-500/10 text-red-400",
                            ].join(" ")}
                          >
                            {correct ? <Check size={16} /> : <X size={16} />}
                            <span className="text-sm">{correct ? "Correct!" : "Not quite"}</span>
                            {correct && progress && (
                              <span className="text-xs opacity-70 ml-auto">
                                {Math.min(
                                  (progress.topicStats[
                                    `${progress.currentModuleIndex}-${progress.currentTopicIndex}`
                                  ]?.correct ?? 1),
                                  CORRECT_TO_ADVANCE,
                                )}
                                /{CORRECT_TO_ADVANCE} to unlock next
                              </span>
                            )}
                          </div>
                          {!correct && exercise.correctAnswer && (
                            <p className="text-sm">
                              <span className="text-muted-foreground">Answer: </span>
                              <span className="text-accent">{exercise.correctAnswer}</span>
                            </p>
                          )}
                          {exercise.explanation && (
                            <p className="text-xs text-muted-foreground">
                              {exercise.explanation}
                            </p>
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
                                <p className="text-xs text-muted-foreground mb-1">
                                  Correct answer
                                </p>
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
                                        <span className="text-accent mt-0.5 shrink-0">
                                          &bull;
                                        </span>
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
                                  <p className="text-sm text-foreground">
                                    {detailedExpl.example}
                                  </p>
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
        </div>
      </motion.div>
    </div>
  );
}
