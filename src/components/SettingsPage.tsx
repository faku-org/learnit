import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Trash2, Plus, BookOpen, Languages } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getPaths, deletePath, updatePreferences, getPreferences } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
};

const NATIVE_LANGUAGE_VALUES = [
  "english",
  "spanish",
  "portuguese",
  "french",
  "german",
  "italian",
  "japanese",
  "chinese",
] as const;

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
  const { t } = useTranslation();
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
      toast.error(t("settings.toastLoadPathsError"));
    }

    if (prefsResult.status === "fulfilled") {
      setActivePathId(prefsResult.value.activePathId);
      setNativeLanguage(prefsResult.value.nativeLanguage ?? "english");
    } else {
      toast.error(t("settings.toastLoadPrefsError"));
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
      toast.success(next ? t("settings.toastActiveUpdated") : t("settings.toastPathDeselected"));
    } catch {
      toast.error(t("settings.toastUpdateActiveError"));
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deletePath(id);
      if (activePathId === id) setActivePathId(null);
      setPaths((prev) => prev.filter((p) => p._id !== id));
      toast.success(t("settings.toastPathDeleted"));
    } catch {
      toast.error(t("settings.toastDeleteError"));
    }
  };

  const handleNativeLanguage = async (lang: string) => {
    setNativeLanguage(lang);
    try {
      await updatePreferences({ nativeLanguage: lang });
      toast.success(t("settings.toastExplanationLangUpdated"));
    } catch {
      toast.error(t("settings.toastSavePrefError"));
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
        {t("settings.title")}
      </motion.h1>
      <motion.p variants={itemVariants} className="text-muted-foreground mb-8">
        {t("settings.subtitle")}
      </motion.p>

      {/* Interface language */}
      <motion.div variants={itemVariants} className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Languages size={14} className="text-accent" />
              {t("settings.interfaceLanguage")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              {t("settings.interfaceLanguageDesc")}
            </p>
            <LanguageSwitcher />
          </CardContent>
        </Card>
      </motion.div>

      {/* Explanation language */}
      <motion.div variants={itemVariants} className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Languages size={14} className="text-accent" />
              {t("settings.explanationLanguage")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              {t("settings.explanationLanguageDesc")}
            </p>
            <div className="flex flex-wrap gap-2">
              {NATIVE_LANGUAGE_VALUES.map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleNativeLanguage(lang)}
                  className={[
                    "px-3 py-1.5 rounded-lg text-xs transition-colors",
                    nativeLanguage === lang
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {t(`common.languages.${lang}`)}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Learning paths */}
      <motion.div variants={itemVariants} className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg text-foreground">{t("settings.learningPaths")}</h2>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <a href="/goals">
            <Plus size={14} />
            {t("settings.newPath")}
          </a>
        </Button>
      </motion.div>

      {loading && (
        <motion.div variants={itemVariants} className="text-center py-12">
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        </motion.div>
      )}

      {!loading && paths.length === 0 && (
        <motion.div variants={itemVariants} className="text-center py-12">
          <BookOpen size={40} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground text-sm mb-4">{t("settings.noPaths")}</p>
          <Button asChild>
            <a href="/goals">{t("settings.generateFirstPath")}</a>
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
                          <span>{t("settings.modules", { count: path.modules?.length ?? 0 })}</span>
                          {path.timeframe && <span>{path.timeframe}</span>}
                          <span>{formatDate(path.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(path._id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-muted-foreground hover:text-red-400 rounded-lg hover:bg-red-500/5 shrink-0"
                      title={t("settings.deletePath")}
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
          {t("settings.clickToActivate")}
        </motion.p>
      )}
    </motion.div>
  );
}
