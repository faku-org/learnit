// Wikisource: broad public-domain primary text with stable titles.
//
// The `extracts` API that works on Wikipedia returns nothing here — TextExtracts
// is not installed on Wikisource, and most works are transcluded from proofread
// page scans, so the raw wikitext is a `<pages index=...>` directive rather than
// the text. `action=parse` renders the transclusion, which is the only route
// that actually yields the work.

import { getJSON, htmlToText } from "./http";
import { excerptFor } from "./excerpt";
import { TRUST, type SourceCandidate, type SourceClaim, type SourceProvider } from "./types";

/** Wikisource runs per language; the claim's language picks the subdomain. */
const SUBDOMAINS: Record<string, string> = {
  english: "en", spanish: "es", french: "fr", german: "de", italian: "it",
  portuguese: "pt", latin: "la", greek: "el", russian: "ru", eng: "en",
  spa: "es", fre: "fr", ger: "de", ita: "it", lat: "la", grc: "el",
};

type SearchResponse = {
  query?: { search?: { title: string; pageid: number; snippet?: string }[] };
};

type ParseResponse = {
  parse?: { title: string; pageid: number; text?: { "*": string } };
};

function api(subdomain: string): string {
  return `https://${subdomain}.wikisource.org/w/api.php`;
}

async function searchTitles(subdomain: string, query: string): Promise<string[]> {
  const url =
    `${api(subdomain)}?action=query&format=json&list=search&srnamespace=0&srlimit=5` +
    `&srsearch=${encodeURIComponent(query)}`;
  const data = await getJSON<SearchResponse>(url);
  return (data?.query?.search ?? []).map((s) => s.title);
}

async function fetchPage(
  subdomain: string,
  title: string,
): Promise<{ title: string; text: string } | null> {
  const url =
    `${api(subdomain)}?action=parse&format=json&prop=text&redirects=1` +
    `&page=${encodeURIComponent(title)}`;
  const data = await getJSON<ParseResponse>(url, { timeoutMs: 8000 });
  const html = data?.parse?.text?.["*"];
  if (!html) return null;
  const text = htmlToText(html);
  return text.length > 200 ? { title: data.parse!.title, text } : null;
}

export function createWikisourceProvider(nativeLanguage = "english"): SourceProvider {
  const fallbackSubdomain = SUBDOMAINS[nativeLanguage.toLowerCase()] ?? "en";

  const build = (
    subdomain: string,
    title: string,
    claim: SourceClaim,
    excerpt: string | null,
  ): SourceCandidate => ({
    provider: "wikisource",
    externalId: `${subdomain}:${title}`,
    author: claim.author ?? "",
    work: title,
    locus: claim.locus,
    date: claim.date,
    lang: subdomain,
    text: excerpt,
    translation: null,
    url: `https://${subdomain}.wikisource.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    // A located passage is as good as a canonical citation; a work that was
    // found but whose quotation was not is metadata only.
    trust: excerpt ? (claim.passage ? TRUST.canonical : TRUST.located) : TRUST.metadata,
    license: "CC BY-SA 4.0 / public domain",
  });

  return {
    id: "wikisource",
    cacheText: true,

    async verify(claim: SourceClaim): Promise<SourceCandidate | null> {
      const subdomain = SUBDOMAINS[(claim.lang ?? "").toLowerCase()] ?? fallbackSubdomain;
      const query = [claim.work, claim.author].filter(Boolean).join(" ");
      if (query.trim() === "") return null;

      const titles = await searchTitles(subdomain, query);
      if (titles.length === 0) return null;

      // Only the top few, because each is a render request and this sits in the
      // exercise-generation path.
      for (const title of titles.slice(0, 3)) {
        const page = await fetchPage(subdomain, title);
        if (!page) continue;
        const excerpt = excerptFor(page.text, claim.passage);
        // A claimed passage that is not in the page means the quotation was
        // invented. Keep looking rather than showing the page's opening as if
        // it were what was cited.
        if (!excerpt && claim.passage) continue;
        return build(subdomain, page.title, claim, excerpt);
      }

      // The work exists in the corpus but the quotation does not. Cite it, do
      // not quote it.
      const first = await fetchPage(subdomain, titles[0]);
      return first ? build(subdomain, first.title, claim, null) : null;
    },

    async search(query: string, opts: { lang?: string } = {}): Promise<SourceCandidate[]> {
      const subdomain = SUBDOMAINS[(opts.lang ?? "").toLowerCase()] ?? fallbackSubdomain;
      const titles = await searchTitles(subdomain, query);
      const out: SourceCandidate[] = [];
      for (const title of titles.slice(0, 2)) {
        const page = await fetchPage(subdomain, title);
        if (page) out.push(build(subdomain, page.title, {}, excerptFor(page.text, undefined)));
      }
      return out;
    },
  };
}
