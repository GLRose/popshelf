/**
 * The upgrade path: a device running the OLD build has an anonymous Supabase
 * session persisted alongside its shelves. It now loads the NEW build, which no
 * longer has anonymous auth at all.
 *
 * What must not happen: the user is shown as signed in to an account with no
 * email, keeps writing rows as an identity nobody can ever log back into, or -
 * worst - has their shelves wiped by the transition.
 */
import { chromium } from 'playwright';

const APP = 'http://localhost:8080';
const API = 'http://localhost:54321';

const state = () => fetch(`${API}/__state`).then((r) => r.json());

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` -> ${detail}` : ''}`);
  if (!ok) failures++;
}

async function boot(page, path = '/') {
  await page.goto(APP + path);
  await page.getByText('Browse', { exact: true }).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
}

const OLD_SHELF = {
  id: 'shelf_legacy_0001',
  name: 'My Shelf',
  color: '#6B4A2F',
  background: 'warm-wall',
  texture: 'smooth',
  figureIds: ['skullpanda-the-warmth-the-raining-day'],
};

async function run() {
  await fetch(`${API}/__reset`);
  const anonSession = await fetch(`${API}/__seed-anon`).then((r) => r.json());

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [page error]', e.message));

  // Plant exactly what the old build left on the device: its collection, and an
  // anonymous session that is still perfectly valid.
  await ctx.addInitScript(
    ([session, shelf]) => {
      localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session));
      localStorage.setItem(
        'popshelf-v1',
        JSON.stringify({
          state: { shelves: [shelf], activeShelfId: shelf.id, favorites: ['skullpanda-the-warmth-enjoy-oneself'] },
          version: 3,
        }),
      );
    },
    [anonSession, OLD_SHELF],
  );

  console.log('\nUpgrading a device that still holds an anonymous session');
  await boot(page);

  const shelved = await page.getByLabel('Remove from this shelf').count();
  check('the old shelf survived the upgrade', shelved === 1, `figures on shelf=${shelved}`);

  let s = await state();
  const wroteAsAnon = s.shelves.length > 0 || s.favorites.length > 0;
  check('nothing was written as the anonymous user', !wroteAsAnon, `shelves=${s.shelves.length}`);

  // The account screen must offer a way IN, not claim to already be signed in.
  await page.goto(`${APP}/account`);
  await page.waitForTimeout(1500);
  const emailField = await page.getByLabel('Email address').count();
  check('the app treats the device as signed out', emailField === 1);

  const token = await page.evaluate(() => localStorage.getItem('sb-localhost-auth-token'));
  const retired = !token || !JSON.parse(token)?.access_token;
  check('the stale anonymous session was cleared', retired, token ? 'still present' : 'gone');

  console.log('\nThe upgraded user creates a real account');
  await page.getByRole('button', { name: "I don't have an account yet" }).click();
  await page.getByLabel('Email address').fill('upgrader@popshelf.test');
  await page.getByLabel('Password', { exact: true }).fill('shelf-me-forever-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForTimeout(2500);

  s = await state();
  const user = s.users.find((u) => u.email === 'upgrader@popshelf.test');
  check('their long-standing shelf moved into the account', s.shelves.length === 1, `shelves=${s.shelves.length}`);
  check(
    'with the figure they had all along',
    s.shelves[0]?.figure_ids?.includes(OLD_SHELF.figureIds[0]),
    JSON.stringify(s.shelves[0]?.figure_ids),
  );
  check('owned by the new account', s.shelves[0]?.owner_id === user?.id);
  check('and their favorite came too', s.favorites.length === 1, `favorites=${s.favorites.length}`);

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
