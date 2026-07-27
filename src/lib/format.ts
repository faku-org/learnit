/** Display helpers shared by the stats surfaces. */

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Compact duration: "45s", "12m", "1h 20m". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "reading_comprehension" -> "Reading comprehension". */
export function formatExerciseType(type: string): string {
  const spaced = type.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Signed percentage-point delta, e.g. "+50 pts" of accuracy. */
export function formatDelta(delta: number): string {
  const points = Math.round(delta * 100);
  return `${points >= 0 ? "+" : ""}${points}%`;
}
