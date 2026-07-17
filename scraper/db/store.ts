// All reads and writes of the two things the pipeline persists: the app's
// catalog (src/data/figures.json) and the per-IP provenance + crawl state
// (scraper/state/<ip>.json). Pure IO; the merge policy lives in upsert.ts.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CATALOG_JSON, STATE_DIR, stateFileFor } from '../core/paths';
import type { KnownItem } from '../core/types';

/** A catalog row exactly as it sits in figures.json. `series` is a plain
 * string here (not the app's Series union) because the file legitimately
 * carries IP slugs the union hasn't been extended for yet. The app casts it to
 * Figure[] at its own boundary (src/data/figures.ts). */
export interface StoredFigure {
  id: string;
  series: string;
  set: string;
  name: string;
  year?: number;
  rarity?: 'regular' | 'secret';
  color?: string;
}

export interface SourceState {
  lastRunAt: string | null;
  /** Keyed by sourceProductId. */
  items: Record<string, KnownItem>;
}

export interface StateFile {
  ip: string;
  /** Keyed by source (adapter) name. */
  sources: Record<string, SourceState>;
}

export async function loadCatalog(): Promise<StoredFigure[]> {
  try {
    return JSON.parse(await readFile(CATALOG_JSON, 'utf8')) as StoredFigure[];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

export async function saveCatalog(figures: readonly StoredFigure[]): Promise<void> {
  await mkdir(dirname(CATALOG_JSON), { recursive: true });
  await writeFile(CATALOG_JSON, JSON.stringify(figures, null, 2) + '\n', 'utf8');
}

export async function loadState(ip: string): Promise<StateFile> {
  try {
    return JSON.parse(await readFile(stateFileFor(ip), 'utf8')) as StateFile;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { ip, sources: {} };
    throw e;
  }
}

export async function saveState(state: StateFile): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(stateFileFor(state.ip), JSON.stringify(state, null, 2) + '\n', 'utf8');
}
