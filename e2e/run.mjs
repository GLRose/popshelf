/**
 * `npm run test:e2e`
 *
 * Builds the real web bundle, points it at a local stand-in for Supabase, and
 * drives it in a browser. Needs no Supabase project, no network, and no
 * credentials - so the sign-up / sign-in / merge behaviour can be checked on
 * every change instead of only in production.
 *
 * See e2e/fake-supabase.mjs for what is being stood in for, and why it enforces
 * owner scoping rather than just recording calls.
 */
import { spawn } from 'node:child_process';
import { rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API_PORT = 54321;
const APP_PORT = 8080;

const children = [];

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
  children.push(child);
  return child;
}

const exited = (child) =>
  new Promise((resolve, reject) => {
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    child.on('error', reject);
  });

/** Polls until the port answers, rather than sleeping and hoping. */
async function waitFor(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(url);
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${url}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

async function main() {
  const out = await mkdtemp(join(tmpdir(), 'popshelf-e2e-'));
  try {
    console.log('Building the web bundle against the local Supabase stand-in...');
    // --clear is required: Metro will otherwise reuse a bundle built with the
    // real EXPO_PUBLIC_SUPABASE_URL baked in, and the test would silently run
    // against the production project.
    await exited(
      run('npx', ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', out], {
        env: {
          ...process.env,
          EXPO_PUBLIC_SUPABASE_URL: `http://localhost:${API_PORT}`,
          EXPO_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
        },
        stdio: 'ignore',
      }),
    );

    run('node', ['e2e/fake-supabase.mjs', String(API_PORT)], { stdio: 'ignore' });
    run('node', ['e2e/serve.mjs', out, String(APP_PORT)], { stdio: 'ignore' });
    await waitFor(`http://localhost:${API_PORT}/__state`);
    await waitFor(`http://localhost:${APP_PORT}/`);

    await exited(run('node', ['e2e/auth.spec.mjs']));
    await exited(run('node', ['e2e/upgrade.spec.mjs']));

    console.log('\ne2e: all specs passed.');
  } finally {
    shutdown();
    await rm(out, { recursive: true, force: true });
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(130);
});

main().catch((e) => {
  console.error(`\ne2e: ${e.message}`);
  shutdown();
  process.exit(1);
});
