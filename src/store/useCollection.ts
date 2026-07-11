import { create } from 'zustand';

import {
  DEFAULT_BACKGROUND_ID,
  DEFAULT_TEXTURE_ID,
  SHELF_COLORS,
} from '@/constants/palette';
import {
  clearLocalCollection,
  loadLocalCollection,
  saveLocalCollection,
  type LocalCollection,
} from '@/lib/localCollection';
import { mergeCollections } from '@/lib/mergeCollection';
import {
  addFavoriteRemote,
  deleteShelfRemote,
  fetchCollection,
  removeFavoriteRemote,
  setActiveShelfRemote,
  syncCollectionToRemote,
  upsertShelfRemote,
} from '@/lib/remoteCollection';
import { currentUserId, supabase } from '@/lib/supabase';
import type { Shelf } from '@/types';

function makeId() {
  return `shelf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const DEFAULT_SHELF_NAME = 'My Shelf';

function defaultShelf(name = DEFAULT_SHELF_NAME, figureIds: string[] = []): Shelf {
  return {
    id: makeId(),
    name,
    color: SHELF_COLORS[0].value,
    background: DEFAULT_BACKGROUND_ID,
    texture: DEFAULT_TEXTURE_ID,
    figureIds,
  };
}

/**
 * True when the collection is still the untouched starter shelf that this store
 * begins life with - a fresh install, or a device that has just signed out.
 *
 * The starter shelf is a placeholder, not a decision the user made, and telling
 * the two apart matters at sign-in: merging a placeholder into an account leaves
 * an empty "My Shelf" trailing behind the user's real shelves on every new
 * device they ever sign in on. Compared by value rather than by tracking whether
 * anything was stored, because hydrate() persists even an untouched collection -
 * so "is there a saved collection?" answers yes on a device that has never been
 * used, while "does it hold anything?" stays honest.
 */
function isUntouched({ shelves, favorites }: LocalCollection): boolean {
  if (favorites.length > 0 || shelves.length !== 1) return false;
  const [shelf] = shelves;
  return (
    shelf.figureIds.length === 0 &&
    shelf.name === DEFAULT_SHELF_NAME &&
    shelf.color === SHELF_COLORS[0].value &&
    shelf.background === DEFAULT_BACKGROUND_ID &&
    shelf.texture === DEFAULT_TEXTURE_ID
  );
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
  /** Set once the initial local load has finished, so the UI can avoid a flash */
  hydrated: boolean;

  /** Loads shelves/favorites from the on-device store, then reconciles with Supabase in the background */
  hydrate: () => Promise<void>;
  /** After a sign-in: union this device's shelves with the account's, then push the result back up */
  adoptRemoteCollection: () => Promise<void>;
  /** After a sign-out: forget this device's collection and start over empty, local-only */
  resetToEmpty: () => Promise<void>;

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
  /** Swap a figure with the neighbour `delta` slots away on its shelf (no-op at the ends) */
  moveOwned: (id: string, delta: number) => void;
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
      // The on-device store is the source of truth: load it first so the UI
      // never depends on Supabase being reachable, configured, or signed into.
      const local = await loadLocalCollection();
      if (local) {
        set({
          shelves: local.shelves,
          activeShelfId: local.activeShelfId,
          favorites: local.favorites,
          hydrated: true,
        });
      } else {
        set({ hydrated: true });
      }

      // Signed out is the resting state, not a failure. Without an account there
      // is no owner for these rows, so what was just loaded is the whole story
      // and nothing is sent anywhere.
      if (!supabase || !(await currentUserId())) return;

      // Signed in, so reconcile with the account - the same union that runs at
      // sign-in. Doing it on every launch is what lets a shelf added on another
      // device show up here; pushing local up unconditionally would instead
      // overwrite the account with this device's stale view of it.
      try {
        await get().adoptRemoteCollection();
      } catch (e) {
        console.warn('Failed to reconcile the collection with Supabase', e);
      }
    },

    /**
     * Unions this device's shelves with the account's, in both directions, and
     * leaves both holding the result. Called on every sign-in and sign-up, and
     * on launch when already signed in.
     *
     * This is what makes an account worth having, and it is the only path by
     * which a device's shelves acquire an owner. On sign-up the account is empty
     * and this is a plain upload of whatever the user built while signed out; on
     * sign-in from a second device it is a real merge. Nothing is dropped either
     * way - see src/lib/mergeCollection.ts for how collisions are settled.
     */
    adoptRemoteCollection: async () => {
      if (!supabase) return;
      const { shelves, activeShelfId, favorites } = get();
      const local = { shelves, activeShelfId, favorites };

      const remote = await fetchCollection();

      // This device has nothing of its own, so take the account's collection
      // whole. Merging instead would fold the starter shelf in as if it were
      // real, and every fresh device would add another empty "My Shelf" to the
      // account. Nothing is uploaded: what we just read is already up there.
      if (remote && isUntouched(local)) {
        set({
          shelves: remote.shelves,
          activeShelfId: remote.activeShelfId,
          favorites: remote.favorites,
        });
        return;
      }

      const merged = remote ? mergeCollections(local, remote) : local;
      set({
        shelves: merged.shelves,
        activeShelfId: merged.activeShelfId,
        favorites: merged.favorites,
      });

      // Already saved locally by the subscriber below, so a failed push is
      // recoverable: the next hydrate() syncs local up to the account.
      await syncCollectionToRemote(merged.shelves, merged.activeShelfId, merged.favorites).catch(
        (e) => console.warn('Failed to push the merged collection to Supabase', e),
      );
    },

    /**
     * Called after signing out, which drops this device back to local-only. The
     * shelves being forgotten are safe in the account that was just left and
     * come back on the next sign-in; keeping them on the device instead would
     * mean the next person to sign in here inherits a stranger's collection,
     * since adoptRemoteCollection() would merge it straight into their account.
     */
    resetToEmpty: async () => {
      await clearLocalCollection();
      const shelf = defaultShelf();
      set({ shelves: [shelf], activeShelfId: shelf.id, favorites: [], hydrated: true });
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

    moveOwned: (id, delta) => {
      const shelf = get().shelves.find((sh) => sh.figureIds.includes(id));
      if (!shelf) return;
      const from = shelf.figureIds.indexOf(id);
      const to = from + delta;
      if (to < 0 || to >= shelf.figureIds.length) return;
      patchShelf(shelf.id, (sh) => {
        const figureIds = [...sh.figureIds];
        [figureIds[from], figureIds[to]] = [figureIds[to], figureIds[from]];
        return { ...sh, figureIds };
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

// Mirrors every post-hydration change to the on-device store, so shelves and
// favorites survive regardless of Supabase's availability or configuration.
useCollection.subscribe((state) => {
  if (!state.hydrated) return;
  saveLocalCollection({
    shelves: state.shelves,
    activeShelfId: state.activeShelfId,
    favorites: state.favorites,
  }).catch((e) => console.warn('Failed to save collection locally', e));
});
