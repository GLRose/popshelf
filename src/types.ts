export type Series =
  | 'skullpanda'
  | 'peachriot'
  | 'hirono'
  | 'dimoo'
  | 'tinytiny'
  // Not a Pop Mart IP but a format: a bean-shaped mini of a character borrowed
  // from another line. The borrowed character rides in the figure's name.
  | 'popbean'
  | 'sweetbean';

export interface Figure {
  /** Stable unique id, e.g. "skullpanda-the-warmth-01" */
  id: string;
  series: Series;
  /** The set / blind-box series this figure belongs to, e.g. "The Warmth" */
  set: string;
  /** Display name of the figure */
  name: string;
  /** Optional release year */
  year?: number;
  rarity?: 'regular' | 'secret';
  /** Accent color used for the placeholder card + shelf glow */
  color?: string;
}

export interface Shelf {
  /** Stable unique id */
  id: string;
  /** User-facing shelf name */
  name: string;
  /** Ledge color value */
  color: string;
  /** Background id (see SHELF_BACKGROUNDS); resolves to a color or wallpaper */
  background: string;
  /** Ledge texture id (see SHELF_TEXTURES) */
  texture: string;
  /** Owned figure ids on this shelf, most-recently-added last */
  figureIds: string[];
}

export interface SeriesMeta {
  id: Series;
  label: string;
  accent: string;
}
