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

/** Groups a series' figures by their set, preserving catalog order. */
export function setsForSeries(series: Series): { set: string; figures: Figure[] }[] {
  const groups = new Map<string, Figure[]>();
  for (const f of figuresBySeries(series)) {
    if (!groups.has(f.set)) groups.set(f.set, []);
    groups.get(f.set)!.push(f);
  }
  return [...groups.entries()].map(([set, figures]) => ({ set, figures }));
}
