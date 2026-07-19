// Covers the id-assignment rules that keep re-runs idempotent, and the
// pre-write guard that stops a duplicate ever reaching figures.json.
//
// The whole pipeline is pointed at a scratch dir through the env overrides in
// core/paths.ts. Those are module-level consts read at import time, so the env
// has to be set before upsert.ts is ever imported: hence the dynamic import
// below rather than a static one at the top of the file.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';

import type { StateFile, StoredFigure } from './store';
import type { CatalogWriter as CatalogWriterType, findCatalogDuplicates as FindDupes } from './upsert';

let scratch: string;
let catalogPath: string;
let statePath: string;
let CatalogWriter: typeof CatalogWriterType;
let findCatalogDuplicates: typeof FindDupes;

before(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'popshelf-upsert-'));
  catalogPath = resolve(scratch, 'figures.json');
  statePath = resolve(scratch, 'state');
  process.env.SCRAPER_CATALOG_JSON = catalogPath;
  process.env.SCRAPER_STATE_DIR = statePath;
  await mkdir(statePath, { recursive: true });

  const mod = await import('./upsert');
  CatalogWriter = mod.CatalogWriter;
  findCatalogDuplicates = mod.findCatalogDuplicates;
});

after(() => {
  delete process.env.SCRAPER_CATALOG_JSON;
  delete process.env.SCRAPER_STATE_DIR;
});

function figure(id: string, set: string, name: string, extra: Partial<StoredFigure> = {}): StoredFigure {
  return { id, series: 'hirono', set, name, rarity: 'regular', color: '#000000', ...extra };
}

/** A NormalizedFigure is more than the pipeline needs here; build just enough. */
function normalized(id: string, set: string, name: string, year?: number, sourceProductId = `p:${id}`) {
  return {
    id,
    series: 'hirono',
    set,
    name,
    year,
    rarity: 'regular' as const,
    color: '#8A7BF0',
    imageUrl: undefined,
    provenance: {
      source: 'popmart',
      sourceProductId,
      sourceUrl: 'https://www.popmart.com/us/products/1',
      scrapedAt: '2026-07-19T00:00:00.000Z',
    },
  };
}

/** Seed the scratch catalog + state, then return a loaded writer for `ip`. */
async function writerWith(catalog: StoredFigure[], state?: StateFile) {
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
  await writeFile(
    resolve(statePath, 'hirono.json'),
    JSON.stringify(state ?? { ip: 'hirono', sources: {} }, null, 2),
    'utf8',
  );
  const writer = new CatalogWriter('hirono');
  await writer.load();
  return writer;
}

describe('resolveId', () => {
  test('adopts a hand-curated row that is the same figure', async () => {
    // The hirono bug: the catalog was seeded by hand before the first scrape.
    const writer = await writerWith([figure('hirono-reshape-puppet', 'Reshape', 'Puppet')]);
    const id = writer.forSource('popmart').resolveId('hirono-reshape-puppet', '1234');
    assert.equal(id, 'hirono-reshape-puppet');
  });

  test('still suffixes when the squatting row is a different figure', async () => {
    // Contrived, but this is the case the suffix exists for: an unrelated row
    // parked on the id we want, whose own set/name do not slug back to it.
    const writer = await writerWith([figure('hirono-reshape-puppet', 'Echo', 'Knight')]);
    const id = writer.forSource('popmart').resolveId('hirono-reshape-puppet', '1234');
    assert.equal(id, 'hirono-reshape-puppet-2');
  });

  test('prior state wins over the catalog, even when they disagree', async () => {
    const writer = await writerWith([figure('hirono-reshape-puppet', 'Reshape', 'Puppet')], {
      ip: 'hirono',
      sources: {
        popmart: {
          lastRunAt: null,
          items: {
            '1234': {
              figureId: 'hirono-reshape-puppet-2',
              sourceUrl: 'https://www.popmart.com/us/products/1',
              scrapedAt: '2026-01-01T00:00:00.000Z',
              contentHash: 'x',
            },
          },
        },
      },
    });
    const id = writer.forSource('popmart').resolveId('hirono-reshape-puppet', '1234');
    assert.equal(id, 'hirono-reshape-puppet-2');
  });

  test('two products that slug alike in one run get distinct ids', async () => {
    const writer = await writerWith([]);
    const src = writer.forSource('popmart');
    assert.equal(src.resolveId('hirono-reshape-puppet', 'a'), 'hirono-reshape-puppet');
    assert.equal(src.resolveId('hirono-reshape-puppet', 'b'), 'hirono-reshape-puppet-2');
  });

  test('adoption is one-to-one: only the first claimant takes the row', async () => {
    const writer = await writerWith([figure('hirono-reshape-puppet', 'Reshape', 'Puppet')]);
    const src = writer.forSource('popmart');
    assert.equal(src.resolveId('hirono-reshape-puppet', 'a'), 'hirono-reshape-puppet');
    assert.equal(src.resolveId('hirono-reshape-puppet', 'b'), 'hirono-reshape-puppet-2');
  });

  test('an adopted row is updated in place, not duplicated', async () => {
    const writer = await writerWith([figure('hirono-reshape-puppet', 'Reshape', 'Puppet')]);
    const src = writer.forSource('popmart');
    const id = src.resolveId('hirono-reshape-puppet', '1234');
    const action = src.apply(normalized(id, 'Reshape', 'Puppet', 2023, '1234'));

    assert.equal(action, 'updated');
    writer.markRun('popmart');
    await writer.commit();

    const written = JSON.parse(await readFile(catalogPath, 'utf8')) as StoredFigure[];
    assert.equal(written.length, 1);
    assert.equal(written[0].id, 'hirono-reshape-puppet');
    assert.equal(written[0].year, 2023);
  });
});

describe('findCatalogDuplicates', () => {
  test('accepts a sound catalog', () => {
    assert.deepEqual(
      findCatalogDuplicates([
        figure('hirono-reshape-puppet', 'Reshape', 'Puppet'),
        figure('hirono-echo-knight', 'Echo', 'Knight'),
      ]),
      [],
    );
  });

  test('reports two ids holding the same figure', () => {
    const problems = findCatalogDuplicates([
      figure('hirono-reshape-puppet', 'Reshape', 'Puppet'),
      figure('hirono-reshape-puppet-2', 'Reshape', 'Puppet'),
    ]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /hirono-reshape-puppet-2/);
  });

  test('reports a repeated id', () => {
    const problems = findCatalogDuplicates([
      figure('hirono-reshape-puppet', 'Reshape', 'Puppet'),
      figure('hirono-reshape-puppet', 'Echo', 'Knight'),
    ]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /duplicate id/);
  });
});

test('commit refuses to write a catalog with duplicates', async () => {
  const writer = await writerWith([figure('hirono-echo-knight', 'Echo', 'Knight')]);
  const src = writer.forSource('popmart');
  // Force the shape the guard exists to catch, bypassing resolveId.
  src.apply(normalized('hirono-echo-knight-2', 'Echo', 'Knight'));

  await assert.rejects(() => writer.commit(), /refusing to write a catalog with duplicates/);

  // The pre-existing file must be untouched, so the run is safe to re-run.
  const onDisk = JSON.parse(await readFile(catalogPath, 'utf8')) as StoredFigure[];
  assert.equal(onDisk.length, 1);
});
