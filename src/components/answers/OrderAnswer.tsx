import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StudentAnswer } from "@shared/grading";

type Tile = { token: string; id: number };

/**
 * Arrange tokens into an order: word order in a language path, the steps of a
 * derivation in a quantitative one, events on a timeline in a historical one.
 *
 * Tiles carry an id rather than being keyed by their token, because a sentence
 * can repeat a word and a derivation can repeat a step.
 */
export function OrderAnswer({
  items,
  onChange,
  submitted,
  correct,
}: {
  /** The correct sequence. Shuffled here; the server holds the answer. */
  items: string[];
  onChange: (next: StudentAnswer) => void;
  submitted: boolean;
  correct: boolean;
}) {
  const { t } = useTranslation();
  const [placed, setPlaced] = useState<number[]>([]);

  const tiles = useMemo<Tile[]>(() => {
    const shuffled = items.map((token, id) => ({ token, id }));
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [items]);

  const tokenOf = (id: number): string => items[id] ?? "";

  const commit = (ids: number[]): void => {
    setPlaced(ids);
    onChange({ kind: "order", items: ids.map(tokenOf) });
  };

  // AnswerArea is keyed by the exercise, so this component remounts with each
  // one and the placed tiles need no reset path of their own.
  const arranged = placed;

  return (
    <div className="space-y-3">
      <div className="min-h-14 flex flex-wrap items-center gap-2 p-3 rounded-lg border border-dashed border-border bg-secondary/30">
        {arranged.length === 0 && (
          <span className="text-xs text-muted-foreground">{t("learn.tapWordsToBuild")}</span>
        )}
        {arranged.map((id, pos) => (
          <button
            key={pos}
            onClick={() => !submitted && commit(arranged.filter((_, i) => i !== pos))}
            disabled={submitted}
            className={[
              "px-3 py-1.5 rounded-lg border text-sm transition-colors",
              submitted
                ? correct
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-red-500/30 bg-red-500/5 text-red-400"
                : "border-primary bg-primary/10 text-foreground hover:bg-primary/20",
            ].join(" ")}
          >
            {tokenOf(id)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {tiles
          .filter((tile) => !arranged.includes(tile.id))
          .map((tile) => (
            <button
              key={tile.id}
              onClick={() => !submitted && commit([...arranged, tile.id])}
              disabled={submitted}
              className="px-3 py-1.5 rounded-lg border border-border text-sm hover:border-primary/30 disabled:opacity-40 transition-colors"
            >
              {tile.token}
            </button>
          ))}
      </div>
    </div>
  );
}
