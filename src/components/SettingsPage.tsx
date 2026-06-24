import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Trash2, Plus, BookOpen, Languages } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPaths, deletePath, updatePreferences, getPreferences } from "@/lib/api";
import { toast } from "sonner";

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
};

const NATIVE_LANGUAGES = [
  { value: "english", label: "English" },
  { value: "spanish", label: "Spanish" },
  { value: "portuguese", label: "Portuguese" },
  { value: "french", label: "French" },
  { value: "german", label: "German" },
  { value: "italian", label: "Italian" },
  { value: "japanese", label: "Japanese" },
  { value: "chinese", label: "Chinese" },
];

type PathModule = { name: string };
type LearningPath = {
  _id: string;
  language: string;
  objective: string;
  timeframe: string | null;
  modules: PathModule[];
  createdAt: string;
  active: boolean;
};

export function SettingsPage() {
  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [activePathId, setActivePathId] = useState<string | null>(null);
  const [nativeLanguage, setNativeLanguage] = useState("english");
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const results = await Promise.allSettled([getPaths(), getPreferences()]);

    const pathsResult = results[0];
    const prefsResult = results[1];

    if (pathsResult.status === "fulfilled") {
      setPaths(pathsResult.value as unknown as LearningPath[]);
    } else {
      toast.error("Failed to load learning paths");
    }

    if (prefsResult.status === "fulfilled") {
      setActivePathId(prefsResult.value.activePathId);
      setNativeLanguage(prefsResult.value.nativeLanguage ?? "english");
    } else {
      toast.error("Failed to load preferences");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleSelectPath = async (id: string) => {
    const next = activePathId === id ? null : id;
    try {
      await updatePreferences({ activePathId: next });
      setActivePathId(next);
      toast.success(next ? "Active path updated" : "Path deselected");
    } catch {
      toast.error("Failed to update active path");
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deletePath(id);
      if (activePathId === id) setActivePathId(null);
      setPaths((prev) => prev.filter((p) => p._id !== id));
      toast.success("Path deleted");
    } catch {
      toast.error("Failed to delete path");
    }
  };

  const handleNativeLanguage = async (lang: string) => {
    setNativeLanguage(lang);
    try {
      await updatePreferences({ nativeLanguage: lang });
      toast.success("Explanation language updated");
    } catch {
      toast.error("Failed to save preference");
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="px-6 py-8 max-w-3xl mx-auto w-full"
    >
      <motion.h1
        variants={itemVariants}
        className="font-display text-3xl text-foreground mb-2"
      >
        Settings
      </motion.h1>
      <motion.p variants={itemVariants} className="text-muted-foreground mb-8">
        Manage your learning paths and preferences.
      </motion.p>

      {/* Explanation language */}
      <motion.div variants={itemVariants} className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Languages size={14} className="text-accent" />
              Explanation language
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Instructions, hints, and explanations in exercises will be written in this language.
            </p>
            <div className="flex flex-wrap gap-2">
              {NATIVE_LANGUAGES.map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => handleNativeLanguage(lang.value)}
                  className={[
                    "px-3 py-1.5 rounded-lg text-xs transition-colors",
                    nativeLanguage === lang.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Learning paths */}
      <motion.div variants={itemVariants} className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg text-foreground">Learning Paths</h2>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <a href="/goals">
            <Plus size={14} />
            New path
          </a>
        </Button>
      </motion.div>

      {loading && (
        <motion.div variants={itemVariants} className="text-center py-12">
          <p className="text-muted-foreground text-sm">Loading...</p>
        </motion.div>
      )}

      {!loading && paths.length === 0 && (
        <motion.div variants={itemVariants} className="text-center py-12">
          <BookOpen size={40} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground text-sm mb-4">No paths yet.</p>
          <Button asChild>
            <a href="/goals">Generate your first path</a>
          </Button>
        </motion.div>
      )}

      <motion.div variants={containerVariants} className="space-y-3">
        <AnimatePresence>
          {paths.map((path) => {
            const isActive = path._id === activePathId;
            return (
              <motion.div
                key={path._id}
                variants={itemVariants}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, x: -20 }}
                layout
              >
                <Card
                  onClick={() => handleSelectPath(path._id)}
                  className={[
                    "cursor-pointer transition-all group",
                    isActive
                      ? "border-primary ring-1 ring-primary"
                      : "hover:border-primary/40",
                  ].join(" ")}
                >
                  <CardContent className="flex items-start justify-between py-4 gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={[
                          "mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                          isActive ? "border-primary bg-primary" : "border-border",
                        ].join(" ")}
                      >
                        {isActive && (
                          <Check size={11} className="text-primary-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-foreground font-medium capitalize">
                          {path.language}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {path.objective}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span>{path.modules?.length ?? 0} modules</span>
                          {path.timeframe && <span>{path.timeframe}</span>}
                          <span>{formatDate(path.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(path._id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-muted-foreground hover:text-red-400 rounded-lg hover:bg-red-500/5 shrink-0"
                      title="Delete path"
                    >
                      <Trash2 size={14} />
                    </button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {paths.length > 0 && (
        <motion.p variants={itemVariants} className="text-xs text-muted-foreground mt-4">
          Click a path to set it as active. The active path is used in Learn and on your dashboard.
        </motion.p>
      )}
    </motion.div>
  );
}
