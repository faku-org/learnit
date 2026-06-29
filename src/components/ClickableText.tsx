import { useState, useRef, useEffect, useCallback } from "react";
import { Volume2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { translateText } from "@/lib/api";

export type WordMeaning = {
  word: string;
  infinitive: string;
  meaning: string;
};

const LANG_CODES: Record<string, string> = {
  japanese: "ja", german: "de", spanish: "es", french: "fr",
  portuguese: "pt", italian: "it", chinese: "zh", mandarin: "zh",
  korean: "ko", russian: "ru", arabic: "ar", dutch: "nl",
  swedish: "sv", polish: "pl", turkish: "tr", hindi: "hi",
  english: "en",
};

export function toLangCode(lang: string): string {
  return LANG_CODES[lang.toLowerCase()] ?? lang.toLowerCase().slice(0, 2);
}

const API = `http://localhost:${import.meta.env.PUBLIC_API_PORT ?? 3001}`;

// ── TTS audio cache ───────────────────────────────────────────────────────────

const audioCache = new Map<string, HTMLAudioElement>();
let currentAudio: HTMLAudioElement | null = null;

function ttsUrl(text: string, langCode: string) {
  return `${API}/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(langCode)}`;
}

export function preloadSpeech(text: string, langCode: string) {
  const url = ttsUrl(text, langCode);
  if (audioCache.has(url)) return;
  const audio = new Audio(url);
  audio.preload = "auto";
  audioCache.set(url, audio);
}

export function speakText(text: string, langCode: string) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  const url = ttsUrl(text, langCode);
  const audio = audioCache.get(url) ?? new Audio(url);
  currentAudio = audio;
  audio.currentTime = 0;
  audio.play().catch(() => null);
}

// ── Translation localStorage cache ────────────────────────────────────────────

function getCachedWordTranslation(word: string, lang: string): string | null {
  try { return localStorage.getItem(`learnit:tr:word:${lang}:${word}`); } catch { return null; }
}

function setCachedWordTranslation(word: string, lang: string, value: string) {
  try { localStorage.setItem(`learnit:tr:word:${lang}:${word}`, value); } catch { /* quota */ }
}

export function getCachedPhraseTranslation(phrase: string, lang: string): string | null {
  try { return localStorage.getItem(`learnit:tr:phrase:${lang}:${phrase}`); } catch { return null; }
}

export function setCachedPhraseTranslation(phrase: string, lang: string, value: string) {
  try { localStorage.setItem(`learnit:tr:phrase:${lang}:${phrase}`, value); } catch { /* quota */ }
}

// ── Component ─────────────────────────────────────────────────────────────────

function stripPunct(s: string): string {
  return s.replace(/[.,!?;:'"()«»„""[\]{}…、。！？：；「」『』]/g, "").trim();
}

type Popup = {
  word: string;
  x: number;
  y: number;
  meaning: WordMeaning | null;
  fetchedTranslation?: string | null;
  translating?: boolean;
};

type Props = {
  text: string;
  language: string;
  nativeLanguage?: string;
  wordMeanings?: WordMeaning[];
  className?: string;
};

export function ClickableText({ text, language, nativeLanguage = "english", wordMeanings = [], className }: Props) {
  const [popup, setPopup] = useState<Popup | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const langCode = toLangCode(language);

  const meaningMap = new Map<string, WordMeaning>(
    wordMeanings.map((m) => [stripPunct(m.word).toLowerCase(), m]),
  );

  // Preload TTS for the main text and all wordMeaning words
  useEffect(() => {
    const speakable = text.replace(/___/g, "").trim();
    if (speakable) preloadSpeech(speakable, langCode);
    for (const m of wordMeanings) {
      const w = m.word.trim();
      if (w) preloadSpeech(w, langCode);
    }
  // wordMeanings identity changes per render but content is stable per exercise — text is the real key
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, langCode]);

  const handleClick = useCallback(
    (raw: string, e: React.MouseEvent<HTMLSpanElement>) => {
      e.stopPropagation();
      const clean = stripPunct(raw);
      if (!clean) return;

      const rect = (e.currentTarget as HTMLSpanElement).getBoundingClientRect();
      const x = Math.max(70, Math.min(rect.left + rect.width / 2, window.innerWidth - 70));
      const y = rect.bottom + 8;
      const meaning = meaningMap.get(clean.toLowerCase()) ?? null;
      const fetchedTranslation = !meaning ? getCachedWordTranslation(clean, nativeLanguage) : null;

      setPopup({ word: clean, x, y, meaning, fetchedTranslation });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meaningMap, text, nativeLanguage],
  );

  useEffect(() => {
    if (!popup) return;
    const close = (e: PointerEvent) => {
      if (!popupRef.current?.contains(e.target as Node)) setPopup(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [popup]);

  const handleTranslate = useCallback(async () => {
    const word = popup?.word;
    if (!word) return;
    setPopup((p) => (p ? { ...p, translating: true } : null));
    try {
      const result = await translateText({ text: word, targetLanguage: nativeLanguage });
      setCachedWordTranslation(word, nativeLanguage, result.translation);
      setPopup((p) => (p ? { ...p, translating: false, fetchedTranslation: result.translation } : null));
    } catch {
      setPopup((p) => (p ? { ...p, translating: false } : null));
    }
  }, [popup?.word, nativeLanguage]);

  const parts = text.split(/(\s+)/);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return <span key={i}>{part}</span>;
        const clean = stripPunct(part).toLowerCase();
        const hasMeaning = meaningMap.has(clean);
        return (
          <span
            key={i}
            role="button"
            tabIndex={-1}
            onClick={(e) => handleClick(part, e)}
            className={cn(
              "cursor-pointer rounded px-px transition-colors hover:bg-primary/15 hover:text-primary",
              hasMeaning && "underline decoration-dotted decoration-primary/50 underline-offset-3",
            )}
          >
            {part}
          </span>
        );
      })}

      {popup && (
        <div
          ref={popupRef}
          style={{ position: "fixed", left: popup.x, top: popup.y, transform: "translateX(-50%)" }}
          className="z-50 bg-popover border border-border rounded-xl shadow-lg p-3 min-w-35 max-w-62.5 text-left"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-foreground break-all leading-tight">
                {popup.word}
              </span>
              {popup.meaning && popup.meaning.infinitive.toLowerCase() !== popup.word.toLowerCase() && (
                <span className="text-[11px] text-muted-foreground ml-1.5 italic">
                  ({popup.meaning.infinitive})
                </span>
              )}
            </div>
            <button
              onClick={() => speakText(popup.word, langCode)}
              className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors rounded p-0.5 hover:bg-secondary"
              title="Listen"
            >
              <Volume2 size={13} />
            </button>
          </div>

          {popup.meaning ? (
            <p className="text-xs text-foreground/80 mt-1.5 leading-snug">{popup.meaning.meaning}</p>
          ) : popup.translating ? (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Loader2 size={11} className="animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Translating...</span>
            </div>
          ) : popup.fetchedTranslation != null ? (
            <p className="text-xs text-foreground/80 mt-1.5 leading-snug">{popup.fetchedTranslation}</p>
          ) : (
            <button
              onClick={handleTranslate}
              className="text-xs text-primary hover:underline mt-1.5 block"
            >
              Translate
            </button>
          )}
        </div>
      )}
    </span>
  );
}
