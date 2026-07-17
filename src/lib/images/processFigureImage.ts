import type { ProcessedImage, ProcessOptions } from '@/lib/images/processFigureImage.types';

/**
 * Native implementation: there is no canvas for pixel access, so the picked
 * image is stored as-is (no cutout / autocrop / resize). The app ships on web
 * today; when native ships, route this through a pixel-capable backend such
 * as react-native-skia.
 */
export async function processFigureImage(
  sourceUri: string,
  _options: ProcessOptions,
): Promise<ProcessedImage> {
  return { uri: sourceUri, width: 0, height: 0, removedFraction: 0 };
}
