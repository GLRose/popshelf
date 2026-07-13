// Publishes the app's catalog artwork to Supabase, which is the only place the
// app reads figure images from. Cutouts used to be committed under
// assets/figures/ and bundled into the binary as static require()s; now they
// live in the `figure-images` bucket under `catalog/<figureId>.png` with an
// approved, owner-less `source = 'catalog'` row each. Run:
//
//   npm run upload:catalog          # publish everything in catalog-images/cutouts
//   npm run upload:catalog -- --dry-run
//
// Needs SUPABASE_SERVICE_ROLE_KEY in .env. That key bypasses RLS, which is the
// point: the policies in supabase/schema.sql deliberately forbid every client -
// moderator included - from writing or deleting catalog rows and objects, so
// this script is the only way they can be published or replaced. Keep the key
// out of the app: nothing under src/ may read it.
//
// Idempotent. Re-running overwrites the bytes in place and leaves the row's id
// alone, so devices keep the copy they already cached (the manifest in
// src/store/useUserImages.ts keys off the row id). Deleting a figure's cutout
// locally does NOT unpublish it - removing catalog art is deliberately manual.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CUTOUT_DIR = resolve(__dirname, '../catalog-images/cutouts');
const FIGURES = resolve(__dirname, '../src/data/figures.json');
const BUCKET = 'figure-images';
const CONCURRENCY = 8;

const dryRun = process.argv.includes('--dry-run');

/**
 * Cutout filenames that predate a catalog rebuild and still carry the old,
 * doubled-up set slug. The figures they depict are very much still in the
 * catalog, just under a corrected id - so these images had silently stopped
 * rendering (figureImages[id] simply missed) and showed the placeholder
 * instead. Rewriting them here is what brings that artwork back rather than
 * migrating 22 dead files.
 *
 * Applied longest-prefix-first. Any id that still doesn't resolve is a hard
 * error, because a silently skipped figure is exactly the bug this is fixing.
 */
const ID_FIXUPS = [
  ['skullpanda-candy-monster-town-candy-monster-tower-', 'skullpanda-candy-monster-town-'],
  ['skullpanda-tell-me-what-you-want-tell-me-what-you-want-series-', 'skullpanda-tell-me-what-you-want-'],
];

function resolveFigureId(fileId) {
  for (const [from, to] of ID_FIXUPS) {
    if (fileId.startsWith(from)) return to + fileId.slice(from.length);
  }
  return fileId;
}

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to .env (see .env.example).`);
  return value;
}

if (existsSync(resolve(__dirname, '../.env'))) process.loadEnvFile(resolve(__dirname, '../.env'));

if (!existsSync(CUTOUT_DIR)) {
  console.error(`No cutouts at ${CUTOUT_DIR}. Run: npm run scrape && npm run cutout`);
  process.exit(1);
}

const knownFigureIds = new Set(JSON.parse(readFileSync(FIGURES, 'utf8')).map((f) => f.id));

// Resolve every filename to a real figure before uploading a single byte, so a
// typo'd or stale cutout stops the run instead of half-publishing the catalog.
const uploads = [];
const claimedBy = new Map(); // figureId -> the file that claimed it
const unresolved = [];

for (const file of readdirSync(CUTOUT_DIR).filter((f) => f.endsWith('.png')).sort()) {
  const fileId = file.replace(/\.png$/, '');
  const figureId = resolveFigureId(fileId);

  if (!knownFigureIds.has(figureId)) {
    unresolved.push(`${file} -> no figure with id "${figureId}"`);
    continue;
  }
  const already = claimedBy.get(figureId);
  if (already) {
    unresolved.push(`${file} and ${already} both resolve to "${figureId}"`);
    continue;
  }
  claimedBy.set(figureId, file);
  uploads.push({ file, figureId, storagePath: `catalog/${figureId}.png` });
}

if (unresolved.length) {
  console.error(`${unresolved.length} cutout(s) do not map onto exactly one catalog figure:\n`);
  for (const problem of unresolved) console.error(`  ${problem}`);
  console.error(`\nFix the filename or the catalog, then re-run. Nothing was uploaded.`);
  process.exit(1);
}

console.log(
  `${uploads.length} cutout(s) -> ${BUCKET}/catalog/ ` +
    `(${knownFigureIds.size - uploads.length} of ${knownFigureIds.size} figures still have no art)`,
);

if (dryRun) {
  for (const { file, figureId } of uploads) {
    console.log(`  ${file}${file.replace(/\.png$/, '') === figureId ? '' : ` -> ${figureId}`}`);
  }
  console.log('\n--dry-run: nothing uploaded.');
  process.exit(0);
}

const supabase = createClient(env('EXPO_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

let done = 0;
let failed = 0;

async function publish({ file, figureId, storagePath }) {
  const bytes = readFileSync(resolve(CUTOUT_DIR, file));

  // upsert so a re-run replaces the bytes rather than colliding on the path.
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: 'image/png', upsert: true });
  if (uploadError) throw uploadError;

  // Keyed on storage_path (unique) rather than id, so a re-run updates the row
  // that already points at this object instead of minting a second one. The
  // partial unique index means a figure can hold one approved catalog row and
  // one approved community row at a time; this is always the catalog one.
  const { error: rowError } = await supabase.from('figure_images').upsert(
    {
      figure_id: figureId,
      storage_path: storagePath,
      status: 'approved',
      source: 'catalog',
      owner_id: null,
    },
    { onConflict: 'storage_path' },
  );
  if (rowError) throw rowError;
}

const queue = [...uploads];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        await publish(next);
        done++;
        if (done % 25 === 0) console.log(`  ${done}/${uploads.length}...`);
      } catch (e) {
        failed++;
        console.error(`  FAILED ${next.figureId}: ${e.message ?? e}`);
      }
    }
  }),
);

console.log(`\nPublished ${done}/${uploads.length} catalog images.`);
if (failed) {
  console.error(`${failed} failed. Re-run to retry - publishing is idempotent.`);
  process.exit(1);
}
