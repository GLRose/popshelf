// Phase 4: download each figure's source image, cut its background to
// transparent (edge-seeded flood fill, same approach as the retired
// scripts/remove-bg.mjs),
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
const NEAR_WHITE = 236; // min channel value to be treated as background
const NEUTRAL = 18; // max channel spread (so only neutral bg is removed, not colored art)
// Pop Mart's per-figure "style" images are inconsistent: most sets give a
// clean isolated render on white, but some give a full staged lifestyle photo
// instead, with no flat background to remove at all. Nothing here reviews a
// cutout before it's published, so an image that clearly wasn't isolated art
// is rejected outright rather than uploaded as-is - the figure keeps the
// placeholder gradient until a better source shows up instead of shipping a
// room photo.
const MIN_BACKGROUND_FRACTION = 0.05;

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

/** Flood-fills in from the edges, dropping alpha on connected near-white/
 * neutral pixels - identical to the retired scripts/remove-bg.mjs. Then
 * autocrops and caps the longest side at MAX_DIMENSION.
 *
 * This was briefly replaced by ML segmentation
 * (@imgly/background-removal-node) to salvage the staged lifestyle photos
 * this rejects. Reverted: that model is a saliency segmenter, so it ate white
 * *inside* the figure (white hoodies, white bodies read as background) and
 * emitted soft alpha that left every edge feathered. Both failures are
 * structural to that approach, not tunable.
 *
 * The two properties that make this correct are worth stating, because they
 * are exactly what the model lacked. It is connectivity-based, so it only
 * removes background reachable from the frame edge and interior white is
 * untouchable by construction. And it is binary - a pixel is kept or dropped,
 * never partially - so edges stay crisp at any display size.
 *
 * Rejecting a lifestyle photo is the intended outcome, not a shortfall. A
 * placeholder gradient is a better result than a confidently mangled cutout
 * nobody reviewed. */
async function cutout(bytes: Buffer): Promise<Buffer> {
  const img = await Jimp.fromBuffer(bytes);
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  const data = img.bitmap.data;
  const idx = (x: number, y: number) => (y * w + x) * 4;
  const isBg = (x: number, y: number) => {
    const i = idx(x, y);
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    return min >= NEAR_WHITE && max - min <= NEUTRAL;
  };

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
  for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);

  let removed = 0;
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (visited[p]) continue;
    visited[p] = 1;
    if (!isBg(x, y)) continue;
    data[idx(x, y) + 3] = 0;
    removed++;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  if (removed / (w * h) < MIN_BACKGROUND_FRACTION) {
    throw new Error('no clean background to remove - looks like a lifestyle photo, not isolated art');
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
