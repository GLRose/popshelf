import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_BACKGROUND_ID,
  DEFAULT_TEXTURE_ID,
  normalizeBackgroundId,
  SHELF_COLORS,
} from '@/constants/palette';
import type { Shelf } from '@/types';

const LEGACY_KEY = 'popshelf-v1';

function makeId() {
  return `shelf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

interface LegacyPersisted {
  shelves?: Shelf[];
  activeShelfId?: string;
  favorites?: string[];
  shelf?: { color?: string; background?: string };
  collection?: string[];
}

/**
 * The transform chain the old Zustand `persist` middleware used to run on
 * load (versions 0-3 of the 'popshelf-v1' AsyncStorage entry), preserved
 * verbatim so a one-time import from a pre-Supabase install still lands on
 * the current shape.
 */
function migrate(persisted: LegacyPersisted, version: number): LegacyPersisted {
  // v0 -> v1: fold the single legacy shelf/collection into a shelves array.
  if (version < 1) {
    const shelf: Shelf = {
      id: makeId(),
      name: 'My Shelf',
      color: persisted.shelf?.color ?? SHELF_COLORS[0].value,
      background: persisted.shelf?.background ?? DEFAULT_BACKGROUND_ID,
      texture: DEFAULT_TEXTURE_ID,
      figureIds: persisted.collection ?? [],
    };
    persisted = {
      shelves: [shelf],
      activeShelfId: shelf.id,
      favorites: persisted.favorites ?? [],
    };
  }
  // v1 -> v2: backgrounds are now ids; map any legacy hex values across.
  if (version < 2 && Array.isArray(persisted.shelves)) {
    persisted.shelves = persisted.shelves.map((sh) => ({
      ...sh,
      background: normalizeBackgroundId(sh.background),
    }));
  }
  // v2 -> v3: ledges gained a texture; default existing shelves to smooth.
  if (version < 3 && Array.isArray(persisted.shelves)) {
    persisted.shelves = persisted.shelves.map((sh) => ({
      ...sh,
      texture: sh.texture ?? DEFAULT_TEXTURE_ID,
    }));
  }
  return persisted;
}

export interface LegacyCollection {
  shelves: Shelf[];
  activeShelfId: string;
  favorites: string[];
}

/**
 * One-time import: reads the pre-Supabase 'popshelf-v1' AsyncStorage entry
 * (if any), migrates it to the current shape, deletes the key, and returns
 * the result - so it never gets read or migrated twice. Returns null when
 * there's nothing to import.
 */
export async function loadAndClearLegacyCollection(): Promise<LegacyCollection | null> {
  const raw = await AsyncStorage.getItem(LEGACY_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { state?: LegacyPersisted; version?: number };
    const migrated = migrate(parsed.state ?? {}, parsed.version ?? 0);
    if (!migrated.shelves || migrated.shelves.length === 0) return null;

    return {
      shelves: migrated.shelves,
      activeShelfId:
        migrated.activeShelfId && migrated.shelves.some((sh) => sh.id === migrated.activeShelfId)
          ? migrated.activeShelfId
          : migrated.shelves[0].id,
      favorites: migrated.favorites ?? [],
    };
  } catch (e) {
    console.warn('Failed to parse legacy collection data', e);
    return null;
  } finally {
    await AsyncStorage.removeItem(LEGACY_KEY);
  }
}
