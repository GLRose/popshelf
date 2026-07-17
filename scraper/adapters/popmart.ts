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
import type { DiscoverContext, RawItem, SourceAdapter } from '../core/types';
import { slug } from '../core/text';

const SITE_HOST = 'https://www.popmart.com';
const COUNTRY = 'us';

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

function deriveSetName(title: string, brandLabel: string): string {
  // Pop Mart's own title punctuation is inconsistent between plain ASCII and
  // full-width CJK forms ("DIMOO Foo" vs "DIMOO：Foo"), so both are accepted.
  return title
    .trim()
    .replace(new RegExp(`^${brandLabel}[\\s：:]+`, 'i'), '')
    .replace(/\s*Series Figures\s*$/i, '')
    .replace(/\s*Figures\s*$/i, '')
    .trim();
}

function cleanFigureName(name: string): string {
  return name.replace(/\s*[(（]\s*secret\s*[)）]\s*$/i, '').trim();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jitter = (ms: number) => ms * (0.75 + Math.random() * 0.5);
// One page load at a time is already slow enough to be polite; this just adds
// a little breathing room between them.
const BETWEEN_SETS_DELAY_MS = 1200;

async function fetchToys(browser: Browser, spuId: string): Promise<Toy[]> {
  const page = await browser.newPage();
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
      data?: { commonInfo?: { toys?: Toy[] } };
    };
    return body.data?.commonInfo?.toys ?? [];
  } finally {
    await page.close();
  }
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
          toys = await fetchToys(browser, product.id);
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
