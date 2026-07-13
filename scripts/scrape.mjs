// Downloads figure images listed in scripts/sources.json into
// catalog-images/raw/. Keyed by figure id so mapping to the catalog is explicit
// and correct. First stage of: scrape -> cutout -> upload:catalog.
//   node scripts/scrape.mjs
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(__dirname, '../catalog-images/raw');
const SOURCES = resolve(__dirname, 'sources.json');

mkdirSync(RAW_DIR, { recursive: true });

const { figures = {} } = JSON.parse(readFileSync(SOURCES, 'utf8'));
const entries = Object.entries(figures).filter(([k]) => k !== '_comment');

if (entries.length === 0) {
  console.log('No sources configured. Add entries under "figures" in scripts/sources.json.');
  process.exit(0);
}

let ok = 0;
for (const [id, url] of entries) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 PopShelf/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase();
    const safeExt = ['png', 'jpg', 'jpeg', 'webp'].includes(ext) ? ext : 'png';
    writeFileSync(resolve(RAW_DIR, `${id}.${safeExt}`), buf);
    ok++;
    console.log(`✓ ${id}`);
  } catch (e) {
    console.warn(`✗ ${id}: ${e.message}`);
  }
}
console.log(`\nDownloaded ${ok}/${entries.length} images to ${RAW_DIR}`);
console.log('Next: npm run cutout  (then npm run upload:catalog)');
