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
