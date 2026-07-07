/**
 * Native implementation: user-added figure images are cached into a
 * `user-figures/` directory under the app's documents folder, one file per
 * figure id, and referenced by file uri. This is a local cache, not the
 * source of truth - see src/lib/remoteFigureImages.ts for the shared,
 * moderated Supabase store that other users' images sync down from.
 */
import { Directory, File, Paths } from 'expo-file-system';

function userDir(): Directory {
  const dir = new Directory(Paths.document, 'user-figures');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function fileFor(figureId: string): File {
  return new File(userDir(), `${figureId}.png`);
}

/**
 * Persists a picked/processed image and returns a displayable uri. `uri` is
 * either a local file:// uri (from the picker) or a remote https:// signed
 * uri (synced down from Supabase) - File.copy() only handles the former, so
 * remote uris go through File.downloadFileAsync() instead.
 */
export async function saveUserImage(figureId: string, uri: string): Promise<string> {
  const dest = fileFor(figureId);
  if (dest.exists) dest.delete();
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    await File.downloadFileAsync(uri, dest);
  } else {
    new File(uri).copy(dest);
  }
  return dest.uri;
}

export async function deleteUserImage(figureId: string): Promise<void> {
  const file = fileFor(figureId);
  if (file.exists) file.delete();
}

/** Loads every stored image as figureId → file uri, for app startup. */
export async function loadUserImages(): Promise<Record<string, string>> {
  const uris: Record<string, string> = {};
  for (const entry of userDir().list()) {
    if (entry instanceof File) {
      uris[entry.name.replace(/\.[^.]+$/, '')] = entry.uri;
    }
  }
  return uris;
}
