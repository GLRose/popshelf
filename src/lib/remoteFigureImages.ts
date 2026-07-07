import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const BUCKET = 'figure-images';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // re-signed on every app launch anyway

/**
 * Uploads a processed image and queues it for moderation. Resolves once
 * queued, not once approved - see supabase/schema.sql for the review flow.
 * No-ops when Supabase isn't configured.
 */
export async function submitForReview(figureId: string, uri: string): Promise<void> {
  if (!supabase) return;

  const path = `pending/${figureId}/${Date.now()}.png`;
  const body = await readForUpload(uri);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType: 'image/png' });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase
    .from('figure_images')
    .insert({ figure_id: figureId, storage_path: path });
  if (insertError) throw insertError;
}

/** Every figureId -> signed uri for images the community has approved. */
export async function fetchApprovedImages(): Promise<Record<string, string>> {
  if (!supabase) return {};

  const { data, error } = await supabase
    .from('figure_images')
    .select('figure_id, storage_path')
    .eq('status', 'approved');
  if (error || !data) return {};

  const uris: Record<string, string> = {};
  await Promise.all(
    data.map(async ({ figure_id, storage_path }) => {
      const { data: signed } = await supabase!.storage
        .from(BUCKET)
        .createSignedUrl(storage_path, SIGNED_URL_TTL_SECONDS);
      if (signed) uris[figure_id] = signed.signedUrl;
    }),
  );
  return uris;
}

/** RN's Blob over local file:// uris is unreliable; arraybuffer is the documented workaround. */
async function readForUpload(uri: string): Promise<Blob | ArrayBuffer> {
  const res = await fetch(uri);
  return Platform.OS === 'web' ? res.blob() : res.arrayBuffer();
}
