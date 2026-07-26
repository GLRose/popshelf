// An integrity check over the real, committed src/data/figures.json, in the
// same spirit as catalog.test.ts: the catalog is the app's data of record and
// nothing else validates it.
//
// A Pop Mart blind-box set is twelve-or-so regular designs plus one secret, and
// `rarity: 'secret'` is the only thing driving the SECRET badge in
// FigureCard.tsx. A set that carries no secret is therefore almost always a
// labeling miss rather than a real edition: skullpanda and peachriot were
// curated by hand before the scraper existed and every one of their secrets
// sat in the catalog labeled `regular` until popmart.com was asked (see
// scraper/audit-rarity.ts).
//
// So the rule here is "exactly one secret per set", and the two exemption
// lists below are the documented exceptions. Both are deliberately explicit:
// adding a set to one should take a deliberate edit and a reason.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadCatalog, type StoredFigure } from './store';

/** Sets that ship no secret at all, so zero is the right answer. None of these
 * are blind-box series: they are the standalone figurines, action figures,
 * pendants and collaboration one-offs the catalog groups under a set name for
 * display. */
const NO_SECRET_SETS: ReadonlySet<string> = new Set([
  // Peach Riot's three-piece figurine and pendant drops (one Frankie, one
  // Gigi, one Poppy - the whole set, openly sold).
  'peachriot/Witchy Punk',
  'peachriot/À La Mode',
  'peachriot/Winter Break OOTD',
  'peachriot/Western Riot',
  'peachriot/Off-Duty: New York City',
  'peachriot/Street Style',
  'peachriot/Bloody Valentine',
  'peachriot/Angel',
  "peachriot/Siren's Song",
  'peachriot/Rainbow Riot',
  "peachriot/Fruit Punch (Pendant's)",
  // Skullpanda's non-blind-box lines.
  'skullpanda/MEGA',
  'skullpanda/Action Figure',
  'skullpanda/Special Editions',
  // Hirono's non-blind-box lines.
  'hirono/Listening; Saying; Seeing',
  'hirono/200%',
  'hirono/Special Editions',
  'hirono/Blister Series',
  'hirono/Plush & Pendants',
  'hirono/Collaborations',
  // Standalone, non-blind-box releases, ingested as a set of one by
  // `allowSingles` in the popmart adapter. There is no roster to hold a
  // secret: the product is the figure.
  'tinytiny/The Lie of Freedom',
  'tinytiny/Lullaby',
  'sweetbean/Grow up Quickly',
  'sweetbean/Hot Spring Travel',
  'sweetbean/Bedtime Story',
  'sweetbean/Easter Bunny',
]);

/** Sets whose secret we cannot label, as distinct from sets that have none.
 *
 * These are the POP BEAN waves sourced from thetoypool.com, which publishes a
 * render per figure but does not mark which is the chase. popmart.com would,
 * but it answers with an empty roster for every one of these products, so
 * there is nothing to audit against - `npm run audit:rarity` cannot help here
 * the way it can everywhere else.
 *
 * Kept separate from NO_SECRET_SETS on purpose. Filing them there would assert
 * these waves ship no secret, which is not something we know and is probably
 * false. This list says "unknown" out loud so it reads as a gap to close
 * rather than a settled fact. */
const UNLABELLED_SECRET_SETS: ReadonlySet<string> = new Set([
  'popbean/Lucky Charm',
  'popbean/Fortune Bag',
  'popbean/Fruit Platter',
  'popbean/Lucky Cat',
  'popbean/Mini Ice Pop',
  'popbean/Harry Potter Flight',
]);

/** Sets that really do ship more than one secret, with the count popmart.com
 * reports for them. Confirmed by `npm run audit:rarity` for every entry except
 * skullpanda/My Little Pony, which Pop Mart no longer publishes. */
const MULTI_SECRET_SETS: Readonly<Record<string, number>> = {
  // A secret plus a "super secret", which the catalog collapses into one
  // rarity because the app has only the two tiers.
  'skullpanda/Tell Me What You Want': 2,
  'skullpanda/My Little Pony': 2,
  'dimoo/Weaving Wonders': 2,
  'dimoo/By Your Side': 2,
  'dimoo/Retro': 3,
  'hirono/× Le Petit Prince': 2,
};

function key(figure: StoredFigure): string {
  return `${figure.series}/${figure.set}`;
}

test('every set in figures.json has the secrets it should', async () => {
  const catalog = await loadCatalog();
  assert.ok(catalog.length > 0, 'catalog should not be empty');

  const secretsBySet = new Map<string, number>();
  for (const figure of catalog) {
    const setKey = key(figure);
    const count = secretsBySet.get(setKey) ?? 0;
    if (figure.rarity === 'secret') {
      secretsBySet.set(setKey, count + 1);
      continue;
    }
    secretsBySet.set(setKey, count);
  }

  const problems: string[] = [];
  for (const [setKey, secrets] of secretsBySet) {
    // Not asserted either way - no source has told us what the answer is.
    if (UNLABELLED_SECRET_SETS.has(setKey)) {
      continue;
    }
    let expected = 1;
    if (NO_SECRET_SETS.has(setKey)) {
      expected = 0;
    }
    const multi = MULTI_SECRET_SETS[setKey];
    if (multi !== undefined) {
      expected = multi;
    }
    if (secrets === expected) {
      continue;
    }
    problems.push(`${setKey}: ${secrets} secret(s), expected ${expected}`);
  }

  assert.deepEqual(
    problems,
    [],
    `figures.json has sets with the wrong number of secrets:\n  ${problems.join('\n  ')}\n` +
      'Run `npm run audit:rarity -- --ip <slug>` to ask popmart.com which design is the secret. ' +
      'If the set genuinely has none, add it to NO_SECRET_SETS in this file with a reason.',
  );
});

test('exemption lists name real sets', async () => {
  const catalog = await loadCatalog();
  const sets = new Set(catalog.map(key));

  const stale: string[] = [];
  for (const setKey of NO_SECRET_SETS) {
    if (!sets.has(setKey)) {
      stale.push(`NO_SECRET_SETS: ${setKey}`);
    }
  }
  for (const setKey of Object.keys(MULTI_SECRET_SETS)) {
    if (!sets.has(setKey)) {
      stale.push(`MULTI_SECRET_SETS: ${setKey}`);
    }
  }
  for (const setKey of UNLABELLED_SECRET_SETS) {
    if (!sets.has(setKey)) {
      stale.push(`UNLABELLED_SECRET_SETS: ${setKey}`);
    }
  }

  assert.deepEqual(stale, [], `exemptions for sets that no longer exist:\n  ${stale.join('\n  ')}`);
});
