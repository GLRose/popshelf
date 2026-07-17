/**
 * Pure-pixel background removal, a 1:1 port of scripts/remove-bg.mjs so
 * user-added images get the same cutout as the bundled pipeline. Operates on
 * raw RGBA data so it stays platform-agnostic (canvas on web feeds it).
 */

const NEAR_WHITE = 236; // min channel value to be treated as background
const NEUTRAL = 18; // max channel spread (so we only remove neutral, not colored)

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, mutated in place by removeBackground */
  data: Uint8ClampedArray;
}

/**
 * Flood-fills near-white background from the edges inward, setting alpha to 0.
 * Returns the fraction of pixels removed; < 0.05 means the background wasn't
 * a clean white and the image is effectively untouched.
 */
export function removeBackground({ width: w, height: h, data }: RgbaImage): number {
  const idx = (x: number, y: number) => (y * w + x) * 4;
  const isBg = (x: number, y: number) => {
    const i = idx(x, y);
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const min = Math.min(r, g, b),
      max = Math.max(r, g, b);
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
  return removed / (w * h);
}

export interface CropBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bounding box of non-transparent pixels (the in-app equivalent of jimp's
 * autocrop). Returns the full image when it is fully opaque or fully empty.
 */
export function opaqueBounds({ width: w, height: h, data }: RgbaImage): CropBounds {
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] !== 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width: w, height: h };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
