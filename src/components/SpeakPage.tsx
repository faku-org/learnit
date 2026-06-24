import { motion } from "motion/react";
import { Mic } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function SpeakPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: "easeOut" }}
      className="p-8 max-w-3xl"
    >
      <div className="flex items-center gap-3 mb-6">
        <Mic size={26} className="text-accent" strokeWidth={1.8} />
        <h1 className="font-display text-3xl text-foreground">Speak</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Speaking practice
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm mb-4">
            Practice pronunciation and conversation skills here.
          </p>
          <Button variant="outline" className="gap-2">
            <Mic size={14} />
            Start recording
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
