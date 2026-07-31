// Sources are retrieved and verified, never taken on the generator's word.
//
// An LLM asked for a primary source will invent one with a plausible
// attribution, and instructing it not to does not work. So the generator only
// ever proposes a CLAIM. A provider then either finds that citation in a real
// corpus and returns the real text, or it does not and the block is dropped.
// Nothing in between reaches the student.

import type { SourceProviderId } from "../domains";

/** What the generator proposed. Every field is a hint, none is trusted. */
export type SourceClaim = {
  author?: string;
  work?: string;
  /** Citation within the work: "1.22", "Book III, ch. 4", a DOI, an arXiv id. */
  locus?: string;
  date?: string;
  lang?: string;
  /** The opening words the generator intends to quote. Used to locate a passage. */
  passage?: string;
};

/** What a provider found. `text` is the real retrieved text or nothing at all. */
export type SourceCandidate = {
  provider: SourceProviderId;
  /** Stable identifier within the provider: a CTS URN, a DOI, a page title. */
  externalId: string;
  author: string;
  work: string;
  locus?: string;
  date?: string;
  /** BCP-47-ish language tag of `text`. */
  lang: string;
  /**
   * The retrieved text, or null when the provider can only confirm that the
   * work exists. A metadata-only candidate still beats a fabricated quotation:
   * the student gets a citation they can follow rather than one that is made up.
   */
  text: string | null;
  translation?: string | null;
  url: string;
  license: string | null;
  /**
   * How much to believe this. A structured corpus that resolved an exact
   * citation scores high; a general web search that merely found the phrase
   * scores low, and the pipeline prefers the former.
   */
  trust: number;
};

export type SourceProvider = {
  id: SourceProviderId;
  /**
   * Whether the retrieved text may be stored in the shared `sources` cache.
   *
   * Open question #4 from the design, answered here: public-domain and
   * open-licensed corpora (Perseus, Wikisource, Gutenberg, arXiv abstracts) are
   * cacheable and redistributable. Bibliographic services (Crossref, OpenAlex)
   * return publisher-owned abstracts, so only their METADATA is stored and the
   * block renders as a citation with a link rather than an excerpt.
   */
  cacheText: boolean;
  /** Confirm a proposed citation exists and return the real text. */
  verify(claim: SourceClaim): Promise<SourceCandidate | null>;
  /** Find candidates when the claim is too vague to resolve directly. */
  search(query: string, opts: { lang?: string; era?: string }): Promise<SourceCandidate[]>;
};

/** Trust weights, so the chain prefers a resolved citation over a lucky search hit. */
export const TRUST = {
  /** Exact citation resolved in a canonical corpus. */
  canonical: 1.0,
  /** Work located and text retrieved, but the locus was approximate. */
  located: 0.8,
  /** Existence and metadata confirmed; no text retrieved. */
  metadata: 0.6,
  /** A general web search found it. Verified against a structured provider if possible. */
  search: 0.3,
} as const;
