// thetoypool.com, a collector database, for the one thing popmart.com cannot
// give us: POP BEAN rosters.
//
// POP BEAN is not an IP. It is a format - a bean-shaped mini of a character
// borrowed from some other line (Labubu, Molly, Dimoo, Crybaby, Pucky...) - and
// it is not in Pop Mart's own CHARACTERS nav. Their product pages for it answer
// with an empty `toys` array, so the roster route in popmartRoster.ts reaches
// nothing for all but a couple of waves. There is no per-design data on
// popmart.com to read.
//
// thetoypool.com publishes one render per figure with the figure's name in the
// filename, over plain unsigned HTML:
//
//   .../s1600/Labubu-The-Best-One-POP-BEAN-Lucky-Charm-Series-Pop-Mart-Figure-1.jpg
//
// which is the same site and the same trick the retired
// scripts/build-catalog.mjs already used for Peach Riot. No browser, no
// signature, one request per set.
//
// The trade is rarity: this site does not mark secrets, so everything here
// lands `regular`. For an IP popmart.com also lists, `npm run audit:rarity`
// corrects that afterwards; for POP BEAN it cannot, and the labels stay a
// documented gap.
import { cleanText, slug } from '../core/text';
import type { DiscoverContext, RawItem, SourceAdapter } from '../core/types';

const SITE_HOST = 'https://thetoypool.com';

/** One set to read: the IP folder it sits under on the site, the set label to
 * write into the catalog, and the invariant filename tail that follows every
 * figure name in that set. The tail is matched case-insensitively because the
 * site is inconsistent about it ("POP-BEAN-..." in most sets, "Pop-Bean-..." in
 * the Lucky Cat one). */
interface ToypoolSet {
  readonly path: string;
  readonly set: string;
  readonly tail: string;
}

interface ToypoolSourceOptions {
  readonly sets?: unknown;
}

function readOptions(raw: Readonly<Record<string, unknown>> | undefined): ToypoolSet[] {
  const { sets } = (raw ?? {}) as ToypoolSourceOptions;
  if (!Array.isArray(sets) || sets.length === 0) {
    throw new Error('toypool adapter requires options.sets (non-empty array)');
  }
  return sets.map((entry, i) => {
    const { path, set, tail } = (entry ?? {}) as Partial<ToypoolSet>;
    if (typeof path !== 'string' || typeof set !== 'string' || typeof tail !== 'string') {
      throw new Error(`toypool adapter options.sets[${i}] needs string path, set and tail`);
    }
    return { path, set, tail };
  });
}

/** Pop Mart characters that show up as the leading part of a POP BEAN figure
 * name, longest first so "Flying Dongdong" wins over any shorter prefix and
 * "Sweet Bean" is never split at "Sweet".
 *
 * This exists only to render "Labubu-The-Best-One" as "Labubu - The Best One",
 * so the borrowed character reads as a prefix rather than running into the
 * design name. A name that matches nothing here passes through unchanged,
 * which is the right outcome for the licensed waves where the leading words
 * are not a Pop Mart character at all ("Cedric Diggory"). */
const CHARACTERS: readonly string[] = [
  'Flying Dongdong',
  'Twinkle Twinkle',
  'The Monsters',
  'Little Adventurers',
  'Green Cow Garden',
  'Satyr Rory',
  'Pino Jelly',
  'Sweet Bean',
  'Skullpanda',
  'Bobo & Coco',
  'Kaiju Negora',
  'Hacipupu',
  'Hacipucu',
  'Fubaobao',
  'Peach Riot',
  'Crybaby',
  'Susumi',
  'Duckoo',
  'Inosoul',
  'Vivicat',
  'Labubu',
  'Zimomo',
  'Mokoko',
  'Tycoco',
  'Merodi',
  'LiLiOS',
  'Minico',
  'Azura',
  'Chaka',
  'Dimoo',
  'Molly',
  'Nyota',
  'Pucky',
  'Polar',
  'Zsiga',
  'Bunny',
  'Yuki',
  'Yoki',
  'Kubo',
  'Nori',
  'Vita',
  'Zoe',
];

// The site's filenames separate words with "-", but a name that already
// contained a space sometimes arrives as "+" instead ("Neville+Longbottom").
const titleize = (s: string) => cleanText(s.replace(/[-+]/g, ' '));

/** "Labubu The Best One" -> "Labubu - The Best One". Left alone when the
 * leading words are not a character we know, or when the whole name is just
 * the character ("Crybaby", in the Fortune Bag wave). */
export function formatFigureName(raw: string): string {
  const name = titleize(raw);
  for (const character of CHARACTERS) {
    if (!name.toLowerCase().startsWith(character.toLowerCase())) continue;
    const rest = name.slice(character.length).trim();
    if (!rest) return name;
    return `${name.slice(0, character.length)} - ${rest}`;
  }
  return name;
}

/** Every figure render on one set page, deduped by name.
 *
 * The site serves several size variants of the same photo and often more than
 * one shot per figure (`-1`, `-2`); `s1600` picks the largest variant and the
 * name key collapses the rest, first occurrence winning. */
export function parseSetPage(html: string, tail: string): { name: string; imageUrl: string }[] {
  const pattern = new RegExp(
    `https://[^"'()\\\\ ]+/s1600/([^"'/]+?)-${tail}-\\d+\\.(?:jpg|jpeg|png|webp)`,
    'gi',
  );
  const byName = new Map<string, { name: string; imageUrl: string }>();
  for (const match of html.matchAll(pattern)) {
    const name = formatFigureName(decodeURIComponent(match[1]));
    if (!name) continue;
    const key = slug(name);
    if (byName.has(key)) continue;
    byName.set(key, { name, imageUrl: match[0] });
  }
  return [...byName.values()];
}

export const toypoolAdapter: SourceAdapter = {
  name: 'toypool',
  domains: ['thetoypool.com'],
  async *discover(ctx: DiscoverContext): AsyncIterable<RawItem> {
    const sets = readOptions(ctx.sourceConfig.options);

    for (const entry of sets) {
      const url = `${SITE_HOST}/pop-mart/series/${entry.path}/`;
      const figures = parseSetPage(await ctx.fetcher.text(url), entry.tail);

      // Loud on purpose, matching the abort-if-empty rule the retired
      // build-catalog.mjs used. A zero here means the page moved or the
      // filename convention changed, and the honest outcome is a failed run -
      // not a set that silently ships with nothing in it.
      if (figures.length === 0) {
        throw new Error(`toypool ${url}: no figures matched tail "${entry.tail}"`);
      }
      ctx.log.info(`  ${entry.set}: ${figures.length} figures`);

      for (const figure of figures) {
        yield {
          sourceProductId: `${slug(entry.set)}:${slug(figure.name)}`,
          sourceUrl: url,
          name: figure.name,
          set: entry.set,
          // The site does not mark secrets. See the header note.
          rarity: 'regular',
          imageUrl: figure.imageUrl,
        };
      }
    }
  },
};
