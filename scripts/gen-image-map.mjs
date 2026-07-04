// Scans assets/figures/*.png and regenerates src/data/figureImages.ts with a
// static require() map (figure id -> bundled cutout). Static requires are what
// React Native needs to bundle images on native. Run after adding cutouts:
//   node scripts/gen-image-map.mjs
import { readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIG_DIR = resolve(__dirname, '../assets/figures');
const OUT = resolve(__dirname, '../src/data/figureImages.ts');

mkdirSync(FIG_DIR, { recursive: true });

const ids = existsSync(FIG_DIR)
  ? readdirSync(FIG_DIR)
      .filter((f) => f.endsWith('.png'))
      .map((f) => f.replace(/\.png$/, ''))
      .sort()
  : [];

const lines = ids
  .map((id) => `  ${JSON.stringify(id)}: require('@/assets/figures/${id}.png'),`)
  .join('\n');

const body = `/**
 * GENERATED FILE — do not edit by hand. Run: node scripts/gen-image-map.mjs
 * Maps a figure id to its bundled transparent-cutout PNG require().
 * React Native needs static require() calls to bundle images on native.
 * When the map is empty the UI falls back to a styled placeholder.
 */
import type { ImageSourcePropType } from 'react-native';

export const figureImages: Record<string, ImageSourcePropType> = {
${lines}
};
`;

writeFileSync(OUT, body);
console.log(`Wrote ${ids.length} image mappings to ${OUT}`);
