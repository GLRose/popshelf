// An integrity check over the real, committed src/data/figures.json.
//
// This is not a scraper unit test: it guards the app's catalog of record, which
// nothing else validates. src/data/figures.ts builds FIGURES_BY_ID with
// Object.fromEntries (last-write-wins), and users shelve figures by id, so a
// duplicate row is silent in code and glaring in the UI. hirono carried 68 of
// them before anyone noticed.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadCatalog } from './store';
import { findCatalogDuplicates } from './upsert';

test('figures.json has no duplicate ids and no duplicate figures', async () => {
  const catalog = await loadCatalog();
  assert.ok(catalog.length > 0, 'catalog should not be empty');

  const problems = findCatalogDuplicates(catalog);
  assert.deepEqual(problems, [], `figures.json contains duplicates:\n  ${problems.join('\n  ')}`);
});
