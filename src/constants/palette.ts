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

/**
 * A shelf background is either a flat color or a procedurally-drawn "wallpaper".
 * Wallpapers are original, cozy Animal Crossing / Stardew-inspired scenes built
 * from a base gradient plus a lightweight motif overlay - no bundled image
 * assets, so they stay crisp at any size and render identically on web + native.
 */
export type Motif =
  | { type: 'dots'; color: string; size: number; gap: number }
  | { type: 'stripes'; color: string; width: number; gap: number }
  | { type: 'clouds'; color: string }
  | { type: 'stars'; color: string }
  | { type: 'hills'; colors: readonly string[] }
  | { type: 'gingham'; color: string; size: number }
  | { type: 'checkerboard'; color: string; size: number }
  | { type: 'grid'; color: string; size: number }
  | { type: 'bricks'; color: string; width: number; height: number }
  | { type: 'diamonds'; color: string; size: number }
  | { type: 'confetti'; colors: readonly string[] }
  | { type: 'hearts'; color: string; size: number; gap: number };

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
  /** Base gradient stops, painted top-left to bottom-right. */
  gradient: readonly [string, string, ...string[]];
  motif: Motif;
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

/** Animal Crossing / Stardew-inspired patterned wallpapers. */
export const SHELF_WALLPAPERS: WallpaperBackground[] = [
  // -- Cute & pastel --------------------------------------------------------
  {
    id: 'polka-party',
    label: 'Polka Party',
    kind: 'wallpaper',
    gradient: ['#FFE3EC', '#FFCEDD'],
    motif: { type: 'dots', color: 'rgba(255,255,255,0.75)', size: 12, gap: 26 },
    foreground: DARK,
  },
  {
    id: 'bubblegum',
    label: 'Bubblegum',
    kind: 'wallpaper',
    gradient: ['#DFF7EE', '#BEEAD9'],
    motif: { type: 'dots', color: 'rgba(255,255,255,0.8)', size: 10, gap: 24 },
    foreground: DARK,
  },
  {
    id: 'cotton-candy',
    label: 'Cotton Candy',
    kind: 'wallpaper',
    gradient: ['#ECE4FF', '#D9CBFF'],
    motif: { type: 'dots', color: 'rgba(255,255,255,0.72)', size: 14, gap: 30 },
    foreground: DARK,
  },
  {
    id: 'sweet-hearts',
    label: 'Sweet Hearts',
    kind: 'wallpaper',
    gradient: ['#FFDCE6', '#FFC2D3'],
    motif: { type: 'hearts', color: 'rgba(255,255,255,0.7)', size: 16, gap: 26 },
    foreground: DARK,
  },
  {
    id: 'candy-stripes',
    label: 'Candy Stripes',
    kind: 'wallpaper',
    gradient: ['#FFF6DC', '#FFE7B4'],
    motif: { type: 'stripes', color: 'rgba(255,138,158,0.32)', width: 16, gap: 16 },
    foreground: DARK,
  },
  {
    id: 'lemonade',
    label: 'Lemonade',
    kind: 'wallpaper',
    gradient: ['#FFFBE6', '#FFF0A8'],
    motif: { type: 'stripes', color: 'rgba(255,206,120,0.4)', width: 18, gap: 18 },
    foreground: DARK,
  },
  {
    id: 'checker-pop',
    label: 'Checker Pop',
    kind: 'wallpaper',
    gradient: ['#E8F7FF', '#CDEBFF'],
    motif: { type: 'checkerboard', color: 'rgba(255,255,255,0.55)', size: 26 },
    foreground: DARK,
  },
  {
    id: 'mint-argyle',
    label: 'Mint Argyle',
    kind: 'wallpaper',
    gradient: ['#E6F6EC', '#CBEBD6'],
    motif: { type: 'diamonds', color: 'rgba(126,190,150,0.3)', size: 34 },
    foreground: DARK,
  },
  {
    id: 'harlequin',
    label: 'Harlequin',
    kind: 'wallpaper',
    gradient: ['#F3E9FF', '#E4D2FF'],
    motif: { type: 'diamonds', color: 'rgba(150,90,210,0.24)', size: 30 },
    foreground: DARK,
  },
  {
    id: 'confetti-pop',
    label: 'Confetti',
    kind: 'wallpaper',
    gradient: ['#FFF7F0', '#FFE9DC'],
    motif: {
      type: 'confetti',
      colors: ['#FF8AA0', '#7CC6FF', '#FFD36B', '#8ED89B', '#C6A8FF'],
    },
    foreground: DARK,
  },
  // -- Sky & scenery --------------------------------------------------------
  {
    id: 'blue-skies',
    label: 'Blue Skies',
    kind: 'wallpaper',
    gradient: ['#CDEBFF', '#8FD0FF'],
    motif: { type: 'clouds', color: 'rgba(255,255,255,0.92)' },
    foreground: DARK,
  },
  {
    id: 'meadow',
    label: 'Meadow',
    kind: 'wallpaper',
    gradient: ['#B7E8FF', '#E7F7CF'],
    motif: { type: 'hills', colors: ['#CFEBA3', '#A6D977', '#7EBE58'] },
    foreground: DARK,
  },
  {
    id: 'autumn-hills',
    label: 'Autumn Hills',
    kind: 'wallpaper',
    gradient: ['#FFE9C7', '#FFD9A0'],
    motif: { type: 'hills', colors: ['#F3C98B', '#E0A45E', '#C77C3C'] },
    foreground: DARK,
  },
  {
    id: 'greenhouse',
    label: 'Greenhouse',
    kind: 'wallpaper',
    gradient: ['#DDF3D6', '#C2E7B8'],
    motif: { type: 'grid', color: 'rgba(90,140,80,0.25)', size: 26 },
    foreground: DARK,
  },
  {
    id: 'graph-paper',
    label: 'Graph Paper',
    kind: 'wallpaper',
    gradient: ['#F2F7FF', '#E2ECFB'],
    motif: { type: 'grid', color: 'rgba(90,120,180,0.22)', size: 22 },
    foreground: DARK,
  },
  // -- Cozy & rustic --------------------------------------------------------
  {
    id: 'farmhouse',
    label: 'Farmhouse',
    kind: 'wallpaper',
    gradient: ['#F6EAD9', '#EAD9BE'],
    motif: { type: 'gingham', color: 'rgba(122,160,90,0.28)', size: 30 },
    foreground: DARK,
  },
  {
    id: 'picnic',
    label: 'Picnic',
    kind: 'wallpaper',
    gradient: ['#FCE9E7', '#F7D3CE'],
    motif: { type: 'gingham', color: 'rgba(214,80,74,0.26)', size: 28 },
    foreground: DARK,
  },
  {
    id: 'harvest-plaid',
    label: 'Harvest Plaid',
    kind: 'wallpaper',
    gradient: ['#F3E4CC', '#E7D0A8'],
    motif: { type: 'gingham', color: 'rgba(176,120,60,0.28)', size: 28 },
    foreground: DARK,
  },
  {
    id: 'brick-cellar',
    label: 'Brick Cellar',
    kind: 'wallpaper',
    gradient: ['#E9C9B0', '#D8AE90'],
    motif: { type: 'bricks', color: 'rgba(120,70,50,0.32)', width: 40, height: 18 },
    foreground: DARK,
  },
  // -- Night & dreamy -------------------------------------------------------
  {
    id: 'starry-night',
    label: 'Starry Night',
    kind: 'wallpaper',
    gradient: ['#243067', '#0E1230'],
    motif: { type: 'stars', color: '#FFF3C4' },
    foreground: LIGHT,
  },
  {
    id: 'twilight',
    label: 'Twilight',
    kind: 'wallpaper',
    gradient: ['#4A3B7A', '#241B45'],
    motif: { type: 'stars', color: '#F3D9FF' },
    foreground: LIGHT,
  },
  {
    id: 'aurora',
    label: 'Aurora',
    kind: 'wallpaper',
    gradient: ['#123B4A', '#0E5A4E'],
    motif: { type: 'stars', color: '#C8FFE9' },
    foreground: LIGHT,
  },
  {
    id: 'midnight-dots',
    label: 'Midnight',
    kind: 'wallpaper',
    gradient: ['#1C2340', '#111730'],
    motif: { type: 'dots', color: 'rgba(255,255,255,0.12)', size: 8, gap: 28 },
    foreground: LIGHT,
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
 * Surface treatment applied to the shelf ledge, layered over the chosen shelf
 * color so material and color are independent choices.
 */
export type TextureKind = 'smooth' | 'wood' | 'matte' | 'glossy' | 'marble' | 'metal';

export interface ShelfTexture {
  id: string;
  label: string;
  kind: TextureKind;
}

export const SHELF_TEXTURES: ShelfTexture[] = [
  { id: 'smooth', label: 'Smooth', kind: 'smooth' },
  { id: 'wood', label: 'Wood', kind: 'wood' },
  { id: 'matte', label: 'Matte', kind: 'matte' },
  { id: 'glossy', label: 'Glossy', kind: 'glossy' },
  { id: 'marble', label: 'Marble', kind: 'marble' },
  { id: 'metal', label: 'Metal', kind: 'metal' },
];

const TEXTURE_BY_ID: Record<string, ShelfTexture> = Object.fromEntries(
  SHELF_TEXTURES.map((t) => [t.id, t]),
);

export const DEFAULT_TEXTURE_ID = SHELF_TEXTURES[0].id;

/** Resolve a stored texture id to its descriptor (defaults to Smooth). */
export function getTexture(id: string | undefined): ShelfTexture {
  return (id && TEXTURE_BY_ID[id]) || SHELF_TEXTURES[0];
}
