import { currentUserId, supabase } from '@/lib/supabase';
import type { Shelf } from '@/types';

/**
 * Every function here is a no-op when signed out: with no auth.uid() there is no
 * owner to write rows as, and RLS would reject them anyway. That is not an error
 * condition - a signed-out device is local-only by design, and its collection
 * lives in src/lib/localCollection.ts until an account claims it.
 */

interface ShelfRow {
  id: string;
  name: string;
  color: string;
  background: string;
  texture: string;
  figure_ids: string[];
  is_active: boolean;
}

function fromRow(row: ShelfRow): Shelf {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    background: row.background,
    texture: row.texture,
    figureIds: row.figure_ids,
  };
}

export interface RemoteCollection {
  shelves: Shelf[];
  activeShelfId: string;
  favorites: string[];
}

/** Loads the signed-in owner's shelves + favorites. Null if unconfigured, no session, or the owner has no shelves yet. */
export async function fetchCollection(): Promise<RemoteCollection | null> {
  if (!supabase) return null;
  const ownerId = await currentUserId();
  if (!ownerId) return null;

  const [{ data: shelfRows, error: shelfError }, { data: favRows, error: favError }] =
    await Promise.all([
      supabase
        .from('shelves')
        .select('id, name, color, background, texture, figure_ids, is_active')
        .order('created_at', { ascending: true }),
      supabase.from('favorites').select('figure_id'),
    ]);
  if (shelfError || favError || !shelfRows || shelfRows.length === 0) return null;

  const shelves = shelfRows.map(fromRow);
  const active = shelfRows.find((r) => r.is_active) ?? shelfRows[0];

  return {
    shelves,
    activeShelfId: active.id,
    favorites: (favRows ?? []).map((r) => r.figure_id),
  };
}

/** Upserts a single shelf's current fields (and active flag, if given). No-op when unconfigured. */
export async function upsertShelfRemote(shelf: Shelf, isActive?: boolean): Promise<void> {
  if (!supabase) return;
  const ownerId = await currentUserId();
  if (!ownerId) return;

  await supabase.from('shelves').upsert({
    id: shelf.id,
    owner_id: ownerId,
    name: shelf.name,
    color: shelf.color,
    background: shelf.background,
    texture: shelf.texture,
    figure_ids: shelf.figureIds,
    ...(isActive !== undefined ? { is_active: isActive } : {}),
    updated_at: new Date().toISOString(),
  });
}

export async function deleteShelfRemote(id: string): Promise<void> {
  if (!supabase) return;
  if (!(await currentUserId())) return;

  // RLS scopes the delete to the caller's own shelves, so no owner_id filter.
  await supabase.from('shelves').delete().eq('id', id);
}

/**
 * Clears is_active on every other shelf first, then sets it on the target -
 * the partial unique index (shelves_one_active_per_owner) isn't deferrable,
 * so a shelf must be deactivated before another is activated. Sequential
 * rather than atomic: two devices racing to change the active shelf could
 * briefly leave none active, which the next fetchCollection() heals by falling
 * back to the first shelf.
 */
export async function setActiveShelfRemote(id: string): Promise<void> {
  if (!supabase) return;
  const ownerId = await currentUserId();
  if (!ownerId) return;

  await supabase.from('shelves').update({ is_active: false }).eq('owner_id', ownerId).neq('id', id);
  await supabase.from('shelves').update({ is_active: true }).eq('id', id);
}

export async function addFavoriteRemote(figureId: string): Promise<void> {
  if (!supabase) return;
  const ownerId = await currentUserId();
  if (!ownerId) return;

  await supabase.from('favorites').upsert({ owner_id: ownerId, figure_id: figureId });
}

export async function removeFavoriteRemote(figureId: string): Promise<void> {
  if (!supabase) return;
  const ownerId = await currentUserId();
  if (!ownerId) return;

  await supabase
    .from('favorites')
    .delete()
    .eq('owner_id', ownerId)
    .eq('figure_id', figureId);
}

/**
 * Bulk-uploads the local collection as a best-effort backfill/sync - the
 * local copy in src/lib/localCollection.ts is the source of truth, this is
 * just keeping Supabase's mirror of it current. No-op when unconfigured.
 *
 * Uploads every shelf inactive, then activates one, for the same reason
 * setActiveShelfRemote does it in two steps: shelves_one_active_per_owner is a
 * non-deferrable partial unique index, and a multi-row upsert that activates
 * one shelf before deactivating the previously-active one trips it mid-
 * statement. Sending them all as inactive first means there is never a moment
 * with two.
 */
export async function syncCollectionToRemote(
  shelves: Shelf[],
  activeShelfId: string,
  favorites: string[],
): Promise<void> {
  if (!supabase) return;
  const ownerId = await currentUserId();
  if (!ownerId) return;

  await supabase.from('shelves').upsert(
    shelves.map((shelf) => ({
      id: shelf.id,
      owner_id: ownerId,
      name: shelf.name,
      color: shelf.color,
      background: shelf.background,
      texture: shelf.texture,
      figure_ids: shelf.figureIds,
      is_active: false,
    })),
  );
  await setActiveShelfRemote(activeShelfId);

  if (favorites.length > 0) {
    await supabase
      .from('favorites')
      .upsert(favorites.map((figureId) => ({ owner_id: ownerId, figure_id: figureId })));
  }
}
