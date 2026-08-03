import { describe, expect, test } from "bun:test";
import { decodeEntities, htmlToText, normalizeWhitespace, tagText, xmlToText } from "../../../api/src/sources/http";
import { excerptFor, locatePassage } from "../../../api/src/sources/excerpt";
import { resolveWork } from "../../../api/src/sources/perseus";

// Pure logic only. The live-provider checks live in sources.live.test.ts, which
// is opt-in: this suite must pass on a machine with no network.

describe("text extraction", () => {
  test("drops scripts, styles, and site chrome", () => {
    const html = `
      <div class="ws-noexport">Navigation junk</div>
      <script>alert(1)</script>
      <style>.x{}</style>
      <p>The actual text of the work.</p>`;
    const text = htmlToText(html);
    expect(text).toContain("The actual text of the work.");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("Navigation junk");
  });

  test("keeps paragraph structure", () => {
    expect(htmlToText("<p>One.</p><p>Two.</p>")).toBe("One.\nTwo.");
  });

  test("decodes entities without letting a control character through", () => {
    expect(decodeEntities("caf&eacute; &amp; &#233; &#x3b1;")).toBe("caf&eacute; & é α");
    expect(decodeEntities("&#0;&#8;")).toBe("  ");
  });

  test("reads TEI markup as plain text", () => {
    const tei = `<TEI><text><body><div><p>μῆνιν ἄειδε</p><p>θεὰ</p></div></body></text></TEI>`;
    expect(xmlToText(tei)).toBe("μῆνιν ἄειδε\nθεὰ");
  });

  test("pulls a named tag out of an Atom entry", () => {
    expect(tagText("<entry><title>A  Paper</title></entry>", "title")).toBe("A Paper");
  });

  test("collapses whitespace including non-breaking spaces", () => {
    expect(normalizeWhitespace("a   b\n\n\n\nc")).toBe("a b\n\nc");
  });
});

describe("locating a claimed passage", () => {
  const text =
    "It is a truth universally acknowledged, that a single man in possession of a good " +
    "fortune, must be in want of a wife. However little known the feelings of such a man may be.";

  test("finds a passage quoted verbatim", () => {
    expect(locatePassage(text, "It is a truth universally acknowledged")).toBe(0);
  });

  test("finds it despite case, accents, and punctuation drift", () => {
    expect(locatePassage(text, "it is a truth, universally acknowledged!")).toBe(0);
  });

  test("finds it from the opening words when the rest was paraphrased", () => {
    const at = locatePassage(text, "However little known the sentiments and views of the man");
    expect(at).toBeGreaterThan(0);
  });

  test("refuses a passage the text does not contain", () => {
    expect(locatePassage(text, "Call me Ishmael, some years ago never mind how long")).toBe(-1);
  });

  test("refuses a fragment too short to be evidence of anything", () => {
    expect(locatePassage(text, "a man")).toBe(-1);
  });

  test("a fabricated quotation yields no excerpt at all", () => {
    // The whole point of the pipeline: the work is real, the quote is not, and
    // nothing gets shown.
    expect(excerptFor(text, "Reader, I married him.")).toBeNull();
  });

  test("no claimed passage falls back to the opening", () => {
    expect(excerptFor(text, undefined)?.startsWith("It is a truth")).toBe(true);
  });
});

describe("Perseus catalog resolution", () => {
  test("resolves an English author and title", () => {
    expect(resolveWork({ author: "Thucydides", work: "History of the Peloponnesian War" })?.id)
      .toBe("tlg0003.tlg001");
  });

  test("resolves a Spanish author and title", () => {
    expect(resolveWork({ author: "Tucídides", work: "Guerra del Peloponeso" })?.id)
      .toBe("tlg0003.tlg001");
  });

  test("resolves a Latin title the student typed instead of the English one", () => {
    expect(resolveWork({ author: "Caesar", work: "De Bello Gallico" })?.id).toBe("phi0448.phi001");
  });

  test("picks the right work when an author has several", () => {
    expect(resolveWork({ author: "Plato", work: "Republic" })?.id).toBe("tlg0059.tlg030");
    expect(resolveWork({ author: "Plato", work: "Apology" })?.id).toBe("tlg0059.tlg002");
  });

  test("an author with one work needs no title", () => {
    expect(resolveWork({ author: "Herodotus" })?.id).toBe("tlg0016.tlg001");
  });

  test("refuses an author the corpus does not hold", () => {
    expect(resolveWork({ author: "Ibn Khaldun", work: "Muqaddimah" })).toBeNull();
  });

  test("refuses an empty claim", () => {
    expect(resolveWork({})).toBeNull();
  });
});
