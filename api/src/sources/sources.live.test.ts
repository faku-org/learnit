import { describe, expect, test } from "bun:test";
import { createPerseusProvider } from "./perseus";
import { createWikisourceProvider } from "./wikisource";
import { createGutenbergProvider } from "./gutenberg";
import { createCrossrefProvider } from "./academic";

// Live checks against the real corpora. Opt in with LIVE_SOURCES=1, because a
// suite that fails when the network is unavailable is a suite people stop
// running.
//
//   LIVE_SOURCES=1 bun test src/sources
//
// These are the acceptance tests for this phase: a real citation resolves to
// real text, and a fabricated one is refused.

const live = process.env.LIVE_SOURCES === "1";
const suite = live ? describe : describe.skip;
const TIMEOUT = 45_000;

suite("Perseus, live", () => {
  const perseus = createPerseusProvider("english");

  test("resolves a real Thucydides citation to the Greek and a translation", async () => {
    const found = await perseus.verify({
      author: "Thucydides",
      work: "History of the Peloponnesian War",
      locus: "1.22",
    });
    expect(found).not.toBeNull();
    expect(found!.lang).toBe("grc");
    // The passage on method: "a possession for all time".
    expect(found!.text).toContain("κτῆμά");
    expect(found!.translation?.length ?? 0).toBeGreaterThan(200);
    expect(found!.url).toContain("scaife.perseus.org");
    expect(found!.trust).toBe(1);
  }, TIMEOUT);

  test("resolves the same citation written in Spanish", async () => {
    const found = await perseus.verify({
      author: "Tucídides",
      work: "Guerra del Peloponeso",
      locus: "Libro 1, capítulo 22",
    });
    expect(found?.text).toContain("κτῆμά");
  }, TIMEOUT);

  test("resolves a Latin citation", async () => {
    const found = await perseus.verify({ author: "Caesar", work: "De Bello Gallico", locus: "1.1" });
    expect(found?.text).toContain("Gallia est omnis divisa");
  }, TIMEOUT);

  test("refuses a locus that does not exist, without inventing one", async () => {
    const found = await perseus.verify({ author: "Thucydides", work: "History", locus: "99.999" });
    // The work is real, so it is still citable — but there is no text, which is
    // the whole point: no passage is fabricated to fill the gap.
    expect(found?.text).toBeNull();
    expect(found!.trust).toBeLessThan(1);
  }, TIMEOUT);

  test("refuses an author the corpus does not hold", async () => {
    expect(await perseus.verify({ author: "Ibn Khaldun", work: "Muqaddimah", locus: "1.1" }))
      .toBeNull();
  }, TIMEOUT);
});

suite("Wikisource, live", () => {
  const wikisource = createWikisourceProvider("english");

  test("retrieves a real document and its quoted passage", async () => {
    const found = await wikisource.verify({
      author: "Abraham Lincoln",
      work: "Gettysburg Address",
      passage: "Four score and seven years ago",
    });
    expect(found).not.toBeNull();
    expect(found!.text).toContain("Four score and seven years ago");
    expect(found!.url).toContain("wikisource.org");
  }, TIMEOUT);

  test("refuses to quote a passage the document does not contain", async () => {
    const found = await wikisource.verify({
      author: "Abraham Lincoln",
      work: "Gettysburg Address",
      passage: "We shall fight on the beaches, we shall fight on the landing grounds",
    });
    // Either nothing, or the document cited without the invented quotation.
    expect(found?.text ?? null).toBeNull();
  }, TIMEOUT);
});

suite("Gutenberg, live", () => {
  test("finds a quotation inside the full text of a real book", async () => {
    const found = await createGutenbergProvider().verify({
      author: "Jane Austen",
      work: "Pride and Prejudice",
      passage: "It is a truth universally acknowledged",
    });
    expect(found?.text).toContain("truth universally acknowledged");
    expect(found!.url).toContain("gutenberg.org");
  }, TIMEOUT);
});

suite("Crossref, live", () => {
  const crossref = createCrossrefProvider();

  test("resolves a real DOI", async () => {
    const found = await crossref.verify({ author: "", work: "", locus: "10.1038/nature12373" });
    expect(found).not.toBeNull();
    expect(found!.externalId.toLowerCase()).toBe("10.1038/nature12373");
    // Publisher-owned: metadata is verified, no text is ever cached or shown.
    expect(found!.text).toBeNull();
  }, TIMEOUT);

  test("refuses a DOI that does not resolve", async () => {
    expect(await crossref.verify({ locus: "10.9999/this.does.not.exist.12345" })).toBeNull();
  }, TIMEOUT);
});
