// Shared HTTP plumbing for the source providers.
//
// Retrieval sits in the exercise-generation path, so every request is bounded.
// A provider that is down, rate-limiting, or simply slow must cost a few seconds
// and then get out of the way — the chain moves to the next provider and, if
// they all fail, the exercise is generated without the block rather than not at
// all.

const DEFAULT_TIMEOUT_MS = 6000;

/**
 * Identifying a client is a condition of use on Wikimedia and Crossref, and
 * being anonymous is how you end up rate-limited at the worst moment.
 */
const USER_AGENT =
  "LearnIt/0.1 (learning app; source verification; https://github.com/learnit) bun-fetch";

export type FetchOptions = {
  timeoutMs?: number;
  accept?: string;
  /** Contact address Crossref's polite pool asks for. */
  mailto?: string;
};

async function fetchWithTimeout(url: string, opts: FetchOptions): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        ...(opts.accept ? { Accept: opts.accept } : {}),
      },
    });
    return response.ok ? response : null;
  } catch {
    // Timeout, DNS failure, TLS failure: all the same to the caller.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Body as text, or null on any failure. Never throws. */
export async function getText(url: string, opts: FetchOptions = {}): Promise<string | null> {
  const response = await fetchWithTimeout(url, opts);
  return response ? response.text().catch(() => null) : null;
}

/** Body parsed as JSON, or null on any failure. Never throws. */
export async function getJSON<T>(url: string, opts: FetchOptions = {}): Promise<T | null> {
  const response = await fetchWithTimeout(url, { accept: "application/json", ...opts });
  if (!response) return null;
  return response.json().then((v) => v as T).catch(() => null);
}

// ── Text extraction ───────────────────────────────────────────────────────────

/** Container classes that carry site chrome rather than the work itself. */
const CHROME_PATTERN =
  /class="[^"]*(?:ws-noexport|noprint|navigation|catlinks|printfooter|mw-editsection|header_notes|licenseContainer|dpl_|mw-references)[^"]*"/i;

/**
 * Plain text from an HTML fragment.
 *
 * Regex rather than a parser because the output is never re-rendered as markup:
 * it lands in a text node. The goal is a faithful reading of the work, not a
 * faithful reproduction of the page.
 */
export function htmlToText(html: string): string {
  let s = html;
  // Whole subtrees that never contain the work.
  s = s.replace(/<(script|style|table|sup|figure|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  // Chrome containers, matched shallowly: a div whose open tag carries one of
  // the classes above, up to its first closing div.
  s = s.replace(/<div\b[^>]*>/gi, (tag) => (CHROME_PATTERN.test(tag) ? "<div data-drop>" : tag));
  s = s.replace(/<div data-drop>[\s\S]*?<\/div>/gi, " ");
  // Block-level tags become paragraph breaks so the text keeps its shape.
  s = s.replace(/<\/(p|div|br|li|h[1-6]|blockquote)\s*\/?>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  return normalizeWhitespace(decodeEntities(s));
}

/** Plain text from a TEI or Atom XML fragment. */
export function xmlToText(xml: string): string {
  const withBreaks = xml
    .replace(/<\/(p|l|div|lg|ab|seg)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return normalizeWhitespace(decodeEntities(withBreaks));
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return " ";
  try {
    return String.fromCodePoint(code);
  } catch {
    return " ";
  }
}

/**
 * Collapse runs of whitespace while keeping paragraph breaks, which carry the
 * shape of a text: verse lines, speeches, and chapter divisions are all lost if
 * every newline run becomes one newline.
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    // Trim each line without touching the blank lines between them.
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The first XML element's text content, by tag name. */
export function tagText(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? normalizeWhitespace(decodeEntities(match[1].replace(/<[^>]+>/g, " "))) : null;
}
