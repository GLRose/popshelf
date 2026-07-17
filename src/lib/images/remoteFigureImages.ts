import { Platform } from 'react-native';

import { currentUserId, supabase } from '@/lib/supabase';

const BUCKET = 'figure-images';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // re-signed on every app launch anyway

/** An image the community has approved, as it exists on the server right now. */
export interface ApprovedImage {
  /** The `figure_images` row id. Changes when a figure's image is replaced, which is how the local cache knows to re-download. */
  id: string;
  signedUrl: string;
}

/** Enough to delete an image: the bytes to remove, and the row to remove after. */
export interface DeletableImage {
  id: string;
  storagePath: string;
}

/**
 * Uploads a processed image and queues it for moderation. Resolves once
 * queued, not once approved - see supabase/schema.sql for the review flow.
 * No-ops when Supabase isn't configured.
 *
 * A submission is owned (figure_images.owner_id, and the owner's id in the
 * storage path), so it needs an account and throws without one. Signed-out users
 * can still pick an image and see it on their own shelf - useUserImages.add()
 * keeps the local copy and reports `submitted: false` - it just stays on the
 * device instead of going to the review queue.
 */
export async function submitForReview(figureId: string, uri: string): Promise<void> {
  if (!supabase) return;

  const ownerId = await currentUserId();
  if (!ownerId) {
    throw new Error('Sign in to share an image: a submission needs an account to own it.');
  }

  const path = `submissions/${ownerId}/${figureId}/${Date.now()}.png`;
  const body = await readForUpload(uri);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType: 'image/png' });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase
    .from('figure_images')
    .insert({ figure_id: figureId, storage_path: path, owner_id: ownerId });
  if (insertError) throw insertError;
}

/**
 * Every figureId -> the one image the app should show for it.
 *
 * A figure can have two approved rows at once: its catalog art (the artwork the
 * app used to bundle) and an approved community submission. The community one
 * wins - someone looked at the catalog image, decided a user's was better, and
 * approved it - and the catalog one is the floor underneath: revoking the
 * community image reveals the original art on the next sync rather than a
 * placeholder. Collapsing that choice here is what lets the local cache stay a
 * single `community` slot instead of two.
 *
 * Throws when the query fails: an RLS denial here reads as an empty result set
 * rather than an error, so swallowing genuine errors on top of that would leave
 * no way at all to tell "nothing approved yet" from "we can't see the table".
 */
export async function fetchApprovedImages(): Promise<Record<string, ApprovedImage>> {
  if (!supabase) return {};

  const { data, error } = await supabase
    .from('figure_images')
    .select('id, figure_id, storage_path, source')
    .eq('status', 'approved');
  if (error) throw error;
  if (!data) return {};

  const best = new Map<string, { id: string; storage_path: string }>();
  for (const row of data) {
    const incumbent = best.get(row.figure_id);
    if (!incumbent || row.source === 'community') best.set(row.figure_id, row);
  }

  const approved: Record<string, ApprovedImage> = {};
  await Promise.all(
    [...best].map(async ([figureId, { id, storage_path }]) => {
      const { data: signed, error: signError } = await supabase!.storage
        .from(BUCKET)
        .createSignedUrl(storage_path, SIGNED_URL_TTL_SECONDS);
      if (signError || !signed) {
        console.warn(`Failed to sign approved image for ${figureId}`, signError);
        return;
      }
      approved[figureId] = { id, signedUrl: signed.signedUrl };
    }),
  );
  return approved;
}

/**
 * Removes images from the bucket and then from the table.
 *
 * Order matters. Deleting the bytes first means a failure part-way through
 * leaves a row whose object is already gone - visible, and retried by
 * purgeRejected(). Deleting the row first would leave the bytes in the bucket
 * with nothing left pointing at them, unfindable and billable forever.
 *
 * `.select()` on the delete is the same guard rejectImage() uses: a DELETE that
 * RLS filters out is not an error, it just matches zero rows, so without
 * reading the deleted rows back a missing policy looks like success.
 */
export async function deleteImages(images: DeletableImage[]): Promise<void> {
  if (!supabase || images.length === 0) return;

  const { error: removeError } = await supabase.storage
    .from(BUCKET)
    .remove(images.map((i) => i.storagePath));
  if (removeError) throw removeError;

  const ids = images.map((i) => i.id);
  const { data, error } = await supabase.from('figure_images').delete().in('id', ids).select('id');
  if (error) throw error;
  if (data?.length !== ids.length) {
    throw new Error(
      `Deleting ${ids.length} figure_images row(s) removed ${data?.length ?? 0} (blocked by RLS?)`,
    );
  }
}

/**
 * Withdraws this device's own still-pending submissions for a figure, used when
 * the submitter removes their image before anyone has reviewed it. Approved
 * images are deliberately out of scope: once published they belong to everyone,
 * and only a moderator's revoke takes them down.
 */
export async function withdrawPendingSubmissions(figureId: string): Promise<void> {
  if (!supabase) return;

  const ownerId = await currentUserId();
  if (!ownerId) return;

  const { data, error } = await supabase
    .from('figure_images')
    .select('id, storage_path')
    .eq('figure_id', figureId)
    .eq('owner_id', ownerId)
    .eq('status', 'pending');
  if (error) throw error;
  if (!data?.length) return;

  await deleteImages(data.map(({ id, storage_path }) => ({ id, storagePath: storage_path })));
}

/** RN's Blob over local file:// uris is unreliable; arraybuffer is the documented workaround. */
async function readForUpload(uri: string): Promise<Blob | ArrayBuffer> {
  const res = await fetch(uri);
  return Platform.OS === 'web' ? res.blob() : res.arrayBuffer();
}
