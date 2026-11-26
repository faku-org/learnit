// Supplementary media for a topic: pictures, pronunciation audio, a clip.
//
// Same shape as the source pipeline: providers return files they actually found
// under a license they actually read, and the result lands in a shared cache so
// the second student on "Greetings" pays nothing. It is deliberately outside the
// exercise-generation path: a lesson asks for media after it has rendered, and a
// provider that is down costs the lesson nothing but the extra panel.

import type { Db } from "mongodb";
import type { DomainSpec, MediaProviderId } from "../domains";
import { createCommonsProvider } from "./commons";
import { createYouTubeProvider } from "./youtube";
import type { MediaCandidate, MediaClaim, MediaProvider } from "./types";

export type { MediaCandidate, MediaClaim, MediaProvider } from "./types";

const FACTORIES: Record<MediaProviderId, () => MediaProvider> = {
  commons: createCommonsProvider,
  youtube: createYouTubeProvider,
};

/** Providers the subject opted into, in order. A subject with none gets no media and no network calls. */
export function mediaChain(spec: DomainSpec): MediaProvider[] {
  return spec.mediaProviders.map((id) => FACTORIES[id]());
}

// ── Cache ─────────────────────────────────────────────────────────────────────

/** Verified results stay valid for a month; licenses and files change rarely. */
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** An answered-but-empty query is retried sooner, so a newly uploaded file can turn up. */
const MISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;

type StoredQuery = {
  key: string;
  refs: MediaCandidate[];
  verifiedAt: number;
};

export async function ensureMediaIndexes(db: Db): Promise<void> {
  await db.collection("media").createIndex({ mediaId: 1 }, { unique: true }).catch(() => {});
  await db.collection("media_queries").createIndex({ key: 1 }, { unique: true }).catch(() => {});
}

function queryKey(claim: MediaClaim, spec: DomainSpec): string {
  return JSON.stringify([
    spec.mediaProviders,
    claim.query.trim().toLowerCase(),
    [...(claim.kinds ?? [])].sort(),
    (claim.lang ?? "").toLowerCase(),
    claim.youtubeId ?? "",
  ]);
}

/**
 * Verified media for a claim, from the cache or the provider chain.
 *
 * Never throws. An unreachable provider yields what the others found, and when
 * every one was unreachable nothing is cached, so the next lesson tries again.
 */
export async function resolveMedia(
  db: Db,
  claim: MediaClaim,
  spec: DomainSpec,
): Promise<MediaCandidate[]> {
  const chain = mediaChain(spec);
  if (chain.length === 0 || claim.query.trim() === "") return [];

  const key = queryKey(claim, spec);
  try {
    const hit = (await db.collection("media_queries").findOne({ key })) as StoredQuery | null;
    if (hit) {
      const ttl = hit.refs.length > 0 ? HIT_TTL_MS : MISS_TTL_MS;
      if (Date.now() - hit.verifiedAt < ttl) return hit.refs;
    }
  } catch {
    // A cache that cannot be read is a cache miss.
  }

  const seen = new Set<string>();
  const refs: MediaCandidate[] = [];
  let answered = false;
  for (const provider of chain) {
    // YouTube has no search: it only has something to say about a proposed id.
    if (provider.id === "youtube" && !claim.youtubeId) continue;
    let found: MediaCandidate[] | null = null;
    try {
      found = await provider.find(claim);
    } catch {
      found = null;
    }
    if (found === null) continue;
    answered = true;
    for (const ref of found) {
      if (seen.has(ref.mediaId)) continue;
      seen.add(ref.mediaId);
      refs.push(ref);
    }
  }
  if (!answered) return [];

  try {
    await db
      .collection("media_queries")
      .updateOne({ key }, { $set: { key, refs, verifiedAt: Date.now() } }, { upsert: true });
    for (const ref of refs) {
      await db
        .collection("media")
        .updateOne(
          { mediaId: ref.mediaId },
          { $set: { ...ref, verifiedAt: Date.now() }, $inc: { usageCount: 1 } },
          { upsert: true },
        );
    }
  } catch {
    // Failing to remember a result must not lose it.
  }
  return refs;
}

/**
 * What to look for given a topic. For a language the topic name is already in
 * the target language, which is exactly what a pronunciation recording is
 * titled; the subject doubles as the audio language.
 */
export function searchTerms(
  topic: { name: string; concepts?: string[] },
  subject: string,
  isLanguage: boolean,
): MediaClaim {
  const name = topic.name.trim();
  return isLanguage
    ? { query: name, lang: subject, kinds: ["image", "audio"] }
    : { query: name, kinds: ["image", "video"] };
}
