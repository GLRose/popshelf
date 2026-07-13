// Turns raw product renders (clean/white background) into transparent cutouts.
// Uses a pure-JS edge flood-fill (jimp) - no native deps, no ML model download,
// which is robust and reproducible. Reads catalog-images/raw/*, writes
// transparent PNGs to catalog-images/cutouts/<id>.png, which is what
// `npm run upload:catalog` then publishes to Supabase.
//   npm run cutout   (or: node scripts/remove-bg.mjs)
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Jimp } from 'jimp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(__dirname, '../catalog-images/raw');
const OUT_DIR = resolve(__dirname, '../catalog-images/cutouts');

const NEAR_WHITE = 236; // min channel value to be treated as background
const NEUTRAL = 18; // max channel spread (so we only remove neutral, not colored)

function removeBg(img) {
  const { width: w, height: h, data } = img.bitmap;
  const idx = (x, y) => (y * w + x) * 4;
  const isBg = (x, y) => {
    const i = idx(x, y);
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const min = Math.min(r, g, b), max = Math.max(r, g, b);
    return min >= NEAR_WHITE && max - min <= NEUTRAL;
  };

  const visited = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
  for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);

  let removed = 0;
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (visited[p]) continue;
    visited[p] = 1;
    if (!isBg(x, y)) continue;
    data[idx(x, y) + 3] = 0;
    removed++;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return removed / (w * h);
}

mkdirSync(OUT_DIR, { recursive: true });
if (!existsSync(RAW_DIR)) {
  console.log('No raw images. Run: npm run scrape');
  process.exit(0);
}
const files = readdirSync(RAW_DIR).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));

let ok = 0;
let weak = 0;
for (const file of files) {
  const id = file.replace(/\.(png|jpe?g|webp)$/i, '');
  try {
    const img = await Jimp.read(resolve(RAW_DIR, file));
    const frac = removeBg(img);
    if (frac < 0.05) weak++; // background wasn't clean/white - kept as-is
    img.autocrop({ cropOnlyFrames: false });
    const MAX = 500; // display is ~150px @2x; keep assets lean
    if (img.bitmap.width > MAX || img.bitmap.height > MAX) {
      if (img.bitmap.width >= img.bitmap.height) img.resize({ w: MAX });
      else img.resize({ h: MAX });
    }
    await img.write(resolve(OUT_DIR, `${id}.png`));
    ok++;
  } catch (e) {
    console.warn(`✗ ${id}: ${e.message}`);
  }
}
console.log(`Cut out ${ok}/${files.length} figures (${weak} had non-white backgrounds).`);
console.log('Next: npm run upload:catalog');
