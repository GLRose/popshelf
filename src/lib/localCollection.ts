import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_BACKGROUND_ID,
  DEFAULT_TEXTURE_ID,
  normalizeBackgroundId,
  SHELF_COLORS,
} from '@/constants/palette';
import type { Shelf } from '@/types';

const STORAGE_KEY = 'popshelf-v1';
const CURRENT_VERSION = 3;

function makeId() {
  return `shelf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

interface PersistedCollection {
  shelves?: Shelf[];
  activeShelfId?: string;
  favorites?: string[];
  customColors?: string[];
  shelf?: { color?: string; background?: string };
  collection?: string[];
}

/**
 * The transform chain the old Zustand `persist` middleware used to run on
 * load (versions 0-3 of the 'popshelf-v1' AsyncStorage entry), preserved
 * verbatim so a collection written by any past version of the app still
 * lands on the current shape.
 */
function migrate(persisted: PersistedCollection, version: number): PersistedCollection {
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

/** The subset of the collection that is unioned with Supabase on sign-in. */
export interface SyncCollection {
  shelves: Shelf[];
  activeShelfId: string;
  favorites: string[];
}

export interface LocalCollection extends SyncCollection {
  /** User-saved wheel colors, kept device-local (not synced to Supabase). */
  customColors: string[];
}

/**
 * Reads and migrates the on-device 'popshelf-v1' AsyncStorage entry, if any.
 * This is the durable store: it's the source of truth for shelves and
 * favorites regardless of whether Supabase is reachable or configured, so a
 * backend hiccup (or a device that's never had Supabase set up) can't wipe
 * a collection. Returns null only on a device that's never persisted one.
 */
export async function loadLocalCollection(): Promise<LocalCollection | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { state?: PersistedCollection; version?: number };
    const migrated = migrate(parsed.state ?? {}, parsed.version ?? 0);
    if (!migrated.shelves || migrated.shelves.length === 0) return null;

    return {
      shelves: migrated.shelves,
      activeShelfId:
        migrated.activeShelfId && migrated.shelves.some((sh) => sh.id === migrated.activeShelfId)
          ? migrated.activeShelfId
          : migrated.shelves[0].id,
      favorites: migrated.favorites ?? [],
      customColors: migrated.customColors ?? [],
    };
  } catch (e) {
    console.warn('Failed to parse local collection data', e);
    return null;
  }
}

/** Writes the current collection to the on-device store. */
export async function saveLocalCollection(collection: LocalCollection): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ state: collection, version: CURRENT_VERSION }),
  );
}

/**
 * Forgets this device's collection, on sign-out. Safe only because the shelves
 * being dropped are mirrored under the account that is being signed out of, and
 * come back on the next sign-in - see useCollection.adoptRemoteCollection().
 */
export async function clearLocalCollection(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
