// Wikimedia Commons: openly licensed images, pronunciation audio and video.
//
// No API key and no account. Every file carries machine-readable license and
// author metadata, which is what lets a file be shown with the attribution its
// license demands. A file whose license is not recognisably open is dropped: an
// unlabelled image is a copyright problem, not a fallback.

import { getJSON, htmlToText } from "./http";
import type { MediaCandidate, MediaClaim, MediaKind, MediaProvider } from "./types";

const API = "https://commons.wikimedia.org/w/api.php";

/** CirrusSearch file-type filters, by the kind the lesson asks for. */
const FILETYPE: Record<MediaKind, string> = {
  image: "bitmap",
  audio: "audio",
  video: "video",
};

/** How many of each kind are worth showing. Pictures help most; one clip is enough. */
const WANTED: Record<MediaKind, number> = { image: 3, audio: 2, video: 1 };

/** Largest original offered as a video, so a lesson never points at a 400 MB file. */
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

/**
 * Licenses Commons accepts are all free, but the short name is free text. Only
 * the families below are shown; anything else is skipped rather than guessed at.
 */
const OPEN_LICENSE =
  /^(cc[\s-]?by|cc0|cc[\s-]?zero|public domain|pd\b|gfdl|attribution|copyrighted free use)/i;

type ExtValue = { value?: string };
type ImageInfo = {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
  extmetadata?: Record<string, ExtValue | undefined>;
};
type Page = { title?: string; index?: number; imageinfo?: ImageInfo[] };
type QueryResponse = { query?: { pages?: Page[] } };

const ALLOWED_MIME: Record<MediaKind, RegExp> = {
  image: /^image\/(jpeg|png|gif|webp|svg\+xml)$/,
  audio: /^(audio\/(ogg|mpeg|wav|x-wav|flac|webm)|application\/ogg)$/,
  video: /^(video\/(webm|ogg|mp4)|application\/ogg)$/,
};

function meta(info: ImageInfo, key: string): string {
  return (info.extmetadata?.[key]?.value ?? "").trim();
}

/** Commons wraps artist and description in HTML; the block stores text. */
function plain(html: string, max: number): string {
  return htmlToText(html).replace(/\s+/g, " ").slice(0, max).trim();
}

export function toCandidate(page: Page, kind: MediaKind): MediaCandidate | null {
  const info = page.imageinfo?.[0];
  const title = page.title;
  if (!info || !title || !info.url || !info.descriptionurl) return null;

  const license = plain(meta(info, "LicenseShortName"), 120);
  if (!OPEN_LICENSE.test(license)) return null;
  // A personality or trademark restriction is a reason not to put the file
  // next to a lesson, even when the copyright license is open.
  if (meta(info, "Restrictions") !== "") return null;

  const mime = (info.mime ?? "").toLowerCase();
  if (!ALLOWED_MIME[kind].test(mime)) return null;
  if (kind === "video" && (info.size ?? 0) > MAX_VIDEO_BYTES) return null;

  const author = plain(meta(info, "Artist"), 200);
  // Attribution is part of the license. No author, no show.
  if (!author) return null;

  const name = title
    .replace(/^File:/, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/_/g, " ");
  const description = plain(meta(info, "ImageDescription"), 400);
  const licenseUrl = meta(info, "LicenseUrl");

  return {
    mediaId: `commons:${title}`,
    provider: "commons",
    kind,
    title: name,
    url: info.url,
    ...(kind === "image" && info.thumburl ? { thumb: info.thumburl } : {}),
    mime,
    ...(kind !== "audio" && info.width && info.height
      ? { width: info.width, height: info.height }
      : {}),
    pageUrl: info.descriptionurl,
    author,
    license,
    ...(/^https?:\/\//i.test(licenseUrl) ? { licenseUrl } : {}),
    ...(description ? { description } : {}),
  };
}

async function search(query: string, kind: MediaKind): Promise<MediaCandidate[] | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: "12",
    gsrsearch: `${query} filetype:${FILETYPE[kind]}`,
    prop: "imageinfo",
    iiprop: "url|mime|mediatype|size|extmetadata",
    iiurlwidth: "640",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|ImageDescription|Restrictions",
  });
  const data = await getJSON<QueryResponse>(`${API}?${params}`);
  if (!data) return null;

  const pages = [...(data.query?.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const out: MediaCandidate[] = [];
  for (const page of pages) {
    const candidate = toCandidate(page, kind);
    if (candidate) out.push(candidate);
    if (out.length >= WANTED[kind]) break;
  }
  return out;
}

export function createCommonsProvider(): MediaProvider {
  return {
    id: "commons",

    async find(claim: MediaClaim): Promise<MediaCandidate[] | null> {
      const query = claim.query.trim();
      if (query === "") return [];
      const kinds: MediaKind[] =
        claim.kinds && claim.kinds.length > 0 ? claim.kinds : ["image", "audio", "video"];

      const results = await Promise.all(
        kinds.map((kind) =>
          search(kind === "audio" && claim.lang ? `${claim.lang} ${query}` : query, kind),
        ),
      );
      // Every request failing is an outage, not an empty result.
      if (results.every((r) => r === null)) return null;

      const seen = new Set<string>();
      const out: MediaCandidate[] = [];
      for (const list of results) {
        for (const c of list ?? []) {
          if (seen.has(c.mediaId)) continue;
          seen.add(c.mediaId);
          out.push(c);
        }
      }
      return out;
    },
  };
}
