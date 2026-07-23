import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Flame, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getStreak, getCurrentPath } from "@/lib/api";
import { AuthGuard } from "@/components/AuthGuard";

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: "easeOut" as const } },
};

type PathModule = { name: string; description: string; order: number };
type Path = { language: string; objective: string; modules: PathModule[] };
type Streak = { currentStreak: number; longestStreak: number };

function DashboardInner() {
  const [streak, setStreak] = useState<Streak | null>(null);
  const [path, setPath] = useState<Path | null>(null);

  useEffect(() => {
    getStreak().then(setStreak).catch(console.error);
    getCurrentPath()
      .then((data) => setPath(data as unknown as Path))
      .catch(() => {});
  }, []);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="px-6 py-8 max-w-3xl mx-auto w-full"
    >
      <motion.h1 variants={itemVariants} className="font-display text-3xl text-foreground mb-1">
        LearnIt!
      </motion.h1>
      <motion.p variants={itemVariants} className="text-muted-foreground mb-8">
        {streak && streak.currentStreak > 0
          ? `${streak.currentStreak} day streak. Keep going.`
          : "Welcome back. Keep the momentum going."}
      </motion.p>

      <motion.div
        variants={containerVariants}
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6"
      >
        <motion.div variants={itemVariants}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest">
                <Flame size={14} className="text-accent" />
                Racha
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-display text-6xl text-foreground leading-none">
                {streak?.currentStreak ?? 0}
              </p>
              <p className="text-muted-foreground text-sm mt-2">
                days &middot; longest: {streak?.longestStreak ?? 0}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest">
                Today
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 flex-1">
              {path ? (
                <p className="text-muted-foreground text-sm">
                  {path.language} &middot; {path.objective}
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">No path set yet.</p>
              )}
              <Button asChild className="mt-auto w-fit gap-2">
                <a href={path ? "/learn" : "/goals"}>
                  {path ? "Continue" : "Set a goal"}
                  <ArrowRight size={14} />
                </a>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {path && path.modules && (
        <motion.div variants={itemVariants}>
          <h2 className="font-display text-xl text-foreground mb-4">Your Path</h2>
          <div className="space-y-3">
            {path.modules.map((mod, i) => (
              <Card key={i}>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="text-accent font-display">{i + 1}</span>
                    {mod.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{mod.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// Zero-hook shell: AuthGuard must gate mounting of DashboardInner, not just its
// output, or the fetch effects below fire (and 401) before auth is known.
export function DashboardContent() {
  return (
    <AuthGuard>
      <DashboardInner />
    </AuthGuard>
  );
}
