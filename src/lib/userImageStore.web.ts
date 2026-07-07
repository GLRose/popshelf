/**
 * Web implementation: user-added figure images live as PNG Blobs in
 * IndexedDB (localStorage's ~5 MB quota is too small for dozens of cutouts)
 * and are handed to the UI as object URLs. This is a local cache, not the
 * source of truth - see src/lib/remoteFigureImages.ts for the shared,
 * moderated Supabase store that other users' images sync down from.
 */

const DB_NAME = 'popshelf-user-images';
const STORE = 'images';

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

/** Persists a processed image (data uri) and returns a displayable uri. */
export async function saveUserImage(figureId: string, uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(blob, figureId);
  await done(tx);
  db.close();
  return URL.createObjectURL(blob);
}

export async function deleteUserImage(figureId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(figureId);
  await done(tx);
  db.close();
}

/** Loads every stored image as figureId → object URL, for app startup. */
export async function loadUserImages(): Promise<Record<string, string>> {
  const db = await openDb();
  const store = db.transaction(STORE, 'readonly').objectStore(STORE);
  const [keys, values] = await Promise.all([
    request<IDBValidKey[]>(store.getAllKeys()),
    request<Blob[]>(store.getAll()),
  ]);
  db.close();
  const uris: Record<string, string> = {};
  keys.forEach((key, i) => {
    uris[String(key)] = URL.createObjectURL(values[i]);
  });
  return uris;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
