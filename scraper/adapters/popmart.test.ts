// The two pure pieces of the roster lookup: reading Pop Mart's product sitemap
// and deciding which of those products is a blind-box figure set. Everything
// else in the adapter needs a browser; these do not, and they are where the
// audit's set matching actually goes wrong when it goes wrong.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { figureProductsBySet, parseProductSitemap } from './popmart';

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.popmart.com/us/products/9/SKULLPANDA%20The%20Warmth%20Series</loc></url>
  <url><loc>https://www.popmart.com/us/products/1291/SKULLPANDA%20The%20Warmth%20Series</loc></url>
  <url><loc>https://www.popmart.com/us/products/720/SKULLPANDA%20The%20Ink%20Plum%20Blossom%20Series%20Figures</loc></url>
  <url><loc>https://www.popmart.com/us/products/1319/SKULLPANDA%20The%20Sound%20Series-Fridge%20Magnet%20Blind%20Box</loc></url>
  <url><loc>https://www.popmart.com/us/products/141/SKULLPANDA%20White%20Maid%20Figurine</loc></url>
  <url><loc>https://www.popmart.com/us/products/3944/Hirono%20Monsters&apos;%20Carnival%20Series%20Figures</loc></url>
  <url><loc>https://www.popmart.com/us/collection/2/skullpanda</loc></url>
</urlset>`;

describe('parseProductSitemap', () => {
  test('reads id and decoded title from every product url', () => {
    const products = parseProductSitemap(SITEMAP);
    assert.deepEqual(
      products.map((p) => `${p.productId} ${p.title}`),
      [
        '9 SKULLPANDA The Warmth Series',
        '1291 SKULLPANDA The Warmth Series',
        '720 SKULLPANDA The Ink Plum Blossom Series Figures',
        '1319 SKULLPANDA The Sound Series-Fridge Magnet Blind Box',
        '141 SKULLPANDA White Maid Figurine',
        "3944 Hirono Monsters' Carnival Series Figures",
      ],
      'non-product urls are skipped and HTML entities are decoded',
    );
  });
});

describe('figureProductsBySet', () => {
  const products = parseProductSitemap(SITEMAP);

  test('keeps figure sets and drops merch that shares the set name', () => {
    const bySet = figureProductsBySet(products, 'SKULLPANDA');
    assert.deepEqual([...bySet.keys()], ['the-warmth', 'the-ink-plum-blossom']);
  });

  test('strips a trailing "Series" as well as "Series Figures"', () => {
    const bySet = figureProductsBySet(products, 'SKULLPANDA');
    assert.equal(bySet.get('the-warmth')?.set, 'The Warmth');
    assert.equal(bySet.get('the-ink-plum-blossom')?.set, 'The Ink Plum Blossom');
  });

  test('collects every product for a set, newest id first', () => {
    const bySet = figureProductsBySet(products, 'SKULLPANDA');
    assert.deepEqual(
      bySet.get('the-warmth')?.candidates.map((c) => c.productId),
      ['1291', '9'],
      'a re-release is a fallback for the same roster, not a second set',
    );
  });

  test('matches the brand label case-insensitively', () => {
    const bySet = figureProductsBySet(products, 'HIRONO');
    assert.deepEqual([...bySet.keys()], ['monsters-carnival']);
  });
});
