import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SHELF_BACKGROUNDS, SHELF_COLORS } from '@/constants/palette';
import type { Shelf } from '@/types';

function makeId() {
  return `shelf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function defaultShelf(name = 'My Shelf', figureIds: string[] = []): Shelf {
  return {
    id: makeId(),
    name,
    color: SHELF_COLORS[0].value,
    background: SHELF_BACKGROUNDS[0].value,
    figureIds,
  };
}

interface CollectionState {
  /** All shelves; at least one always exists */
  shelves: Shelf[];
  /** Id of the shelf figures are added to / displayed */
  activeShelfId: string;
  /** Favorited figure ids (independent of ownership) */
  favorites: string[];
  /** Set once persisted state has loaded, so the UI can avoid a flash */
  hydrated: boolean;

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
}

export const useCollection = create<CollectionState>()(
  persist(
    (set, get) => {
      const initial = defaultShelf();
      return {
        shelves: [initial],
        activeShelfId: initial.id,
        favorites: [],
        hydrated: false,

        activeShelf: () => {
          const s = get();
          return s.shelves.find((sh) => sh.id === s.activeShelfId) ?? s.shelves[0];
        },

        shelfOf: (figureId) => get().shelves.find((sh) => sh.figureIds.includes(figureId)),

        isOwned: (id) => get().shelves.some((sh) => sh.figureIds.includes(id)),
        isFavorite: (id) => get().favorites.includes(id),

        addToActiveShelf: (id) =>
          set((s) => ({
            shelves: s.shelves.map((sh) => {
              if (sh.id === s.activeShelfId) {
                return sh.figureIds.includes(id)
                  ? sh
                  : { ...sh, figureIds: [...sh.figureIds, id] };
              }
              // Remove it from any other shelf so a figure lives in one place.
              return sh.figureIds.includes(id)
                ? { ...sh, figureIds: sh.figureIds.filter((x) => x !== id) }
                : sh;
            }),
          })),

        removeOwned: (id) =>
          set((s) => ({
            shelves: s.shelves.map((sh) =>
              sh.figureIds.includes(id)
                ? { ...sh, figureIds: sh.figureIds.filter((x) => x !== id) }
                : sh,
            ),
          })),

        toggleFavorite: (id) =>
          set((s) => ({
            favorites: s.favorites.includes(id)
              ? s.favorites.filter((x) => x !== id)
              : [...s.favorites, id],
          })),

        removeFavorite: (id) => set((s) => ({ favorites: s.favorites.filter((x) => x !== id) })),

        createShelf: (name) => {
          const shelf = defaultShelf(name.trim() || 'New Shelf');
          set((s) => ({ shelves: [...s.shelves, shelf], activeShelfId: shelf.id }));
          return shelf.id;
        },

        renameShelf: (id, name) =>
          set((s) => ({
            shelves: s.shelves.map((sh) =>
              sh.id === id ? { ...sh, name: name.trim() || sh.name } : sh,
            ),
          })),

        removeShelf: (id) =>
          set((s) => {
            if (s.shelves.length <= 1) return s;
            const shelves = s.shelves.filter((sh) => sh.id !== id);
            const activeShelfId = s.activeShelfId === id ? shelves[0].id : s.activeShelfId;
            return { shelves, activeShelfId };
          }),

        setActiveShelf: (id) => set({ activeShelfId: id }),

        setShelfColor: (id, color) =>
          set((s) => ({
            shelves: s.shelves.map((sh) => (sh.id === id ? { ...sh, color } : sh)),
          })),

        setShelfBackground: (id, background) =>
          set((s) => ({
            shelves: s.shelves.map((sh) => (sh.id === id ? { ...sh, background } : sh)),
          })),
      };
    },
    {
      name: 'popshelf-v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        shelves: s.shelves,
        activeShelfId: s.activeShelfId,
        favorites: s.favorites,
      }),
      migrate: (persisted: any, version) => {
        if (!persisted) return persisted;
        if (version < 1) {
          const shelf: Shelf = {
            id: makeId(),
            name: 'My Shelf',
            color: persisted.shelf?.color ?? SHELF_COLORS[0].value,
            background: persisted.shelf?.background ?? SHELF_BACKGROUNDS[0].value,
            figureIds: persisted.collection ?? [],
          };
          return {
            shelves: [shelf],
            activeShelfId: shelf.id,
            favorites: persisted.favorites ?? [],
          };
        }
        return persisted;
      },
      onRehydrateStorage: () => (state) => {
        // Guarantee at least one shelf and a valid active id after loading.
        if (state) {
          if (!state.shelves || state.shelves.length === 0) {
            const shelf = defaultShelf();
            state.shelves = [shelf];
            state.activeShelfId = shelf.id;
          } else if (!state.shelves.some((sh) => sh.id === state.activeShelfId)) {
            state.activeShelfId = state.shelves[0].id;
          }
        }
        useCollection.setState({ hydrated: true });
      },
    },
  ),
);
