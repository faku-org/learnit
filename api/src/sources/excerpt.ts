// Locating a claimed passage inside a retrieved work.
//
// This is where fabrication is actually caught. A generator will happily
// attribute a sentence it invented to a real book: the citation resolves, the
// work is genuine, and the quotation is not in it. So a claimed passage must be
// FOUND in the retrieved text before it is shown. When it cannot be, the block
// degrades to a citation without an excerpt rather than quietly quoting
// something adjacent.

import { normalizeWhitespace } from "./http";

const MAX_EXCERPT = 1200;

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/**
 * Comparison form: case, accents, punctuation, and quote style all discarded,
 * paired with a map from each folded character back to its index in the
 * original.
 *
 * The map is the point. Folding is not length-preserving \u2014 "don't" becomes two
 * words, "\u00c9" becomes one character \u2014 so a match position in the folded string
 * cannot be recovered by counting words or characters afterwards. Recording the
 * origin of every character as it is produced is the only way to cut the
 * excerpt at the place that actually matched.
 */
function foldWithMap(text: string): { folded: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;

  for (let i = 0; i < text.length; i++) {
    const normalized = text[i].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized === "" || !WORD_CHARACTER.test(normalized)) {
      pendingSpace = chars.length > 0;
      continue;
    }
    if (pendingSpace) {
      chars.push(" ");
      map.push(i);
      pendingSpace = false;
    }
    for (const c of normalized) {
      chars.push(c);
      map.push(i);
    }
  }
  return { folded: chars.join(""), map };
}

/** Comparison form only, for the needle. */
function fold(text: string): string {
  return foldWithMap(text).folded;
}

/**
 * Where a claimed passage begins in a text, or -1.
 *
 * Matched on the folded forms and then mapped back, so an edition that spells
 * "œ" as "oe" or uses curly quotes still matches. Falls back to the first six
 * words, because a generator usually recalls an opening correctly even when it
 * paraphrases the rest.
 */
export function locatePassage(text: string, passage: string): number {
  const { folded: foldedText, map } = foldWithMap(text);
  const foldedPassage = fold(passage);
  if (foldedPassage.length < 8) return -1;

  let at = foldedText.indexOf(foldedPassage);
  if (at === -1) {
    // A generator usually recalls an opening correctly and paraphrases from
    // there, so the anchor shortens until it matches. Being forgiving here is
    // safe: what gets shown is always the REAL text at the anchor, so a loose
    // match costs at worst a slightly misplaced excerpt, while being strict
    // costs a legitimate source its block.
    const words = foldedPassage.split(" ");
    for (let take = Math.min(8, words.length); take >= 4 && at === -1; take--) {
      const anchor = words.slice(0, take).join(" ");
      if (anchor.length < 16) break;
      at = foldedText.indexOf(anchor);
    }
  }
  return at === -1 ? -1 : (map[at] ?? -1);
}

/**
 * A readable excerpt around an offset, cut at sentence boundaries where it can
 * be. Returns null when there is nothing substantial to show.
 */
export function excerptAround(text: string, at: number): string | null {
  const slice = text.slice(Math.max(0, at), Math.max(0, at) + MAX_EXCERPT);
  if (slice.trim().length < 40) return null;
  // Prefer to end on a sentence rather than mid-word.
  const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("· "), slice.lastIndexOf("\n"));
  const cut = lastStop > MAX_EXCERPT * 0.4 ? slice.slice(0, lastStop + 1) : slice;
  return normalizeWhitespace(cut);
}

/** The opening of a work, for when no specific passage was claimed. */
export function openingExcerpt(text: string): string | null {
  return excerptAround(text, 0);
}

/**
 * The excerpt a claim earns from a retrieved text.
 *
 * A claimed passage that is not in the text returns null: the citation is real
 * but the quotation is not, and that is precisely the case this pipeline exists
 * to catch.
 */
export function excerptFor(text: string, passage: string | undefined): string | null {
  if (!passage || passage.trim() === "") return openingExcerpt(text);
  const at = locatePassage(text, passage);
  return at === -1 ? null : excerptAround(text, at);
}
