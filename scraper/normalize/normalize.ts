// RawItem -> NormalizedFigure. Source-agnostic: no URLs, no selectors, no
// per-source special cases. External input is validated here at the boundary
// (zod) so malformed source data becomes a reported skip, never a corrupt row.
import { z } from 'zod';
import { accentFor } from '../config/palette';
import { cleanText, slug } from '../core/text';
import type { NormalizedFigure, RawItem, Rarity } from '../core/types';

const isHttpUrl = (s: string) => /^https?:\/\//i.test(s);

const RawItemSchema = z.object({
  sourceProductId: z.string().min(1),
  sourceUrl: z.string().refine(isHttpUrl, 'must be an http(s) URL'),
  name: z.string().min(1),
  set: z.string().min(1),
  rarity: z.string().optional(),
  year: z.union([z.number(), z.string()]).optional(),
  imageUrl: z.string().refine(isHttpUrl, 'must be an http(s) URL').optional(),
});

export interface NormalizeContext {
  readonly series: string;
  readonly source: string;
  readonly scrapedAt: string;
  /** Map a base id + source id to a collision-free, run-stable catalog id.
   * Owned by the pipeline because it needs the catalog + prior state to decide. */
  resolveId(baseId: string, sourceProductId: string): string;
}

export type NormalizeResult =
  | { readonly ok: true; readonly figure: NormalizedFigure }
  | { readonly ok: false; readonly reason: string; readonly sourceProductId?: string };

function toRarity(raw: string | undefined, name: string): Rarity {
  return /secret/i.test(`${raw ?? ''} ${name}`) ? 'secret' : 'regular';
}

function toYear(raw: number | string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw).match(/\d{4}/)?.[0] ?? '', 10);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : undefined;
}

export function normalizeItem(raw: RawItem, ctx: NormalizeContext): NormalizeResult {
  const parsed = RawItemSchema.safeParse(raw);
  if (!parsed.success) {
    const reason = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    const sourceProductId = typeof raw?.sourceProductId === 'string' ? raw.sourceProductId : undefined;
    return { ok: false, reason, sourceProductId };
  }
  const r = parsed.data;
  const name = cleanText(r.name);
  const set = cleanText(r.set);
  if (!name || !set) {
    return { ok: false, reason: 'name or set empty after cleaning', sourceProductId: r.sourceProductId };
  }

  const baseId = `${ctx.series}-${slug(set)}-${slug(name)}`;
  const figure: NormalizedFigure = {
    id: ctx.resolveId(baseId, r.sourceProductId),
    series: ctx.series,
    set,
    name,
    year: toYear(r.year),
    rarity: toRarity(r.rarity, name),
    color: accentFor(ctx.series, set),
    imageUrl: r.imageUrl,
    provenance: {
      source: ctx.source,
      sourceProductId: r.sourceProductId,
      sourceUrl: r.sourceUrl,
      scrapedAt: ctx.scrapedAt,
    },
  };
  return { ok: true, figure };
}

/** The stable fingerprint of the catalog-visible fields. When this is
 * unchanged between runs the figure is skipped (unless --force). */
export function contentHashOf(figure: NormalizedFigure): string {
  return JSON.stringify([figure.set, figure.name, figure.rarity, figure.year ?? null, figure.color]);
}
