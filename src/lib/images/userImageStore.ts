/**
 * Native implementation: the images this device's owner picked are cached under
 * the app's documents folder, one file per figure id, and referenced by file
 * uri:
 *
 *   user-figures/mine/<figureId>.png  - what this device's owner chose
 *
 * Only the user's own pick is stored. Shared artwork - catalog and approved
 * community images - is not cached here at all: it comes from a public bucket
 * over ordinary https, and expo-image maintains its own disk cache, so mirroring
 * it here meant downloading the entire catalog before the first image could be
 * shown. The retired `user-figures/community/` directory is deleted on launch.
 *
 * Before slots existed both wrote to `user-figures/<figureId>.png`, so an
 * approved community image silently clobbered the user's own. Legacy files at
 * that flat path are migrated on first launch - see listLegacyImages() and
 * hydrate() in src/store/useUserImages.ts.
 *
 * This is a local cache, not the source of truth - see
 * src/lib/images/remoteFigureImages.ts for the shared, moderated Supabase store.
 */
import { Directory, File, Paths } from 'expo-file-system';

function rootDir(): Directory {
  const dir = new Directory(Paths.document, 'user-figures');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function mineDir(): Directory {
  const dir = new Directory(rootDir(), 'mine');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function fileFor(figureId: string): File {
  return new File(mineDir(), `${figureId}.png`);
}

function figureIdOf(file: File): string {
  return file.name.replace(/\.[^.]+$/, '');
}

/**
 * Persists an image and returns a displayable uri. `uri` is a local file:// uri
 * from the picker.
 *
 * copySync() rather than copy(): copy() is async, and the version of this that
 * called it without awaiting returned dest.uri while the bytes were still in
 * flight.
 */
export async function saveUserImage(figureId: string, uri: string): Promise<string> {
  const dest = fileFor(figureId);
  if (dest.exists) dest.delete();
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    await File.downloadFileAsync(uri, dest);
  } else {
    new File(uri).copySync(dest);
  }
  return dest.uri;
}

export async function deleteUserImage(figureId: string): Promise<void> {
  const file = fileFor(figureId);
  if (file.exists) file.delete();
}

/**
 * Every image the user picked, as figureId -> file uri, for app startup.
 *
 * Un-migrated legacy images surface here too, so they still display on a launch
 * where the migration can't run (no network to classify them against the
 * approved set).
 */
export async function loadUserImages(): Promise<Record<string, string>> {
  reclaimCommunityCache();

  const mine: Record<string, string> = {};
  for (const entry of mineDir().list()) {
    if (entry instanceof File) mine[figureIdOf(entry)] = entry.uri;
  }
  for (const figureId of await listLegacyImages()) {
    mine[figureId] ??= legacyFile(figureId).uri;
  }
  return mine;
}

/**
 * Deletes the retired community mirror. Previous builds kept a copy of every
 * approved image in the catalog here - hundreds of PNGs - and nothing reads
 * that directory any more, so leaving it would strand tens of megabytes of the
 * user's storage forever. Never worth failing startup over: the images load
 * from the bucket either way.
 */
function reclaimCommunityCache(): void {
  try {
    const dir = new Directory(rootDir(), 'community');
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('Failed to reclaim the retired community image cache', e);
  }
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
  if (!file.exists) return fileFor(figureId).uri;
  await deleteUserImage(figureId);
  file.moveSync(mineDir());
  return fileFor(figureId).uri;
}

/** Drops a legacy image the server can hand back, since it is served from the bucket now. */
export async function discardLegacyImage(figureId: string): Promise<void> {
  const file = legacyFile(figureId);
  if (file.exists) file.delete();
}
