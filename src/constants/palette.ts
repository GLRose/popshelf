import type { ImageSourcePropType } from 'react-native';

import type { SeriesMeta } from '@/types';

/**
 * App-wide palette. Kept separate from the template's constants/theme.ts so the
 * collectible-app look is easy to tune in one place.
 */
export const Palette = {
  skullpanda: '#7C6BF2',
  peachriot: '#FF7A9A',
  gold: '#F4B740',
  ink: '#171423',
} as const;

export const SERIES: Record<string, SeriesMeta> = {
  skullpanda: {
    id: 'skullpanda',
    label: 'SKULLPANDA',
    accent: Palette.skullpanda,
  },
  peachriot: {
    id: 'peachriot',
    label: 'PEACH RIOT',
    accent: Palette.peachriot,
  },
};

export const SERIES_ORDER = ['skullpanda', 'peachriot'] as const;

/** Preset shelf ledge colors the user can pick from. */
export const SHELF_COLORS = [
  { id: 'walnut', label: 'Walnut', value: '#6B4A2F' },
  { id: 'oak', label: 'Oak', value: '#B98A52' },
  { id: 'white', label: 'White', value: '#EDE7DF' },
  { id: 'charcoal', label: 'Charcoal', value: '#2B2B30' },
  { id: 'blush', label: 'Blush', value: '#E9A6AF' },
];

interface BackgroundBase {
  id: string;
  label: string;
  /** Best-contrast color for text/controls drawn on top of this background. */
  foreground: string;
}

export interface SolidBackground extends BackgroundBase {
  kind: 'solid';
  color: string;
}

export interface WallpaperBackground extends BackgroundBase {
  kind: 'wallpaper';
  image: ImageSourcePropType;
}

export type ShelfBackground = SolidBackground | WallpaperBackground;

const DARK = '#211C2B';
const LIGHT = '#FFFFFF';

/** Preset flat colors (kept from the original palette). */
export const SHELF_SOLIDS: SolidBackground[] = [
  { id: 'lavender', label: 'Lavender', kind: 'solid', color: '#E7E2FB', foreground: DARK },
  { id: 'peach', label: 'Peach', kind: 'solid', color: '#FDE3E8', foreground: DARK },
  { id: 'mint', label: 'Mint', kind: 'solid', color: '#DBF3E8', foreground: DARK },
  { id: 'night', label: 'Night', kind: 'solid', color: '#1B1830', foreground: LIGHT },
  { id: 'sand', label: 'Sand', kind: 'solid', color: '#F3ECE1', foreground: DARK },
  { id: 'sky', label: 'Sky', kind: 'solid', color: '#D9ECFB', foreground: DARK },
];

/**
 * Patterned wallpapers, backed by real CC0 photo textures (ambientCG) bundled
 * under assets/wallpapers - not procedurally drawn.
 */
export const SHELF_WALLPAPERS: WallpaperBackground[] = [
  {
    id: 'pastel-plaid',
    label: 'Pastel Plaid',
    kind: 'wallpaper',
    image: require('@/assets/wallpapers/pastel-plaid.jpg'),
    foreground: DARK,
  },
  {
    id: 'cozy-tartan',
    label: 'Cozy Tartan',
    kind: 'wallpaper',
    image: require('@/assets/wallpapers/cozy-tartan.jpg'),
    foreground: LIGHT,
  },
  {
    id: 'mint-dot',
    label: 'Mint Dot',
    kind: 'wallpaper',
    image: require('@/assets/wallpapers/mint-dot.jpg'),
    foreground: DARK,
  },
  {
    id: 'teal-check',
    label: 'Teal Check',
    kind: 'wallpaper',
    image: require('@/assets/wallpapers/teal-check.jpg'),
    foreground: LIGHT,
  },
  {
    id: 'charcoal-houndstooth',
    label: 'Houndstooth',
    kind: 'wallpaper',
    image: require('@/assets/wallpapers/charcoal-houndstooth.jpg'),
    foreground: LIGHT,
  },
  {
    id: 'cream-diamond',
    label: 'Cream Diamond',
    kind: 'wallpaper',
    image: require('@/assets/wallpapers/cream-diamond.jpg'),
    foreground: DARK,
  },
  {
    id: 'berry-diamond',
    label: 'Berry Diamond',
    kind: 'wallpaper',
    image: require('@/assets/wallpapers/berry-diamond.jpg'),
    foreground: LIGHT,
  },
  {
    id: 'blush-stripe',
    label: 'Blush Stripe',
    kind: 'wallpaper',
    image: require('@/assets/wallpapers/blush-stripe.jpg'),
    foreground: DARK,
  },
  {
    id: 'navy-stripe',
    label: 'Navy Stripe',
    kind: 'wallpaper',
    image: require('@/assets/wallpapers/navy-stripe.jpg'),
    foreground: LIGHT,
  },
  {
    id: 'confetti-terrazzo',
    label: 'Confetti Terrazzo',
    kind: 'wallpaper',
    image: require('@/assets/wallpapers/confetti-terrazzo.jpg'),
    foreground: DARK,
  },
  {
    id: 'whitewash-brick',
    label: 'Whitewash Brick',
    kind: 'wallpaper',
    image: require('@/assets/wallpapers/whitewash-brick.jpg'),
    foreground: DARK,
  },
  {
    id: 'cream-woodchip',
    label: 'Cream Woodchip',
    kind: 'wallpaper',
    image: require('@/assets/wallpapers/cream-woodchip.jpg'),
    foreground: DARK,
  },
];

/** All backgrounds, solids first, in the order shown in the customizer. */
export const SHELF_BACKGROUNDS: ShelfBackground[] = [...SHELF_SOLIDS, ...SHELF_WALLPAPERS];

const BACKGROUND_BY_ID: Record<string, ShelfBackground> = Object.fromEntries(
  SHELF_BACKGROUNDS.map((b) => [b.id, b]),
);

/** Maps legacy hex-value backgrounds (persisted before v2) onto the new ids. */
const LEGACY_HEX_TO_ID: Record<string, string> = {
  '#E7E2FB': 'lavender',
  '#FDE3E8': 'peach',
  '#DBF3E8': 'mint',
  '#1B1830': 'night',
  '#F3ECE1': 'sand',
  '#D9ECFB': 'sky',
};

export const DEFAULT_BACKGROUND_ID = SHELF_BACKGROUNDS[0].id;

/** Resolve a stored background id (or legacy hex) to its descriptor. */
export function getBackground(id: string | undefined): ShelfBackground {
  if (id && BACKGROUND_BY_ID[id]) return BACKGROUND_BY_ID[id];
  if (id && LEGACY_HEX_TO_ID[id]) return BACKGROUND_BY_ID[LEGACY_HEX_TO_ID[id]];
  return SHELF_BACKGROUNDS[0];
}

/** Normalize a stored value (id or legacy hex) to a canonical background id. */
export function normalizeBackgroundId(id: string | undefined): string {
  return getBackground(id).id;
}

/**
 * Surface treatment applied to the shelf ledge. `smooth` uses the chosen
 * shelf color as a flat fill; every other kind shows a real CC0 material
 * photo (assets/shelf-textures) in its natural color, independent of the
 * shelf color choice.
 */
export type TextureKind = 'smooth' | 'wood' | 'matte' | 'glossy' | 'marble' | 'metal';

export interface ShelfTexture {
  id: string;
  label: string;
  kind: TextureKind;
  image?: ImageSourcePropType;
}

/** Real material photo backing each non-smooth texture kind. */
export const TEXTURE_IMAGES: Partial<Record<TextureKind, ImageSourcePropType>> = {
  wood: require('@/assets/shelf-textures/wood.jpg'),
  matte: require('@/assets/shelf-textures/matte.jpg'),
  glossy: require('@/assets/shelf-textures/glossy.jpg'),
  marble: require('@/assets/shelf-textures/marble.jpg'),
  metal: require('@/assets/shelf-textures/metal.jpg'),
};

export const SHELF_TEXTURES: ShelfTexture[] = [
  { id: 'smooth', label: 'Smooth', kind: 'smooth' },
  { id: 'wood', label: 'Wood', kind: 'wood', image: TEXTURE_IMAGES.wood },
  { id: 'matte', label: 'Matte', kind: 'matte', image: TEXTURE_IMAGES.matte },
  { id: 'glossy', label: 'Glossy', kind: 'glossy', image: TEXTURE_IMAGES.glossy },
  { id: 'marble', label: 'Marble', kind: 'marble', image: TEXTURE_IMAGES.marble },
  { id: 'metal', label: 'Metal', kind: 'metal', image: TEXTURE_IMAGES.metal },
];

const TEXTURE_BY_ID: Record<string, ShelfTexture> = Object.fromEntries(
  SHELF_TEXTURES.map((t) => [t.id, t]),
);

export const DEFAULT_TEXTURE_ID = SHELF_TEXTURES[0].id;

/** Resolve a stored texture id to its descriptor (defaults to Smooth). */
export function getTexture(id: string | undefined): ShelfTexture {
  return (id && TEXTURE_BY_ID[id]) || SHELF_TEXTURES[0];
}
