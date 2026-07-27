import { motion } from "motion/react";
import {
  Trophy,
  Target,
  Clock,
  CheckCircle2,
  Lightbulb,
  TrendingUp,
  Repeat,
  HelpCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile, accuracyTone } from "@/components/StatTile";
import { cn } from "@/lib/utils";
import { formatDelta, formatDuration, formatExerciseType, formatPercent } from "@/lib/format";
import type { StatsOverview as Overview } from "@/lib/api";

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: "easeOut" as const } },
};

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

/** A topic name with a right-aligned figure — the shape every list here uses. */
function StatRow({
  name,
  value,
  tone,
  bar,
}: {
  name: string;
  value: string;
  tone?: string;
  bar?: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-foreground truncate">{name}</span>
        <span className={cn("text-xs shrink-0", tone ?? "text-muted-foreground")}>{value}</span>
      </div>
      {bar !== undefined && (
        <div className="h-1 rounded-full bg-secondary">
          <div
            className={cn("h-1 rounded-full bg-current transition-all", tone)}
            style={{ width: `${Math.max(2, Math.min(100, bar * 100))}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function StatsOverview({ stats }: { stats: Overview }) {
  if (stats.totalAnswered === 0) {
    return (
      <motion.p variants={itemVariants} className="text-sm text-muted-foreground mb-6">
        {stats.recommendations[0]?.message ??
          "Answer a few exercises to start seeing your stats."}
      </motion.p>
    );
  }

  const hasLists =
    stats.hardestTopics.length > 0 ||
    stats.mostGaveUp.length > 0 ||
    stats.mostRepeated.length > 0 ||
    stats.biggestImprovements.length > 0;

  return (
    <motion.section variants={itemVariants} className="mb-8">
      <h2 className="font-display text-xl text-foreground mb-4">Your Stats</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatTile
          icon={<Trophy size={11} />}
          label="Points"
          value={stats.totalPoints}
          sub={`${stats.totalAnswered} answers`}
        />
        <StatTile
          icon={<Target size={11} />}
          label="Accuracy"
          value={
            <span className={accuracyTone(stats.accuracy)}>{formatPercent(stats.accuracy)}</span>
          }
          sub={
            stats.mostCommonErrorType
              ? `most missed: ${formatExerciseType(stats.mostCommonErrorType).toLowerCase()}`
              : undefined
          }
        />
        <StatTile
          icon={<Clock size={11} />}
          label="Studied"
          value={formatDuration(stats.totalTimeMs)}
        />
        <StatTile
          icon={<CheckCircle2 size={11} />}
          label="Lessons"
          value={stats.topicsCompleted}
          sub="completed"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest">
              <Lightbulb size={14} className="text-accent" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {stats.recommendations.map((rec, i) => (
              <p key={i} className="text-sm text-muted-foreground leading-snug">
                {rec.message}
              </p>
            ))}
          </CardContent>
        </Card>

        {stats.hardestTopics.length > 0 && (
          <SectionCard title="Hardest so far" icon={<Target size={14} />}>
            {stats.hardestTopics.map((t) => (
              <StatRow
                key={`${t.moduleIndex}-${t.topicIndex}`}
                name={t.topicName}
                value={`${formatPercent(t.accuracy)} · ${t.total}`}
                tone={accuracyTone(t.accuracy)}
                bar={t.accuracy}
              />
            ))}
          </SectionCard>
        )}

        {stats.mostGaveUp.length > 0 && (
          <SectionCard title="Asked for help" icon={<HelpCircle size={14} />}>
            {stats.mostGaveUp.map((t) => (
              <StatRow
                key={`${t.moduleIndex}-${t.topicIndex}`}
                name={t.topicName}
                value={`${t.gaveUp}x`}
              />
            ))}
          </SectionCard>
        )}

        {stats.mostRepeated.length > 0 && (
          <SectionCard title="Most repeated" icon={<Repeat size={14} />}>
            {stats.mostRepeated.map((t) => (
              <StatRow
                key={`${t.moduleIndex}-${t.topicIndex}`}
                name={t.topicName}
                value={`${t.passes} passes`}
              />
            ))}
          </SectionCard>
        )}

        {stats.biggestImprovements.length > 0 && (
          <SectionCard title="Biggest gains" icon={<TrendingUp size={14} />}>
            {stats.biggestImprovements.map((t) => (
              <StatRow
                key={`${t.moduleIndex}-${t.topicIndex}`}
                name={t.topicName}
                value={`${formatDelta(t.delta)} · ${formatPercent(t.from)} → ${formatPercent(t.to)}`}
                tone="text-accent"
              />
            ))}
          </SectionCard>
        )}
      </div>

      {!hasLists && (
        <p className="text-xs text-muted-foreground mt-3">
          Keep going — per-topic breakdowns appear once you've answered a few more.
        </p>
      )}
    </motion.section>
  );
}
