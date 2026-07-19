// Removes published catalog artwork whose figure is no longer in the catalog.
//
//   node scripts/prune-orphan-catalog-images.mjs            # report only
//   node scripts/prune-orphan-catalog-images.mjs --apply    # actually delete
//
// A `source = 'catalog'` row in figure_images is unreachable from the app once
// its figure leaves src/data/figures.json: nothing renders it, nothing can
// delete it, and scripts/missing-images.mjs will not notice it either. The RLS
// delete policy in supabase/schema.sql is scoped `using (source = 'community')`
// precisely so that no client, moderator included, can destroy catalog art - so
// the service role key is the only way to clean these up. Same rule as
// upload-catalog-images.mjs applies: nothing under src/ may read that key.
//
// Written for the hirono de-duplication (68 rows stranded at '<id>-2' when the
// duplicated figures were merged away) but deliberately general: it derives the
// orphan set by comparing against figures.json rather than hardcoding ids, so
// it stays useful the next time a figure is renamed or retired.
//
// Deletes the storage object before the row, matching the ordering rule the
// moderation flow uses. The reverse strands bytes in the bucket with nothing
// left to find them by.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIGURES = resolve(__dirname, '../src/data/figures.json');
const BUCKET = 'figure-images';

const apply = process.argv.includes('--apply');

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to .env (see .env.example).`);
  return value;
}

if (existsSync(resolve(__dirname, '../.env'))) process.loadEnvFile(resolve(__dirname, '../.env'));

const knownFigureIds = new Set(JSON.parse(readFileSync(FIGURES, 'utf8')).map((f) => f.id));

const client = createClient(env('EXPO_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: rows, error } = await client
  .from('figure_images')
  .select('id, figure_id, storage_path')
  .eq('source', 'catalog');

if (error) {
  console.error(`Could not read figure_images: ${error.message}`);
  process.exit(1);
}

const orphans = rows.filter((row) => !knownFigureIds.has(row.figure_id));

console.log(`catalog rows published: ${rows.length}`);
console.log(`orphaned:               ${orphans.length}`);

if (orphans.length === 0) {
  console.log('\nNothing to prune.');
  process.exit(0);
}

for (const row of orphans) console.log(`  ${row.figure_id}  (${row.storage_path})`);

if (!apply) {
  console.log('\nReport only. Pass --apply to delete these rows and their objects.');
  process.exit(0);
}

let removed = 0;
const failures = [];

for (const row of orphans) {
  const { error: objectError } = await client.storage.from(BUCKET).remove([row.storage_path]);
  if (objectError) {
    failures.push(`${row.figure_id}: object - ${objectError.message}`);
    continue;
  }

  const { error: rowError } = await client.from('figure_images').delete().eq('id', row.id);
  if (rowError) {
    failures.push(`${row.figure_id}: row - ${rowError.message}`);
    continue;
  }
  removed += 1;
}

console.log(`\npruned: ${removed}`);
if (failures.length > 0) {
  console.error(`failed: ${failures.length}`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
