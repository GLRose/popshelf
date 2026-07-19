/**
 * Web implementation: the images this device's owner picked live as PNG Blobs
 * in IndexedDB (localStorage's ~5 MB quota is too small for dozens of cutouts)
 * and are handed to the UI as object URLs.
 *
 * Only the user's own pick is stored. Shared artwork - catalog and approved
 * community images - is not cached here at all: it comes from a public bucket
 * over ordinary https, so the browser's HTTP cache and expo-image's own disk
 * cache already handle it, and doing it again here meant downloading every
 * image in the catalog before the first one could be shown. See hydrate() in
 * src/store/useUserImages.ts.
 *
 * Keys are `mine:<figureId>`. Keys with no prefix are legacy, from before slots
 * existed, and are migrated on first launch. Keys under the retired `community:`
 * prefix are deleted on sight by loadUserImages().
 *
 * This is a local cache, not the source of truth - see
 * src/lib/images/remoteFigureImages.ts for the shared, moderated Supabase store.
 */

const DB_NAME = 'popshelf-user-images';
const STORE = 'images';

/** The retired shared-artwork slot. Only referenced to clean it up. */
const COMMUNITY_PREFIX = 'community:';

const keyFor = (figureId: string) => `mine:${figureId}`;

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

/** Persists an image (data uri or remote url) and returns a displayable uri. */
export async function saveUserImage(figureId: string, uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(blob, keyFor(figureId));
  await done(tx);
  db.close();
  return URL.createObjectURL(blob);
}

export async function deleteUserImage(figureId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(keyFor(figureId));
  await done(tx);
  db.close();
}

/**
 * Every image the user picked, as figureId -> object URL, for app startup.
 *
 * Un-migrated legacy images surface here too, so they still display on a launch
 * where the migration can't run (no network to classify them against the
 * approved set).
 *
 * Also reclaims the retired `community:` cache. Previous builds mirrored the
 * entire catalog into this database - hundreds of PNGs - and nothing else will
 * ever read those keys again, so leaving them would strand tens of megabytes of
 * a user's disk quota indefinitely. Failure to prune is not worth failing
 * startup over: the images still load either way.
 */
export async function loadUserImages(): Promise<Record<string, string>> {
  const entries = await readAll();
  const mine: Record<string, string> = {};
  const stale: string[] = [];

  for (const [key, blob] of entries) {
    if (key.startsWith(COMMUNITY_PREFIX)) {
      stale.push(key);
      continue;
    }
    const [prefixed, figureId] = splitKey(key);
    // A legacy (unprefixed) image must not displace a real `mine:` entry.
    if (prefixed) mine[figureId] = URL.createObjectURL(blob);
    else mine[figureId] ??= URL.createObjectURL(blob);
  }

  if (stale.length > 0) {
    try {
      const db = await openDb();
      const tx = db.transaction(STORE, 'readwrite');
      for (const key of stale) tx.objectStore(STORE).delete(key);
      await done(tx);
      db.close();
    } catch (e) {
      console.warn('Failed to reclaim the retired community image cache', e);
    }
  }

  return mine;
}

/** Figure ids still cached under the pre-slot unprefixed keys. Empty once migration has run. */
export async function listLegacyImages(): Promise<string[]> {
  const entries = await readAll();
  return entries
    .map(([key]) => splitKey(key))
    .filter(([prefixed]) => !prefixed)
    .map(([, id]) => id);
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
  tx.objectStore(STORE).put(blob, keyFor(figureId));
  tx.objectStore(STORE).delete(figureId);
  await done(tx);
  db.close();
  return URL.createObjectURL(blob);
}

/** Drops a legacy image the server can hand back, since it is served from the bucket now. */
export async function discardLegacyImage(figureId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(figureId);
  await done(tx);
  db.close();
}

/** `prefixed` is false for an unprefixed legacy key. Figure ids never contain a colon. */
function splitKey(key: string): [boolean, string] {
  const sep = key.indexOf(':');
  if (sep === -1) return [false, key];
  return [true, key.slice(sep + 1)];
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
