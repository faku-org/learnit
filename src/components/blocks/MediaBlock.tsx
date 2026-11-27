import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MediaRef } from "@shared/blocks";

const PROVIDER_NAMES: Record<MediaRef["provider"], string> = {
  commons: "Wikimedia Commons",
  youtube: "YouTube",
};

function ImageMedia({ refData }: { refData: MediaRef }) {
  if (!refData.url) return null;
  return (
    <img
      src={refData.thumb ?? refData.url}
      alt={refData.description ?? refData.title}
      width={refData.width}
      height={refData.height}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="mx-auto max-h-72 w-auto max-w-full rounded-md object-contain"
    />
  );
}

function AudioMedia({ refData }: { refData: MediaRef }) {
  if (!refData.url) return null;
  return (
    <audio
      controls
      preload="none"
      src={refData.url}
      aria-label={refData.title}
      className="w-full"
    />
  );
}

function VideoMedia({ refData }: { refData: MediaRef }) {
  if (!refData.url) return null;
  return (
    <video
      controls
      preload="none"
      src={refData.url}
      aria-label={refData.title}
      className="mx-auto max-h-72 w-full rounded-md"
    />
  );
}

/** A poster-less button until clicked, then a privacy-enhanced (`youtube-nocookie.com`) embed. */
function YouTubeMedia({ refData }: { refData: MediaRef }) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  if (!refData.youtubeId) return null;

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-md bg-secondary text-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Play size={28} aria-hidden />
        <span className="text-sm font-medium">{t("media.playVideo")}</span>
        <span className="px-4 text-center text-[11px] text-muted-foreground">
          {t("media.youtubeNotice")}
        </span>
      </button>
    );
  }

  return (
    <iframe
      src={`https://www.youtube-nocookie.com/embed/${refData.youtubeId}?autoplay=1&rel=0`}
      title={refData.title}
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      // YouTube refuses to play (Error 153) without a Referer, so `no-referrer` is not an option;
      // the origin alone is sent, never a path or query.
      referrerPolicy="strict-origin-when-cross-origin"
      // The embed is cross-origin (youtube-nocookie.com), so `allow-same-origin` only lets the
      // player keep its own storage and cannot lift this sandbox. Tested in a real browser:
      // without it the player never renders (opaque origin, no storage).
      sandbox="allow-scripts allow-same-origin allow-presentation"
      className="aspect-video w-full rounded-md"
    />
  );
}

function Attribution({ refData }: { refData: MediaRef }) {
  const { t } = useTranslation();
  return (
    <figcaption className="space-y-0.5 text-[11px] text-muted-foreground">
      <p className="text-xs font-medium text-foreground">{refData.title}</p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {refData.author && <span>{t("media.by", { author: refData.author })}</span>}
        {refData.licenseUrl ? (
          <a
            href={refData.licenseUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline underline-offset-2 transition-colors hover:text-foreground"
          >
            {refData.license}
          </a>
        ) : (
          <span>{refData.license}</span>
        )}
        <a
          href={refData.pageUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <ExternalLink size={10} aria-hidden />
          {t("media.viewOn", { provider: PROVIDER_NAMES[refData.provider] })}
        </a>
      </p>
    </figcaption>
  );
}

function Player({ refData }: { refData: MediaRef }) {
  if (refData.kind === "image") return <ImageMedia refData={refData} />;
  if (refData.kind === "audio") return <AudioMedia refData={refData} />;
  if (refData.provider === "youtube") return <YouTubeMedia refData={refData} />;
  return <VideoMedia refData={refData} />;
}

/**
 * A picture, a recording or a clip, shown with the attribution its license asks for.
 *
 * Nothing loads until it is needed: images are lazy, audio and video use
 * `preload="none"`, and a YouTube video is a button until clicked. So opening a
 * lesson sends no request to a third party for media the student never plays.
 * Every URL here was whitelisted by the server-side sanitizer.
 */
export function MediaBlock({ refData }: { refData: MediaRef }) {
  return (
    <figure className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
      <Player refData={refData} />
      <Attribution refData={refData} />
    </figure>
  );
}
