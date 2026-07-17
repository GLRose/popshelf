/**
 * Web implementation: user-added figure images live as PNG Blobs in IndexedDB
 * (localStorage's ~5 MB quota is too small for dozens of cutouts) and are
 * handed to the UI as object URLs.
 *
 * Two slots, keyed `mine:<figureId>` and `community:<figureId>`, because an
 * image the user picked and an image the community approved are different
 * things that happen to be about the same figure. Keys rather than a second
 * object store, so the database version doesn't have to change. Keys with no
 * prefix are legacy, from before slots existed, and are migrated on first
 * launch - see hydrate() in src/store/useUserImages.ts.
 *
 * This is a local cache, not the source of truth - see
 * src/lib/remoteFigureImages.ts for the shared, moderated Supabase store.
 */

const DB_NAME = 'popshelf-user-images';
const STORE = 'images';

export type ImageSlot = 'mine' | 'community';

const keyFor = (figureId: string, slot: ImageSlot) => `${slot}:${figureId}`;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persists an image (data uri or remote url) into a slot and returns a displayable uri. */
export async function saveUserImage(figureId: string, uri: string, slot: ImageSlot): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(blob, keyFor(figureId, slot));
  await done(tx);
  db.close();
  return URL.createObjectURL(blob);
}

export async function deleteUserImage(figureId: string, slot: ImageSlot): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(keyFor(figureId, slot));
  await done(tx);
  db.close();
}

/**
 * Every stored image as figureId -> object URL, per slot, for app startup.
 * Un-migrated legacy images surface under `mine` so they still display on a
 * launch where the migration can't run (no network to classify them against
 * the approved set).
 */
export async function loadUserImages(): Promise<Record<ImageSlot, Record<string, string>>> {
  const entries = await readAll();
  const slots: Record<ImageSlot, Record<string, string>> = { mine: {}, community: {} };

  for (const [key, blob] of entries) {
    const [slot, figureId] = splitKey(key);
    if (slot === null) {
      slots.mine[figureId] ??= URL.createObjectURL(blob);
    } else {
      slots[slot][figureId] = URL.createObjectURL(blob);
    }
  }
  return slots;
}

/** Figure ids still cached under the pre-slot unprefixed keys. Empty once migration has run. */
export async function listLegacyImages(): Promise<string[]> {
  const entries = await readAll();
  return entries.map(([key]) => splitKey(key)).filter(([slot]) => slot === null).map(([, id]) => id);
}

/**
 * Claims a legacy image as the user's own, keeping the bytes.
 *
 * Reads and writes in separate transactions: an IndexedDB transaction commits
 * as soon as the event loop yields with nothing pending, so issuing the put()
 * after awaiting the get() would race the auto-commit. The write half is one
 * transaction, so it can't half-apply; a crash between the two just leaves the
 * legacy key in place for the next launch to promote again.
 */
export async function promoteLegacyImage(figureId: string): Promise<string> {
  const db = await openDb();
  const readStore = db.transaction(STORE, 'readonly').objectStore(STORE);
  const blob = await request<Blob | undefined>(readStore.get(figureId));
  if (!blob) {
    db.close();
    return '';
  }

  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(blob, keyFor(figureId, 'mine'));
  tx.objectStore(STORE).delete(figureId);
  await done(tx);
  db.close();
  return URL.createObjectURL(blob);
}

/** Drops a legacy image the server can hand back. Cheaper than moving it, since it's about to be re-downloaded into `community`. */
export async function discardLegacyImage(figureId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(figureId);
  await done(tx);
  db.close();
}

/** `null` slot means an unprefixed legacy key. Figure ids never contain a colon. */
function splitKey(key: string): [ImageSlot | null, string] {
  const sep = key.indexOf(':');
  if (sep === -1) return [null, key];
  return [key.slice(0, sep) as ImageSlot, key.slice(sep + 1)];
}

async function readAll(): Promise<[string, Blob][]> {
  const db = await openDb();
  const store = db.transaction(STORE, 'readonly').objectStore(STORE);
  const [keys, values] = await Promise.all([
    request<IDBValidKey[]>(store.getAllKeys()),
    request<Blob[]>(store.getAll()),
  ]);
  db.close();
  return keys.map((key, i) => [String(key), values[i]]);
}
