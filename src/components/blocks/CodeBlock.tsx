/**
 * A code sample.
 *
 * No syntax highlighter: every one of them either ships a large grammar bundle
 * or wants to set innerHTML from a string, and the whole point of the block
 * design is that generated content never becomes markup. Line numbers plus a
 * highlight band on the lines the question turns on carry the weight instead.
 */
export function CodeBlock({
  lang,
  value,
  highlight = [],
}: {
  lang: string;
  value: string;
  highlight?: number[];
}) {
  const lines = value.split("\n");
  const marked = new Set(highlight);

  return (
    <figure className="my-2 rounded-lg border border-border bg-secondary/40 overflow-hidden">
      {lang && lang !== "text" && (
        <figcaption className="px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
          {lang}
        </figcaption>
      )}
      <pre className="overflow-x-auto text-[13px] leading-relaxed py-2">
        <code className="block font-mono">
          {lines.map((line, i) => (
            <span
              key={i}
              className={[
                "grid grid-cols-[2.5rem_1fr] px-1",
                marked.has(i + 1) ? "bg-accent/10 border-l-2 border-accent" : "border-l-2 border-transparent",
              ].join(" ")}
            >
              <span className="text-right pr-3 select-none text-muted-foreground/50">{i + 1}</span>
              <span className="whitespace-pre text-foreground">{line || " "}</span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
