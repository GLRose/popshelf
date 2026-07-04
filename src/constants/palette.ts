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
    tagline: 'Moody, dreamy, ever-changing',
    accent: Palette.skullpanda,
  },
  peachriot: {
    id: 'peachriot',
    label: 'PEACH RIOT',
    tagline: 'Sweet but rebellious',
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

/** Preset shelf backgrounds (linear-gradient-ish flat colors kept simple for RN). */
export const SHELF_BACKGROUNDS = [
  { id: 'lavender', label: 'Lavender', value: '#E7E2FB' },
  { id: 'peach', label: 'Peach', value: '#FDE3E8' },
  { id: 'mint', label: 'Mint', value: '#DBF3E8' },
  { id: 'night', label: 'Night', value: '#1B1830' },
  { id: 'sand', label: 'Sand', value: '#F3ECE1' },
  { id: 'sky', label: 'Sky', value: '#D9ECFB' },
];
