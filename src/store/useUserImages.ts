import AsyncStorage from '@react-native-async-storage/async-storage';
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
 * figureId -> the `figure_images` row id whose bytes are cached in the
 * `community` slot. Lets hydrate() tell "already have this one" from "the
 * approved image for this figure was replaced", so it only downloads what
 * actually changed instead of re-fetching every approved image every launch.
 */
const MANIFEST_KEY = 'popshelf-community-images-v1';
type Manifest = Record<string, string>;

/**
 * User-added images for figures that ship without a bundled cutout.
 *
 * Two slots, kept apart on purpose. `mine` is what this device's owner picked;
 * `community` is what moderation approved for everyone. They used to share one
 * slot, which meant an approved image silently overwrote the user's own, and a
 * revoked image lived on forever because nothing ever removed it locally.
 *
 * The platform image store (IndexedDB on web, documents dir on native) is a
 * local cache; the Supabase `figure_images` table + storage bucket is the
 * shared source of truth once an image is approved (see supabase/schema.sql).
 */
interface UserImagesState {
  /** Images this device's owner chose. Wins over `community` when displayed. */
  mine: Record<string, string>;
  /** Images approved for everyone, mirrored down from Supabase. */
  community: Record<string, string>;
  hydrated: boolean;

  /** Load stored images into memory and reconcile the community slot against the server; called once at app start */
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
      const { mine, community } = await loadUserImages();
      set({ mine, community, hydrated: true });
    } catch (e) {
      console.warn('Failed to load user images', e);
      set({ hydrated: true });
    }

    // No backend means no authority to reconcile against: fetchApprovedImages()
    // answers {} on an unconfigured build, which is indistinguishable from
    // "everything was revoked" and would wipe the community cache.
    if (!supabase) return;

    try {
      const approved = await fetchApprovedImages();
      // Reconcile first. Migration wants to throw away legacy bytes the server
      // can hand back, and it can only safely do that once the replacement has
      // actually landed in the `community` slot.
      await reconcileCommunityImages(approved, set, get);
      await migrateLegacyImages(approved, set, get);
    } catch (e) {
      // Offline, or the table is unreadable. The local cache still displays,
      // the legacy migration stays pending, and the next launch retries.
      // Notably we do NOT prune here - a failed fetch says nothing about what
      // is still approved.
      console.warn('Failed to sync community images', e);
    }
  },

  add: async (figureId, uri) => {
    const stored = await saveUserImage(figureId, uri, 'mine');
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
    await deleteUserImage(figureId, 'mine');
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
 * Sorts pre-slot cached images into `mine` or `community`. Runs after
 * reconciliation, so the `community` slot already holds whatever the server
 * handed back on this launch.
 *
 * The old flat path was written by both slots, so a file there is ambiguous on
 * its face. The approved set disambiguates it: if the figure has no approved
 * image today, the file can only have come from a local add, so it's `mine`. If
 * it does, that download is what last wrote the file and the bytes are
 * recoverable - but only discard them once the replacement is confirmed on
 * disk, otherwise a failed download leaves the user staring at a placeholder
 * where their image used to be. A figure whose download failed keeps its legacy
 * file and is retried next launch.
 *
 * Self-terminating: once no legacy files remain this does nothing. It only runs
 * when the approved set was fetched successfully, so an offline launch leaves
 * the files where they are rather than guessing.
 */
async function migrateLegacyImages(
  approved: Record<string, ApprovedImage>,
  set: SetState,
  get: () => UserImagesState,
) {
  for (const figureId of await listLegacyImages()) {
    try {
      if (!approved[figureId]) {
        const uri = await promoteLegacyImage(figureId);
        if (uri) set((s) => ({ mine: { ...s.mine, [figureId]: uri } }));
        continue;
      }
      if (!get().community[figureId]) continue;

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

/**
 * Makes the `community` slot match the server's approved set exactly.
 *
 * Pruning is the whole point: an image that was approved, cached here, and then
 * revoked has to disappear from this device. Nothing else ever removes it.
 */
async function reconcileCommunityImages(
  approved: Record<string, ApprovedImage>,
  set: SetState,
  get: () => UserImagesState,
) {
  const manifest = await readManifest();

  for (const figureId of Object.keys(get().community)) {
    if (approved[figureId]) continue;
    try {
      await deleteUserImage(figureId, 'community');
      set((s) => {
        const { [figureId]: _, ...community } = s.community;
        return { community };
      });
    } catch (e) {
      console.warn(`Failed to prune revoked community image for ${figureId}`, e);
    }
  }

  const next: Manifest = {};
  await Promise.all(
    Object.entries(approved).map(async ([figureId, { id, signedUrl }]) => {
      if (manifest[figureId] === id && get().community[figureId]) {
        next[figureId] = id;
        return;
      }
      try {
        const stored = await saveUserImage(figureId, signedUrl, 'community');
        set((s) => ({ community: { ...s.community, [figureId]: stored } }));
        next[figureId] = id;
      } catch (e) {
        // Leave it out of the manifest so the next launch tries again.
        console.warn(`Failed to download approved image for ${figureId}`, e);
      }
    }),
  );

  await writeManifest(next);
}

async function readManifest(): Promise<Manifest> {
  try {
    const raw = await AsyncStorage.getItem(MANIFEST_KEY);
    return raw ? (JSON.parse(raw) as Manifest) : {};
  } catch (e) {
    console.warn('Failed to read the community image manifest; treating it as empty', e);
    return {};
  }
}

async function writeManifest(manifest: Manifest): Promise<void> {
  try {
    await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
  } catch (e) {
    // Only costs a redundant re-download next launch.
    console.warn('Failed to write the community image manifest', e);
  }
}
