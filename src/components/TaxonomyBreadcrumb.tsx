import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight, Loader2, Pencil, Check, Sparkles } from "lucide-react";
import { getTaxonomyTree, type TaxonomyNodeDTO } from "@/lib/api";
import { childrenOf, type TaxonomyNode } from "@/lib/domains";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";

interface Props {
  /** Root-to-leaf ids as classified. */
  taxonomy: string[];
  breadcrumb: string;
  /** True when the classifier guessed rather than matched a known name. */
  uncertain?: boolean;
  /** Set when the classifier had to invent a node for this subject. */
  createdNode?: string | null;
  /** Fires with the corrected lineage. The picker already knows it, so the
   *  caller never has to re-classify. */
  onChange: (next: { taxonomy: string[]; taxonomyLeaf: string; breadcrumb: string }) => void;
}

/**
 * Shows where the classifier placed a subject and lets the student correct it.
 *
 * Misplacement is cheap but not free: it decides which exercise types and
 * content blocks the subject gets, so the person best positioned to notice is
 * given an obvious way to fix it.
 */
export function TaxonomyBreadcrumb({
  taxonomy,
  breadcrumb,
  uncertain = false,
  createdNode = null,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const [nodes, setNodes] = useState<Map<string, TaxonomyNode> | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(taxonomy);

  useEffect(() => setDraft(taxonomy), [taxonomy]);

  useEffect(() => {
    if (!editing || nodes) return;
    getTaxonomyTree()
      .then((list: TaxonomyNodeDTO[]) => setNodes(new Map(list.map((n) => [n.id, n]))))
      .catch(() => setNodes(new Map()));
  }, [editing, nodes]);

  // One column per level, each showing the siblings available at that depth.
  const columns = useMemo(() => {
    if (!nodes) return [];
    const out: { parentId: string | null; options: TaxonomyNode[]; selected: string | null }[] = [];
    let parentId: string | null = null;
    for (let depth = 0; depth < 3; depth++) {
      const options = childrenOf(parentId, nodes);
      if (options.length === 0) break;
      const selected = draft[depth] ?? null;
      out.push({ parentId, options, selected });
      if (!selected) break;
      parentId = selected;
    }
    return out;
  }, [nodes, draft]);

  const pick = (depth: number, id: string) => {
    const next = [...draft.slice(0, depth), id];
    setDraft(next);
  };

  const commit = () => {
    setEditing(false);
    const leaf = draft[draft.length - 1];
    if (!leaf || leaf === taxonomy[taxonomy.length - 1]) return;
    onChange({
      taxonomy: draft,
      taxonomyLeaf: leaf,
      breadcrumb: nodes ? draft.map((id) => nodes.get(id)?.name ?? id).join(" / ") : draft.join(" / "),
    });
  };

  if (!editing) {
    return (
      <div className="flex items-start gap-2 text-xs">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-muted-foreground">{t("taxonomy.placedIn")}</span>
            <span className="text-foreground font-medium">{breadcrumb}</span>
            <button
              onClick={() => setEditing(true)}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
              title={t("taxonomy.change")}
            >
              <Pencil size={11} />
            </button>
          </div>
          {createdNode && (
            <p className="flex items-center gap-1.5 text-[11px] text-accent/80 mt-1">
              <Sparkles size={10} className="shrink-0" />
              {t("taxonomy.newArea")}
            </p>
          )}
          {uncertain && !createdNode && (
            <p className="text-[11px] text-muted-foreground/70 mt-1">{t("taxonomy.uncertain")}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="overflow-hidden"
      >
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
            {t("taxonomy.pickArea")}
          </p>

          {!nodes ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 size={12} className="animate-spin" />
              {t("common.loading")}
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {columns.map((col, depth) => (
                <div key={depth} className="min-w-40 shrink-0 max-h-52 overflow-y-auto">
                  {col.options.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => pick(depth, opt.id)}
                      className={cn(
                        "w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center justify-between gap-1",
                        col.selected === opt.id
                          ? "bg-primary/15 text-foreground font-medium"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      <span className="truncate">{opt.name}</span>
                      {childrenOf(opt.id, nodes).length > 0 && (
                        <ChevronRight size={10} className="shrink-0 opacity-50" />
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-muted-foreground truncate">
              {nodes ? draft.map((id) => nodes.get(id)?.name ?? id).join(" / ") : ""}
            </span>
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={() => {
                  setDraft(taxonomy);
                  setEditing(false);
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={commit}
                className="text-[11px] text-primary hover:text-primary/80 px-2 py-1 flex items-center gap-1"
              >
                <Check size={11} />
                {t("common.done")}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
