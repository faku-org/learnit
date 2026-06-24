import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Search, X, ChevronLeft, ChevronRight, Loader2, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getExercises } from "@/lib/api";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const TYPES = [
  { value: "", label: "All types" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "fill_blank", label: "Fill in blank" },
  { value: "translation", label: "Translation" },
  { value: "conjugation", label: "Conjugation" },
  { value: "matching", label: "Matching" },
] as const;

const TYPE_COLORS: Record<string, string> = {
  multiple_choice: "bg-blue-500/10 text-blue-400",
  fill_blank: "bg-purple-500/10 text-purple-400",
  translation: "bg-amber-500/10 text-amber-400",
  conjugation: "bg-green-500/10 text-green-400",
  matching: "bg-pink-500/10 text-pink-400",
};

type ExerciseDoc = {
  _id: string;
  type: string;
  topic: string;
  language: string;
  level: string;
  instruction: string;
  question?: string;
  sentence?: string;
  sourceText?: string;
  correctAnswer?: string;
  createdAt: string;
};

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

export function ExercisesPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [exercises, setExercises] = useState<ExerciseDoc[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getExercises({
        q: debouncedQuery || undefined,
        type: typeFilter || undefined,
        limit: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      });
      setExercises(res.exercises as ExerciseDoc[]);
      setTotal(res.total);
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, typeFilter, page]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="px-6 py-8 max-w-3xl mx-auto w-full"
    >
      <motion.h1 variants={itemVariants} className="font-display text-3xl text-foreground mb-1">
        Exercise History
      </motion.h1>
      <motion.p variants={itemVariants} className="text-muted-foreground mb-6">
        All exercises you've practiced. Search and filter to review.
      </motion.p>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-col gap-3 mb-6">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by topic or keyword..."
            className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => {
                setTypeFilter(t.value);
                setPage(1);
              }}
              className={cn(
                "px-3 py-1 rounded-full text-xs transition-colors border",
                typeFilter === t.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Count */}
      <motion.p variants={itemVariants} className="text-xs text-muted-foreground mb-4">
        {loading ? "Loading..." : `${total} exercise${total !== 1 ? "s" : ""}`}
      </motion.p>

      {/* List */}
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-accent" size={28} />
        </div>
      )}

      {!loading && exercises.length === 0 && (
        <div className="text-center py-16">
          <BookOpen size={40} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">
            {debouncedQuery || typeFilter
              ? "No exercises match your filters."
              : "No exercises yet. Start practicing to build your history."}
          </p>
        </div>
      )}

      {!loading && exercises.length > 0 && (
        <motion.div variants={containerVariants} className="space-y-2">
          {exercises.map((ex) => {
            const isExpanded = expandedId === ex._id;
            const preview = ex.question ?? ex.sentence ?? ex.sourceText ?? ex.instruction;
            const truncated =
              preview.length > 100 ? preview.slice(0, 100) + "..." : preview;

            return (
              <motion.div key={ex._id} variants={itemVariants}>
                <Card
                  className={cn(
                    "cursor-pointer transition-colors hover:border-primary/30",
                    isExpanded && "border-primary/30",
                  )}
                  onClick={() => setExpandedId(isExpanded ? null : ex._id)}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide",
                              TYPE_COLORS[ex.type] ?? "bg-secondary text-muted-foreground",
                            )}
                          >
                            {ex.type.replace(/_/g, " ")}
                          </span>
                          <span className="text-xs text-muted-foreground font-medium">
                            {ex.topic}
                          </span>
                          <span className="text-xs text-muted-foreground">&middot; {ex.language}</span>
                        </div>
                        <p className="text-sm text-foreground leading-snug">
                          {isExpanded ? preview : truncated}
                        </p>

                        {isExpanded && (
                          <div className="mt-3 space-y-2 border-t border-border pt-3">
                            <p className="text-xs text-muted-foreground">{ex.instruction}</p>
                            {ex.correctAnswer && (
                              <p className="text-xs">
                                <span className="text-muted-foreground">Answer: </span>
                                <span className="text-accent">{ex.correctAnswer}</span>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0 pt-0.5">
                        {formatDate(ex.createdAt)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="gap-1.5"
          >
            <ChevronLeft size={14} />
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="gap-1.5"
          >
            Next
            <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </motion.div>
  );
}
