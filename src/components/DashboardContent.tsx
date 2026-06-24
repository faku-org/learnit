import { motion } from "motion/react";
import { Flame, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: "easeOut" } },
};

export function DashboardContent() {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-8 max-w-3xl"
    >
      <motion.h1
        variants={itemVariants}
        className="font-display text-3xl text-foreground mb-1"
      >
        LearnIt!
      </motion.h1>
      <motion.p variants={itemVariants} className="text-muted-foreground mb-8">
        Welcome back. Keep the momentum going.
      </motion.p>

      <motion.div
        variants={containerVariants}
        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
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
                0
              </p>
              <p className="text-muted-foreground text-sm mt-2">days</p>
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
              <p className="text-muted-foreground text-sm">
                No session started yet.
              </p>
              <Button asChild className="mt-auto w-fit gap-2">
                <a href="/learn">
                  Start learning
                  <ArrowRight size={14} />
                </a>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
