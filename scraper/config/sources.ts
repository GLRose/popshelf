// The registry. Adding a new IP is (ideally) an entry in IP_CONFIGS; adding a
// new source is one entry in ADAPTERS plus its adapter file. Nothing else in
// the pipeline changes. This file is the only place that knows which sources
// feed which IPs.
import type { IpConfig, SourceAdapter } from '../core/types';
import { stubAdapter } from '../adapters/stub';
import { popmartAdapter } from '../adapters/popmart';
import { popmartRosterAdapter } from '../adapters/popmartRoster';
import { toypoolAdapter } from '../adapters/toypool';

const ADAPTERS: readonly SourceAdapter[] = [
  stubAdapter,
  popmartAdapter,
  popmartRosterAdapter,
  toypoolAdapter,
];

export function getAdapter(name: string): SourceAdapter {
  const adapter = ADAPTERS.find((a) => a.name === name);
  if (!adapter) {
    throw new Error(
      `No adapter registered named "${name}". Registered: ${ADAPTERS.map((a) => a.name).join(', ')}`,
    );
  }
  return adapter;
}

export const IP_CONFIGS: readonly IpConfig[] = [
  // Verification-only IP: exercises the pipeline end to end with no network.
  {
    ip: 'stub',
    label: 'Stub',
    accent: '#8A7BF0',
    sources: [{ source: 'stub' }],
  },
  {
    ip: 'dimoo',
    label: 'DIMOO',
    accent: '#4A9DD9',
    sources: [{ source: 'popmart', options: { brandLabel: 'DIMOO' } }],
  },
  {
    ip: 'hirono',
    label: 'HIRONO',
    accent: '#5B6B8C',
    sources: [{ source: 'popmart', options: { brandLabel: 'HIRONO' } }],
  },
  // Both of these were curated by hand long before the pipeline existed, so
  // their rows carry no Pop Mart provenance and there is no state sidecar for
  // them. They are registered here for audit-rarity.ts, which reads the
  // authoritative secret flag off popmart.com without writing a catalog. A
  // full `npm run scrape --ip skullpanda` would work, but it would also
  // re-id, rename and republish artwork for ~400 hand-curated rows, so it is
  // not what these entries are here for.
  {
    ip: 'skullpanda',
    label: 'SKULLPANDA',
    accent: '#7C6BF2',
    sources: [{ source: 'popmart', options: { brandLabel: 'SKULLPANDA' } }],
  },
  {
    ip: 'peachriot',
    label: 'PEACH RIOT',
    accent: '#FF7A9A',
    sources: [{ source: 'popmart', options: { brandLabel: 'PEACH RIOT' } }],
  },
  // The three below use `popmart-roster` rather than `popmart`, because the
  // collection pager the latter depends on has been broken on Pop Mart's side
  // since 2026-07-25. The sitemap route reaches the same rosters and the same
  // artwork; the only field it cannot give is `year`.
  //
  // `brandLabel` here must match the prefix on Pop Mart's own *product titles*,
  // which is not always what their CHARACTERS nav prints: the nav says
  // "TINY TINY", every product says "TINYTINY".
  {
    ip: 'tinytiny',
    label: 'TINYTINY',
    accent: '#B8A6D9',
    sources: [{ source: 'popmart-roster', options: { brandLabel: 'TINYTINY' } }],
  },
  {
    ip: 'sweetbean',
    label: 'SWEET BEAN',
    accent: '#F2C879',
    sources: [{ source: 'popmart-roster', options: { brandLabel: 'Sweet Bean' } }],
  },
  // POP BEAN is a format, not an IP - a bean-shaped mini of a character
  // borrowed from another line - which is why it is absent from Pop Mart's
  // CHARACTERS nav and why the borrowed character rides in the figure name
  // ("Labubu - The Best One") instead of becoming a series of its own. Filing
  // these under a dozen character IPs would promise mainline catalogs that do
  // not exist.
  //
  // Two sources because neither covers it alone. Pop Mart answers with an
  // empty roster for almost every POP BEAN product (the collaboration waves
  // are the exception), so thetoypool.com carries the rest.
  //
  // toypool runs first, and the order is load-bearing for a reason that is not
  // about data: Browse lists sets in catalog order, which is ingestion order.
  // The one wave Pop Mart does answer for, DIMOO WORLD × PIXAR, is also the
  // only wave whose art the cutout rejects (staged lifestyle photos), so
  // leading with it opened the IP on a grid of placeholders while the 87
  // properly illustrated figures sat below the fold.
  //
  // The two sources cover disjoint sets, so nothing about rarity or ids turns
  // on which runs first.
  {
    ip: 'popbean',
    label: 'POP BEAN',
    accent: '#7FBF8F',
    sources: [
      {
        source: 'toypool',
        options: {
          sets: [
            {
              path: 'pop-mart/pop-bean-lucky-charm-series',
              set: 'Lucky Charm',
              tail: 'POP-BEAN-Lucky-Charm-Series-Pop-Mart-Figure',
            },
            {
              path: 'pop-mart/pop-bean-fortune-bag-series',
              set: 'Fortune Bag',
              tail: 'POP-BEAN-Fortune-Bag-Series-Pop-Mart-Figure',
            },
            {
              path: 'pop-mart/pop-bean-fruit-platter-series',
              set: 'Fruit Platter',
              tail: 'POP-BEAN-Fruit-Platter-Series-Pop-Mart-Figure',
            },
            {
              path: 'pop-mart/pop-bean-lucky-cat-series',
              set: 'Lucky Cat',
              tail: 'Pop-Bean-Lucky-Cat-Series-Pop-Mart-Figure',
            },
            {
              path: 'pop-mart/pop-bean-mini-ice-pop-series',
              set: 'Mini Ice Pop',
              tail: 'POP-BEAN-Mini-Ice-Pop-Series-Pop-Mart-Figure',
            },
            {
              path: 'licensed-series/pop-bean-harry-potter-flight-series',
              set: 'Harry Potter Flight',
              tail: 'Pop-Bean-Flight-Series-Harry-Potter-Series-Pop-Mart-Figure',
            },
          ],
        },
      },
      { source: 'popmart-roster', options: { brandLabel: 'POP BEAN', allowSingles: false } },
    ],
  },
];

export function getIpConfig(ip: string): IpConfig {
  const config = IP_CONFIGS.find((c) => c.ip === ip);
  if (!config) {
    throw new Error(
      `No IP configured for "${ip}". Configured: ${IP_CONFIGS.map((c) => c.ip).join(', ')}`,
    );
  }
  return config;
}
