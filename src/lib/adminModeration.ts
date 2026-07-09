import { supabase } from '@/lib/supabase';

const BUCKET = 'figure-images';
const REVIEW_SIGNED_URL_TTL_SECONDS = 60 * 10; // short-lived; re-signed on every queue fetch

export type ModerationStatus = 'pending' | 'approved' | 'rejected';

export interface PendingImage {
  id: string;
  figureId: string;
  storagePath: string;
  createdAt: string;
  signedUrl: string | null;
}

/**
 * Oldest-first queue of everything still awaiting a decision. Throws on
 * failure rather than reporting an empty queue, so a misconfigured backend
 * can't masquerade as "all caught up".
 */
export async function fetchPendingImages(): Promise<PendingImage[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('figure_images')
    .select('id, figure_id, storage_path, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
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

/** Atomically demotes any existing approved image for the figure and promotes this one. */
export async function approveImage(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('approve_figure_image', { image_id: id });
  if (error) throw error;
}

/**
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
}
