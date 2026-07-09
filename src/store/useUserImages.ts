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
  /**
   * Cache a processed image for a figure, start displaying it, and queue it for
   * review. Rejects only if the local save failed. `submitted` is false when the
   * image is on this device but never reached the review queue, so callers can
   * say so instead of implying it's now visible to everyone.
   */
  add: (figureId: string, uri: string) => Promise<{ submitted: boolean }>;
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

    // The local cache is authoritative for display, so a failed upload must not
    // undo the save - but it does mean nobody else will ever see this image.
    try {
      await submitForReview(figureId, uri);
      return { submitted: true };
    } catch (e) {
      console.warn('Failed to submit image for review', e);
      return { submitted: false };
    }
  },

  remove: async (figureId) => {
    await deleteUserImage(figureId);
    set((s) => {
      const { [figureId]: _, ...uris } = s.uris;
      return { uris };
    });
  },
}));
