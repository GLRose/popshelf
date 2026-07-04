import { Palette } from './palette';

/**
 * Content colors for PopShelf screens. Light-first, warm collectible look.
 * Kept intentionally simple and consistent across web + native.
 */
export const T = {
  bg: '#FBF7F4',
  card: '#FFFFFF',
  text: '#211C2B',
  muted: '#8A8394',
  border: '#ECE6EF',
  chip: '#F2EDF6',
  danger: '#E5484D',
  gold: Palette.gold,
  ink: Palette.ink,
} as const;

export const Radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;
