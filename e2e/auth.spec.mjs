/**
 * Drives the real web build against the fake Supabase and asserts on the
 * SERVER's state, not the UI's optimism.
 *
 * The claim under test: a user's shelves and favorites survive the device.
 *   1. signed out, nothing is sent to the server at all
 *   2. signing up adopts what the device already built
 *   3. signing out leaves the device empty but the account intact
 *   4. signing in on a *different* device brings the account's shelves back
 *   5. and merges them with whatever that second device built on its own
 */
import { chromium } from 'playwright';

const APP = 'http://localhost:8080';
const API = 'http://localhost:54321';
const EMAIL = 'collector@popshelf.test';
const PASSWORD = 'shelf-me-forever-1';

const state = () => fetch(`${API}/__state`).then((r) => r.json());
const reset = () => fetch(`${API}/__reset`).then((r) => r.json());

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` -> ${detail}` : ''}`);
  if (!ok) failures++;
}

/** Waits for the app to settle: the tab bar is the last thing to render. */
async function boot(page, path = '/') {
  await page.goto(APP + path);
  await page.getByText('Browse', { exact: true }).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800); // hydrate() + any remote reconciliation
}

async function openAccount(page) {
  await page.goto(`${APP}/account`);
  await page.getByLabel('Email address').waitFor({ timeout: 15000 });
}

/** The account screen as it renders for a user who is already signed in. */
async function openAccountSignedIn(page) {
  await page.goto(`${APP}/account`);
  await page.getByRole('button', { name: 'Sign out' }).waitFor({ timeout: 15000 });
}

/** Adds the Nth figure on the Browse grid to the active shelf, and returns its name. */
async function shelveFigure(page, n) {
  const card = page.getByLabel('Add to shelf').nth(n);
  await card.waitFor({ timeout: 15000 });
  await card.click();
  await page.waitForTimeout(400);
}

async function run() {
  await reset();
  const browser = await chromium.launch();

  // ---------- Device A ----------
  console.log('\nDevice A: build a shelf while signed out');
  const deviceA = await browser.newContext();
  const a = await deviceA.newPage();
  a.on('pageerror', (e) => console.log('  [page error]', e.message));
  await boot(a);

  await shelveFigure(a, 0);
  await a.getByLabel('Add to favorites').first().click();
  await a.waitForTimeout(600);

  let s = await state();
  check(
    'signed out, nothing reaches the server',
    s.shelves.length === 0 && s.favorites.length === 0,
    `shelves=${s.shelves.length} favorites=${s.favorites.length}`,
  );
  const wroteWhileSignedOut = s.calls.some((c) => c.path.startsWith('/rest/v1/shelves'));
  check('signed out, no shelf write is even attempted', !wroteWhileSignedOut);

  console.log('\nDevice A: create an account');
  await openAccount(a);
  await a.getByRole('button', { name: "I don't have an account yet" }).click();
  await a.getByLabel('Email address').fill(EMAIL);
  await a.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await a.getByRole('button', { name: 'Create account' }).click();
  await a.waitForTimeout(2000);

  s = await state();
  const user = s.users.find((u) => u.email === EMAIL);
  check('the account exists', Boolean(user), user ? user.id : 'no user');
  check('sign-up adopted the device shelf', s.shelves.length === 1, `shelves=${s.shelves.length}`);
  check(
    'the shelf is owned by the new account',
    s.shelves.every((sh) => sh.owner_id === user?.id),
  );
  const figuresA = s.shelves[0]?.figure_ids ?? [];
  check('the shelved figure came with it', figuresA.length === 1, JSON.stringify(figuresA));
  check('the favorite came with it', s.favorites.length === 1, `favorites=${s.favorites.length}`);

  console.log('\nDevice A: sign out');
  await openAccountSignedIn(a);
  const signedInAs = await a.getByText(EMAIL).count();
  check('the account screen shows who is signed in', signedInAs === 1);
  await a.getByRole('button', { name: 'Sign out' }).click();
  await a.getByRole('button', { name: 'Sign out' }).last().click(); // confirm
  await a.waitForTimeout(1500);

  s = await state();
  check(
    'signing out leaves the account intact on the server',
    s.shelves.length === 1 && s.favorites.length === 1,
    `shelves=${s.shelves.length} favorites=${s.favorites.length}`,
  );

  await boot(a);
  const stillShelved = await a.getByLabel('Remove from this shelf').count();
  check('signing out empties the device', stillShelved === 0, `still shelved=${stillShelved}`);
  await deviceA.close();

  // ---------- Device B ----------
  console.log('\nDevice B: a different device, its own shelf, then sign in');
  const deviceB = await browser.newContext(); // fresh localStorage + IndexedDB
  const b = await deviceB.newPage();
  b.on('pageerror', (e) => console.log('  [page error]', e.message));
  await boot(b);

  await shelveFigure(b, 3); // a different figure than device A shelved
  await b.waitForTimeout(600);

  await openAccount(b);
  await b.getByLabel('Email address').fill(EMAIL);
  await b.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await b.getByRole('button', { name: 'Sign in' }).click();
  await b.waitForTimeout(2500);

  s = await state();
  check(
    'signing in merged both devices into one account',
    s.shelves.length === 2,
    `shelves=${s.shelves.length}`,
  );
  check(
    'every shelf belongs to the account',
    s.shelves.length > 0 && s.shelves.every((sh) => sh.owner_id === user?.id),
  );
  const allFigures = s.shelves.flatMap((sh) => sh.figure_ids);
  check(
    "device A's figure survived onto device B's account",
    figuresA.every((f) => allFigures.includes(f)),
    JSON.stringify(allFigures),
  );
  check('nothing was dropped in the merge', allFigures.length === 2, JSON.stringify(allFigures));
  check(
    "device A's favorite came back on device B",
    s.favorites.length === 1,
    `favorites=${s.favorites.length}`,
  );

  // The point of the whole feature: device B can now SEE device A's figure.
  await boot(b);
  const onShelfB = await b.getByLabel('Remove from this shelf').count();
  const shownB = await b.getByLabel('Move here from My Shelf').count();
  check(
    "device B displays the account's figures",
    onShelfB + shownB === 2,
    `active=${onShelfB} other-shelf=${shownB}`,
  );
  await deviceB.close();

  // ---------- reinstall ----------
  console.log('\nDevice C: a clean reinstall signs in and gets everything back');
  const deviceC = await browser.newContext();
  const c = await deviceC.newPage();
  c.on('pageerror', (e) => console.log('  [page error]', e.message));
  await boot(c);
  await openAccount(c);
  await c.getByLabel('Email address').fill(EMAIL);
  await c.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await c.getByRole('button', { name: 'Sign in' }).click();
  await c.waitForTimeout(2500);
  await boot(c);

  const onShelfC = await c.getByLabel('Remove from this shelf').count();
  const otherC = await c.getByLabel('Move here from My Shelf').count();
  check(
    'a fresh device gets the whole collection back',
    onShelfC + otherC === 2,
    `active=${onShelfC} other-shelf=${otherC}`,
  );

  s = await state();
  check(
    'and no phantom starter shelf was merged in',
    s.shelves.length === 2,
    `shelves=${s.shelves.length}`,
  );
  await deviceC.close();

  // ---------- wrong password ----------
  console.log('\nA wrong password is rejected');
  const deviceD = await browser.newContext();
  const d = await deviceD.newPage();
  await boot(d);
  await openAccount(d);
  await d.getByLabel('Email address').fill(EMAIL);
  await d.getByLabel('Password', { exact: true }).fill('not-the-password');
  await d.getByRole('button', { name: 'Sign in' }).click();
  await d.waitForTimeout(1500);
  const rejected = await d.getByText("That email and password don't match an account.").count();
  check('a bad password shows a readable error', rejected === 1);
  await deviceD.close();

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
