import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { titleCaseIfShouting } from './text';

describe('titleCaseIfShouting', () => {
  test('cases an all-caps set name the way the rest of the catalog reads', () => {
    assert.equal(titleCaseIfShouting('PROLOGUE'), 'Prologue');
    assert.equal(titleCaseIfShouting('THE LIE OF FREEDOM'), 'The Lie of Freedom');
    assert.equal(titleCaseIfShouting('LULLABY'), 'Lullaby');
  });

  test('leaves anything already carrying lowercase completely alone', () => {
    // These are the forms the guard exists to protect. Blanket title-casing
    // would flatten every one of them.
    for (const name of [
      'The Warmth',
      '× INSTINCTOY Sweet Together',
      "No One's Gonna Sleep Tonight",
      'THE MONSTERS Hair Salon',
      'LiLiOS',
    ]) {
      assert.equal(titleCaseIfShouting(name), name);
    }
  });

  test('cases a wholly-uppercase brand name too, which is the known trade', () => {
    // No rule separates a shouted phrase from a stylised wordmark. Casing
    // both is the predictable half of that choice; see the doc comment.
    assert.equal(titleCaseIfShouting('DIMOO WORLD × PIXAR'), 'Dimoo World × Pixar');
  });

  test('keeps a minor word lowercase unless it leads', () => {
    assert.equal(titleCaseIfShouting('THE ART OF WAR'), 'The Art of War');
    assert.equal(titleCaseIfShouting('OF MICE AND MEN'), 'Of Mice and Men');
  });

  test('passes through tokens with no letters', () => {
    assert.equal(titleCaseIfShouting('200%'), '200%');
    assert.equal(titleCaseIfShouting('SERIES 2'), 'Series 2');
  });
});
