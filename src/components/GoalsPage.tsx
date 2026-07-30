import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Target, ArrowRight, Loader2, Check, Trash2, Plus, ChevronLeft, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  generatePath, getPaths, deletePath, updatePreferences, getPreferences,
  classifySubject, checkScope,
  type CalibrationLevel, type Classification, type ScopeReport,
} from "@/lib/api";
import { CalibrationFlow } from "@/components/CalibrationFlow";
import { TaxonomyBreadcrumb } from "@/components/TaxonomyBreadcrumb";
import { ScopingQuiz } from "@/components/ScopingQuiz";
import { subjectNameOf } from "@/lib/domains";
import { AuthGuard } from "@/components/AuthGuard";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: "easeOut" as const } },
};

type Topic = { name: string; order: number; description: string };
type PathModule = {
  name: string;
  description: string;
  focus?: string;
  order: number;
  topics?: Topic[];
};
type LearningPath = {
  _id: string;
  subject?: string;
  /** Present on paths created before the taxonomy work. */
  language?: string;
  taxonomy?: string[];
  taxonomyLeaf?: string;
  objective: string;
  timeframe?: string;
  modules: PathModule[];
  active?: boolean;
};

/** Which step of path creation the form is on. */
type Stage = "form" | "scoping" | "calibration";

function GoalsInner() {
  const { t } = useTranslation();
  const [subject, setSubject] = useState("");
  const [objective, setObjective] = useState("");
  const [timeframe, setTimeframe] = useState("6 months");
  const [generating, setGenerating] = useState(false);
  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [activePathId, setActivePathId] = useState<string | null>(null);
  const [loadingPaths, setLoadingPaths] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settingActiveId, setSettingActiveId] = useState<string | null>(null);
  const [newPath, setNewPath] = useState<LearningPath | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [nativeLanguage, setNativeLanguage] = useState("english");
  const [classification, setClassification] = useState<Classification | null>(null);
  const [scopeReport, setScopeReport] = useState<ScopeReport | null>(null);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    Promise.allSettled([getPaths(), getPreferences()]).then(([pathsRes, prefsRes]) => {
      if (pathsRes.status === "fulfilled") {
        setPaths(pathsRes.value as LearningPath[]);
      }
      if (prefsRes.status === "fulfilled") {
        setActivePathId(prefsRes.value.activePathId);
        if (prefsRes.value.nativeLanguage) setNativeLanguage(prefsRes.value.nativeLanguage);
      }
      setLoadingPaths(false);
    });
  }, []);

  const handleSetActive = async (id: string) => {
    setSettingActiveId(id);
    try {
      await updatePreferences({ activePathId: id });
      setActivePathId(id);
      toast.success(t("goals.toastActiveUpdated"));
    } catch {
      toast.error(t("goals.toastUpdateActiveError"));
    } finally {
      setSettingActiveId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deletePath(id);
      setPaths((prev) => prev.filter((p) => p._id !== id));
      if (activePathId === id) setActivePathId(null);
      if (newPath?._id === id) setNewPath(null);
      toast.success(t("goals.toastPathDeleted"));
    } catch {
      toast.error(t("goals.toastDeleteError"));
    } finally {
      setDeletingId(null);
    }
  };

  /**
   * Classify the subject and check the goal's scope in one pass, then route to
   * the scoping quiz if the goal is unplannable as written, otherwise straight
   * to calibration. Classification failure is not fatal: the server falls back
   * to classifying at generation time.
   */
  const handleStartGenerate = async () => {
    if (!subject || !objective) {
      toast.error(t("goals.toastSubjectObjectiveRequired"));
      return;
    }
    setPreparing(true);
    try {
      const [classified, scope] = await Promise.allSettled([
        classifySubject({ subject, objective }),
        checkScope({ subject, objective }),
      ]);
      if (classified.status === "fulfilled") setClassification(classified.value);

      const report = scope.status === "fulfilled" ? scope.value : null;
      if (report && report.breadth !== "workable" && report.questions.length > 0) {
        setScopeReport(report);
        setStage("scoping");
      } else {
        setStage("calibration");
      }
    } catch {
      setStage("calibration");
    } finally {
      setPreparing(false);
    }
  };

  const handleScopeResolved = (refined: string) => {
    if (refined.trim()) setObjective(refined.trim());
    setScopeReport(null);
    setStage("calibration");
  };

  const handleGenerateWithLevel = async (startingLevel: CalibrationLevel) => {
    setStage("form");
    setGenerating(true);
    try {
      // Only the outline and module 1 are written now; later modules are generated
      // from real performance, so the path can be longer without hitting output limits.
      const path = await generatePath({
        subject,
        taxonomyLeaf: classification?.taxonomyLeaf,
        objective,
        timeframe,
        modules: 10,
        startingLevel,
      });
      const generated = path as unknown as LearningPath;
      await updatePreferences({ activePathId: generated._id });
      setActivePathId(generated._id);
      setPaths((prev) => [{ ...generated, active: true }, ...prev.map((p) => ({ ...p, active: false }))]);
      setNewPath(generated);
      setShowForm(false);
      setSubject("");
      setObjective("");
      setTimeframe("6 months");
      setClassification(null);
      setScopeReport(null);
      toast.success(t("goals.toastPathGenerated"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("goals.toastGenerateError"));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="px-6 py-8 max-w-3xl mx-auto w-full"
    >
      <motion.h1 variants={itemVariants} className="font-display text-3xl text-foreground mb-2">
        {t("goals.title")}
      </motion.h1>
      <motion.p variants={itemVariants} className="text-muted-foreground mb-8">
        {t("goals.subtitle")}
      </motion.p>

      {/* Existing paths */}
      {loadingPaths ? (
        <motion.div variants={itemVariants} className="flex items-center gap-2 text-muted-foreground text-sm mb-6">
          <Loader2 size={14} className="animate-spin" />
          {t("goals.loadingPaths")}
        </motion.div>
      ) : paths.length > 0 ? (
        <motion.div variants={itemVariants} className="space-y-3 mb-8">
          <h2 className="font-display text-lg text-foreground mb-3">{t("goals.learningPaths")}</h2>
          {paths.map((path) => {
            const isActive = path._id === activePathId;
            return (
              <Card
                key={path._id}
                className={cn(
                  "transition-colors",
                  isActive && "border-primary/40 bg-primary/5",
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm flex items-center gap-2">
                        {isActive && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/15 px-1.5 py-0.5 rounded">
                            <Check size={9} />
                            {t("goals.active")}
                          </span>
                        )}
                        <span className="font-medium">{subjectNameOf(path)}</span>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1 leading-snug">
                        {path.objective}
                        {path.timeframe && (
                          <span className="text-muted-foreground/60"> &middot; {path.timeframe}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetActive(path._id)}
                          disabled={settingActiveId === path._id}
                          className="text-xs h-7 px-2"
                        >
                          {settingActiveId === path._id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            t("goals.setActive")
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(path._id)}
                        disabled={deletingId === path._id}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                      >
                        {deletingId === path._id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">
                    {t("goals.modulesAndTopics", {
                      modules: path.modules.length,
                      topics: path.modules.reduce((n, m) => n + (m.topics?.length ?? 0), 0),
                    })}
                  </p>
                </CardContent>
              </Card>
            );
          })}
          <Button asChild className="w-full gap-2 mt-2">
            <a href="/learn">
              {t("goals.continueLearning")}
              <ArrowRight size={14} />
            </a>
          </Button>
        </motion.div>
      ) : null}

      {/* New path form */}
      {paths.length > 0 && !showForm ? (
        <motion.div variants={itemVariants}>
          <Button
            variant="outline"
            onClick={() => setShowForm(true)}
            className="w-full gap-2 text-muted-foreground"
          >
            <Plus size={14} />
            {t("goals.createNewPath")}
          </Button>
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="space-y-4">
          {paths.length > 0 && (
            <h2 className="font-display text-lg text-foreground">{t("goals.newPath")}</h2>
          )}

          <AnimatePresence mode="wait">
            {stage === "form" ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Target size={14} className="text-accent" />
                      {t("goals.learningGoal")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t("goals.subjectLabel")}</label>
                      <Input
                        placeholder={t("goals.subjectPlaceholder")}
                        value={subject}
                        onChange={(e) => {
                          setSubject(e.target.value);
                          // The old placement no longer describes the new subject.
                          if (classification) setClassification(null);
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t("goals.objectiveLabel")}</label>
                      <Input
                        placeholder={t("goals.objectivePlaceholder")}
                        value={objective}
                        onChange={(e) => setObjective(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t("goals.timeframeLabel")}</label>
                      <Input
                        placeholder={t("goals.timeframePlaceholder")}
                        value={timeframe}
                        onChange={(e) => setTimeframe(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleStartGenerate}
                        disabled={generating || preparing}
                        className="flex-1 gap-2"
                      >
                        {generating || preparing ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <Target size={16} />
                        )}
                        {generating
                          ? t("goals.generating")
                          : preparing
                            ? t("goals.preparing")
                            : t("goals.continueBtn")}
                      </Button>
                      {paths.length > 0 && (
                        <Button variant="ghost" onClick={() => setShowForm(false)} className="text-muted-foreground">
                          {t("common.cancel")}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : stage === "scoping" && scopeReport ? (
              <motion.div
                key="scoping"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <button
                        onClick={() => setStage("form")}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      {t("scoping.cardTitle", { subject })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScopingQuiz
                      report={scopeReport}
                      onResolve={handleScopeResolved}
                      onSkip={() => {
                        setScopeReport(null);
                        setStage("calibration");
                      }}
                    />
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                key="calibration"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <button
                        onClick={() => setStage("form")}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      {t("goals.calibrationTitle", { subject })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {classification && (
                      <TaxonomyBreadcrumb
                        taxonomy={classification.taxonomy}
                        breadcrumb={classification.breadcrumb}
                        uncertain={!classification.matchedOffline && classification.confidence < 0.7}
                        createdNode={classification.createdNode}
                        onChange={(next) =>
                          setClassification({
                            ...classification,
                            ...next,
                            // A correction by hand is certain, and no longer a guess.
                            confidence: 1,
                            matchedOffline: true,
                            createdNode: null,
                          })
                        }
                      />
                    )}
                    <CalibrationFlow
                      subject={subject}
                      taxonomyLeaf={classification?.taxonomyLeaf}
                      nativeLanguage={nativeLanguage}
                      onComplete={(level) => handleGenerateWithLevel(level)}
                      onSkip={() => handleGenerateWithLevel("complete_beginner")}
                    />
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Newly generated path preview */}
      {newPath && newPath.modules && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mt-8 space-y-3"
        >
          <h2 className="font-display text-xl text-foreground mb-4">
            {t("goals.pathTitle", { subject: subjectNameOf(newPath) })}
          </h2>
          {newPath.modules.map((mod, i) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className="text-accent font-display">{i + 1}</span>
                  {mod.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">{mod.description}</p>
                {mod.topics && mod.topics.length > 0 ? (
                  <div className="space-y-1">
                    {mod.topics.map((topic, j) => (
                      <div key={j} className="text-xs flex items-center gap-2">
                        <span className="text-primary">&bull;</span>
                        {topic.name}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs flex items-center gap-2 text-muted-foreground/70">
                    <Sparkles size={11} className="text-accent/60 shrink-0" />
                    <span>
                      {mod.focus ? `${mod.focus} — ` : ""}lessons written when you get here,
                      based on how you're doing
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

// Zero-hook shell: AuthGuard must gate mounting of GoalsInner, not just its
// output, or the fetch effects below fire (and 401) before auth is known.
export function GoalsPage() {
  return (
    <AuthGuard>
      <GoalsInner />
    </AuthGuard>
  );
}
