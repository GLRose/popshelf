// Every filesystem location the pipeline reads or writes, resolved once from
// this file's own location so the CLI works regardless of cwd. Each is
// overridable by env so tests can point the whole pipeline at a scratch dir
// without touching the real catalog (see scraper/*.test.ts).
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)); // scraper/core
export const SCRAPER_ROOT = resolve(here, '..');
export const REPO_ROOT = resolve(here, '../..');

/** The app's catalog of record. The pipeline merges into this in place. */
export const CATALOG_JSON =
  process.env.SCRAPER_CATALOG_JSON ?? resolve(REPO_ROOT, 'src/data/figures.json');

/** Committed provenance + incremental crawl state, one file per IP. */
export const STATE_DIR = process.env.SCRAPER_STATE_DIR ?? resolve(SCRAPER_ROOT, 'state');

/** Git-ignored cache of raw source responses, keyed by URL. */
export const CACHE_DIR = process.env.SCRAPER_CACHE_DIR ?? resolve(SCRAPER_ROOT, '.cache');

/** Git-ignored image working area, shared with the legacy scripts. */
export const IMAGE_DIR = process.env.SCRAPER_IMAGE_DIR ?? resolve(REPO_ROOT, 'catalog-images');

export function stateFileFor(ip: string): string {
  return resolve(STATE_DIR, `${ip}.json`);
}
