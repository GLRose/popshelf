import { create } from 'zustand';

import {
  fetchApprovedImages,
  submitForReview,
  withdrawPendingSubmissions,
  type ApprovedImage,
} from '@/lib/images/remoteFigureImages';
import { supabase } from '@/lib/supabase';
import {
  deleteUserImage,
  discardLegacyImage,
  listLegacyImages,
  loadUserImages,
  promoteLegacyImage,
  saveUserImage,
} from '@/lib/images/userImageStore';

/**
 * Images for figures that ship without a bundled cutout.
 *
 * Two slots, kept apart on purpose. `mine` is what this device's owner picked;
 * `community` is what the server serves everyone. They used to share one slot,
 * which meant an approved image silently overwrote the user's own.
 *
 * The two are stored very differently, and that asymmetry is the point:
 *
 *   `mine`      - a local file (IndexedDB on web, documents dir on native).
 *                 There is nowhere else to get it: an image the user picked but
 *                 never submitted, or submitted and nobody approved, exists only
 *                 on this device.
 *   `community` - just a URL. The bucket is public, so the bytes are an ordinary
 *                 cacheable https GET that the browser and expo-image already
 *                 cache far better than this store ever did. Nothing is
 *                 downloaded until something on screen asks for it.
 *
 * The app used to mirror every approved image into local storage at startup,
 * which meant a new user watched placeholders while the whole catalog
 * downloaded. Deleting that mirror is what makes first paint fast, and it also
 * deleted the bookkeeping it needed: a manifest to spot replaced images, and a
 * reconcile pass to prune revoked ones. `community` is rebuilt from the server
 * on every launch now, so a replaced image is simply a different URL and a
 * revoked one is simply absent.
 */
interface UserImagesState {
  /** Local uris for images this device's owner chose. Win over `community` when displayed. */
  mine: Record<string, string>;
  /** Public bucket urls for the art the server serves everyone. Not downloaded until displayed. */
  community: Record<string, string>;
  hydrated: boolean;

  /** Load local images and learn what art the server has; called once at app start. */
  hydrate: () => Promise<void>;
  /**
   * Cache a processed image for a figure, start displaying it, and queue it for
   * review. Rejects only if the local save failed. `submitted` is false when the
   * image is on this device but never reached the review queue, so callers can
   * say so instead of implying it's now visible to everyone.
   */
  add: (figureId: string, uri: string) => Promise<{ submitted: boolean }>;
  /**
   * Delete the user's own image for a figure and withdraw the submission it
   * created, if that submission is still awaiting review. `withdrawn` is false
   * when the local copy is gone but the queued submission couldn't be recalled,
   * so callers can say so rather than implying it will never be published.
   *
   * An already-approved image is not withdrawn: once published it belongs to
   * everyone, and only a moderator's revoke takes it down. Removing yours just
   * reveals the community's copy underneath.
   */
  remove: (figureId: string) => Promise<{ withdrawn: boolean }>;
}

export const useUserImages = create<UserImagesState>()((set, get) => ({
  mine: {},
  community: {},
  hydrated: false,

  hydrate: async () => {
    try {
      const mine = await loadUserImages();
      set({ mine, hydrated: true });
    } catch (e) {
      console.warn('Failed to load user images', e);
      set({ hydrated: true });
    }

    // No backend, no shared artwork. Everything the user picked still displays.
    if (!supabase) return;

    try {
      const approved = await fetchApprovedImages();
      // One assignment for the whole catalog. The previous per-image set() ran
      // hundreds of store commits, each re-rendering every mounted FigureImage.
      set({
        community: Object.fromEntries(
          Object.entries(approved).map(([figureId, { url }]) => [figureId, url]),
        ),
      });
      await migrateLegacyImages(approved, set);
    } catch (e) {
      // Offline, or the table is unreadable. Deliberately leaves `community`
      // alone rather than emptying it: a failed fetch says nothing about what
      // is still approved, and the legacy migration stays pending for the next
      // launch to retry.
      console.warn('Failed to sync community images', e);
    }
  },

  add: async (figureId, uri) => {
    const stored = await saveUserImage(figureId, uri);
    set((s) => ({ mine: { ...s.mine, [figureId]: stored } }));

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
      const { [figureId]: _, ...mine } = s.mine;
      return { mine };
    });

    try {
      await withdrawPendingSubmissions(figureId);
      return { withdrawn: true };
    } catch (e) {
      console.warn('Failed to withdraw pending submission', e);
      return { withdrawn: false };
    }
  },
}));

type SetState = (partial: (s: UserImagesState) => Partial<UserImagesState>) => void;

/**
 * Resolves images cached at the pre-slot flat path, which both slots once wrote
 * to, so a file there is ambiguous on its face.
 *
 * The approved set disambiguates it. If the figure has no approved image today,
 * the file can only have come from a local add, so it is `mine` and the bytes
 * are kept. If it does, that file is a stale copy of a download the server will
 * happily serve again, so it is discarded and the figure falls through to the
 * `community` url that hydrate() just set.
 *
 * That discard used to wait until a fresh copy was confirmed on disk. There is
 * no copy to confirm any more - `community` is a url, not a file - and nothing
 * is lost either way: the worst case is an offline user seeing a placeholder
 * for a figure whose real art is one connection away.
 *
 * Self-terminating: once no legacy files remain this does nothing. It only runs
 * when the approved set was fetched successfully, so an offline launch leaves
 * the files where they are rather than guessing.
 */
async function migrateLegacyImages(approved: Record<string, ApprovedImage>, set: SetState) {
  for (const figureId of await listLegacyImages()) {
    try {
      if (!approved[figureId]) {
        const uri = await promoteLegacyImage(figureId);
        if (uri) set((s) => ({ mine: { ...s.mine, [figureId]: uri } }));
        continue;
      }

      await discardLegacyImage(figureId);
      set((s) => {
        const { [figureId]: _, ...mine } = s.mine;
        return { mine };
      });
    } catch (e) {
      console.warn(`Failed to migrate legacy image for ${figureId}`, e);
    }
  }
}
