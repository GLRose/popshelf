import { shortHash } from '../core/text';

// The same accent palette the legacy build-catalog.mjs used. There it was
// handed out in catalog order (fragile: inserting a set reshuffled every
// downstream color). Here a set's color is a deterministic function of its
// label, so it never changes and never depends on crawl order.
const ACCENTS: readonly string[] = [
  '#8A7BF0', '#6C7BD1', '#C77D5A', '#6FB2A0', '#556070', '#8E9AAE', '#5E7CE2',
  '#C6415A', '#3D4C7A', '#7A5C8E', '#7F9B6E', '#D98AA6', '#C98A3E', '#5B8D88',
  '#B5687F', '#4E7A9B', '#9B6AB0', '#A8743E', '#6E8F5A',
];

/** Stable accent for a given IP + set. Same input ⇒ same color, forever. */
export function accentFor(series: string, setLabel: string): string {
  const n = parseInt(shortHash(`${series}::${setLabel}`), 36);
  return ACCENTS[n % ACCENTS.length];
}
