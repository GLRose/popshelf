import type { Figure, Series } from '@/types';
import raw from './figures.json';

export const FIGURES: Figure[] = raw as Figure[];

export const FIGURES_BY_ID: Record<string, Figure> = Object.fromEntries(
  FIGURES.map((f) => [f.id, f]),
);

export function getFigure(id: string): Figure | undefined {
  return FIGURES_BY_ID[id];
}

export function figuresBySeries(series: Series): Figure[] {
  return FIGURES.filter((f) => f.series === series);
}

/**
 * Every secret in a series, in catalog order. The secret is the thing a
 * collector chases and the one figure per set they are most likely to be
 * looking for, so it gets a view of its own rather than being one badged card
 * buried at the end of each of twenty sets.
 */
export function secretsForSeries(series: Series): Figure[] {
  return figuresBySeries(series).filter((f) => f.rarity === 'secret');
}

/** Groups a series' figures by their set, preserving catalog order. */
export function setsForSeries(series: Series): { set: string; figures: Figure[] }[] {
  const groups = new Map<string, Figure[]>();
  for (const f of figuresBySeries(series)) {
    if (!groups.has(f.set)) groups.set(f.set, []);
    groups.get(f.set)!.push(f);
  }
  return [...groups.entries()].map(([set, figures]) => ({ set, figures }));
}
