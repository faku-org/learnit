// YouTube, as an embed and nothing else.
//
// There is no search here and no scraping: a video only appears when someone
// supplied its id, and the id is checked against YouTube's own oEmbed endpoint
// (no key, no account), which answers 200 only for a video that exists and
// allows embedding. The client renders it through youtube-nocookie.com behind a
// click, so opening a lesson sends nothing to Google.

import { getJSON } from "./http";
import type { MediaCandidate, MediaClaim, MediaProvider } from "./types";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

type OEmbed = { title?: string; author_name?: string };

/** Lowercase, accent-free words of three letters or more. */
function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3),
  );
}

export function createYouTubeProvider(): MediaProvider {
  return {
    id: "youtube",

    async find(claim: MediaClaim): Promise<MediaCandidate[] | null> {
      const id = claim.youtubeId ?? "";
      if (!YOUTUBE_ID.test(id)) return [];

      const watch = `https://www.youtube.com/watch?v=${id}`;
      const data = await getJSON<OEmbed>(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`,
      );
      // getJSON cannot tell "unreachable" from "not found". A bad id is the
      // common case, so it is treated as nothing rather than as an outage.
      if (!data?.title || !data.author_name) return [];

      // An id that exists proves a video exists, not that it is about the
      // topic. Requiring one shared word between the title and the query is a
      // cheap guard against a plausible but unrelated id.
      const wanted = words(claim.query);
      if (wanted.size > 0) {
        // The title only: a channel called "Learn German" would otherwise vouch for any video.
        const have = words(data.title);
        if (![...wanted].some((w) => have.has(w))) return [];
      }

      return [
        {
          mediaId: `youtube:${id}`,
          provider: "youtube",
          kind: "video",
          title: data.title,
          youtubeId: id,
          pageUrl: watch,
          author: data.author_name,
          // YouTube's own terms, not an open license: the embed is the only
          // permitted use, and the player carries the channel's attribution.
          license: "Standard YouTube License (embed only)",
        },
      ];
    },
  };
}
