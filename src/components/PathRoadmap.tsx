import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, ChevronRight, Lock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Progress } from "@/lib/api";

type Topic = { name: string; order: number; description?: string };
type Module = { name: string; order: number; topics?: Topic[] };

export type { Module as RoadmapModule, Topic as RoadmapTopic };

interface PathRoadmapProps {
  language: string;
  modules: Module[];
  progress: Progress;
  activeTopicKey: string | null;
  correctToAdvance: number;
  onTopicSelect: (moduleIdx: number, topicIdx: number, topicName: string) => void;
}

type TopicStatus = "completed" | "current" | "locked";

function getTopicStatus(moduleIdx: number, topicIdx: number, progress: Progress): TopicStatus {
  const key = `${moduleIdx}-${topicIdx}`;
  if (progress.completedTopics.includes(key)) return "completed";
  if (moduleIdx === progress.currentModuleIndex && topicIdx === progress.currentTopicIndex)
    return "current";
  return "locked";
}

function getFlatIndex(moduleIdx: number, topicIdx: number, modules: Module[]): number {
  let flat = 0;
  for (let m = 0; m < modules.length; m++) {
    const topics = modules[m].topics ?? [];
    if (m < moduleIdx) {
      flat += topics.length;
    } else if (m === moduleIdx) {
      flat += topicIdx;
      break;
    }
  }
  return flat;
}

export function PathRoadmap({
  language,
  modules,
  progress,
  activeTopicKey,
  correctToAdvance,
  onTopicSelect,
}: PathRoadmapProps) {
  const currentFlat = getFlatIndex(
    progress.currentModuleIndex,
    progress.currentTopicIndex,
    modules,
  );

  // Only the current module is expanded by default
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set([progress.currentModuleIndex]),
  );

  const toggle = (idx: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });

  const currentModule = modules[progress.currentModuleIndex];
  const currentTopic = currentModule?.topics?.[progress.currentTopicIndex];
  const currentStats =
    progress.topicStats[`${progress.currentModuleIndex}-${progress.currentTopicIndex}`];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
          {language} path
        </p>

        {currentModule && currentTopic && (
          <div className="px-2 py-2.5 rounded-lg bg-primary/10 border border-primary/20 mb-1">
            <p className="text-[10px] text-primary/70 uppercase tracking-wide font-medium mb-0.5">
              Current stage
            </p>
            <p className="text-sm font-medium text-foreground leading-tight">{currentTopic.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{currentModule.name}</p>
            {currentStats && currentStats.correct > 0 && (
              <div className="mt-2 flex items-center gap-1.5">
                <div className="flex-1 h-1 rounded-full bg-primary/20">
                  <div
                    className="h-1 rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(100, (currentStats.correct / correctToAdvance) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {currentStats.correct}/{correctToAdvance}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {modules.map((mod, mIdx) => {
          const topics = mod.topics ?? [];
          const isOpen = expanded.has(mIdx);

          return (
            <div key={mIdx}>
              <button
                onClick={() => toggle(mIdx)}
                className="flex items-center justify-between w-full px-2 py-1.5 rounded-md hover:bg-secondary transition-colors group"
              >
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
                  {mod.name}
                </span>
                <ChevronDown
                  size={12}
                  className={cn(
                    "text-muted-foreground/50 transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-0.5 pt-0.5 pb-1">
                      {topics.map((topic, tIdx) => {
                        const status = getTopicStatus(mIdx, tIdx, progress);
                        const topicKey = `${mIdx}-${tIdx}`;
                        const isActive = activeTopicKey === topicKey;
                        const flatIdx = getFlatIndex(mIdx, tIdx, modules);
                        const isClickable = flatIdx <= currentFlat;
                        const stats = progress.topicStats[topicKey];
                        const correct = stats?.correct ?? 0;

                        return (
                          <motion.button
                            key={tIdx}
                            onClick={() => isClickable && onTopicSelect(mIdx, tIdx, topic.name)}
                            disabled={!isClickable}
                            whileHover={isClickable ? { x: 2 } : {}}
                            className={cn(
                              "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors text-sm w-full",
                              isActive && status !== "completed"
                                ? "bg-primary/15 text-foreground font-medium"
                                : status === "completed"
                                  ? "text-muted-foreground hover:bg-secondary hover:text-foreground"
                                  : status === "current"
                                    ? "text-foreground font-medium"
                                    : "text-accent/50 cursor-default",
                            )}
                          >
                            <span className="shrink-0 w-4 h-4 flex items-center justify-center">
                              {status === "completed" ? (
                                <Check size={13} className="text-accent" />
                              ) : status === "current" ? (
                                <ChevronRight size={13} className="text-primary" />
                              ) : (
                                <Lock size={11} className="text-accent/40" />
                              )}
                            </span>

                            <span className="flex-1 leading-tight">{topic.name}</span>

                            {status === "current" && correct > 0 && (
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {correct}/{correctToAdvance}
                              </span>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
