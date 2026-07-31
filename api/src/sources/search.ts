// The general fallback, for claims no structured corpus covers.
//
// A history path will cite a nineteenth-century pamphlet that is not in Perseus,
// Wikisource, or Crossref. Rather than drop every such block, the claim goes to
// a live web search that returns CITATIONS — and those citations are then
// re-verified against a structured provider wherever one applies.
//
// Trust is deliberately the lowest in the chain. A search result is evidence
// that a page mentioning the claim exists, which is weaker than a resolved
// citation in a canonical corpus, and the pipeline prefers the latter whenever
// both are available. What this fallback must never do is manufacture a
// quotation: it returns a link and an attribution, never an excerpt.

import { TRUST, type SourceCandidate, type SourceClaim, type SourceProvider } from "./types";

const XAI_API_KEY = process.env.XAI_API_KEY ?? "";
const XAI_URL = "https://api.x.ai/v1/chat/completions";
const TIMEOUT_MS = 9000;

type XaiCitation = string;

type XaiResponse = {
  choices?: { message?: { content?: string } }[];
  citations?: XaiCitation[];
};

const SYSTEM = `You confirm whether a cited source actually exists.
You are given an attribution. Search for it and report only what you find.
Never write out a quotation. Never fill in a detail you did not find.
If you cannot confirm the source exists, say so plainly.`;

function buildQuery(claim: SourceClaim): string {
  const parts = [claim.author, claim.work, claim.locus, claim.date].filter(Boolean).join(", ");
  return `Does this source exist? ${parts}

Answer as JSON only:
{ "exists": true or false, "author": "", "work": "", "date": "", "url": "" }
Set "exists" false unless you found the actual work. "url" must be a page you
actually saw in the results, never one you constructed.`;
}

/** Confirmed metadata from live search, or null. Never returns a passage. */
async function liveSearch(claim: SourceClaim): Promise<SourceCandidate | null> {
  if (!XAI_API_KEY) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(XAI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-4-fast",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: buildQuery(claim) },
        ],
        search_parameters: { mode: "on", return_citations: true, max_search_results: 5 },
        temperature: 0,
        max_tokens: 300,
      }),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as XaiResponse;
    const content = data.choices?.[0]?.message?.content ?? "";
    const json = content.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;

    const parsed = JSON.parse(json) as {
      exists?: unknown; author?: unknown; work?: unknown; date?: unknown; url?: unknown;
    };
    if (parsed.exists !== true) return null;

    // The URL must come from the search's own citation list. A model-written URL
    // is exactly the fabrication this provider exists to avoid.
    const citations = (data.citations ?? []).filter((c) => typeof c === "string");
    const claimed = typeof parsed.url === "string" ? parsed.url : "";
    const url = citations.includes(claimed) ? claimed : citations[0];
    if (!url || !/^https?:\/\//.test(url)) return null;

    const work = typeof parsed.work === "string" ? parsed.work : (claim.work ?? "");
    if (work.trim() === "") return null;

    return {
      provider: "xai_search",
      externalId: url,
      author: typeof parsed.author === "string" ? parsed.author : (claim.author ?? ""),
      work,
      locus: claim.locus,
      date: typeof parsed.date === "string" ? parsed.date : claim.date,
      lang: claim.lang ?? "en",
      // Never an excerpt: a search result is not a text.
      text: null,
      translation: null,
      url,
      trust: TRUST.search,
      license: null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function createSearchProvider(): SourceProvider {
  return {
    id: "xai_search",
    cacheText: false,

    verify: liveSearch,

    async search(query: string): Promise<SourceCandidate[]> {
      const candidate = await liveSearch({ work: query });
      return candidate ? [candidate] : [];
    },
  };
}

/** True when the fallback can run at all. Absent credentials simply skip it. */
export function searchProviderAvailable(): boolean {
  return XAI_API_KEY !== "";
}
