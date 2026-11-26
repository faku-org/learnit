import type { ReactNode } from "react";
import type { ContentBlock } from "@shared/blocks";
import { Latex } from "./Latex";
import { Plot } from "./Plot";
import { Diagram } from "./Diagram";
import { SourceExcerpt } from "./SourceExcerpt";
import { CodeBlock } from "./CodeBlock";
import { DataTable } from "./DataTable";

/**
 * Inline `$...$` inside a text block, because a sentence like "solve for $x$"
 * reads badly if the variable has to be its own block. The split is on the
 * delimiter only; the fragment itself goes through KaTeX like any other formula.
 */
function TextBlock({ value }: { value: string }) {
  const parts = value.split(/\$([^$]+)\$/g);
  return (
    <p className="text-foreground leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) =>
        i % 2 === 1 ? <Latex key={i} value={part} /> : <span key={i}>{part}</span>,
      )}
    </p>
  );
}

function Block({ block }: { block: ContentBlock }) {
  switch (block.kind) {
    case "text": return <TextBlock value={block.value} />;
    case "latex": return <Latex value={block.value} display={block.display ?? true} />;
    case "plot": return <Plot spec={block.spec} />;
    case "diagram": return <Diagram spec={block.spec} />;
    case "source": return <SourceExcerpt refData={block.ref} />;
    case "code": return <CodeBlock lang={block.lang} value={block.value} highlight={block.highlight} />;
    case "table": return <DataTable headers={block.headers} rows={block.rows} caption={block.caption} />;
  }
}

/**
 * The structured body of an exercise.
 *
 * Documents written before Phase 2 have no `blocks` and render through
 * `fallback`, which is the caller's existing question/sentence/sourceText path.
 * That is why there is no backfill: both shapes are first-class here, and an
 * exercise generated last year renders exactly as it always did.
 */
export function ContentBlocks({
  blocks,
  fallback = null,
}: {
  blocks?: ContentBlock[] | null;
  fallback?: ReactNode;
}) {
  if (!blocks || blocks.length === 0) return <>{fallback}</>;
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}
