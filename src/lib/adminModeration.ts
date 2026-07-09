import { deleteImages } from '@/lib/remoteFigureImages';
import { supabase } from '@/lib/supabase';

const BUCKET = 'figure-images';
const REVIEW_SIGNED_URL_TTL_SECONDS = 60 * 10; // short-lived; re-signed on every queue fetch

export type ModerationStatus = 'pending' | 'approved' | 'rejected';

export interface ReviewImage {
  id: string;
  figureId: string;
  storagePath: string;
  createdAt: string;
  signedUrl: string | null;
}

/**
 * Throws on failure rather than reporting an empty list, so a misconfigured
 * backend can't masquerade as "all caught up" / "nothing published".
 */
async function fetchByStatus(status: ModerationStatus, oldestFirst: boolean): Promise<ReviewImage[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('figure_images')
    .select('id, figure_id, storage_path, created_at')
    .eq('status', status)
    .order('created_at', { ascending: oldestFirst });
  if (error) throw error;
  if (!data) return [];

  return Promise.all(
    data.map(async ({ id, figure_id, storage_path, created_at }) => {
      const { data: signed } = await supabase!.storage
        .from(BUCKET)
        .createSignedUrl(storage_path, REVIEW_SIGNED_URL_TTL_SECONDS);
      return {
        id,
        figureId: figure_id,
        storagePath: storage_path,
        createdAt: created_at,
        signedUrl: signed?.signedUrl ?? null,
      };
    }),
  );
}

/** Oldest-first queue of everything still awaiting a decision. */
export function fetchPendingImages(): Promise<ReviewImage[]> {
  return fetchByStatus('pending', true);
}

/** Newest-first list of what's currently live for everyone, so it can be revoked. */
export function fetchApprovedImages(): Promise<ReviewImage[]> {
  return fetchByStatus('approved', false);
}

/**
 * Atomically demotes any existing approved image for the figure and promotes
 * this one, then purges what it demoted.
 *
 * A failed purge doesn't fail the approval: the new image is live either way,
 * and the demoted one is already out of circulation as a tombstone. The next
 * purgeRejected() sweep collects it.
 */
export async function approveImage(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('approve_figure_image', { image_id: id });
  if (error) throw error;
  await purgeRejectedQuietly();
}

/**
 * Takes an image out of circulation and destroys it. This is both "reject a
 * pending submission" and "revoke a bad approval" - the row's current status
 * doesn't change what has to happen to it.
 *
 * Tombstone first, purge second. The UPDATE is what actually makes the image
 * disappear (it drops out of the approved set, so every device prunes its
 * cached copy on next launch), and it's atomic. The purge that follows only
 * reclaims the row and its bytes, so if it fails the image is still gone and a
 * later sweep finishes the job.
 *
 * `.select()` matters: an UPDATE that RLS filters out is not an error, it just
 * matches zero rows. Without reading the updated row back, a policy that
 * doesn't cover the caller's role looks exactly like a successful rejection.
 */
export async function rejectImage(id: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('figure_images')
    .update({ status: 'rejected' })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new Error(`Rejecting image ${id} affected no rows (blocked by RLS?)`);
  await purgeRejectedQuietly();
}

/**
 * Deletes the bytes and rows of every tombstoned image. Rejected rows are the
 * residue of an interrupted purge, so this is idempotent and safe to call on a
 * schedule - the moderation screen runs it on load, which is what makes an
 * interrupted delete self-healing rather than a permanent orphan.
 */
export async function purgeRejected(): Promise<void> {
  if (!supabase) return;

  const { data, error } = await supabase
    .from('figure_images')
    .select('id, storage_path')
    .eq('status', 'rejected');
  if (error) throw error;
  if (!data?.length) return;

  await deleteImages(data.map(({ id, storage_path }) => ({ id, storagePath: storage_path })));
}

async function purgeRejectedQuietly(): Promise<void> {
  try {
    await purgeRejected();
  } catch (e) {
    console.warn('Failed to purge rejected images; they will be swept up later', e);
  }
}
