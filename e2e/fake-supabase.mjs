/**
 * A local stand-in for the slice of Supabase this app talks to: GoTrue's
 * email+password endpoints, and PostgREST over `shelves` / `favorites` /
 * `figure_images`.
 *
 * Enforces owner scoping the way RLS does - every read and write is filtered to
 * the bearer token's user - because that is the whole thing under test: shelves
 * must follow the *account*, not the device.
 *
 * Behaves as the project is meant to be configured: "Confirm email" OFF, so
 * signup returns a session immediately.
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.argv[2] ?? 54321);

const users = new Map(); // email -> { id, email, password }
const sessions = new Map(); // access_token -> user id
let shelves = []; // { id, owner_id, name, color, background, texture, figure_ids, is_active, created_at }
let favorites = []; // { owner_id, figure_id }
let figureImages = []; // { id, figure_id, storage_path, source, status, owner_id }
const calls = [];

/**
 * A 1x1 transparent PNG. Standing in for a cutout: the test cares about which
 * URL the app asks for and how many requests it takes to get there, not about
 * the pixels.
 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const sendPng = (res) => {
  res.writeHead(200, {
    'content-type': 'image/png',
    'cache-control': 'public, max-age=3600',
    'access-control-allow-origin': '*',
  });
  res.end(PNG);
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/**
 * supabase-js decodes the access token to check expiry, so this has to be a
 * structurally real JWT. The signature is never verified client-side.
 */
function mintSession(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access_token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: user.id,
    role: 'authenticated',
    aud: 'authenticated',
    email: user.email,
    exp,
    iat: Math.floor(Date.now() / 1000),
    is_anonymous: false,
  })}.sig`;
  sessions.set(access_token, user.id);
  return {
    access_token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: `refresh-${randomUUID()}`,
    user: publicUser(user),
  };
}

const publicUser = (u) => ({
  id: u.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: u.email,
  is_anonymous: false,
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: 'email' },
  user_metadata: {},
  identities: [{ id: u.id, user_id: u.id, provider: 'email' }],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

/** The signed-in user's id, or null. This is the stub's stand-in for auth.uid(). */
function uid(req) {
  const auth = req.headers.authorization ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  return sessions.get(token) ?? null;
}

/** Parses PostgREST's `?col=eq.val` / `?col=neq.val` into a predicate. */
function filterFrom(url) {
  const preds = [];
  for (const [key, raw] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) continue;
    const [op, ...rest] = raw.split('.');
    const val = rest.join('.');
    if (op === 'eq') preds.push((r) => String(r[key]) === val);
    else if (op === 'neq') preds.push((r) => String(r[key]) !== val);
  }
  return (row) => preds.every((p) => p(row));
}

const send = (res, code, body) => {
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-expose-headers': '*',
    'access-control-allow-methods': '*',
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

const authError = (res, status, error_code, msg) =>
  send(res, status, { code: status, error_code, msg, message: msg, error: error_code });

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  const body = raw ? JSON.parse(raw) : undefined;
  const path = url.pathname;
  calls.push({ method: req.method, path, query: url.search });

  // --- introspection for the test harness ---
  if (path === '/__state') {
    return send(res, 200, {
      users: [...users.values()].map((u) => ({ id: u.id, email: u.email })),
      shelves,
      favorites,
      figureImages,
      calls,
    });
  }

  // Publishes catalog artwork for the given figure ids, as
  // scripts/upload-catalog-images.mjs does with the service role key: owner-less
  // and born approved.
  if (path === '/__seed-images') {
    const ids = url.searchParams.get('figures')?.split(',').filter(Boolean) ?? [];
    figureImages = ids.map((figureId) => ({
      id: randomUUID(),
      figure_id: figureId,
      storage_path: `catalog/${figureId}.png`,
      source: 'catalog',
      status: 'approved',
      owner_id: null,
    }));
    return send(res, 200, { seeded: figureImages.length });
  }
  // Mints an anonymous session like the previous build's signInAnonymously()
  // did, so the upgrade path can be tested: a device that still has one.
  if (path === '/__seed-anon') {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const id = randomUUID();
    const access_token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
      sub: id,
      role: 'authenticated',
      aud: 'authenticated',
      exp,
      is_anonymous: true,
    })}.sig`;
    sessions.set(access_token, id);
    const user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      is_anonymous: true,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    };
    return send(res, 200, {
      access_token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: exp,
      refresh_token: `refresh-${randomUUID()}`,
      user,
    });
  }

  if (path === '/__reset') {
    shelves = [];
    favorites = [];
    figureImages = [];
    users.clear();
    sessions.clear();
    calls.length = 0;
    return send(res, 200, { ok: true });
  }

  // --- GoTrue ---
  if (path === '/auth/v1/signup') {
    const email = String(body?.email ?? '').toLowerCase();
    const password = String(body?.password ?? '');
    if (users.has(email)) {
      return authError(res, 422, 'user_already_exists', 'User already registered');
    }
    if (password.length < 6) {
      return authError(res, 422, 'weak_password', 'Password should be at least 6 characters');
    }
    const user = { id: randomUUID(), email, password };
    users.set(email, user);
    return send(res, 200, mintSession(user)); // Confirm email OFF -> instant session
  }

  if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
    const email = String(body?.email ?? '').toLowerCase();
    const user = users.get(email);
    if (!user || user.password !== body?.password) {
      return authError(res, 400, 'invalid_credentials', 'Invalid login credentials');
    }
    return send(res, 200, mintSession(user));
  }

  if (path === '/auth/v1/logout') {
    const auth = req.headers.authorization ?? '';
    sessions.delete(auth.replace(/^Bearer\s+/i, ''));
    return send(res, 204);
  }

  if (path === '/auth/v1/user') {
    const id = uid(req);
    const user = [...users.values()].find((u) => u.id === id);
    if (!user) return authError(res, 401, 'no_session', 'Not authenticated');
    return send(res, 200, publicUser(user));
  }

  // --- Storage ---
  //
  // The bucket is public, so reads are a plain GET of a stable path with no
  // token and no round trip to obtain one. The signing endpoint below is kept
  // deliberately: it is what the old client used, and the spec asserts nobody
  // calls it any more.
  if (path.startsWith('/storage/v1/object/public/figure-images/')) {
    return sendPng(res);
  }

  // POST /storage/v1/object/sign/<bucket>/<path> -> a URL good for one object.
  // One of these per figure was the cold-start bottleneck this suite guards.
  if (req.method === 'POST' && path.startsWith('/storage/v1/object/sign/figure-images/')) {
    const objectPath = path.slice('/storage/v1/object/sign/figure-images/'.length);
    return send(res, 200, {
      signedURL: `/object/sign/figure-images/${objectPath}?token=stub-token`,
    });
  }

  if (path.startsWith('/storage/v1/object/sign/figure-images/')) {
    return sendPng(res);
  }

  // --- PostgREST ---
  const table = path.startsWith('/rest/v1/') ? path.slice('/rest/v1/'.length) : null;

  // Catalog and approved community art is world-readable: schema.sql grants
  // select to anon and authenticated alike, so this is deliberately not
  // owner-scoped the way shelves are.
  if (table === 'figure_images') {
    if (req.method === 'GET') return send(res, 200, figureImages.filter(filterFrom(url)));
    return send(res, 200, []); // submissions and moderation are out of scope here
  }

  if (table === 'shelves' || table === 'favorites') {
    const owner = uid(req);
    const rows = table === 'shelves' ? shelves : favorites;
    // RLS: `to authenticated ... using (owner_id = auth.uid())`. Signed out sees
    // and writes nothing, which is exactly what the client relies on.
    const mine = (r) => owner !== null && r.owner_id === owner;
    const match = filterFrom(url);

    if (req.method === 'GET') {
      return send(res, 200, rows.filter((r) => mine(r) && match(r)));
    }

    if (req.method === 'POST') {
      // Upsert (Prefer: resolution=merge-duplicates).
      if (!owner) return send(res, 401, { message: 'RLS: no session' });
      const incoming = Array.isArray(body) ? body : [body];
      for (const row of incoming) {
        if (row.owner_id !== owner) return send(res, 403, { message: 'RLS: owner_id mismatch' });
        const key =
          table === 'shelves'
            ? (r) => r.id === row.id
            : (r) => r.owner_id === row.owner_id && r.figure_id === row.figure_id;
        const at = rows.findIndex(key);
        if (at >= 0) rows[at] = { ...rows[at], ...row };
        else rows.push({ created_at: new Date().toISOString(), ...row });
      }
      return send(res, 201, []);
    }

    if (req.method === 'PATCH') {
      if (!owner) return send(res, 401, { message: 'RLS: no session' });
      for (const r of rows) if (mine(r) && match(r)) Object.assign(r, body);
      return send(res, 200, []);
    }

    if (req.method === 'DELETE') {
      if (!owner) return send(res, 401, { message: 'RLS: no session' });
      const keep = rows.filter((r) => !(mine(r) && match(r)));
      if (table === 'shelves') shelves = keep;
      else favorites = keep;
      return send(res, 200, []);
    }
  }

  return send(res, 404, { message: `unhandled ${req.method} ${path}` });
}).listen(PORT, () => console.log(`fake supabase on http://localhost:${PORT}`));
