import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { BookOpen, Plus, Trash2, Search, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getVocabulary,
  addVocabulary,
  enrichVocabulary,
  deleteVocabulary,
  getCurrentPath,
  getPreferences,
} from "@/lib/api";
import { toast } from "sonner";

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
};

type Conjugation = { form: string; value: string };

type VocabEntry = {
  _id: string;
  word: string;
  meaning: string;
  language: string;
  type?: string;
  conjugations?: Conjugation[];
  example?: string;
  exampleTranslation?: string;
  createdAt: string;
};

export function VocabularyPage() {
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  const [word, setWord] = useState("");
  const [meaning, setMeaning] = useState("");
  const [language, setLanguage] = useState("");
  const [filterLang, setFilterLang] = useState("all");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [nativeLanguage, setNativeLanguage] = useState("english");

  const fetchEntries = useCallback(async () => {
    try {
      const data = await getVocabulary();
      setEntries(data as unknown as VocabEntry[]);
    } catch {
      toast.error("Failed to load vocabulary");
    }
  }, []);

  useEffect(() => {
    fetchEntries();
    getCurrentPath()
      .then((p) => {
        const lang = (p as Record<string, unknown>).language as string | undefined;
        if (lang) setLanguage(lang);
      })
      .catch(() => {});
    getPreferences()
      .then((p) => setNativeLanguage(p.nativeLanguage))
      .catch(() => {});
  }, [fetchEntries]);

  const handleAdd = async () => {
    if (!word.trim() || !meaning.trim()) {
      toast.error("Word and meaning are required");
      return;
    }
    setAdding(true);
    try {
      const raw = await addVocabulary({
        word: word.trim(),
        meaning: meaning.trim(),
        language,
      });
      const saved = raw as unknown as VocabEntry;
      setEntries((prev) => [saved, ...prev]);
      setWord("");
      setMeaning("");
      toast.success("Word saved");

      // Enrich in background — best-effort, word is already persisted
      setEnrichingId(saved._id);
      try {
        const enrichment = await enrichVocabulary(saved._id, {
          word: saved.word,
          meaning: saved.meaning,
          language: saved.language,
          nativeLanguage,
        });
        setEntries((prev) =>
          prev.map((e) => (e._id === saved._id ? { ...e, ...enrichment } : e)),
        );
      } catch {
        // silently skip enrichment failure
      } finally {
        setEnrichingId(null);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteVocabulary(id);
      setEntries((prev) => prev.filter((e) => e._id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleReenrich = async (entry: VocabEntry) => {
    setEnrichingId(entry._id);
    try {
      const enrichment = await enrichVocabulary(entry._id, {
        word: entry.word,
        meaning: entry.meaning,
        language: entry.language,
        nativeLanguage,
      });
      setEntries((prev) =>
        prev.map((e) => (e._id === entry._id ? { ...e, ...enrichment } : e)),
      );
    } catch {
      toast.error("Failed to enrich");
    } finally {
      setEnrichingId(null);
    }
  };

  const knownLanguages = Array.from(new Set(entries.map((e) => e.language))).sort();

  const filtered = entries.filter((e) => {
    const matchesLang = filterLang === "all" || e.language === filterLang;
    const matchesSearch =
      !search.trim() ||
      e.word.toLowerCase().includes(search.toLowerCase()) ||
      e.meaning.toLowerCase().includes(search.toLowerCase());
    return matchesLang && matchesSearch;
  });

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="px-6 py-8 max-w-3xl mx-auto w-full"
    >
      <motion.h1 variants={itemVariants} className="font-display text-3xl text-foreground mb-2">
        Vocabulary
      </motion.h1>
      <motion.p variants={itemVariants} className="text-muted-foreground mb-8">
        Save words you encounter during your learning.
      </motion.p>

      <motion.div variants={itemVariants}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm">Add a word</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Language</label>
              <Input
                placeholder="e.g., German, Japanese, French"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              />
            </div>
            <Input
              placeholder="Word or phrase"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Input
              placeholder="Meaning"
              value={meaning}
              onChange={(e) => setMeaning(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button onClick={handleAdd} disabled={adding} className="w-full gap-2">
              <Plus size={16} />
              {adding ? "Saving..." : "Save Word"}
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {knownLanguages.length > 1 && (
        <motion.div variants={itemVariants} className="flex gap-2 mb-4 flex-wrap">
          {["all", ...knownLanguages].map((lang) => (
            <button
              key={lang}
              onClick={() => setFilterLang(lang)}
              className={[
                "px-3 py-1 rounded-lg text-xs capitalize transition-colors",
                filterLang === lang
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {lang}
            </button>
          ))}
        </motion.div>
      )}

      {entries.length > 0 && (
        <motion.div variants={itemVariants} className="mb-4 relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search vocabulary..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </motion.div>
      )}

      <AnimatePresence>
        {filtered.length === 0 && (
          <motion.div
            key="empty"
            variants={itemVariants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0 }}
            className="text-center py-12"
          >
            <BookOpen size={40} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              {entries.length === 0
                ? "No words saved yet. Add your first one above."
                : "No matches found."}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div variants={containerVariants} className="space-y-3">
        <AnimatePresence>
          {filtered.map((entry) => (
            <motion.div
              key={entry._id}
              variants={itemVariants}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, x: -20 }}
              layout
            >
              <Card className="group">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-3">
                      {/* Word + type badge + enriching spinner */}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-foreground font-medium">{entry.word}</p>
                          {entry.type && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground capitalize shrink-0">
                              {entry.type}
                            </span>
                          )}
                          {enrichingId === entry._id && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                              <Loader2 size={11} className="animate-spin" />
                              Generating...
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{entry.meaning}</p>
                      </div>

                      {/* Conjugations */}
                      {entry.conjugations && entry.conjugations.length > 0 && (
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs border-t border-border pt-3">
                          {entry.conjugations.map((c, i) => (
                            <div key={i} className="flex items-baseline gap-1.5 min-w-0">
                              <span className="text-foreground font-medium shrink-0">{c.value}</span>
                              <span className="text-muted-foreground truncate">— {c.form}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Example */}
                      {entry.example && (
                        <div className="text-xs border-t border-border pt-3 space-y-0.5">
                          <p className="text-foreground italic">"{entry.example}"</p>
                          {entry.exampleTranslation && (
                            <p className="text-muted-foreground">{entry.exampleTranslation}</p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                      <button
                        onClick={() => handleReenrich(entry)}
                        disabled={enrichingId === entry._id}
                        className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary disabled:opacity-40"
                        title="Re-enrich"
                      >
                        <RefreshCw size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(entry._id)}
                        className="p-2 text-muted-foreground hover:text-red-400 rounded-lg hover:bg-red-500/5"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
