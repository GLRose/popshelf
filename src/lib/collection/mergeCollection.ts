import type { SyncCollection } from '@/lib/collection/localCollection';

/**
 * Unions a device's collection with the one already stored under the account
 * being signed into. Nothing is ever dropped: a shelf present in only one of
 * the two survives, and a shelf present in both keeps the device's copy.
 *
 * Preferring the device's copy on an id collision is deliberate. Shelf ids are
 * client-generated (`shelf_<time>_<rand>`), so the same id appearing on both
 * sides means it is literally the same shelf, seen from a device that may have
 * edited it while signed out. The device holds the newer edit by definition -
 * it is the source of truth here (see src/lib/localCollection.ts).
 *
 * Device shelves keep their order and lead, so a user who just signed in still
 * sees the shelf they were looking at a moment ago; the account's other shelves
 * follow.
 */
export function mergeCollections(local: SyncCollection, remote: SyncCollection): SyncCollection {
  const byId = new Map(local.shelves.map((sh) => [sh.id, sh]));
  for (const shelf of remote.shelves) {
    if (!byId.has(shelf.id)) byId.set(shelf.id, shelf);
  }
  const shelves = [...byId.values()];

  return {
    shelves,
    // The device's active shelf survived the merge by construction, but fall
    // back anyway rather than trust it and render an empty shelf.
    activeShelfId: shelves.some((sh) => sh.id === local.activeShelfId)
      ? local.activeShelfId
      : shelves[0].id,
    favorites: [...new Set([...local.favorites, ...remote.favorites])],
  };
}
