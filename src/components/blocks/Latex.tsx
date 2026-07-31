import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * A LaTeX fragment, rendered by KaTeX.
 *
 * `throwOnError` is off deliberately: an exercise arrives from a generator and
 * is drawn from a bank shared across users, so a malformed formula must degrade
 * to its own source text rather than take the exercise down with it. KaTeX
 * builds its own DOM from the parsed tree, so the string never reaches the page
 * as markup even when it fails to parse.
 */
export function Latex({
  value,
  display = false,
  className = "",
}: {
  value: string;
  display?: boolean;
  className?: string;
}) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(value, {
        displayMode: display,
        throwOnError: false,
        errorColor: "currentColor",
        strict: false,
        trust: false,
        output: "html",
      });
    } catch {
      return null;
    }
  }, [value, display]);

  if (html === null) {
    return (
      <code className={`text-sm text-muted-foreground ${className}`}>{value}</code>
    );
  }

  const Tag = display ? "div" : "span";
  return (
    <Tag
      className={[display ? "overflow-x-auto py-1 text-center" : "", className].join(" ")}
      // Safe by construction: KaTeX serializes a parse tree it built itself, and
      // `trust: false` blocks the commands (\href, \htmlClass, \includegraphics)
      // that could otherwise carry arbitrary attributes into the output.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
