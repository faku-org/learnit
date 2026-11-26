import { useEffect, useState } from "react";
import { ChevronDown, Images, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getTopicMedia } from "@/lib/api";
import type { ContentBlock } from "@shared/blocks";
import { ContentBlocks } from "@/components/blocks/ContentBlocks";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; blocks: ContentBlock[] }
  | { status: "error" };

/**
 * "Supplementary material" for the topic being studied.
 *
 * Collapsed by default and fetched on first open, so a lesson costs no extra
 * request (and no third-party image load) unless the student asks. It is
 * strictly optional: a failed request leaves a quiet message and the lesson
 * itself is untouched. The `key` on the caller resets it when the topic changes.
 */
export function TopicMedia({
  pathId,
  moduleIndex,
  topicIndex,
}: {
  pathId: string;
  moduleIndex: number;
  topicIndex: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    if (!open || state.status !== "idle") return;
    let cancelled = false;
    setState({ status: "loading" });
    getTopicMedia(pathId, moduleIndex + 1, topicIndex)
      .then((blocks) => {
        if (!cancelled) setState({ status: "ready", blocks });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, state.status, pathId, moduleIndex, topicIndex]);

  return (
    <section aria-label={t("media.title")} className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Images size={15} aria-hidden />
        <span className="font-medium">{t("media.title")}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-2 space-y-3" aria-live="polite">
          {state.status === "loading" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" aria-hidden />
              {t("media.loading")}
            </p>
          )}
          {state.status === "error" && (
            <p className="text-sm text-muted-foreground">{t("media.error")}</p>
          )}
          {state.status === "ready" && state.blocks.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
              {t("media.empty")}
            </p>
          )}
          {state.status === "ready" && state.blocks.length > 0 && (
            <ContentBlocks blocks={state.blocks} />
          )}
        </div>
      )}
    </section>
  );
}
