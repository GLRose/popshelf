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

/** Oldest-first queue of everything still awaiting a decision. */
export async function fetchPendingImages(): Promise<PendingImage[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('figure_images')
    .select('id, figure_id, storage_path, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error || !data) return [];

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

export async function rejectImage(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('figure_images').update({ status: 'rejected' }).eq('id', id);
  if (error) throw error;
}
