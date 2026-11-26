import { useState } from "react";
import { ExternalLink, Quote, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SourceRef } from "@shared/blocks";

/** Display names for the corpora that can confirm a citation. */
const PROVIDER_NAMES: Record<string, string> = {
  perseus: "Perseus Digital Library",
  wikisource: "Wikisource",
  gutenberg: "Project Gutenberg",
  crossref: "Crossref",
  openalex: "OpenAlex",
  arxiv: "arXiv",
  xai_search: "web search",
  duckduckgo: "web search",
};

/**
 * A primary source excerpt.
 *
 * Styled distinctly from generated prose on purpose: the student must always be
 * able to tell a primary source from the tutor's commentary about it. The
 * provenance line is always visible, because verification proves the text exists,
 * not that the tutor's reading of it is sound.
 *
 * Until Phase 3 retrieves and verifies these, a block may carry only the claim
 * the generator made. That case is labelled rather than hidden: an unverified
 * attribution shown as if it were checked is exactly the failure this design is
 * built to avoid.
 */
export function SourceExcerpt({ refData }: { refData: SourceRef }) {
  const { t } = useTranslation();
  const [showTranslation, setShowTranslation] = useState(refData.showTranslation);

  const excerpt =
    refData.text && refData.excerptStart !== undefined && refData.excerptEnd !== undefined
      ? refData.text.slice(refData.excerptStart, refData.excerptEnd)
      : refData.text;

  const attribution = [refData.author, refData.work, refData.locus, refData.date]
    .filter(Boolean)
    .join(", ");

  return (
    <figure className="my-3 border-l-2 border-accent/50 bg-secondary/30 rounded-r-lg px-4 py-3 space-y-2">
      {excerpt ? (
        <blockquote className="flex gap-2">
          <Quote size={13} className="shrink-0 mt-1 text-accent/60" />
          <p
            lang={refData.lang}
            className="text-foreground leading-relaxed font-serif text-[15px] whitespace-pre-wrap"
          >
            {excerpt}
          </p>
        </blockquote>
      ) : (
        // The citation resolved but the passage did not. Saying so is the point:
        // the alternative is quoting something the source does not contain.
        <p className="text-sm text-muted-foreground">{t("blocks.citationOnly")}</p>
      )}

      {showTranslation && refData.translation && (
        <div className="pl-5 space-y-1">
          <p className="text-sm text-muted-foreground italic leading-relaxed whitespace-pre-wrap">
            {refData.translation}
          </p>
          {/* The original is retrieved and verified; a generated translation is
              an aid, not an edition, and the student should know which is which. */}
          {refData.translationMachine && (
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
              <Sparkles size={9} />
              {t("blocks.machineTranslation")}
            </p>
          )}
        </div>
      )}

      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground pl-5">
        {attribution && <cite className="not-italic font-medium">{attribution}</cite>}

        {refData.translation && (
          <button
            onClick={() => setShowTranslation((v) => !v)}
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            {showTranslation ? t("blocks.hideTranslation") : t("blocks.showTranslation")}
          </button>
        )}

        {refData.url && (
          <a
            href={refData.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ExternalLink size={10} />
            {t("blocks.viewSource")}
          </a>
        )}

        {/* Verification proves the text exists, not that the tutor's reading of
            it is sound, so the provenance line is always visible. */}
        {refData.verified ? (
          <span
            className="inline-flex items-center gap-1 text-accent/80"
            title={refData.license ?? undefined}
          >
            <ShieldCheck size={10} />
            {t("blocks.verifiedVia", {
              provider: PROVIDER_NAMES[refData.provider ?? ""] ?? refData.provider ?? "",
            })}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-amber-500/90" title={t("blocks.unverifiedHint")}>
            <ShieldAlert size={10} />
            {t("blocks.unverified")}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
