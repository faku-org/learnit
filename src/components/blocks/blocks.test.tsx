import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { sanitizeBlocks, type ContentBlock } from "@shared/blocks";
import { ContentBlocks } from "./ContentBlocks";
import "@/lib/i18n";

// The block pipeline end to end: whatever a generator returns, through the
// sanitizer, into real HTML. The security assertions below are the reason this
// file exists — exercises are shared across users, so a generator that could
// emit markup would be stored XSS against everyone who later draws one.

const ALL: Parameters<typeof sanitizeBlocks>[1] = [
  "text", "latex", "plot", "diagram", "source", "code", "table",
];

const render = (raw: unknown[]): { blocks: ContentBlock[]; html: string } => {
  const blocks = sanitizeBlocks(raw, ALL);
  return { blocks, html: renderToStaticMarkup(<ContentBlocks blocks={blocks} />) };
};

describe("content blocks", () => {
  test("renders a formula through KaTeX", () => {
    const { html } = render([{ kind: "latex", value: "f(x) = x^2 - 3x + 2", display: true }]);
    expect(html).toContain("katex");
    expect(html).not.toContain("f(x) = x^2 - 3x + 2</span></div>");
  });

  test("renders inline math inside a text block", () => {
    const { html } = render([{ kind: "text", value: "Find the minimum of $f(x)$." }]);
    expect(html).toContain("katex");
    expect(html).toContain("Find the minimum of ");
  });

  test("draws a function plot from its expression", () => {
    const { html } = render([{
      kind: "plot",
      spec: {
        type: "function", domain: [-2, 5], grid: true,
        series: [{ label: "f", expr: "x^2 - 3*x + 2" }],
        markers: [{ x: 1.5, y: -0.25, label: "minimum" }],
      },
    }]);
    expect(html).toContain("<polyline");
    expect(html).toContain("minimum");
  });

  test("draws a diagram and drops primitives it does not know", () => {
    const { html } = render([{
      kind: "diagram",
      spec: {
        viewBox: [0, 0, 200, 150],
        elements: [
          { t: "line", x1: 20, y1: 100, x2: 120, y2: 100, arrow: "end", label: "F" },
          { t: "script", src: "evil.js" },
        ],
      },
    }]);
    expect(html).toContain("<line");
    expect(html).not.toContain("evil.js");
  });

  test("shows a source excerpt in its original script", () => {
    const { html } = render([{
      kind: "source",
      claim: { author: "Thucydides", work: "History", text: "κτῆμά τε ἐς αἰεὶ", lang: "grc" },
    }]);
    expect(html).toContain("κτῆμά");
    expect(html).toContain("Thucydides");
  });

  test("names the corpus that verified the citation", () => {
    const { html } = render([{
      kind: "source",
      ref: {
        provider: "perseus", author: "Thucydides", work: "History",
        text: "κτῆμά τε ἐς αἰεὶ", lang: "grc", verified: true,
        url: "https://scaife.perseus.org/reader/x/",
      },
    }]);
    expect(html).toContain("Perseus Digital Library");
    expect(html).toContain("scaife.perseus.org");
  });

  test("labels a generated translation as generated", () => {
    const { html } = render([{
      kind: "source",
      ref: {
        provider: "perseus", author: "Thucydides", work: "History",
        text: "κτῆμά", translation: "a possession for all time",
        translationMachine: true, showTranslation: true, verified: true,
      },
    }]);
    expect(html).toContain("a possession for all time");
    expect(html).toContain("Machine translation");
  });

  test("a verified work with no locatable passage is cited, not quoted", () => {
    const { html } = render([{
      kind: "source",
      ref: { provider: "wikisource", author: "Lincoln", work: "Gettysburg Address", verified: true },
    }]);
    expect(html).toContain("could not be located");
    expect(html).not.toContain("<blockquote");
  });

  test("falls back to the legacy body when there are no blocks", () => {
    const html = renderToStaticMarkup(
      <ContentBlocks blocks={[]} fallback={<p>legacy question</p>} />,
    );
    expect(html).toBe("<p>legacy question</p>");
  });
});

describe("blocks cannot carry markup into the page", () => {
  test("text is escaped rather than parsed", () => {
    const { html } = render([{ kind: "text", value: "<img src=x onerror=alert(1)>" }]);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  test("a javascript: citation link never becomes an href", () => {
    const { html } = render([{
      kind: "source",
      claim: { author: "Anon", url: "javascript:alert(1)" },
    }]);
    expect(html).not.toContain("javascript:");
  });

  test("a latex payload cannot smuggle an attribute through KaTeX", () => {
    // \htmlClass and \href are exactly what `trust: false` exists to refuse.
    const { html } = render([{
      kind: "latex",
      value: "\\href{javascript:alert(1)}{click} \\htmlClass{x}{y}",
    }]);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a href");
  });

  test("a plot expression that is not arithmetic is dropped, not evaluated", () => {
    const { blocks } = render([{
      kind: "plot",
      spec: { type: "function", series: [{ expr: "fetch('/steal')" }] },
    }]);
    expect(blocks).toHaveLength(0);
  });

  test("properties the model invented do not survive into the block", () => {
    const { blocks } = render([
      { kind: "text", value: "hi", dangerouslySetInnerHTML: { __html: "<script>" } },
    ]);
    expect(blocks[0]).toEqual({ kind: "text", value: "hi" });
  });
});
