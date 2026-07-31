// The verification pipeline.
//
// The generator proposes `{ kind: "source", claim: {...} }`. This module turns
// that into `{ kind: "source", ref: {...} }` carrying real retrieved text, or
// drops it. Nothing else in the system decides whether a citation is real.
//
// Cost is amortized exactly like the exercise bank: a verified source lands in
// the shared `sources` collection keyed by provider and external id, so the
// second exercise to cite Thucydides 1.22 pays nothing. That matters, because
// this runs inside exercise generation.

import type { Db } from "mongodb";
import type { DomainSpec, SourceProviderId } from "../domains";
import { generateJSON, FLASH_MODEL } from "../llm";
import { createPerseusProvider } from "./perseus";
import { createWikisourceProvider } from "./wikisource";
import { createGutenbergProvider } from "./gutenberg";
import { createArxivProvider, createCrossrefProvider, createOpenAlexProvider } from "./academic";
import { createSearchProvider, searchProviderAvailable } from "./search";
import type { SourceCandidate, SourceClaim, SourceProvider } from "./types";

export type { SourceCandidate, SourceClaim, SourceProvider } from "./types";
export { TRUST } from "./types";

// ── Registry ──────────────────────────────────────────────────────────────────

type Factory = (nativeLanguage: string) => SourceProvider;

const FACTORIES: Partial<Record<SourceProviderId, Factory>> = {
  perseus: (lang) => createPerseusProvider(lang),
  wikisource: (lang) => createWikisourceProvider(lang),
  gutenberg: () => createGutenbergProvider(),
  crossref: () => createCrossrefProvider(),
  openalex: () => createOpenAlexProvider(),
  arxiv: () => createArxivProvider(),
  xai_search: () => createSearchProvider(),
  // duckduckgo has no usable API; the spec may declare it, and it resolves to
  // nothing rather than to a guess.
};

/**
 * The chain a subject consults, in order, plus the general fallback last.
 *
 * `DomainSpec.sourceProviders` is a union merged root-to-leaf, so an
 * ancient-history path arrives here with Perseus ahead of Wikisource and a
 * physics path with Crossref ahead of arXiv. Ids without an implementation are
 * skipped rather than treated as failures.
 */
export function providerChain(spec: DomainSpec, nativeLanguage: string): SourceProvider[] {
  const chain: SourceProvider[] = [];
  for (const id of spec.sourceProviders) {
    const factory = FACTORIES[id];
    if (factory) chain.push(factory(nativeLanguage));
  }
  if (searchProviderAvailable() && !chain.some((p) => p.id === "xai_search")) {
    chain.push(createSearchProvider());
  }
  return chain;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

/**
 * The cache is only a cache if the lookup is cheap, and the uniqueness
 * constraint is what stops two concurrent generations citing the same passage
 * from writing it twice. Idempotent, run at startup.
 */
export async function ensureSourceIndexes(db: Db): Promise<void> {
  const col = db.collection("sources");
  await col.createIndex({ provider: 1, externalId: 1 }, { unique: true }).catch(() => {});
  await col.createIndex({ usageCount: -1 }).catch(() => {});
}

type StoredSource = {
  _id?: unknown;
  provider: SourceProviderId;
  externalId: string;
  author: string;
  work: string;
  locus?: string;
  date?: string;
  lang: string;
  text: string | null;
  translation: string | null;
  /** Machine translations, by explanation language. See `translateFor`. */
  translations?: Record<string, string>;
  url: string;
  license: string | null;
  trust: number;
  verifiedAt: string;
  usageCount: number;
};

function cacheKey(candidate: SourceCandidate): { provider: string; externalId: string } {
  return { provider: candidate.provider, externalId: candidate.externalId };
}

async function readCache(db: Db, key: SourceClaimKey): Promise<StoredSource | null> {
  return db.collection("sources").findOne(key) as Promise<StoredSource | null>;
}

type SourceClaimKey = { provider: string; externalId: string };

/**
 * Store a verified source and return its id.
 *
 * `cacheText` is the licensing gate: Crossref and OpenAlex results are stored
 * as metadata only, because the abstract belongs to the publisher and this
 * collection is shared across every user.
 */
async function writeCache(
  db: Db,
  candidate: SourceCandidate,
  cacheText: boolean,
): Promise<StoredSource> {
  const now = new Date().toISOString();
  const key = cacheKey(candidate);
  const doc: Omit<StoredSource, "_id" | "usageCount"> = {
    ...key,
    provider: candidate.provider,
    author: candidate.author,
    work: candidate.work,
    locus: candidate.locus,
    date: candidate.date,
    lang: candidate.lang,
    text: cacheText ? candidate.text : null,
    translation: cacheText ? (candidate.translation ?? null) : null,
    url: candidate.url,
    license: candidate.license,
    trust: candidate.trust,
    verifiedAt: now,
  };
  await db.collection("sources").updateOne(
    key,
    { $set: doc, $setOnInsert: { usageCount: 0 }, $inc: { usageCount: 1 } },
    { upsert: true },
  );
  const stored = await readCache(db, key);
  return stored ?? { ...doc, usageCount: 1 };
}

// ── Translation ───────────────────────────────────────────────────────────────

const TRANSLATABLE_MAX = 1500;

/**
 * A Greek passage is useless to a student who cannot read Greek, and Perseus
 * only sometimes holds a facing translation. When it does not, one is generated
 * and labelled as machine-made — the ORIGINAL is verified and real, and the
 * translation is presented as an aid rather than as an edition.
 *
 * Cached on the source document, so a passage is translated once per language
 * for every student who ever draws it.
 */
async function translateFor(
  db: Db,
  stored: StoredSource,
  nativeLanguage: string,
): Promise<{ translation: string | null; machine: boolean }> {
  if (stored.translation) return { translation: stored.translation, machine: false };
  if (!stored.text || stored.text.length > TRANSLATABLE_MAX) {
    return { translation: null, machine: false };
  }

  const key = nativeLanguage.toLowerCase();
  const cached = stored.translations?.[key];
  if (cached) return { translation: cached, machine: true };

  try {
    const result = await generateJSON<{ translation?: unknown }>(
      `You translate primary source texts for a student reading them in a course.
Translate faithfully and plainly. Do not paraphrase, do not modernize, do not
explain. Return the translation and nothing else.`,
      `Translate this passage into ${nativeLanguage}.

Source language: ${stored.lang}
Work: ${stored.work}${stored.author ? ` by ${stored.author}` : ""}

${stored.text}

Return ONLY valid JSON: { "translation": "the translation" }`,
      { temperature: 0.2, maxTokens: 900, model: FLASH_MODEL },
    );
    const translation = typeof result.translation === "string" ? result.translation.trim() : "";
    if (translation === "") return { translation: null, machine: false };

    await db.collection("sources").updateOne(
      { provider: stored.provider, externalId: stored.externalId },
      { $set: { [`translations.${key}`]: translation } },
    ).catch(() => {});
    return { translation, machine: true };
  } catch {
    return { translation: null, machine: false };
  }
}

// ── Verification ──────────────────────────────────────────────────────────────

export type ResolvedSource = {
  sourceId: string;
  provider: SourceProviderId;
  author: string;
  work: string;
  locus?: string;
  date?: string;
  lang: string;
  text: string | null;
  translation: string | null;
  translationMachine: boolean;
  url: string;
  license: string | null;
  verified: true;
  showTranslation: boolean;
};

/** Whether a claim says enough to be looked up at all. */
function isUsableClaim(claim: SourceClaim): boolean {
  return Boolean((claim.author ?? "").trim() || (claim.work ?? "").trim());
}

/**
 * Run a claim down the chain and return the best candidate, or null.
 *
 * The chain is ordered by the domain spec, but a later provider that resolves
 * an exact citation still beats an earlier one that could only confirm the work
 * exists. So every provider is consulted until one returns a canonical hit, and
 * the highest-trust result wins.
 */
export async function verifyClaim(
  db: Db,
  claim: SourceClaim,
  spec: DomainSpec,
  nativeLanguage: string,
): Promise<ResolvedSource | null> {
  if (!isUsableClaim(claim)) return null;

  const chain = providerChain(spec, nativeLanguage);
  let best: { candidate: SourceCandidate; provider: SourceProvider } | null = null;

  for (const provider of chain) {
    const candidate = await provider.verify(claim).catch(() => null);
    if (!candidate) continue;
    if (!best || candidate.trust > best.candidate.trust) best = { candidate, provider };
    // A canonical hit with real text cannot be improved on; stop paying for
    // requests in the generation path.
    if (candidate.trust >= 1 && candidate.text) break;
  }

  if (!best) return null;

  const stored = await writeCache(db, best.candidate, best.provider.cacheText);
  const { translation, machine } = stored.text && stored.lang !== languageCode(nativeLanguage)
    ? await translateFor(db, stored, nativeLanguage)
    : { translation: stored.translation, machine: false };

  return {
    sourceId: `${stored.provider}:${stored.externalId}`,
    provider: stored.provider,
    author: stored.author,
    work: stored.work,
    locus: stored.locus,
    date: stored.date,
    lang: stored.lang,
    text: stored.text,
    translation,
    translationMachine: machine,
    url: stored.url,
    license: stored.license,
    verified: true,
    showTranslation: Boolean(translation),
  };
}

const LANGUAGE_CODES: Record<string, string> = {
  english: "en", spanish: "es", french: "fr", german: "de", italian: "it",
  portuguese: "pt", dutch: "nl",
};

function languageCode(nativeLanguage: string): string {
  return LANGUAGE_CODES[nativeLanguage.toLowerCase()] ?? "en";
}

// ── Block resolution ──────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readClaim(raw: Record<string, unknown>): SourceClaim | null {
  const body = isRecord(raw.claim) ? raw.claim : isRecord(raw.ref) ? raw.ref : null;
  if (!body) return null;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
  return {
    author: str(body.author),
    work: str(body.work),
    locus: str(body.locus),
    date: str(body.date),
    lang: str(body.lang),
    passage: str(body.passage),
  };
}

export type ResolutionOutcome = {
  /** The block array with source claims replaced by verified refs. */
  blocks: unknown[];
  /** How many source blocks the generator proposed. */
  proposed: number;
  /** How many survived verification. */
  verified: number;
};

/**
 * Replace every source claim in a generated block array with a verified
 * reference, dropping the ones that cannot be confirmed.
 *
 * Runs BEFORE `sanitizeBlocks`, so what reaches the shared bank is already
 * retrieved text rather than the generator's proposal. A block that fails
 * verification is removed entirely: the design's rule is that a source which
 * cannot be verified never reaches the student, and a half-shown citation is
 * still a citation the student would believe.
 */
export async function resolveSourceBlocks(
  db: Db,
  blocks: unknown,
  spec: DomainSpec,
  nativeLanguage: string,
): Promise<ResolutionOutcome> {
  if (!Array.isArray(blocks)) return { blocks: [], proposed: 0, verified: 0 };

  const out: unknown[] = [];
  let proposed = 0;
  let verified = 0;

  for (const block of blocks) {
    if (!isRecord(block) || block.kind !== "source") {
      out.push(block);
      continue;
    }
    proposed++;
    const claim = readClaim(block);
    if (!claim) continue;

    const resolved = await verifyClaim(db, claim, spec, nativeLanguage).catch(() => null);
    if (!resolved) continue;

    verified++;
    out.push({ kind: "source", ref: resolved });
  }

  return { blocks: out, proposed, verified };
}
