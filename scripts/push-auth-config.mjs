// Pushes this repo's Supabase auth URL configuration to the hosted project: the
// Site URL, and the redirect allow list. Run: npm run auth:config [-- --dry-run]
//
// Why this exists. Auth config is dashboard state, invisible to schema.sql and
// unversioned, and getting it wrong is silent. A project ships with Site URL set
// to http://localhost:3000, so every verification link Supabase mails points at a
// dead port on the user's own machine. Worse, /auth/v1/verify consumes the token
// *before* it redirects, so an email-change link appears to work (it mutates the
// user we are already signed in as) while a magic-link sign-in silently does not
// (its session is delivered to the redirect, and thrown away). That asymmetry
// reads as flakiness. Nothing in the client can detect or fix any of it.
//
// supabase/config.toml cannot do this job: it configures a local dev stack only,
// and never reaches a hosted project. The Management API can.
//
// Not pushed here, because a free-tier project on Supabase's built-in email
// sender is forbidden from editing email templates. Those stay stock, which is
// exactly why src/lib/auth.ts is a link flow and not a code flow: the stock
// templates render {{ .ConfirmationURL }} and never {{ .Token }}.
//
// Needs a Supabase personal access token (https://supabase.com/dashboard/account/tokens):
//   SUPABASE_ACCESS_TOKEN=sbp_... npm run auth:config
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

/** The deployed app. Site URL is where Supabase sends anything it cannot route itself. */
const SITE_URL = process.env.POPSHELF_SITE_URL ?? 'https://popshelf-one.vercel.app';

/**
 * Anything not on this list is rejected and silently swapped for SITE_URL, so a
 * missing entry looks exactly like a typo'd link rather than a config error.
 *
 * Both the bare origin and its /** subtree are listed: authRedirectTo() sends
 * window.location.origin, which has no trailing path, and a subtree pattern is
 * not documented to cover its own root. Expo serves web dev on 8081, and
 * popshelf:// is the native scheme from app.json, used by Linking.createURL().
 */
const REDIRECT_URLS = [
  SITE_URL,
  `${SITE_URL}/**`,
  'http://localhost:8081',
  'http://localhost:8081/**',
  'popshelf://**',
];

function die(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/** The token is a credential, so it is never accepted on the command line. */
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
if (!accessToken) {
  die(
    'SUPABASE_ACCESS_TOKEN is not set. Create one at\n' +
      '  https://supabase.com/dashboard/account/tokens\n' +
      'then run: SUPABASE_ACCESS_TOKEN=sbp_... npm run auth:config',
  );
}

/** Read the project ref out of .env rather than duplicating it here. */
function projectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? readEnvFile().EXPO_PUBLIC_SUPABASE_URL;
  if (!url) die('No project. Set SUPABASE_PROJECT_REF, or EXPO_PUBLIC_SUPABASE_URL in .env');

  const ref = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  if (!ref) die(`Could not read a project ref out of EXPO_PUBLIC_SUPABASE_URL: ${url}`);
  return ref;
}

function readEnvFile() {
  const path = resolve(ROOT, '.env');
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^["']|["']$/g, '')];
      }),
  );
}

const ref = projectRef();
const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

async function call(method, body) {
  const res = await fetch(api, { method, headers, body: body && JSON.stringify(body) });
  if (!res.ok) die(`${method} ${api}\n  ${res.status} ${res.statusText}\n  ${await res.text()}`);
  return res.json();
}

const payload = { site_url: SITE_URL, uri_allow_list: REDIRECT_URLS.join(',') };

console.log(`\n  project     ${ref}`);
console.log(`  site_url    ${payload.site_url}`);
for (const url of REDIRECT_URLS) console.log(`  redirect    ${url}`);

if (DRY_RUN) {
  console.log('\n  --dry-run, nothing pushed.\n');
  process.exit(0);
}

const before = await call('GET');
await call('PATCH', payload);
const after = await call('GET');

/** Read the config back rather than trusting the 200: this is the whole point of the script. */
const problems = [];
if (after.site_url !== SITE_URL) problems.push(`site_url is still ${after.site_url}`);
for (const url of REDIRECT_URLS) {
  if (!(after.uri_allow_list ?? '').split(',').includes(url)) problems.push(`${url} is not allowed`);
}
if (problems.length) {
  die(`Pushed, but the project did not come back as expected:\n  - ${problems.join('\n  - ')}`);
}

console.log(`\n  pushed. site_url ${before.site_url} -> ${after.site_url}`);
console.log(`          ${REDIRECT_URLS.length} redirect URLs allowed`);

/**
 * The built-in sender is not merely rate limited, it refuses to deliver to any
 * address outside the project's organization. Sign-in therefore works for the
 * team and silently fails for real users, which is invisible in testing because
 * the person testing is always on the team.
 */
if (!after.smtp_host) {
  console.log(
    '\n  WARNING: no custom SMTP configured.\n' +
      `  Supabase's built-in sender is capped at ${after.rate_limit_email_sent ?? 2} emails per hour, and\n` +
      "  delivers ONLY to members of this project's organization. Everyone else gets\n" +
      '  "Email address not authorized" and cannot sign in at all.\n' +
      '  Set SMTP under Authentication > Emails before release.\n',
  );
}
