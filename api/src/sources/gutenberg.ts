// Project Gutenberg, through the Gutendex metadata API.
//
// Full public-domain works, which makes it the provider that can actually
// confirm a quotation rather than merely confirm a book: the whole text is
// fetched and the claimed passage is either in it or it is not.

import { getJSON, getText, normalizeWhitespace } from "./http";
import { excerptFor } from "./excerpt";
import { TRUST, type SourceCandidate, type SourceClaim, type SourceProvider } from "./types";

const GUTENDEX = "https://gutendex.com/books";

type GutendexBook = {
  id: number;
  title: string;
  authors: { name: string; birth_year: number | null; death_year: number | null }[];
  languages: string[];
  formats: Record<string, string>;
};

type GutendexResponse = { count: number; results: GutendexBook[] };

/** The plain-text download for a book, preferring UTF-8. */
function plainTextUrl(book: GutendexBook): string | null {
  const formats = book.formats;
  const key =
    Object.keys(formats).find((k) => k.startsWith("text/plain") && k.includes("utf-8")) ??
    Object.keys(formats).find((k) => k.startsWith("text/plain"));
  const url = key ? formats[key] : null;
  // Zipped bundles are not worth unpacking in the generation path.
  return url && !url.endsWith(".zip") ? url : null;
}

/**
 * Gutenberg wraps every work in a licence header and footer. Stripping them
 * keeps boilerplate out of the excerpt and, more importantly, stops the
 * passage locator from matching the licence text instead of the book.
 */
function stripBoilerplate(raw: string): string {
  const startMarker = raw.search(/\*\*\* ?START OF (THIS|THE) PROJECT GUTENBERG/i);
  const endMarker = raw.search(/\*\*\* ?END OF (THIS|THE) PROJECT GUTENBERG/i);
  const from = startMarker === -1 ? 0 : raw.indexOf("\n", startMarker) + 1;
  const to = endMarker === -1 ? raw.length : endMarker;
  return normalizeWhitespace(raw.slice(from, to));
}

const MAX_DOWNLOAD = 2_000_000;

export function createGutenbergProvider(): SourceProvider {
  const build = (book: GutendexBook, claim: SourceClaim, excerpt: string | null): SourceCandidate => ({
    provider: "gutenberg",
    externalId: String(book.id),
    author: book.authors[0]?.name ?? claim.author ?? "",
    work: book.title,
    locus: claim.locus,
    date: claim.date,
    lang: book.languages[0] ?? "en",
    text: excerpt,
    translation: null,
    url: `https://www.gutenberg.org/ebooks/${book.id}`,
    trust: excerpt ? (claim.passage ? TRUST.canonical : TRUST.located) : TRUST.metadata,
    license: "Public domain (Project Gutenberg licence)",
  });

  async function findBook(query: string): Promise<GutendexBook | null> {
    // Gutendex is the slowest provider in the chain by a wide margin, and it is
    // the only one that can confirm a quotation against a whole book, so it is
    // worth waiting for rather than timing out into a dropped source block.
    const data = await getJSON<GutendexResponse>(
      `${GUTENDEX}?search=${encodeURIComponent(query)}`,
      { timeoutMs: 14000 },
    );
    return data?.results?.[0] ?? null;
  }

  async function bodyOf(book: GutendexBook): Promise<string | null> {
    const url = plainTextUrl(book);
    if (!url) return null;
    const raw = await getText(url, { timeoutMs: 15000 });
    if (!raw) return null;
    return stripBoilerplate(raw.slice(0, MAX_DOWNLOAD));
  }

  return {
    id: "gutenberg",
    cacheText: true,

    async verify(claim: SourceClaim): Promise<SourceCandidate | null> {
      const query = [claim.author, claim.work].filter(Boolean).join(" ");
      if (query.trim() === "") return null;

      const book = await findBook(query);
      if (!book) return null;

      const body = await bodyOf(book);
      if (!body) return build(book, claim, null);

      const excerpt = excerptFor(body, claim.passage);
      // The book is real and the quotation is not in it, which is exactly the
      // failure mode this provider is best placed to catch.
      return build(book, claim, excerpt);
    },

    async search(query: string): Promise<SourceCandidate[]> {
      const book = await findBook(query);
      if (!book) return [];
      const body = await bodyOf(book);
      return [build(book, {}, body ? excerptFor(body, undefined) : null)];
    },
  };
}
