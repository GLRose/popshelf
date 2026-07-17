// Phase 4: download each figure's source image, cut its background to
// transparent via an ML segmentation model (@imgly/background-removal-node -
// ONNX model bundled in the package, runs fully offline, no API key/cost),
// and publish it to Supabase Storage's `figure-images` bucket - the app's only
// source of figure artwork (see scripts/upload-catalog-images.mjs, which this
// supersedes for scraped IPs; see also src/components/FigureImage.tsx).
//
// Dedup is by content hash of the downloaded bytes, carried in
// scraper/state/<ip>.json via SourceWriter.(set|prior)ImageHash, so an
// unchanged source image costs nothing on a re-run - no download, no
// re-cutout, no re-upload.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { removeBackground } from '@imgly/background-removal-node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Jimp } from 'jimp';
import { REPO_ROOT } from '../core/paths';
import type { Fetcher, Logger } from '../core/types';
import type { SourceWriter } from '../db/upsert';

export interface ImageIntent {
  readonly figureId: string;
  readonly sourceProductId: string;
  readonly imageUrl: string;
}

export interface ImageDeps {
  readonly fetcher: Fetcher;
  readonly writer: SourceWriter;
  readonly log: Logger;
  readonly force: boolean;
}

export interface ImageResult {
  downloaded: number;
  deduped: number;
  failed: number;
  failures: { figureId: string; reason: string }[];
}

const BUCKET = 'figure-images';
const MAX_DIMENSION = 500; // display is ~150px @2x; keep assets lean
// Guards against a degenerate segmentation (blank/corrupt source image
// leaving the model with nothing to isolate) rather than a source-image-shape
// assumption - the ML model itself handles both clean-render-on-white and
// staged lifestyle photos, unlike the flood-fill approach this replaced.
// Nothing here reviews a cutout before it's published, so a figure with no
// usable result keeps the placeholder gradient instead of shipping a blank.
const MIN_FOREGROUND_FRACTION = 0.02;

function contentHash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

let envLoaded = false;
function loadEnvOnce(): void {
  if (envLoaded) return;
  envLoaded = true;
  const envPath = resolve(REPO_ROOT, '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Add it to .env (see .env.example) to publish images.`);
  }
  return value;
}

let cachedClient: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (cachedClient) return cachedClient;
  loadEnvOnce();
  cachedClient = createClient(
    requiredEnv('EXPO_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );
  return cachedClient;
}

/** Runs the source image through the ML segmentation model to drop the
 * background to transparent, then autocrops and caps the longest side at
 * MAX_DIMENSION. */
async function cutout(bytes: Buffer): Promise<Buffer> {
  // removeBackground needs a MIME type to pick a decode path (a bare
  // ArrayBuffer/Uint8Array becomes a type-less Blob internally and fails with
  // "Unsupported format:") - Pop Mart's per-figure images are always PNG.
  const blob = await removeBackground(new Blob([bytes], { type: 'image/png' }));
  const img = await Jimp.fromBuffer(Buffer.from(await blob.arrayBuffer()));

  const { width: w, height: h, data } = img.bitmap;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) opaque++;
  if (opaque / (w * h) < MIN_FOREGROUND_FRACTION) {
    throw new Error('background removal kept almost nothing - likely a blank or corrupt source image');
  }

  img.autocrop({ cropOnlyFrames: false });
  if (img.bitmap.width > MAX_DIMENSION || img.bitmap.height > MAX_DIMENSION) {
    if (img.bitmap.width >= img.bitmap.height) img.resize({ w: MAX_DIMENSION });
    else img.resize({ h: MAX_DIMENSION });
  }
  return img.getBuffer('image/png');
}

/** Upsert so a re-run replaces bytes/row in place rather than colliding - same
 * scheme as scripts/upload-catalog-images.mjs (storage_path is the unique
 * conflict key, so a figure keeps its catalog row across re-publishes). */
async function publish(figureId: string, png: Buffer): Promise<void> {
  const storagePath = `catalog/${figureId}.png`;
  const client = supabase();

  const { error: uploadError } = await client.storage
    .from(BUCKET)
    .upload(storagePath, png, { contentType: 'image/png', upsert: true });
  if (uploadError) throw new Error(`upload: ${uploadError.message}`);

  const { error: rowError } = await client.from('figure_images').upsert(
    {
      figure_id: figureId,
      storage_path: storagePath,
      status: 'approved',
      source: 'catalog',
      owner_id: null,
    },
    { onConflict: 'storage_path' },
  );
  if (rowError) throw new Error(`figure_images row: ${rowError.message}`);
}

export async function ingestImages(
  intents: readonly ImageIntent[],
  deps: ImageDeps,
): Promise<ImageResult> {
  const result: ImageResult = { downloaded: 0, deduped: 0, failed: 0, failures: [] };
  if (intents.length === 0) return result;

  // Resolve credentials once up front: failing here with one clear message
  // beats every intent below individually discovering the same missing key.
  try {
    supabase();
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    deps.log.error(`image pipeline: ${reason}`);
    result.failed = intents.length;
    result.failures = intents.map((i) => ({ figureId: i.figureId, reason }));
    return result;
  }

  for (const intent of intents) {
    try {
      const bytes = await deps.fetcher.binary(intent.imageUrl);
      const hash = contentHash(bytes);
      const prior = deps.writer.priorImageHash(intent.sourceProductId);
      if (!deps.force && prior === hash) {
        result.deduped++;
        continue;
      }

      const png = await cutout(bytes);
      await publish(intent.figureId, png);
      deps.writer.setImageHash(intent.sourceProductId, hash);
      result.downloaded++;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      result.failed++;
      result.failures.push({ figureId: intent.figureId, reason });
      deps.log.warn(`image ${intent.figureId}: ${reason}`);
    }
  }

  return result;
}
