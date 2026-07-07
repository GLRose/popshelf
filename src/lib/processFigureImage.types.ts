export interface ProcessOptions {
  /** Remove the (near-white) background and autocrop to the figure */
  cutout: boolean;
}

export interface ProcessedImage {
  /** Displayable + storable uri (data: on web, file: on native) */
  uri: string;
  width: number;
  height: number;
  /** Fraction of pixels removed; < 0.05 means the background wasn't clean white */
  removedFraction: number;
}
