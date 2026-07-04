import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SHELF_BACKGROUNDS, SHELF_COLORS } from '@/constants/palette';

export interface ShelfSettings {
  /** Ledge color value */
  color: string;
  /** Background color value */
  background: string;
}

interface CollectionState {
  /** Owned figure ids, most-recently-added last */
  collection: string[];
  /** Favorited figure ids (independent of ownership) */
  favorites: string[];
  shelf: ShelfSettings;
  /** Set once persisted state has loaded, so the UI can avoid a flash */
  hydrated: boolean;

  isOwned: (id: string) => boolean;
  isFavorite: (id: string) => boolean;
  toggleOwned: (id: string) => void;
  removeOwned: (id: string) => void;
  toggleFavorite: (id: string) => void;
  removeFavorite: (id: string) => void;
  setShelfColor: (color: string) => void;
  setShelfBackground: (background: string) => void;
}

export const useCollection = create<CollectionState>()(
  persist(
    (set, get) => ({
      collection: [],
      favorites: [],
      shelf: { color: SHELF_COLORS[0].value, background: SHELF_BACKGROUNDS[0].value },
      hydrated: false,

      isOwned: (id) => get().collection.includes(id),
      isFavorite: (id) => get().favorites.includes(id),

      toggleOwned: (id) =>
        set((s) => ({
          collection: s.collection.includes(id)
            ? s.collection.filter((x) => x !== id)
            : [...s.collection, id],
        })),

      removeOwned: (id) => set((s) => ({ collection: s.collection.filter((x) => x !== id) })),

      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id)
            ? s.favorites.filter((x) => x !== id)
            : [...s.favorites, id],
        })),

      removeFavorite: (id) => set((s) => ({ favorites: s.favorites.filter((x) => x !== id) })),

      setShelfColor: (color) => set((s) => ({ shelf: { ...s.shelf, color } })),
      setShelfBackground: (background) => set((s) => ({ shelf: { ...s.shelf, background } })),
    }),
    {
      name: 'popshelf-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ collection: s.collection, favorites: s.favorites, shelf: s.shelf }),
      onRehydrateStorage: () => (state) => {
        useCollection.setState({ hydrated: true });
      },
    },
  ),
);
