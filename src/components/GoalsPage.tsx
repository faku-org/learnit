import { useState } from "react";
import { motion } from "motion/react";
import { Target, ArrowRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generatePath, updatePreferences } from "@/lib/api";
import { toast } from "sonner";

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
type GeneratedPath = { _id: string; language: string; objective: string; modules: PathModule[] };

export function GoalsPage() {
  const [language, setLanguage] = useState("");
  const [objective, setObjective] = useState("");
  const [timeframe, setTimeframe] = useState("6 months");
  const [loading, setLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState<GeneratedPath | null>(null);

  const handleGenerate = async () => {
    if (!language || !objective) {
      toast.error("Language and objective are required");
      return;
    }
    setLoading(true);
    try {
      const path = await generatePath({ language, objective, timeframe, modules: 6 });
      const generated = path as unknown as GeneratedPath;
      setCurrentPath(generated);
      await updatePreferences({ activePathId: generated._id });
      toast.success("Learning path generated!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to generate path");
    } finally {
      setLoading(false);
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
        Your Goal
      </motion.h1>
      <motion.p variants={itemVariants} className="text-muted-foreground mb-8">
        Define what you want to achieve and the AI will create a personalized learning path.
      </motion.p>

      <motion.div variants={itemVariants} className="space-y-4">
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
            <Button onClick={handleGenerate} disabled={loading} className="w-full gap-2">
              {loading ? <Loader2 className="animate-spin" size={16} /> : <Target size={16} />}
              {loading ? "Generating..." : "Generate Learning Path"}
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {currentPath && currentPath.modules && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mt-8 space-y-3"
        >
          <h2 className="font-display text-xl text-foreground mb-4">Your Learning Path</h2>
          {currentPath.modules.map((mod, i) => (
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
          <Button asChild className="w-full gap-2 mt-4">
            <a href="/learn">
              Start Learning
              <ArrowRight size={14} />
            </a>
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}
