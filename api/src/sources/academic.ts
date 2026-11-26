// Academic verification: Crossref, OpenAlex, and arXiv.
//
// These answer a different question from the primary-text providers. A physics
// or economics exercise does not quote a passage; it attributes a result to a
// paper. What has to be verified is that the paper EXISTS and says what the
// citation says it is — author, title, year, DOI.
//
// LICENSING, which is open question #4 from the design, settled here:
// Crossref and OpenAlex return publisher-owned abstracts, so only their
// metadata is cached and rendered. The block becomes a citation with a
// resolvable link rather than an excerpt. arXiv distributes its own abstracts
// under the submitter's licence and is displayable, so its summary is kept.

import { getJSON, getText, normalizeWhitespace, tagText } from "./http";
import { TRUST, type SourceCandidate, type SourceClaim, type SourceProvider } from "./types";

const DOI_PATTERN = /10\.\d{4,9}\/[^\s"'<>]+/;
const ARXIV_PATTERN = /(\d{4}\.\d{4,5})(v\d+)?|([a-z-]+(?:\.[A-Z]{2})?\/\d{7})/;

/** Any DOI the claim carries, wherever it was put. */
function doiIn(claim: SourceClaim): string | null {
  const haystack = [claim.locus, claim.work, claim.passage].filter(Boolean).join(" ");
  const match = haystack.match(DOI_PATTERN);
  return match ? match[0].replace(/[.,;)]+$/, "") : null;
}

function bibliographicQuery(claim: SourceClaim): string {
  return [claim.author, claim.work, claim.date].filter(Boolean).join(" ").trim();
}

// ── Crossref ──────────────────────────────────────────────────────────────────

type CrossrefWork = {
  DOI: string;
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  issued?: { "date-parts"?: number[][] };
  "container-title"?: string[];
  URL?: string;
  license?: { URL?: string }[];
  score?: number;
};

type CrossrefResponse = { message: CrossrefWork | { items?: CrossrefWork[] } };

function authorOf(work: CrossrefWork): string {
  const first = work.author?.[0];
  if (!first) return "";
  return first.name ?? [first.given, first.family].filter(Boolean).join(" ");
}

function yearOf(work: CrossrefWork): string | undefined {
  const year = work.issued?.["date-parts"]?.[0]?.[0];
  return year ? String(year) : undefined;
}

function crossrefCandidate(work: CrossrefWork, exact: boolean): SourceCandidate {
  return {
    provider: "crossref",
    externalId: work.DOI,
    author: authorOf(work),
    work: work.title?.[0] ?? "",
    locus: work["container-title"]?.[0],
    date: yearOf(work),
    lang: "en",
    // Metadata only. The abstract belongs to the publisher.
    text: null,
    translation: null,
    url: work.URL ?? `https://doi.org/${work.DOI}`,
    trust: exact ? TRUST.canonical : TRUST.metadata,
    license: work.license?.[0]?.URL ?? null,
  };
}

/**
 * A bibliographic hit is only a verification if it is actually the same work.
 * Crossref will happily return its best guess for a title that does not exist,
 * so the returned title has to share substantial wording with the claim.
 */
function titlesAgree(claimed: string | undefined, found: string): boolean {
  if (!claimed) return false;
  const words = (s: string) =>
    new Set(
      s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3),
    );
  const a = words(claimed);
  const b = words(found);
  if (a.size === 0) return false;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / a.size >= 0.6;
}

export function createCrossrefProvider(): SourceProvider {
  return {
    id: "crossref",
    // Publisher-owned content: metadata is stored, text never is.
    cacheText: false,

    async verify(claim: SourceClaim): Promise<SourceCandidate | null> {
      const doi = doiIn(claim);
      if (doi) {
        const data = await getJSON<CrossrefResponse>(
          `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
        );
        const work = data?.message as CrossrefWork | undefined;
        if (work?.DOI) return crossrefCandidate(work, true);
        // A DOI that does not resolve is a fabricated DOI. Say nothing.
        return null;
      }

      const query = bibliographicQuery(claim);
      if (query === "") return null;
      const results = await this.search(query, {});
      const found = results[0];
      return found && titlesAgree(claim.work, found.work) ? found : null;
    },

    async search(query: string): Promise<SourceCandidate[]> {
      const data = await getJSON<CrossrefResponse>(
        `https://api.crossref.org/works?rows=3&select=DOI,title,author,issued,container-title,URL,license` +
          `&query.bibliographic=${encodeURIComponent(query)}`,
      );
      const items = (data?.message as { items?: CrossrefWork[] } | undefined)?.items ?? [];
      return items.filter((w) => w.DOI).map((w) => crossrefCandidate(w, false));
    },
  };
}

// ── OpenAlex ──────────────────────────────────────────────────────────────────

type OpenAlexWork = {
  id: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: { source?: { display_name?: string } | null; landing_page_url?: string | null } | null;
  license?: string | null;
};

type OpenAlexResponse = { results?: OpenAlexWork[] };

function openAlexCandidate(work: OpenAlexWork): SourceCandidate {
  const title = work.title ?? work.display_name ?? "";
  return {
    provider: "openalex",
    externalId: work.doi ?? work.id,
    author: work.authorships?.[0]?.author?.display_name ?? "",
    work: title,
    locus: work.primary_location?.source?.display_name ?? undefined,
    date: work.publication_year ? String(work.publication_year) : undefined,
    lang: "en",
    text: null,
    translation: null,
    url: work.doi ?? work.primary_location?.landing_page_url ?? work.id,
    trust: TRUST.metadata,
    license: work.license ?? null,
  };
}

export function createOpenAlexProvider(): SourceProvider {
  return {
    id: "openalex",
    cacheText: false,

    async verify(claim: SourceClaim): Promise<SourceCandidate | null> {
      const doi = doiIn(claim);
      if (doi) {
        const data = await getJSON<OpenAlexWork>(`https://api.openalex.org/works/doi:${doi}`);
        return data?.id ? { ...openAlexCandidate(data), trust: TRUST.canonical } : null;
      }
      const query = bibliographicQuery(claim);
      if (query === "") return null;
      const results = await this.search(query, {});
      const found = results[0];
      return found && titlesAgree(claim.work, found.work) ? found : null;
    },

    async search(query: string): Promise<SourceCandidate[]> {
      const data = await getJSON<OpenAlexResponse>(
        `https://api.openalex.org/works?per-page=3&search=${encodeURIComponent(query)}`,
      );
      return (data?.results ?? []).filter((w) => w.id).map(openAlexCandidate);
    },
  };
}

// ── arXiv ─────────────────────────────────────────────────────────────────────

/**
 * arXiv answers with an Atom feed. Its abstracts are distributed by arXiv under
 * the submitter's licence, so unlike Crossref the summary can be shown.
 */
function arxivEntries(xml: string): SourceCandidate[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  return entries
    .map((entry): SourceCandidate | null => {
      const id = tagText(entry, "id");
      const title = tagText(entry, "title");
      if (!id || !title) return null;
      const summary = tagText(entry, "summary");
      const published = tagText(entry, "published");
      const authorBlock = entry.match(/<author>[\s\S]*?<\/author>/);
      return {
        provider: "arxiv",
        externalId: id.replace(/^https?:\/\/arxiv\.org\/abs\//, ""),
        author: authorBlock ? (tagText(authorBlock[0], "name") ?? "") : "",
        work: normalizeWhitespace(title),
        date: published?.slice(0, 4),
        lang: "en",
        text: summary ? normalizeWhitespace(summary) : null,
        translation: null,
        url: id,
        trust: TRUST.located,
        license: "arXiv non-exclusive licence",
      };
    })
    .filter((c): c is SourceCandidate => c !== null);
}

export function createArxivProvider(): SourceProvider {
  return {
    id: "arxiv",
    cacheText: true,

    async verify(claim: SourceClaim): Promise<SourceCandidate | null> {
      const haystack = [claim.locus, claim.work].filter(Boolean).join(" ");
      const arxivId =
        haystack.match(/arxiv[:\s]*([\w./-]+)/i)?.[1] ?? haystack.match(ARXIV_PATTERN)?.[0];
      if (arxivId) {
        const xml = await getText(
          `http://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`,
        );
        const found = xml ? arxivEntries(xml)[0] : null;
        if (found) return { ...found, trust: TRUST.canonical };
        return null;
      }
      const query = bibliographicQuery(claim);
      if (query === "") return null;
      const results = await this.search(query, {});
      const found = results[0];
      return found && titlesAgree(claim.work, found.work) ? found : null;
    },

    async search(query: string): Promise<SourceCandidate[]> {
      const xml = await getText(
        `http://export.arxiv.org/api/query?max_results=3&search_query=all:${encodeURIComponent(query)}`,
        { timeoutMs: 8000 },
      );
      return xml ? arxivEntries(xml) : [];
    },
  };
}
