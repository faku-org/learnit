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
  Volume2,
  SkipForward,
  Map,
  ChevronRight,
  Lightbulb,
  Languages,
  Bookmark,
  type LucideProps,
} from "lucide-react";
import * as LucideIcons from "lucide-react";

function ExerciseIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = (LucideIcons as Record<string, unknown>)[name] as React.FC<LucideProps> | undefined;
  return Icon ? <Icon {...props} /> : null;
}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getNextExercise,
  recordAnswer,
  explainExercise,
  getCurrentPath,
  getPreferences,
  updateStreak,
  getProgress,
  saveProgress,
  translateText,
  addVocabulary,
  enrichVocabulary,
  hydrateModuleTopics,
  type Progress,
} from "@/lib/api";
import { getCachedPhraseTranslation, setCachedPhraseTranslation } from "@/components/ClickableText";
import { PathRoadmap, type RoadmapModule } from "@/components/PathRoadmap";
import { ClickableText, toLangCode, speakText, type WordMeaning } from "@/components/ClickableText";
import { AuthGuard } from "@/components/AuthGuard";
import { FeedbackModal } from "@/components/FeedbackModal";
import { toast } from "sonner";

const QUEUE_SIZE = 2;
const CORRECT_TO_ADVANCE = 3;
const FEEDBACK_EVERY = 7;

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
  icon?: string;
  context?: string;
  instruction: string;
  question?: string;
  sentence?: string;
  sourceText?: string;
  options?: string[];
  correctIndex?: number;
  correctAnswer?: string;
  hint?: string;
  explanation?: string;
  wordMeanings?: WordMeaning[];
};

function normalizeAnswer(text: string, language: string): string {
  let s = text
    .toLowerCase()
    .replace(/[.,!?;:'"()«»„""\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (language.toLowerCase() !== "german") return s;
  return s
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u");
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
    // Land on the next module even if its topics have not been generated yet —
    // hydration is triggered on arrival. Never skip past an outlined module.
    if (modIdx < modules.length && (modules[modIdx].topics?.length ?? 0) === 0) {
      return { ...progress, completedTopics: completed, currentModuleIndex: modIdx, currentTopicIndex: 0 };
    }
  }
  return {
    ...progress,
    completedTopics: completed,
    currentModuleIndex: progress.currentModuleIndex,
    currentTopicIndex: progress.currentTopicIndex,
  };
}

function LearnInner() {
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
  const [exerciseQueue, setExerciseQueue] = useState<Exercise[]>([]);
  const [currentPath, setCurrentPath] = useState<CurrentPath | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [activeTopicKey, setActiveTopicKey] = useState<string | null>(null);
  const [showRoadmap, setShowRoadmap] = useState(true);
  const [justAdvanced, setJustAdvanced] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [phraseTranslation, setPhraseTranslation] = useState<string | null>(null);
  const [phraseTranslating, setPhraseTranslating] = useState(false);
  const [savingWord, setSavingWord] = useState<string | null>(null);
  const [showWordMenu, setShowWordMenu] = useState(false);

  const [hydratingModules, setHydratingModules] = useState<number[]>([]);
  const [hydrationError, setHydrationError] = useState(false);

  const queueRef = useRef<Exercise[]>([]);
  const currentPathRef = useRef<CurrentPath | null>(null);
  const nativeLangRef = useRef("english");
  const prefetchingRef = useRef(false);
  const progressRef = useRef<Progress | null>(null);
  const activeTopicRef = useRef<string | null>(null);
  const hydratingRef = useRef<Set<number>>(new Set());

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

  // The module the student just walked into has an outline but no topics yet.
  const currentModulePending = useMemo(() => {
    if (!currentPath || !progress) return false;
    return (currentPath.modules[progress.currentModuleIndex]?.topics?.length ?? 0) === 0;
  }, [currentPath, progress]);

  const buildParams = useCallback(() => {
    const path = currentPathRef.current;
    const language = path?.language ?? "japanese";
    const prog = progressRef.current;
    const activeKey = activeTopicRef.current;
    let topic = "greetings";
    if (path && prog) {
      const resolved = activeKey
        ? (() => {
            const [mIdx, tIdx] = activeKey.split("-").map(Number);
            return path.modules[mIdx]?.topics?.[tIdx]?.name;
          })()
        : path.modules[prog.currentModuleIndex]?.topics?.[prog.currentTopicIndex]?.name;
      // Module topics are written on demand. Until they arrive there is no topic
      // to practice — wait rather than drifting off-path onto a fallback.
      if (!resolved) return null;
      topic = resolved;
    } else if (path) {
      const allTopics = path.modules.flatMap((m) => m.topics ?? []);
      if (allTopics.length > 0) {
        topic = allTopics[Math.floor(Math.random() * allTopics.length)].name;
      }
    }
    return { language, topic, level: "beginner", nativeLanguage: nativeLangRef.current };
  }, []);

  const prefillQueue = useCallback(
    async (needed: number) => {
      if (prefetchingRef.current || needed <= 0) return;
      const params = buildParams();
      if (!params) return;
      prefetchingRef.current = true;
      try {
        const results = await Promise.allSettled(
          Array.from({ length: needed }, () =>
            getNextExercise(params).then((d) => d as unknown as Exercise),
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
          if (prog) setProgress(prog);
        }
        prefillQueue(QUEUE_SIZE);
      },
    );
  }, [prefillQueue]);

  /**
   * Fill in a module's topics on demand. The path is stored as an outline plus
   * module 1; every later module is written from the student's real performance,
   * which keeps the path adaptive and each LLM call well under the output limit.
   */
  const ensureModuleHydrated = useCallback(
    async (moduleIdx: number) => {
      const path = currentPathRef.current;
      if (!path || moduleIdx < 0 || moduleIdx >= path.modules.length) return;
      if ((path.modules[moduleIdx].topics?.length ?? 0) > 0) return;
      if (hydratingRef.current.has(moduleIdx)) return;

      hydratingRef.current.add(moduleIdx);
      setHydratingModules([...hydratingRef.current]);
      setHydrationError(false);
      try {
        const { topics } = await hydrateModuleTopics(path._id, moduleIdx + 1);
        const merged: CurrentPath = {
          ...path,
          modules: path.modules.map((m, i) => (i === moduleIdx ? { ...m, topics } : m)),
        };
        currentPathRef.current = merged;
        setCurrentPath(merged);
        // The student may be standing in this module with an empty queue.
        if (progressRef.current?.currentModuleIndex === moduleIdx) {
          prefillQueue(QUEUE_SIZE - queueRef.current.length);
        }
      } catch {
        setHydrationError(true);
        toast.error("Couldn't prepare that module.");
      } finally {
        hydratingRef.current.delete(moduleIdx);
        setHydratingModules([...hydratingRef.current]);
      }
    },
    [prefillQueue],
  );

  // Hydrate the module the student is standing in, and prefetch the next one as
  // soon as they reach the final topic of the current module.
  useEffect(() => {
    if (!currentPath || !progress) return;
    const mIdx = progress.currentModuleIndex;
    const topics = currentPath.modules[mIdx]?.topics ?? [];
    if (topics.length === 0) {
      ensureModuleHydrated(mIdx);
      return;
    }
    if (progress.currentTopicIndex >= topics.length - 1) {
      ensureModuleHydrated(mIdx + 1);
    }
  }, [currentPath, progress, ensureModuleHydrated]);

  const resetInteractionState = () => {
    setSubmitted(false);
    setSelectedAnswer(null);
    setTextAnswer("");
    setGaveUp(false);
    setExplaining(false);
    setDetailedExpl(null);
    setPhraseTranslation(null);
    setPhraseTranslating(false);
    setShowWordMenu(false);
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

    const params = buildParams();
    if (!params) return;

    setLoading(true);
    try {
      const data = await getNextExercise(params);
      setExercise(data as unknown as Exercise);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load exercise");
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
    try { await saveProgress(newProg); } catch { /* non-critical */ }
  }, []);

  const handleCorrectAnswer = useCallback(() => {
    const prog = progressRef.current;
    const path = currentPathRef.current;
    if (!prog || !path) return;
    const isOnCurrentTopic =
      activeTopicRef.current === null ||
      activeTopicRef.current === `${prog.currentModuleIndex}-${prog.currentTopicIndex}`;
    if (!isOnCurrentTopic) return;
    const key = `${prog.currentModuleIndex}-${prog.currentTopicIndex}`;
    const stats = prog.topicStats[key] ?? { total: 0, correct: 0 };
    const newCorrect = stats.correct + 1;
    let newProg: Progress = {
      ...prog,
      topicStats: { ...prog.topicStats, [key]: { total: stats.total + 1, correct: newCorrect } },
    };
    if (newCorrect >= CORRECT_TO_ADVANCE) {
      newProg = advanceTopic(newProg, path.modules);
      setActiveTopicKey(null);
      setJustAdvanced(true);
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
      topicStats: { ...prog.topicStats, [key]: { total: stats.total + 1, correct: stats.correct } },
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
      if (!isCorrect && exercise.type === "fill_blank" && exercise.sentence) {
        const full = exercise.sentence.replace(/___/g, exercise.correctAnswer ?? "");
        isCorrect = input === normalizeAnswer(full, lang);
      }
    }
    setCorrect(isCorrect);
    setSubmitted(true);

    // Record for SRS
    if (exercise._id) {
      recordAnswer({ exerciseId: exercise._id, correct: isCorrect }).catch(() => {});
    }

    if (isCorrect) {
      updateStreak().catch(console.error);
      handleCorrectAnswer();
    } else {
      handleWrongAnswer();
    }

    // Feedback trigger
    const next = answeredCount + 1;
    setAnsweredCount(next);
    if (next % FEEDBACK_EVERY === 0) {
      setTimeout(() => setShowFeedback(true), 800);
    }
  };

  const handleGiveUp = async () => {
    if (!exercise) return;
    setGaveUp(true);
    handleWrongAnswer();
    if (exercise._id) {
      recordAnswer({ exerciseId: exercise._id, correct: false, quality: 0 }).catch(() => {});
    }
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
    const next = answeredCount + 1;
    setAnsweredCount(next);
    if (next % FEEDBACK_EVERY === 0) {
      setTimeout(() => setShowFeedback(true), 800);
    }
  };

  const handleRetryLater = useCallback(() => {
    if (!exercise) return;
    const queue = queueRef.current;
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      const newQueue = [...rest, exercise];
      queueRef.current = newQueue;
      setExerciseQueue(newQueue);
      setPrevExercise(null);
      resetInteractionState();
      setExercise(next);
      setJustAdvanced(false);
    } else {
      queueRef.current = [exercise];
      setExerciseQueue([exercise]);
      resetInteractionState();
      setExercise(null);
      setJustAdvanced(false);
      prefillQueue(QUEUE_SIZE);
    }
  }, [exercise, prefillQueue]);

  const handleSaveWord = async (wm: WordMeaning) => {
    const wordToSave = wm.infinitive || wm.word;
    setSavingWord(wordToSave);
    setShowWordMenu(false);
    try {
      const saved = await addVocabulary({
        word: wordToSave,
        meaning: wm.meaning,
        language: currentPath?.language ?? "",
      }) as unknown as { _id: string };
      toast.success(`Saved "${wordToSave}" to vocabulary`);
      enrichVocabulary(saved._id, {
        word: wordToSave,
        meaning: wm.meaning,
        language: currentPath?.language ?? "",
        nativeLanguage,
      }).catch(() => {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save word");
    } finally {
      setSavingWord(null);
    }
  };

  const handleTopicSelect = useCallback(
    (moduleIdx: number, topicIdx: number, _topicName: string) => {
      const key = `${moduleIdx}-${topicIdx}`;
      setActiveTopicKey(key);
      queueRef.current = [];
      setExerciseQueue([]);
      resetInteractionState();
      setExercise(null);
      setPrevExercise(null);
      setJustAdvanced(false);
    },
    [],
  );

  // ── Main render ───────────────────────────────────────────────────────────

  const canSubmit =
    exercise &&
    !submitted &&
    (exercise.type === "multiple_choice" ? selectedAnswer !== null : textAnswer.trim().length > 0);

  const hasPath = Boolean(currentPath);

  return (
    <div className="flex">
      {showFeedback && (
        <FeedbackModal
          exerciseCount={answeredCount}
          onClose={() => setShowFeedback(false)}
        />
      )}

      <AnimatePresence>
        {hasPath && showRoadmap && currentPath && progress && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 272, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="shrink-0 border-r border-border overflow-x-hidden overflow-y-auto sticky top-0 h-screen"
          >
            <div className="w-68 py-8 px-4">
              <PathRoadmap
                language={currentPath.language}
                modules={currentPath.modules}
                progress={progress}
                activeTopicKey={
                  activeTopicKey ??
                  `${progress.currentModuleIndex}-${progress.currentTopicIndex}`
                }
                correctToAdvance={CORRECT_TO_ADVANCE}
                hydratingModules={hydratingModules}
                onTopicSelect={handleTopicSelect}
              />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

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

          {currentModulePending && !exercise && !loading && (
            <motion.div variants={itemVariants} className="mt-6">
              <Card className="text-center py-12">
                <CardContent className="flex flex-col items-center gap-3">
                  {hydrationError ? (
                    <X size={40} className="text-red-400/70" />
                  ) : (
                    <Loader2 size={40} className="text-primary animate-spin" />
                  )}
                  <div>
                    <p className="text-foreground font-medium">
                      {hydrationError ? "Couldn't design " : "Designing "}
                      {currentPath?.modules[progress?.currentModuleIndex ?? 0]?.name ??
                        "your next module"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                      {hydrationError
                        ? "The lesson plan for this module didn't generate. Give it another go."
                        : "This module is being written around how you've actually been doing, so it lands at the right difficulty."}
                    </p>
                  </div>
                  {hydrationError && progress && (
                    <Button
                      onClick={() => ensureModuleHydrated(progress.currentModuleIndex)}
                      className="gap-2"
                    >
                      <RefreshCw size={14} />
                      Try again
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {!exercise && !loading && !currentModulePending && (
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
                    Start Exercise
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
              <p className="text-muted-foreground">Loading exercise...</p>
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
                        <span className="flex items-center gap-1.5">
                          {exercise.icon && (
                            <ExerciseIcon name={exercise.icon} size={13} className="text-accent/70 shrink-0" />
                          )}
                          {exercise.type.replace(/_/g, " ")}
                        </span>
                        <span className="flex items-center gap-2 normal-case font-normal">
                          {currentTopicName && (
                            <span className="flex items-center gap-1 text-[11px]">
                              <ChevronRight size={10} />
                              {currentTopicName}
                            </span>
                          )}
                          {exercise.wordMeanings && exercise.wordMeanings.length > 0 && (
                            <div className="relative">
                              <button
                                onClick={() => setShowWordMenu((v) => !v)}
                                title="Save a word to vocabulary"
                                className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                disabled={!!savingWord}
                              >
                                {savingWord ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Bookmark size={12} />
                                )}
                              </button>
                              {showWordMenu && (
                                <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-52">
                                  <p className="px-3 pt-1 pb-1.5 text-[10px] text-muted-foreground border-b border-border mb-1">
                                    Save to vocabulary
                                  </p>
                                  {exercise.wordMeanings.map((wm, i) => (
                                    <button
                                      key={i}
                                      onClick={() => handleSaveWord(wm)}
                                      className="w-full text-left px-3 py-2 text-xs hover:bg-secondary flex items-baseline gap-2"
                                    >
                                      <span className="font-medium text-foreground shrink-0">
                                        {wm.infinitive || wm.word}
                                      </span>
                                      <span className="text-muted-foreground truncate">{wm.meaning}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {exercise.context && (
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <Lightbulb size={12} className="shrink-0 mt-0.5 text-accent/70" />
                          <span>{exercise.context}</span>
                        </div>
                      )}
                      <p className="text-foreground text-lg">{exercise.instruction}</p>

                      {(() => {
                        const lang = currentPath?.language ?? "japanese";
                        const langCode = toLangCode(lang);
                        const displayText =
                          exercise.question ?? exercise.sentence ?? exercise.sourceText;
                        const speakableText = displayText?.replace(/___/g, "");
                        const handleTranslatePhrase = async () => {
                          const cached = getCachedPhraseTranslation(displayText!, nativeLanguage);
                          if (cached) { setPhraseTranslation(cached); return; }
                          setPhraseTranslating(true);
                          try {
                            const res = await translateText({ text: displayText!, targetLanguage: nativeLanguage });
                            setCachedPhraseTranslation(displayText!, nativeLanguage, res.translation);
                            setPhraseTranslation(res.translation);
                          } catch { /* silent */ } finally {
                            setPhraseTranslating(false);
                          }
                        };

                        return (
                          <>
                            {displayText && (
                              <div className="space-y-1.5">
                                <div className="flex items-start gap-2">
                                  <p className="flex-1 text-foreground font-medium text-lg leading-relaxed">
                                    <ClickableText
                                      text={displayText}
                                      language={lang}
                                      nativeLanguage={nativeLanguage}
                                      wordMeanings={exercise.wordMeanings}
                                    />
                                  </p>
                                  <div className="flex shrink-0 gap-0.5 mt-1">
                                    {speakableText && (
                                      <button
                                        onClick={() => speakText(speakableText, langCode)}
                                        className="text-muted-foreground hover:text-foreground transition-colors rounded-lg p-1.5 hover:bg-secondary"
                                        title="Listen to phrase"
                                      >
                                        <Volume2 size={16} />
                                      </button>
                                    )}
                                    <button
                                      onClick={handleTranslatePhrase}
                                      disabled={phraseTranslating}
                                      className="text-muted-foreground hover:text-foreground transition-colors rounded-lg p-1.5 hover:bg-secondary disabled:opacity-50"
                                      title="Translate phrase"
                                    >
                                      <Languages size={16} />
                                    </button>
                                  </div>
                                </div>
                                {phraseTranslation && (
                                  <p className="text-sm text-muted-foreground italic pl-0.5">{phraseTranslation}</p>
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
                          <Button
                            onClick={handleRetryLater}
                            variant="ghost"
                            className="text-muted-foreground gap-1.5 shrink-0"
                            title="Skip and practice later"
                          >
                            <SkipForward size={14} />
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
                            <p className="text-xs text-muted-foreground">{exercise.explanation}</p>
                          )}
                          <div className="flex gap-2">
                            <Button onClick={fetchExercise} variant="outline" className="flex-1 gap-2">
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
                              <Loader2 className="animate-spin mx-auto mb-3 text-accent" size={22} />
                              <p className="text-xs text-muted-foreground">Generating explanation...</p>
                            </div>
                          )}
                          {detailedExpl && !explaining && (
                            <>
                              <div className="p-3 rounded-lg bg-accent/10">
                                <p className="text-xs text-muted-foreground mb-1">Correct answer</p>
                                <p className="text-accent font-medium">{detailedExpl.correctAnswer}</p>
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
                              <p className="text-sm text-muted-foreground">{detailedExpl.explanation}</p>
                              {detailedExpl.example && (
                                <div className="p-3 rounded-lg bg-secondary">
                                  <p className="text-xs text-muted-foreground mb-1">Example</p>
                                  <p className="text-sm text-foreground">{detailedExpl.example}</p>
                                </div>
                              )}
                              <div className="flex gap-2">
                                <Button onClick={fetchExercise} variant="outline" className="flex-1 gap-2">
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

// Zero-hook shell: AuthGuard must gate mounting of LearnInner, not just its
// output, or the fetch effects below fire (and 401) before auth is known.
export function LearnPage() {
  return (
    <AuthGuard>
      <LearnInner />
    </AuthGuard>
  );
}
