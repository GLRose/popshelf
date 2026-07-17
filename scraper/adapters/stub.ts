// A fake source with no network access, used to exercise the whole pipeline
// (discover -> normalize -> upsert -> summary) before any real adapter exists.
// Phase-1 verification target for `--dry-run`. Not registered against any real
// IP beyond the 'stub' config.
import type { DiscoverContext, RawItem, SourceAdapter } from '../core/types';

const ITEMS: readonly RawItem[] = [
  { sourceProductId: 's1', sourceUrl: 'https://example.com/s/1', name: 'Test Alpha', set: 'Demo Wave', rarity: 'regular', imageUrl: 'https://example.com/a.png' },
  { sourceProductId: 's2', sourceUrl: 'https://example.com/s/2', name: 'Test Beta', set: 'Demo Wave', rarity: 'regular', imageUrl: 'https://example.com/b.png' },
  { sourceProductId: 's3', sourceUrl: 'https://example.com/s/3', name: 'Test Secret', set: 'Demo Wave', rarity: 'secret' },
  // Same name+set as s1, different source id: exercises id collision handling.
  { sourceProductId: 's4', sourceUrl: 'https://example.com/s/4', name: 'Test Alpha', set: 'Demo Wave' },
  // Malformed: empty name -> must be reported as a skip, not crash the run.
  { sourceProductId: 's5', sourceUrl: 'https://example.com/s/5', name: '', set: 'Demo Wave' },
];

export const stubAdapter: SourceAdapter = {
  name: 'stub',
  domains: ['example.com'],
  async *discover(_ctx: DiscoverContext): AsyncIterable<RawItem> {
    for (const item of ITEMS) yield item;
  },
};
