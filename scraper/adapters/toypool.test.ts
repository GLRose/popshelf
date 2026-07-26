// The whole toypool adapter is one regex over a filename convention, so the
// regex is the part that breaks. These run against a committed capture of a
// real set page rather than a hand-written string, because a hand-written
// string only ever proves the regex matches what its author already assumed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

import { formatFigureName, parseSetPage } from './toypool';

const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '__fixtures__/toypool-lucky-charm.html',
);
const LUCKY_CHARM_TAIL = 'POP-BEAN-Lucky-Charm-Series-Pop-Mart-Figure';

describe('parseSetPage', () => {
  const html = readFileSync(FIXTURE, 'utf8');

  test('reads every figure in the set, and only figures', () => {
    const figures = parseSetPage(html, LUCKY_CHARM_TAIL);
    assert.equal(figures.length, 19);
    // The page also carries site chrome at the same /s1600/ path
    // (ebay-button.png, Tool-Pool-Banner.jpg); the tail is what excludes it.
    assert.ok(figures.every((f) => /Lucky-Charm/i.test(f.imageUrl)));
    assert.ok(figures.every((f) => f.imageUrl.includes('/s1600/')));
  });

  test('names carry the borrowed character as a prefix', () => {
    const names = parseSetPage(html, LUCKY_CHARM_TAIL).map((f) => f.name);
    assert.ok(names.includes('Labubu - The Best One'));
    assert.ok(names.includes('Molly - Lucky Red'));
    assert.ok(names.includes('Skullpanda - Leap Into Success'));
    // Two-word character, which a naive split on the first space would break.
    assert.ok(names.includes('Pino Jelly - Pure Silver'));
  });

  test('collapses the size and shot variants of one figure', () => {
    const names = parseSetPage(html, LUCKY_CHARM_TAIL).map((f) => f.name);
    assert.equal(new Set(names).size, names.length);
  });

  test('a tail that matches nothing yields nothing, so the adapter can throw', () => {
    assert.deepEqual(parseSetPage(html, 'Not-A-Real-Series-Pop-Mart-Figure'), []);
  });
});

describe('formatFigureName', () => {
  test('splits a known character off the design name', () => {
    assert.equal(formatFigureName('Labubu-The-Best-One'), 'Labubu - The Best One');
    assert.equal(formatFigureName('LiLiOS-Warm-Yellow'), 'LiLiOS - Warm Yellow');
  });

  test('prefers the longest character match', () => {
    // "Sweet Bean" must not split at a shorter prefix, and "Flying Dongdong"
    // must not become "Flying - Dongdong Coconut".
    assert.equal(formatFigureName('Sweet-Bean-Joyful-Red'), 'Sweet Bean - Joyful Red');
    assert.equal(formatFigureName('Flying-Dongdong-Coconut'), 'Flying Dongdong - Coconut');
  });

  test('leaves a bare character name alone', () => {
    // The Fortune Bag wave names its figures after the character and nothing
    // else, so there is no design name to separate.
    assert.equal(formatFigureName('Crybaby'), 'Crybaby');
    assert.equal(formatFigureName('Bobo-&-Coco'), 'Bobo & Coco');
  });

  test('passes through a name that is not a Pop Mart character', () => {
    // The licensed waves are cast members, not borrowed IPs.
    assert.equal(formatFigureName('Cedric-Diggory'), 'Cedric Diggory');
  });

  test('treats "+" as a word separator too', () => {
    // One filename in the Harry Potter wave uses it instead of "-".
    assert.equal(formatFigureName('Neville+Longbottom'), 'Neville Longbottom');
  });
});
