// popmart.com, the only source this pipeline scrapes from.
//
// Everything here goes through headless Playwright, not the pipeline's shared
// rate-limited `Fetcher` - two different Pop Mart quirks both force that:
//
//  - Collection listing pages (which sets exist for an IP) are served from a
//    plain, unsigned JSON snapshot on Pop Mart's CDN, but only the first few
//    pages of it exist (a 404 past that point) - digging further requires
//    clicking the site's own pager and letting its client JS make the signed
//    fallback request itself.
//  - The per-set figure roster (individual design names + which one is the
//    secret - the whole reason this adapter exists) is never in that
//    snapshot at all. It only comes back from a signed API gated behind
//    Cloudflare Turnstile and a proprietary device-fingerprint session token
//    Pop Mart's client JS generates. There is no lighter-weight path to it;
//    the previous, now-retired scripts/build-catalog.mjs hit the same wall
//    and gave up on Pop Mart entirely for that reason.
//
// In both cases the only reliable way in is to let a real browser load the
// page and read the JSON response its own code produces - not forging the
// signature, just letting the site sign its own request the way a real
// visitor's browser would.
import { chromium, type Browser, type Page } from 'playwright';
import type { DiscoverContext, Logger, Rarity, RawItem, SourceAdapter } from '../core/types';
import { cleanText, slug, titleCaseIfShouting } from '../core/text';

const SITE_HOST = 'https://www.popmart.com';
const COUNTRY = 'us';
// Pop Mart's own storefront sends this; headless Chromium's default UA gets a
// visibly different (and more broken) render of their app.
const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// Only the classic multi-design blind-box figure series match this - it
// excludes plush pendants, keychains, fridge magnets, single MEGA/action
// figures and other merch that shares the same IP collection page.
const DEFAULT_TITLE_PATTERN = /\bSeries Figures$/i;

/** As accepted in IpSourceConfig.options. */
interface PopmartSourceOptions {
  /** Pop Mart's numeric id for this IP's collection page, e.g. 3 for Dimoo.
   * Optional: resolved automatically from `brandLabel` against Pop Mart's own
   * live IP list (see `resolveCollectionId`) when omitted. Only worth setting
   * if that lookup is ever ambiguous or an IP drops off the nav menu. */
  readonly collectionId?: unknown;
  /** IP label exactly as Pop Mart prints it, both at the front of every
   * product title ("DIMOO The Missing Day Series Figures" - stripped when
   * deriving the set name) and in their own "CHARACTERS" nav list ("DIMOO",
   * "SKULLPANDA", "PEACH RIOT", ...), used to resolve `collectionId`. */
  readonly brandLabel?: unknown;
  readonly titlePattern?: unknown;
}

/** Resolved, defaults applied. */
interface PopmartOptions {
  readonly collectionId?: number;
  readonly brandLabel: string;
  readonly titlePattern: RegExp;
}

function readOptions(raw: Readonly<Record<string, unknown>> | undefined): PopmartOptions {
  const { collectionId, brandLabel, titlePattern } = (raw ?? {}) as PopmartSourceOptions;
  if (typeof brandLabel !== 'string' || !brandLabel) {
    throw new Error('popmart adapter requires options.brandLabel (string)');
  }
  if (collectionId !== undefined && typeof collectionId !== 'number') {
    throw new Error('popmart adapter options.collectionId, if given, must be a number');
  }
  return {
    collectionId,
    brandLabel,
    titlePattern: titlePattern instanceof RegExp ? titlePattern : DEFAULT_TITLE_PATTERN,
  };
}

/** One IP as Pop Mart's own site nav lists it. */
interface CharacterEntry {
  readonly title: string;
  readonly collectionId: number;
}

/** Every IP currently in Pop Mart's own "CHARACTERS" nav menu - the same data
 * that page uses to link to each IP's collection - so a new IP never needs
 * its collection id hand-discovered the way Dimoo's originally was. */
async function fetchCharacterList(browser: Browser): Promise<CharacterEntry[]> {
  const page = await browser.newPage();
  try {
    const navResponse = page.waitForResponse(
      (res) => res.url().includes('/home/topNavigation') && res.ok(),
      { timeout: 20000 },
    );
    await page.goto(`${SITE_HOST}/${COUNTRY}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const body = (await (await navResponse).json()) as {
      data?: { list?: { title: string; jsonData?: string }[] };
    };
    const characters = body.data?.list?.find((section) => section.title === 'CHARACTERS');
    if (!characters?.jsonData) return [];

    const parsed = JSON.parse(characters.jsonData) as {
      secondMenu?: { title?: string; webUrl?: string }[];
    };
    const entries: CharacterEntry[] = [];
    for (const item of parsed.secondMenu ?? []) {
      const idMatch = item.webUrl?.match(/\/collection\/(\d+)/);
      if (item.title && idMatch) entries.push({ title: item.title, collectionId: Number(idMatch[1]) });
    }
    return entries;
  } finally {
    await page.close();
  }
}

async function resolveCollectionId(browser: Browser, brandLabel: string): Promise<number> {
  const entries = await fetchCharacterList(browser);
  const match = entries.find((e) => e.title.toLowerCase() === brandLabel.toLowerCase());
  if (!match) {
    const known = entries.map((e) => e.title).join(', ') || '(none found - nav shape may have changed)';
    throw new Error(`no Pop Mart IP named "${brandLabel}" in their live character list. Known: ${known}`);
  }
  return match.collectionId;
}

interface CollectionProduct {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly upTime: number;
}

interface CollectionPage {
  readonly total: number;
  readonly productData: readonly CollectionProduct[];
}

interface Toy {
  readonly name: string;
  readonly type: number; // 1 = regular design, 2 = secret
  readonly url: string;
}

function isCollectionPage(v: unknown): v is CollectionPage {
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray((v as CollectionPage).productData) &&
    typeof (v as CollectionPage).total === 'number'
  );
}

/** Best-effort: closes the "you are in United States" and cookie-consent
 * overlays that otherwise sit on top of the pager and swallow clicks. Safe to
 * no-op if either isn't present (already dismissed, different country, etc). */
async function dismissOverlays(page: Page): Promise<void> {
  try {
    await page.locator('[class*="ipInConutry"]').first().click({ timeout: 3000, force: true });
  } catch {
    /* no country overlay this time */
  }
  try {
    await page.locator('button:has-text("Accept All Cookies")').click({ timeout: 3000, force: true });
  } catch {
    /* no cookie banner this time */
  }
}

/** Every product on an IP's collection page, across however many pages it
 * takes. Drives the site's own numbered pager rather than paging a URL, since
 * that's what lets pages past the CDN snapshot's limit resolve at all. */
async function fetchCollectionProducts(
  browser: Browser,
  collectionId: number,
  brandLabel: string,
  log: DiscoverContext['log'],
): Promise<CollectionProduct[]> {
  const page = await browser.newPage();
  try {
    const isCollectionResponse = (res: import('playwright').Response) =>
      /productoncollection/i.test(res.url()) && res.ok();

    const firstPage = page.waitForResponse(isCollectionResponse, { timeout: 20000 });
    await page.goto(`${SITE_HOST}/${COUNTRY}/collection/${collectionId}/${slug(brandLabel)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    const firstBody: unknown = await (await firstPage).json();
    const firstData = (firstBody as { data?: unknown }).data ?? firstBody;
    if (!isCollectionPage(firstData)) {
      throw new Error(`popmart collection ${collectionId}: unexpected response shape`);
    }

    const products = [...firstData.productData];
    const pageSize = firstData.productData.length;
    const totalPages = pageSize > 0 ? Math.ceil(firstData.total / pageSize) : 1;

    await dismissOverlays(page);

    for (let n = 2; n <= totalPages; n++) {
      const nextResponse = page.waitForResponse(isCollectionResponse, { timeout: 15000 });
      const clicked = await page.evaluate((pageNum) => {
        const link = Array.from(document.querySelectorAll('a[rel="nofollow"]')).find(
          (a) => a.textContent?.trim() === String(pageNum),
        );
        if (!link) return false;
        link.scrollIntoView();
        (link as HTMLElement).click();
        return true;
      }, n);
      if (!clicked) {
        log.warn(`popmart collection ${collectionId}: no pager link for page ${n}, stopping early`);
        break;
      }
      const body: unknown = await (await nextResponse).json();
      const data = (body as { data?: unknown }).data ?? body;
      if (!isCollectionPage(data)) {
        throw new Error(`popmart collection ${collectionId} page ${n}: unexpected response shape`);
      }
      products.push(...data.productData);
    }

    return products;
  } finally {
    await page.close();
  }
}

/** Matches the IP label where it sits at the front of a product title.
 *
 * Pop Mart's own title punctuation is inconsistent between plain ASCII and
 * full-width CJK forms ("DIMOO Foo" vs "DIMOO：Foo"), and TinyTiny hyphenates
 * ("TINYTINY-PROLOGUE SERIES FIGURES"), so all three separators are accepted. */
function brandPrefix(brandLabel: string): RegExp {
  return new RegExp(`^${brandLabel}[\\s：:-]+`, 'i');
}

function deriveSetName(title: string, brandLabel: string): string {
  return titleCaseIfShouting(
    title
      .trim()
      .replace(brandPrefix(brandLabel), '')
      .replace(/\s*Series Figures\s*$/i, '')
      .replace(/\s*Figures?\s*$/i, '')
      .trim(),
  );
}

// Pop Mart marks the special designs in the name as well as in `toy.type`, and
// a set can hold more than one tier of them ("As I Wish (Super Secret)" sits
// beside a plain secret in Tell Me What You Want). The catalog has one
// `secret` rarity, so every tier collapses into it and the suffix comes off
// the display name.
function cleanFigureName(name: string): string {
  return name.replace(/\s*[(（]\s*(?:super\s+)?secret\s*[)）]\s*$/i, '').trim();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jitter = (ms: number) => ms * (0.75 + Math.random() * 0.5);
// One page load at a time is already slow enough to be polite; this just adds
// a little breathing room between them.
const BETWEEN_SETS_DELAY_MS = 1200;

/** Where a product page gets opened. `discover()` uses the browser's default
 * context; `discoverRosters()` uses one carrying a real browser UA. */
type PageFactory = () => Promise<Page>;

/** A product page's own view of itself. `toys` is the per-design roster and is
 * empty for anything that is not a multi-design blind box; `banners` is the
 * gallery, whose first entry is the product shot - the only image a
 * single-figure product has (see `singleFigureRoster`). */
interface ProductDetail {
  readonly toys: Toy[];
  readonly banners: { readonly type?: string; readonly url?: string }[];
}

async function fetchProductDetail(newPage: PageFactory, spuId: string): Promise<ProductDetail> {
  const page = await newPage();
  try {
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes('/productDetail/groupSpu') && res.ok(),
      { timeout: 20000 },
    );
    await page.goto(`${SITE_HOST}/${COUNTRY}/products/${spuId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    const response = await responsePromise;
    const body = (await response.json()) as {
      data?: { commonInfo?: { toys?: Toy[]; banners?: ProductDetail['banners'] } };
    };
    const commonInfo = body.data?.commonInfo;
    return { toys: commonInfo?.toys ?? [], banners: commonInfo?.banners ?? [] };
  } finally {
    await page.close();
  }
}

async function fetchToys(newPage: PageFactory, spuId: string): Promise<Toy[]> {
  return (await fetchProductDetail(newPage, spuId)).toys;
}

/** spuId -> already have at least one figure from it in prior state, so a
 * routine (non --full) run leaves it alone instead of re-launching a browser
 * for it. */
function knownSpuIds(known: DiscoverContext['known']): Set<string> {
  const ids = new Set<string>();
  for (const item of known.values()) {
    const m = item.sourceUrl.match(/\/products\/(\d+)/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

export const popmartAdapter: SourceAdapter = {
  name: 'popmart',
  // Informational only: this adapter drives every request through its own
  // headless browser, not the shared `Fetcher`, so nothing here is actually
  // subject to core/rateLimit.ts's per-domain throttling.
  domains: ['www.popmart.com'],
  async *discover(ctx: DiscoverContext): AsyncIterable<RawItem> {
    const opts = readOptions(ctx.sourceConfig.options);
    const alreadyKnown = knownSpuIds(ctx.known);

    const browser = await chromium.launch();
    try {
      const collectionId = opts.collectionId ?? (await resolveCollectionId(browser, opts.brandLabel));
      const allProducts = await fetchCollectionProducts(browser, collectionId, opts.brandLabel, ctx.log);
      const candidates = allProducts.filter(
        (p) => p.type === 'normal' && opts.titlePattern.test(p.title),
      );
      ctx.log.info(`  ${candidates.length} figure series found on collection ${collectionId}`);

      for (const product of candidates) {
        if (!ctx.full && alreadyKnown.has(product.id)) {
          ctx.log.debug(`skip known set ${product.id}: ${product.title}`);
          continue;
        }

        const setName = deriveSetName(product.title, opts.brandLabel);
        const sourceUrl = `${SITE_HOST}/${COUNTRY}/products/${product.id}`;
        const year = new Date(product.upTime * 1000).getUTCFullYear();

        let toys: Toy[];
        try {
          toys = await fetchToys(() => browser.newPage(), product.id);
        } catch (e) {
          ctx.log.warn(`popmart product ${product.id} (${product.title}): ${(e as Error).message}`);
          continue;
        }
        if (toys.length === 0) {
          ctx.log.warn(`popmart product ${product.id} (${product.title}): no figure roster found`);
          continue;
        }

        for (const toy of toys) {
          const name = cleanFigureName(toy.name);
          if (!name) continue;
          yield {
            sourceProductId: `${product.id}:${slug(name)}`,
            sourceUrl,
            name,
            set: setName,
            rarity: toy.type === 2 ? 'secret' : 'regular',
            year,
            imageUrl: toy.url,
          };
        }

        await sleep(jitter(BETWEEN_SETS_DELAY_MS));
      }
    } finally {
      await browser.close();
    }
  },
};

// --- Roster lookup, for auditing an already-curated catalog ----------------
//
// `discover()` above finds an IP's sets by driving the collection page's own
// pager. That is the right shape for ingestion (it is where `upTime`, and so a
// figure's year, comes from) but it is useless for auditing skullpanda and
// peachriot: their rows were curated by hand, so there is no crawl state, and
// the pager only reaches products the storefront still lists.
//
// This path starts from Pop Mart's product sitemap instead - plain XML, no
// signature, no browser, every product they publish for a country in one file.
// It gives up `upTime`, which is exactly the field an audit does not need, and
// in exchange it needs one page load per set rather than one per pager click.

const SITEMAP_URL = `${SITE_HOST}/${COUNTRY}/sitemap-products.xml`;
// Product titles for the classic blind-box figure sets end in "Series",
// "Series Figures", or just "Figures" ("Peach Riot À La Mode Figures"). Merch
// carrying the same set name does not ("... Series-Fridge Magnet Blind Box",
// "... Series Phone Chain"), which is what keeps it out.
//
// The singular "Figure" is here for the standalone, non-blind-box releases
// ("TINYTINY LULLABY FIGURE"). Those carry no roster at all, so they only
// become figures under `allowSingles` - see `singleFigureRoster`.
const FIGURE_TITLE_PATTERN = /\b(?:Series|Figures?)\s*$/i;

/** One set as Pop Mart's own product page reports it. */
export interface SetRoster {
  /** Pop Mart's numeric product (SPU) id. */
  readonly productId: string;
  /** Product title, verbatim. */
  readonly title: string;
  /** Set name with the IP prefix and "Series Figures" suffix removed. */
  readonly set: string;
  readonly sourceUrl: string;
  readonly figures: readonly {
    readonly name: string;
    readonly rarity: Rarity;
    /** Pop Mart's own render of this design. Already background-free. */
    readonly imageUrl?: string;
  }[];
}

interface SitemapProduct {
  readonly productId: string;
  readonly title: string;
}

/** Every product Pop Mart lists for this country, as (id, title). The path
 * segment after the id is the product title, URL-encoded. */
export function parseProductSitemap(xml: string): SitemapProduct[] {
  const products: SitemapProduct[] = [];
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const url = match[1];
    const parts = url.match(/\/products\/(\d+)\/(.+)$/);
    if (!parts) continue;
    products.push({ productId: parts[1], title: cleanText(decodeURIComponent(parts[2])) });
  }
  return products;
}

/** Blind-box figure products for one IP, newest id first, deduped to one
 * candidate list per set. Pop Mart carries several SPUs for the same set (a
 * re-release, a regional listing), and any of them answers with the same
 * roster, so the extras are only fallbacks for when one of them does not. */
export function figureProductsBySet(
  products: readonly SitemapProduct[],
  brandLabel: string,
): Map<string, { set: string; candidates: SitemapProduct[] }> {
  const prefix = brandPrefix(brandLabel);
  const bySet = new Map<string, { set: string; candidates: SitemapProduct[] }>();
  for (const product of products) {
    if (!prefix.test(product.title)) continue;
    if (!FIGURE_TITLE_PATTERN.test(product.title)) continue;
    // deriveSetName strips "Series Figures" and "Figures"; sitemap titles also
    // come in the older "SKULLPANDA The Warmth Series" shape. Re-cased after
    // that trailing "Series" comes off, not before: "DIMOO WORLD × PIXAR
    // Series" still carries the lowercase of "Series" while it is attached, so
    // deriveSetName's own pass reads it as already-cased and leaves it be.
    const set = titleCaseIfShouting(
      deriveSetName(product.title, brandLabel)
        .replace(/\s*Figures?\s*$/i, '')
        .replace(/\s*Series\s*$/i, '')
        .trim(),
    );
    if (!set) continue;
    const key = slug(set);
    const entry = bySet.get(key);
    if (entry) {
      entry.candidates.push(product);
      continue;
    }
    bySet.set(key, { set, candidates: [product] });
  }
  for (const entry of bySet.values()) {
    entry.candidates.sort((a, b) => Number(b.productId) - Number(a.productId));
  }
  return bySet;
}

export interface RosterOptions {
  /** IP label exactly as Pop Mart prints it at the front of a product title. */
  readonly brandLabel: string;
  readonly log: Logger;
  /** Only visit sets whose slug this accepts. Used to skip sets the caller
   * has no rows for, so no page is loaded for nothing. */
  readonly wanted?: (setSlug: string) => boolean;
  /** Treat a rosterless product as a set of one named after itself.
   *
   * Off by default, and deliberately so: the rarity audit reads this to check
   * labels on sets it already has rows for, and a standalone release is not
   * one of those. Ingestion turns it on, because "TINYTINY LULLABY FIGURE" is
   * a figure a collector owns and wants on a shelf whether or not Pop Mart
   * ever put it in a blind box. */
  readonly allowSingles?: boolean;
}

// A standalone release names itself in the singular ("TINYTINY LULLABY FIGURE",
// "Sweet Bean Easter Bunny Figure"). A multi-design set does not, even when its
// roster fails to load ("Sweet Bean Afternoon Tea Series Figures").
//
// That distinction is the whole safety of `allowSingles`. Without it, a real
// twelve-design series whose roster happened to come back empty would be
// flattened into one figure named after the set - which is worse than missing,
// because it looks complete.
const SINGLE_FIGURE_TITLE_PATTERN = /\b(?:Figure|Figurine)\s*$/i;

/** A rosterless product as a one-figure set. Pop Mart gives these no `toys`
 * at all - there are no designs to enumerate - so the set and the figure are
 * both the product, and the artwork is the first gallery banner. */
function singleFigureRoster(
  candidate: SitemapProduct,
  set: string,
  detail: ProductDetail,
): SetRoster | undefined {
  if (!SINGLE_FIGURE_TITLE_PATTERN.test(candidate.title)) return undefined;
  const name = cleanFigureName(set);
  if (!name) return undefined;
  const banner = detail.banners.find((b) => b.url && b.type !== 'video');
  return {
    productId: candidate.productId,
    title: candidate.title,
    set,
    sourceUrl: `${SITE_HOST}/${COUNTRY}/products/${candidate.productId}`,
    figures: [{ name, rarity: 'regular', imageUrl: banner?.url }],
  };
}

/** Every blind-box set Pop Mart currently publishes for `brandLabel`, with the
 * per-design secret flag their product pages carry. */
export async function* discoverRosters(opts: RosterOptions): AsyncIterable<SetRoster> {
  const response = await fetch(SITEMAP_URL, { headers: { 'user-agent': BROWSER_UA } });
  if (!response.ok) {
    throw new Error(`popmart sitemap ${SITEMAP_URL}: HTTP ${response.status}`);
  }
  const bySet = figureProductsBySet(parseProductSitemap(await response.text()), opts.brandLabel);
  opts.log.info(`  ${bySet.size} figure sets listed for ${opts.brandLabel}`);

  const browser = await chromium.launch();
  // Standalone one-offs are held back and yielded last. Browse lists sets in
  // catalog order, which is ingestion order, and the sitemap is ordered by
  // product id - so without this an IP opens on a column of lonely one-card
  // sets (Sweet Bean's Grow up Quickly, Hot Spring Travel, ...) before any of
  // its real blind-box waves. The one-offs are the appendix to a line, not the
  // headline.
  const singles: SetRoster[] = [];
  try {
    const context = await browser.newContext({ userAgent: BROWSER_UA, viewport: { width: 1440, height: 900 } });
    for (const [setSlug, entry] of bySet) {
      if (opts.wanted && !opts.wanted(setSlug)) {
        opts.log.debug(`skip set not in catalog: ${entry.set}`);
        continue;
      }

      let roster: SetRoster | undefined;
      // Only used if no candidate yields a real roster, so a genuine blind-box
      // set whose newest SPU happens to answer empty still prefers an older
      // SPU's real roster over being flattened into a set of one.
      let single: SetRoster | undefined;
      for (const candidate of entry.candidates) {
        let detail: ProductDetail;
        try {
          detail = await fetchProductDetail(() => context.newPage(), candidate.productId);
        } catch (e) {
          opts.log.warn(`popmart product ${candidate.productId} (${candidate.title}): ${(e as Error).message}`);
          continue;
        } finally {
          await sleep(jitter(BETWEEN_SETS_DELAY_MS));
        }
        if (detail.toys.length === 0) {
          if (opts.allowSingles && !single) {
            single = singleFigureRoster(candidate, entry.set, detail);
          }
          opts.log.warn(`popmart product ${candidate.productId} (${candidate.title}): no figure roster found`);
          continue;
        }
        const figures: { name: string; rarity: Rarity; imageUrl?: string }[] = [];
        for (const toy of detail.toys) {
          const name = cleanFigureName(toy.name);
          if (!name) continue;
          let rarity: Rarity = 'regular';
          if (toy.type === 2) {
            rarity = 'secret';
          }
          figures.push({ name, rarity, imageUrl: toy.url });
        }
        roster = {
          productId: candidate.productId,
          title: candidate.title,
          set: entry.set,
          sourceUrl: `${SITE_HOST}/${COUNTRY}/products/${candidate.productId}`,
          figures,
        };
        break;
      }

      if (!roster && single) {
        opts.log.info(`  ${single.set}: standalone figure, no roster`);
        singles.push(single);
        continue;
      }

      if (roster) {
        yield roster;
      }
    }
  } finally {
    await browser.close();
  }

  for (const single of singles) {
    yield single;
  }
}
