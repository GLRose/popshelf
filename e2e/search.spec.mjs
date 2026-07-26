/**
 * Browse's two ways of finding a figure you cannot scroll to.
 *
 * Search is catalog-wide and deliberately ignores the series toggle, because
 * "which IP is this one from" is a common reason to search in the first place.
 * The ranking is the part worth guarding: a two-letter query hits a stray
 * figure in dozens of sets, and the set the user was actually typing has to
 * come out on top of them rather than somewhere in the middle.
 *
 * The Secrets chip is the other half. A secret is the one figure per set a
 * collector chases, and before this it was a badged card at the end of each of
 * twenty sets with no way to see them together.
 *
 * Both are pure client state - no Supabase call is involved either way - so
 * this spec asserts against the rendered list rather than the stub's /__state.
 */
import { chromium } from 'playwright';

const APP = 'http://localhost:8080';

/** From src/data/figures.json. Checked here so a bad catalog fails loudly.
 *
 * Every IP in SERIES_ORDER belongs here, including the low counts: POP BEAN
 * has exactly one because only its DIMOO WORLD × PIXAR wave came from Pop
 * Mart, and the six waves read from thetoypool.com carry no secret marking at
 * all (see UNLABELLED_SECRET_SETS in scraper/db/rarity.test.ts). A 1 here is
 * the honest number, and it will move the day that gap is closed. */
const SECRETS = {
  SKULLPANDA: 24,
  'PEACH RIOT': 8,
  HIRONO: 14,
  DIMOO: 16,
  TINYTINY: 1,
  'POP BEAN': 1,
  'SWEET BEAN': 4,
};

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` -> ${detail}` : ''}`);
  if (!ok) failures++;
}

/** The section headers currently in the list, top to bottom. */
const headings = (page) =>
  page.locator('[data-testid="section-title"]').allTextContents();

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [page error]', e.message));

  await page.goto(APP);
  await page.getByText('Browse', { exact: true }).first().waitFor({ timeout: 20000 });

  const search = page.getByLabel('Search figures');
  const results = page.locator('[data-testid="result-count"]');

  console.log('\nTyping two letters finds the set they start');
  await search.fill('po');
  await results.waitFor({ timeout: 5000 });
  const first = (await headings(page))[0];
  check('the best-ranked set is Power Chords', first === 'Power Chords', first);
  check(
    'its IP is named, since results span every IP',
    (await page.locator('[data-testid="section-series"]').first().textContent()) === 'PEACH RIOT',
  );
  check(
    'a Skullpanda figure is reachable from a Peach Riot search box',
    (await headings(page)).length > 1,
    `${(await headings(page)).length} sets matched`,
  );

  console.log('\nAdding words narrows rather than widens');
  await search.fill('peach riot power');
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="section-title"]').length === 1,
    { timeout: 5000 },
  );
  check('one set survives all three tokens', (await headings(page)).length === 1);
  check('and it is still Power Chords', (await headings(page))[0] === 'Power Chords');

  console.log('\nA figure can be found by its own name');
  await search.fill('gigi the underworld');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="result-count"]')?.textContent === '1 result',
    { timeout: 5000 },
  );
  check('exactly one figure matches', (await results.textContent()) === '1 result');
  check(
    'and it is the one that was named',
    await page.getByText('Gigi The Underworld', { exact: true }).first().isVisible(),
  );

  console.log('\nA query that matches nothing says so');
  await search.fill('zzzzq');
  await page.getByText('No figures match', { exact: false }).waitFor({ timeout: 5000 });
  check('the empty state is shown', true);
  check('and no sets are listed', (await headings(page)).length === 0);

  console.log('\nClearing search puts Browse back');
  await page.getByLabel('Clear search').click();
  await page.getByRole('button', { name: 'SKULLPANDA' }).waitFor({ timeout: 5000 });
  check('the IP toggle is back', true);
  check('and the search box is empty', (await search.inputValue()) === '');

  console.log('\nEvery IP can show its secrets in one place');
  for (const [label, expected] of Object.entries(SECRETS)) {
    await page.getByRole('button', { name: label }).click();
    const chip = page.getByRole('button', { name: `Secrets ${expected}` });
    await chip.waitFor({ timeout: 5000 });
    await chip.click();
    await page.getByText('All Secrets', { exact: true }).waitFor({ timeout: 5000 });

    const count = await page.locator('[data-testid="section-count"]').first().textContent();
    check(`${label} gathers all ${expected} of its secrets`, count === String(expected), count);

    // Every card in this view has to be a secret, or the filter is not one.
    const cards = await page.locator('[data-testid="figure-card"]').count();
    const badges = await page.locator('[data-testid="secret-badge"]').count();
    check(`${label} shows nothing but secrets`, cards > 0 && cards === badges, `${badges}/${cards}`);
  }

  console.log('\nSwitching IP drops the previous IP\'s filter');
  await page.getByRole('button', { name: 'SKULLPANDA' }).click();
  await page.getByText('The Warmth', { exact: true }).first().waitFor({ timeout: 5000 });
  check('Browse is back on every set', (await headings(page)).length > 1);

  await browser.close();
  console.log(failures === 0 ? '\nsearch: OK' : `\nsearch: ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
