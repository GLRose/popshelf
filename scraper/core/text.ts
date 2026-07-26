// Source-agnostic string helpers shared by normalization and id assignment.
// Kept deliberately tiny and dependency-free; anything source-specific belongs
// in an adapter, not here.

/** Lowercase, non-alphanumerics collapsed to single dashes, trimmed. Matches
 * the id scheme the legacy build-catalog.mjs used, so ids stay stable across
 * the cutover. */
export function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const ENTITY: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#039;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
};

/** Decode the HTML entities that show up in scraped names/alt text. */
export function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-z0-9#]+;/gi, (m) => ENTITY[m.toLowerCase()] ?? m);
}

/** Collapse whitespace and decode entities on a human-facing display string. */
export function cleanText(input: string): string {
  return decodeEntities(input).replace(/\s+/g, ' ').trim();
}

// Words that stay lowercase inside a title but not at the start of one.
const MINOR_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'nor', 'of',
  'on', 'or', 'the', 'to', 'vs', 'with',
]);

/** Title-case a string, but only if it is shouting.
 *
 * Pop Mart is inconsistent about product-title casing per IP: most read
 * "DIMOO Animal Kingdom Series", but TinyTiny's are wholly uppercase
 * ("TINYTINY-PROLOGUE SERIES FIGURES"). Left alone, that IP's sets would sit
 * in the UI as PROLOGUE and THE LIE OF FREEDOM beside The Warmth and Animal
 * Kingdom.
 *
 * The all-caps guard is the point. Anything carrying a lowercase letter is
 * already cased the way its source meant, and rewriting it would flatten
 * deliberate forms the catalog needs to keep - "THE MONSTERS Hair Salon",
 * "× INSTINCTOY Sweet Together", "LiLiOS". Tokens with no letters at all
 * (numerals, "×") pass through untouched.
 *
 * Known trade: a wholly-uppercase brand name gets cased too, so a newly
 * scraped "DIMOO WORLD × PIXAR" lands as "Dimoo World × Pixar". Distinguishing
 * a shouted phrase from a stylised wordmark is not something a rule can do
 * reliably, and casing everything is the predictable half of that choice. It
 * does not rewrite anything already in the catalog: existing rows keep the
 * form they were ingested with (skullpanda's HYPEPANDA and MEGA, dimoo's
 * WORLD × PIXAR) unless their IP is deliberately re-scraped. */
export function titleCaseIfShouting(input: string): string {
  if (/[a-z]/.test(input)) return input;
  return input
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (i > 0 && MINOR_WORDS.has(word)) return word;
      return word.replace(/[a-z]/, (c) => c.toUpperCase());
    })
    .join(' ');
}

/** Short, stable, filesystem-safe hash used for id disambiguation and cache
 * keys. Not cryptographic; FNV-1a is plenty for these. */
export function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
