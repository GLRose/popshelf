import { create } from 'zustand';

import { fetchApprovedImages, submitForReview } from '@/lib/remoteFigureImages';
import { deleteUserImage, loadUserImages, saveUserImage } from '@/lib/userImageStore';

/**
 * User-added images for figures that ship without a bundled cutout.
 * The platform image store (IndexedDB on web, documents dir on native) is a
 * local cache; the Supabase `figure_images` table + storage bucket is the
 * shared source of truth once an image is approved (see
 * supabase/schema.sql). This store mirrors figureId → displayable uri in
 * memory, backed by that local cache.
 */
interface UserImagesState {
  uris: Record<string, string>;
  hydrated: boolean;

  /** Load stored images into memory and sync down community approvals; called once at app start */
  hydrate: () => Promise<void>;
  /** Cache a processed image for a figure, start displaying it, and queue it for review */
  add: (figureId: string, uri: string) => Promise<void>;
  /** Delete a figure's user image from this device's cache */
  remove: (figureId: string) => Promise<void>;
}

export const useUserImages = create<UserImagesState>()((set) => ({
  uris: {},
  hydrated: false,

  hydrate: async () => {
    try {
      const uris = await loadUserImages();
      set({ uris, hydrated: true });
    } catch (e) {
      console.warn('Failed to load user images', e);
      set({ hydrated: true });
    }

    try {
      const approved = await fetchApprovedImages();
      await Promise.all(
        Object.entries(approved).map(async ([figureId, remoteUri]) => {
          const stored = await saveUserImage(figureId, remoteUri);
          set((s) => ({ uris: { ...s.uris, [figureId]: stored } }));
        }),
      );
    } catch (e) {
      console.warn('Failed to sync community images', e);
    }
  },

  add: async (figureId, uri) => {
    const stored = await saveUserImage(figureId, uri);
    set((s) => ({ uris: { ...s.uris, [figureId]: stored } }));
    submitForReview(figureId, uri).catch((e) => console.warn('Failed to submit image for review', e));
  },

  remove: async (figureId) => {
    await deleteUserImage(figureId);
    set((s) => {
      const { [figureId]: _, ...uris } = s.uris;
      return { uris };
    });
  },
}));
