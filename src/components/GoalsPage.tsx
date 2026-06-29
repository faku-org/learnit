import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Target, ArrowRight, Loader2, Check, Trash2, Plus, ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generatePath, getPaths, deletePath, updatePreferences, getPreferences, type CalibrationLevel } from "@/lib/api";
import { CalibrationFlow } from "@/components/CalibrationFlow";
import { AuthGuard } from "@/components/AuthGuard";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: "easeOut" as const } },
};

type Topic = { name: string; order: number; description: string };
type PathModule = { name: string; description: string; order: number; topics?: Topic[] };
type LearningPath = {
  _id: string;
  language: string;
  objective: string;
  timeframe?: string;
  modules: PathModule[];
  active?: boolean;
};

export function GoalsPage() {
  const [language, setLanguage] = useState("");
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
  const [showCalibration, setShowCalibration] = useState(false);
  const [nativeLanguage, setNativeLanguage] = useState("english");

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
      toast.success("Active path updated");
    } catch {
      toast.error("Failed to update active path");
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
      toast.success("Path deleted");
    } catch {
      toast.error("Failed to delete path");
    } finally {
      setDeletingId(null);
    }
  };

  const handleStartGenerate = () => {
    if (!language || !objective) {
      toast.error("Language and objective are required");
      return;
    }
    setShowCalibration(true);
  };

  const handleGenerateWithLevel = async (startingLevel: CalibrationLevel) => {
    setShowCalibration(false);
    setGenerating(true);
    try {
      const path = await generatePath({ language, objective, timeframe, modules: 6, startingLevel });
      const generated = path as unknown as LearningPath;
      await updatePreferences({ activePathId: generated._id });
      setActivePathId(generated._id);
      setPaths((prev) => [{ ...generated, active: true }, ...prev.map((p) => ({ ...p, active: false }))]);
      setNewPath(generated);
      setShowForm(false);
      setLanguage("");
      setObjective("");
      setTimeframe("6 months");
      toast.success("Learning path generated!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to generate path");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AuthGuard>
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="px-6 py-8 max-w-3xl mx-auto w-full"
    >
      <motion.h1 variants={itemVariants} className="font-display text-3xl text-foreground mb-2">
        Your Goals
      </motion.h1>
      <motion.p variants={itemVariants} className="text-muted-foreground mb-8">
        Manage your learning paths or create a new one.
      </motion.p>

      {/* Existing paths */}
      {loadingPaths ? (
        <motion.div variants={itemVariants} className="flex items-center gap-2 text-muted-foreground text-sm mb-6">
          <Loader2 size={14} className="animate-spin" />
          Loading paths...
        </motion.div>
      ) : paths.length > 0 ? (
        <motion.div variants={itemVariants} className="space-y-3 mb-8">
          <h2 className="font-display text-lg text-foreground mb-3">Learning Paths</h2>
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
                            Active
                          </span>
                        )}
                        <span className="font-medium">{path.language}</span>
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
                            "Set active"
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
                    {path.modules.length} modules &middot;{" "}
                    {path.modules.reduce((n, m) => n + (m.topics?.length ?? 0), 0)} topics
                  </p>
                </CardContent>
              </Card>
            );
          })}
          <Button asChild className="w-full gap-2 mt-2">
            <a href="/learn">
              Continue Learning
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
            Create new path
          </Button>
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="space-y-4">
          {paths.length > 0 && (
            <h2 className="font-display text-lg text-foreground">New Path</h2>
          )}

          <AnimatePresence mode="wait">
            {!showCalibration ? (
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
                      Learning Goal
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Language</label>
                      <Input
                        placeholder="e.g., Japanese, French, German"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Objective</label>
                      <Input
                        placeholder="e.g., Hold basic conversations for travel"
                        value={objective}
                        onChange={(e) => setObjective(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Timeframe</label>
                      <Input
                        placeholder="e.g., 3 months, 6 months"
                        value={timeframe}
                        onChange={(e) => setTimeframe(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleStartGenerate} disabled={generating} className="flex-1 gap-2">
                        {generating ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <Target size={16} />
                        )}
                        {generating ? "Generating..." : "Continue"}
                      </Button>
                      {paths.length > 0 && (
                        <Button variant="ghost" onClick={() => setShowForm(false)} className="text-muted-foreground">
                          Cancel
                        </Button>
                      )}
                    </div>
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
                        onClick={() => setShowCalibration(false)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      Calibration — {language}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CalibrationFlow
                      language={language}
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
            {newPath.language} Path
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
                {mod.topics && (
                  <div className="space-y-1">
                    {mod.topics.map((topic, j) => (
                      <div key={j} className="text-xs flex items-center gap-2">
                        <span className="text-primary">&bull;</span>
                        {topic.name}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}
    </motion.div>
    </AuthGuard>
  );
}
