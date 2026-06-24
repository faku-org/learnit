import { motion } from "motion/react";
import { Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function GoalsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: "easeOut" }}
      className="p-8 max-w-3xl"
    >
      <div className="flex items-center gap-3 mb-6">
        <Target size={26} className="text-accent" strokeWidth={1.8} />
        <h1 className="font-display text-3xl text-foreground">Goals</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            No goals set
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm mb-4">
            Define what you want to learn and track your progress here.
          </p>
          <Button variant="outline">Add goal</Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
