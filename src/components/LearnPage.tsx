import { motion } from "motion/react";
import { BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function LearnPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: "easeOut" }}
      className="p-8 max-w-3xl"
    >
      <div className="flex items-center gap-3 mb-6">
        <BookOpen size={26} className="text-accent" strokeWidth={1.8} />
        <h1 className="font-display text-3xl text-foreground">Learn</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Ready to start
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm mb-4">
            Your lessons and exercises will appear here.
          </p>
          <Button>Begin session</Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
