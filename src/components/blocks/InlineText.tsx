import { Latex } from "./Latex";

type Fragment = { key: string; text: string; math: boolean };

/** Split on `$...$`; a fragment is keyed by where it starts in the source. */
function fragments(value: string): Fragment[] {
  const out: Fragment[] = [];
  let offset = 0;
  for (const [n, text] of value.split(/\$([^$]+)\$/g).entries()) {
    const math = n % 2 === 1;
    out.push({ key: `${offset}:${math ? "m" : "t"}`, text, math });
    // A formula also consumed its two delimiters.
    offset += text.length + (math ? 2 : 0);
  }
  return out;
}

/**
 * Prose with inline `$...$` math. The split is on the delimiter only; each
 * fragment goes through KaTeX like any other formula and the rest is a text
 * node, so generated text never becomes markup. Newlines and indentation are
 * kept as written (the caller sets `white-space`).
 */
export function InlineText({ value }: { value: string }) {
  return (
    <>
      {fragments(value).map((f) =>
        f.math ? <Latex key={f.key} value={f.text} /> : <span key={f.key}>{f.text}</span>,
      )}
    </>
  );
}
