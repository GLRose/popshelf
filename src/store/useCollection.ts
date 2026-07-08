import { create } from 'zustand';

import {
  DEFAULT_BACKGROUND_ID,
  DEFAULT_TEXTURE_ID,
  SHELF_COLORS,
} from '@/constants/palette';
import { loadAndClearLegacyCollection } from '@/lib/legacyCollectionMigration';
import {
  addFavoriteRemote,
  deleteShelfRemote,
  fetchCollection,
  migrateLegacyCollection,
  removeFavoriteRemote,
  setActiveShelfRemote,
  upsertShelfRemote,
} from '@/lib/remoteCollection';
import { supabase } from '@/lib/supabase';
import type { Shelf } from '@/types';

function makeId() {
  return `shelf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function defaultShelf(name = 'My Shelf', figureIds: string[] = []): Shelf {
  return {
    id: makeId(),
    name,
    color: SHELF_COLORS[0].value,
    background: DEFAULT_BACKGROUND_ID,
    texture: DEFAULT_TEXTURE_ID,
    figureIds,
  };
}

/** Fire-and-forget push of a shelf's current fields to Supabase. */
function pushShelf(shelf: Shelf) {
  upsertShelfRemote(shelf).catch((e) => console.warn('Failed to sync shelf', e));
}

interface CollectionState {
  /** All shelves; at least one always exists */
  shelves: Shelf[];
  /** Id of the shelf figures are added to / displayed */
  activeShelfId: string;
  /** Favorited figure ids (independent of ownership) */
  favorites: string[];
  /** Set once the initial Supabase load has finished, so the UI can avoid a flash */
  hydrated: boolean;

  /** Loads shelves/favorites from Supabase (migrating a legacy local collection up once, if found) */
  hydrate: () => Promise<void>;

  /** The currently active shelf (falls back to the first shelf) */
  activeShelf: () => Shelf;
  /** The shelf a figure sits on, if any */
  shelfOf: (figureId: string) => Shelf | undefined;
  /** True if the figure is on any shelf */
  isOwned: (id: string) => boolean;
  isFavorite: (id: string) => boolean;

  /** Add to the active shelf, moving it off any other shelf it was on */
  addToActiveShelf: (id: string) => void;
  /** Remove a figure from whichever shelf holds it */
  removeOwned: (id: string) => void;
  toggleFavorite: (id: string) => void;
  removeFavorite: (id: string) => void;

  /** Create a new shelf, make it active, and return its id */
  createShelf: (name: string) => string;
  renameShelf: (id: string, name: string) => void;
  /** Remove a shelf (no-op when only one remains); reassigns active if needed */
  removeShelf: (id: string) => void;
  setActiveShelf: (id: string) => void;
  setShelfColor: (id: string, color: string) => void;
  setShelfBackground: (id: string, background: string) => void;
  setShelfTexture: (id: string, texture: string) => void;
}

export const useCollection = create<CollectionState>()((set, get) => {
  const initial = defaultShelf();

  /** Updates one shelf via `updater`, applies it locally, and pushes it to Supabase. */
  function patchShelf(id: string, updater: (sh: Shelf) => Shelf) {
    let updated: Shelf | undefined;
    set((s) => ({
      shelves: s.shelves.map((sh) => {
        if (sh.id !== id) return sh;
        updated = updater(sh);
        return updated;
      }),
    }));
    if (updated) pushShelf(updated);
  }

  return {
    shelves: [initial],
    activeShelfId: initial.id,
    favorites: [],
    hydrated: false,

    hydrate: async () => {
      if (!supabase) {
        set({ hydrated: true });
        return;
      }

      try {
        const remote = await fetchCollection();
        if (remote) {
          set({
            shelves: remote.shelves,
            activeShelfId: remote.activeShelfId,
            favorites: remote.favorites,
            hydrated: true,
          });
          return;
        }

        const legacy = await loadAndClearLegacyCollection();
        if (legacy) {
          set({
            shelves: legacy.shelves,
            activeShelfId: legacy.activeShelfId,
            favorites: legacy.favorites,
            hydrated: true,
          });
          migrateLegacyCollection(legacy.shelves, legacy.activeShelfId, legacy.favorites).catch((e) =>
            console.warn('Failed to migrate legacy collection to Supabase', e),
          );
          return;
        }

        // Brand new install: keep the in-memory default shelf, and create it remotely.
        const { shelves } = get();
        upsertShelfRemote(shelves[0], true).catch((e) =>
          console.warn('Failed to create default shelf remotely', e),
        );
        set({ hydrated: true });
      } catch (e) {
        console.warn('Failed to hydrate collection from Supabase', e);
        set({ hydrated: true });
      }
    },

    activeShelf: () => {
      const s = get();
      return s.shelves.find((sh) => sh.id === s.activeShelfId) ?? s.shelves[0];
    },

    shelfOf: (figureId) => get().shelves.find((sh) => sh.figureIds.includes(figureId)),

    isOwned: (id) => get().shelves.some((sh) => sh.figureIds.includes(id)),
    isFavorite: (id) => get().favorites.includes(id),

    addToActiveShelf: (id) => {
      const before = get().shelves;
      const activeShelfId = get().activeShelfId;
      const after = before.map((sh) => {
        if (sh.id === activeShelfId) {
          return sh.figureIds.includes(id) ? sh : { ...sh, figureIds: [...sh.figureIds, id] };
        }
        // Remove it from any other shelf so a figure lives in one place.
        return sh.figureIds.includes(id)
          ? { ...sh, figureIds: sh.figureIds.filter((x) => x !== id) }
          : sh;
      });
      set({ shelves: after });
      after.forEach((sh, i) => {
        if (sh !== before[i]) pushShelf(sh);
      });
    },

    removeOwned: (id) => {
      const before = get().shelves;
      const after = before.map((sh) =>
        sh.figureIds.includes(id) ? { ...sh, figureIds: sh.figureIds.filter((x) => x !== id) } : sh,
      );
      set({ shelves: after });
      after.forEach((sh, i) => {
        if (sh !== before[i]) pushShelf(sh);
      });
    },

    toggleFavorite: (id) => {
      const wasFavorite = get().favorites.includes(id);
      set((s) => ({
        favorites: wasFavorite ? s.favorites.filter((x) => x !== id) : [...s.favorites, id],
      }));
      (wasFavorite ? removeFavoriteRemote(id) : addFavoriteRemote(id)).catch((e) =>
        console.warn('Failed to sync favorite', e),
      );
    },

    removeFavorite: (id) => {
      set((s) => ({ favorites: s.favorites.filter((x) => x !== id) }));
      removeFavoriteRemote(id).catch((e) => console.warn('Failed to sync favorite removal', e));
    },

    createShelf: (name) => {
      const shelf = defaultShelf(name.trim() || 'New Shelf');
      set((s) => ({ shelves: [...s.shelves, shelf], activeShelfId: shelf.id }));
      upsertShelfRemote(shelf)
        .then(() => setActiveShelfRemote(shelf.id))
        .catch((e) => console.warn('Failed to create shelf remotely', e));
      return shelf.id;
    },

    renameShelf: (id, name) => patchShelf(id, (sh) => ({ ...sh, name: name.trim() || sh.name })),

    removeShelf: (id) => {
      const s = get();
      if (s.shelves.length <= 1) return;
      const shelves = s.shelves.filter((sh) => sh.id !== id);
      const wasActive = s.activeShelfId === id;
      const activeShelfId = wasActive ? shelves[0].id : s.activeShelfId;
      set({ shelves, activeShelfId });
      deleteShelfRemote(id)
        .then(() => (wasActive ? setActiveShelfRemote(activeShelfId) : undefined))
        .catch((e) => console.warn('Failed to remove shelf remotely', e));
    },

    setActiveShelf: (id) => {
      set({ activeShelfId: id });
      setActiveShelfRemote(id).catch((e) => console.warn('Failed to sync active shelf', e));
    },

    setShelfColor: (id, color) => patchShelf(id, (sh) => ({ ...sh, color })),
    setShelfBackground: (id, background) => patchShelf(id, (sh) => ({ ...sh, background })),
    setShelfTexture: (id, texture) => patchShelf(id, (sh) => ({ ...sh, texture })),
  };
});
