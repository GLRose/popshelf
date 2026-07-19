/**
 * First paint for a brand-new visitor.
 *
 * The app bundles no artwork, so every figure starts as a gradient placeholder
 * and only becomes real once its bytes arrive. That makes the shape of the
 * cold-start request waterfall the whole user experience, and this spec asserts
 * that shape rather than a wall-clock number, which would be flaky.
 *
 * What regressed before: the bucket was private, so listing the approved images
 * cost one `createSignedUrl` round trip *per figure* - hundreds of them, none of
 * which could overlap with a download because the client awaited all of them
 * first. Each image was then fetched as a blob and committed to IndexedDB before
 * it could display. A new user watched placeholders for seconds.
 *
 * So: exactly one query to learn what art exists, zero signing calls, and the
 * URLs handed to the browser must be plain cacheable https, never `blob:`.
 */
import { chromium } from 'playwright';

const APP = 'http://localhost:8080';
const API = 'http://localhost:54321';

/** Real ids from src/data/figures.json - the first setful of Skullpanda. */
const SEEDED = [
  'skullpanda-the-warmth-the-raining-day',
  'skullpanda-the-warmth-the-encounter',
  'skullpanda-the-warmth-the-day-off',
];

const state = () => fetch(`${API}/__state`).then((r) => r.json());

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` -> ${detail}` : ''}`);
  if (!ok) failures++;
}

async function run() {
  await fetch(`${API}/__reset`);
  await fetch(`${API}/__seed-images?figures=${SEEDED.join(',')}`);

  const browser = await chromium.launch();
  // A brand-new visitor: no storage, no cache, no session.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [page error]', e.message));

  console.log('\nA first-time visitor loads the site');
  await page.goto(APP);
  await page.getByText('Browse', { exact: true }).first().waitFor({ timeout: 20000 });

  // Wait for the artwork itself, not a fixed sleep: the point is that it lands.
  const artwork = page.locator('img[src*="/storage/v1/object/"]').first();
  await artwork.waitFor({ timeout: 15000 }).catch(() => {});

  const srcs = await page.locator('img').evaluateAll((nodes) => nodes.map((n) => n.src));
  const fromStorage = srcs.filter((s) => s.includes('/storage/v1/object/'));

  check('figure artwork rendered', fromStorage.length > 0, `${fromStorage.length} image(s)`);
  check(
    'artwork loads straight from the public bucket',
    fromStorage.length > 0 && fromStorage.every((s) => s.includes('/object/public/')),
    fromStorage[0] ?? 'none',
  );
  check(
    'no image is served from a blob: URL',
    !srcs.some((s) => s.startsWith('blob:')),
    srcs.filter((s) => s.startsWith('blob:')).length + ' blob url(s)',
  );

  // The images the browser actually painted must be decodable, not broken
  // requests that merely look right in the DOM.
  const painted = await page
    .locator('img[src*="/object/public/"]')
    .first()
    .evaluate((n) => n.complete && n.naturalWidth > 0)
    .catch(() => false);
  check('the first cutout decoded', painted === true);

  console.log('\nThe request waterfall that gets it there');
  const { calls } = await state();
  const listed = calls.filter((c) => c.path === '/rest/v1/figure_images' && c.method === 'GET');
  const signed = calls.filter((c) => c.path.startsWith('/storage/v1/object/sign/'));

  check('one query discovers every approved image', listed.length === 1, `${listed.length} call(s)`);
  check('nothing is signed', signed.length === 0, `${signed.length} signing call(s)`);

  console.log('\nA returning visitor');
  await page.reload();
  await page.getByText('Browse', { exact: true }).first().waitFor({ timeout: 20000 });
  await page.locator('img[src*="/object/public/"]').first().waitFor({ timeout: 10000 });

  const after = await state();
  const signedAfter = after.calls.filter((c) => c.path.startsWith('/storage/v1/object/sign/'));
  check('still nothing is signed on a warm load', signedAfter.length === 0);

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
