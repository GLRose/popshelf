import { opaqueBounds, removeBackground } from '@/lib/images/removeBackground';
import type { ProcessedImage, ProcessOptions } from '@/lib/images/processFigureImage.types';

const MAX = 500; // display is ~150px @2x; keep stored images lean (matches remove-bg.mjs)

/**
 * Web implementation: decode the picked image on a canvas, flood-fill the
 * white background away, autocrop, downscale, and re-encode as a PNG data URI.
 */
export async function processFigureImage(
  sourceUri: string,
  { cutout }: ProcessOptions,
): Promise<ProcessedImage> {
  const img = await loadImage(sourceUri);

  let canvas = draw(img, img.naturalWidth, img.naturalHeight);
  const ctx = canvas.getContext('2d')!;
  let removedFraction = 0;

  if (cutout) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    removedFraction = removeBackground(pixels);
    ctx.putImageData(pixels, 0, 0);
    const b = opaqueBounds(pixels);
    if (b.width !== canvas.width || b.height !== canvas.height) {
      const cropped = document.createElement('canvas');
      cropped.width = b.width;
      cropped.height = b.height;
      cropped.getContext('2d')!.drawImage(canvas, -b.x, -b.y);
      canvas = cropped;
    }
  }

  if (canvas.width > MAX || canvas.height > MAX) {
    const scale = MAX / Math.max(canvas.width, canvas.height);
    canvas = draw(canvas, Math.round(canvas.width * scale), Math.round(canvas.height * scale));
  }

  return {
    uri: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
    removedFraction,
  };
}

function draw(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(source, 0, 0, width, height);
  return canvas;
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = uri;
  });
}
