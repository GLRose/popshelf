// popmart.com again, reached the other way round.
//
// `popmart.ts`'s discover() walks an IP's collection page, which is the only
// place Pop Mart publishes a set's release date. That pager has been broken on
// their side since 2026-07-25 - their own get_location_by_ip answers 500 and
// the storefront's JS dies before it ever requests the product list - so that
// route reaches nothing at all.
//
// The sitemap route does still work, and `discoverRosters()` has been walking
// it for the rarity audit all along: plain unsigned XML lists every product,
// and a product page still answers with its own roster. Each design in that
// roster carries a name, Pop Mart's authoritative secret flag, and a render.
// That is everything the catalog needs except `year`, which only the collection
// listing ever had.
//
// So this adapter is deliberately thin. It exists to make that already-working
// walk available to the pipeline as a source, rather than to reimplement it.
import { discoverRosters } from './popmart';
import { slug } from '../core/text';
import type { DiscoverContext, RawItem, SourceAdapter } from '../core/types';

interface RosterSourceOptions {
  readonly brandLabel?: unknown;
  readonly allowSingles?: unknown;
}

function readOptions(raw: Readonly<Record<string, unknown>> | undefined) {
  const { brandLabel, allowSingles } = (raw ?? {}) as RosterSourceOptions;
  if (typeof brandLabel !== 'string' || !brandLabel) {
    throw new Error('popmart-roster adapter requires options.brandLabel (string)');
  }
  if (allowSingles !== undefined && typeof allowSingles !== 'boolean') {
    throw new Error('popmart-roster adapter options.allowSingles, if given, must be a boolean');
  }
  return { brandLabel, allowSingles: allowSingles ?? true };
}

export const popmartRosterAdapter: SourceAdapter = {
  name: 'popmart-roster',
  // Informational only, like popmart.ts: the sitemap read is a plain fetch but
  // every product page goes through this adapter's own headless browser, which
  // paces itself and never touches core/rateLimit.ts.
  domains: ['www.popmart.com'],
  async *discover(ctx: DiscoverContext): AsyncIterable<RawItem> {
    const opts = readOptions(ctx.sourceConfig.options);

    // No `wanted` predicate on purpose. The audit passes one to avoid loading
    // pages for sets it has no rows for; ingestion wants exactly those sets.
    for await (const roster of discoverRosters({
      brandLabel: opts.brandLabel,
      log: ctx.log,
      allowSingles: opts.allowSingles,
    })) {
      for (const figure of roster.figures) {
        yield {
          // Same scheme discover() uses, so a figure keeps its id whichever
          // route reached it and the two sources cannot fork a duplicate.
          sourceProductId: `${roster.productId}:${slug(figure.name)}`,
          sourceUrl: roster.sourceUrl,
          name: figure.name,
          set: roster.set,
          rarity: figure.rarity,
          imageUrl: figure.imageUrl,
        };
      }
    }
  },
};
