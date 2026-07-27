import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";

/** Accuracy bands drive every colour decision on the stats surfaces. */
export function accuracyTone(accuracy: number): string {
  if (accuracy >= 0.8) return "text-accent";
  if (accuracy >= 0.5) return "text-primary";
  return "text-red-400";
}

export function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-3">
      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-widest">
        {icon}
        {label}
      </p>
      <p className="font-display text-2xl text-foreground leading-none mt-2">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export function AccuracyRing({
  accuracy,
  size = 96,
  label = "accuracy",
}: {
  accuracy: number;
  size?: number;
  label?: string;
}) {
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.max(0, Math.min(1, accuracy)))}
          className={cn("transition-all duration-700", accuracyTone(accuracy))}
          stroke="currentColor"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-display text-xl leading-none", accuracyTone(accuracy))}>
          {formatPercent(accuracy)}
        </span>
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">
          {label}
        </span>
      </div>
    </div>
  );
}
