/**
 * Native implementation: user-added figure images are cached under the app's
 * documents folder, one file per figure id, and referenced by file uri.
 *
 * Two slots, because an image the user picked and an image the community
 * approved are different things that happen to be about the same figure:
 *
 *   user-figures/mine/<figureId>.png       - what this device's owner chose
 *   user-figures/community/<figureId>.png  - synced down from Supabase
 *
 * Before slots existed both wrote to `user-figures/<figureId>.png`, so an
 * approved community image silently clobbered the user's own, and deleting a
 * community image locally was pointless because the next sync re-downloaded it.
 * Legacy files at that flat path are migrated on first launch - see
 * listLegacyImages() and hydrate() in src/store/useUserImages.ts.
 *
 * This is a local cache, not the source of truth - see
 * src/lib/remoteFigureImages.ts for the shared, moderated Supabase store.
 */
import { Directory, File, Paths } from 'expo-file-system';

export type ImageSlot = 'mine' | 'community';

function rootDir(): Directory {
  const dir = new Directory(Paths.document, 'user-figures');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function slotDir(slot: ImageSlot): Directory {
  const dir = new Directory(rootDir(), slot);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function fileFor(figureId: string, slot: ImageSlot): File {
  return new File(slotDir(slot), `${figureId}.png`);
}

function figureIdOf(file: File): string {
  return file.name.replace(/\.[^.]+$/, '');
}

/**
 * Persists an image into a slot and returns a displayable uri. `uri` is either
 * a local file:// uri (from the picker) or a remote https:// signed uri (synced
 * down from Supabase) - copySync() only handles the former, so remote uris go
 * through File.downloadFileAsync() instead.
 *
 * copySync() rather than copy(): copy() is async, and the version of this that
 * called it without awaiting returned dest.uri while the bytes were still in
 * flight.
 */
export async function saveUserImage(figureId: string, uri: string, slot: ImageSlot): Promise<string> {
  const dest = fileFor(figureId, slot);
  if (dest.exists) dest.delete();
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    await File.downloadFileAsync(uri, dest);
  } else {
    new File(uri).copySync(dest);
  }
  return dest.uri;
}

export async function deleteUserImage(figureId: string, slot: ImageSlot): Promise<void> {
  const file = fileFor(figureId, slot);
  if (file.exists) file.delete();
}

/**
 * Every stored image as figureId -> file uri, per slot, for app startup.
 * Un-migrated legacy images surface under `mine` so they still display on a
 * launch where the migration can't run (no network to classify them against
 * the approved set).
 */
export async function loadUserImages(): Promise<Record<ImageSlot, Record<string, string>>> {
  const mine = listSlot('mine');
  for (const figureId of await listLegacyImages()) {
    mine[figureId] ??= legacyFile(figureId).uri;
  }
  return { mine, community: listSlot('community') };
}

function listSlot(slot: ImageSlot): Record<string, string> {
  const uris: Record<string, string> = {};
  for (const entry of slotDir(slot).list()) {
    if (entry instanceof File) uris[figureIdOf(entry)] = entry.uri;
  }
  return uris;
}

function legacyFile(figureId: string): File {
  return new File(rootDir(), `${figureId}.png`);
}

/** Figure ids still cached at the pre-slot flat path. Empty once migration has run. */
export async function listLegacyImages(): Promise<string[]> {
  return rootDir()
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .map(figureIdOf);
}

/** Claims a legacy image as the user's own, keeping the bytes. */
export async function promoteLegacyImage(figureId: string): Promise<string> {
  const file = legacyFile(figureId);
  if (!file.exists) return fileFor(figureId, 'mine').uri;
  await deleteUserImage(figureId, 'mine');
  file.moveSync(slotDir('mine'));
  return fileFor(figureId, 'mine').uri;
}

/** Drops a legacy image the server can hand back. Cheaper than moving it, since it's about to be re-downloaded into `community`. */
export async function discardLegacyImage(figureId: string): Promise<void> {
  const file = legacyFile(figureId);
  if (file.exists) file.delete();
}
