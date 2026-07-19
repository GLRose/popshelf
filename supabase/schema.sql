-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New query)
-- for your project. It sets up the shared store for user-submitted figure
-- images (a table tracking submissions + their approval status, a public
-- storage bucket for the bytes), the shelves/favorites an account owns, and the
-- RLS policies over both.
--
--
-- DASHBOARD SETTINGS THIS SCHEMA ASSUMES
-- ======================================
-- None of these can be set from SQL. Authentication > Sign In / Providers:
--
--   Email provider .......... ON   The only way in. Sign-up and sign-in are
--                                  email + password; see src/lib/auth.ts.
--   Allow new users to sign up  ON   Otherwise signUp() fails with
--                                  `signup_disabled` and nobody can register.
--   Confirm email ........... OFF  signUp() then returns a session immediately
--                                  and account creation is a single step, with
--                                  no mail sent at all. This is deliberate: the
--                                  free tier's built-in SMTP is rate-limited to
--                                  a handful of messages an hour and only
--                                  delivers to project team members, so a
--                                  confirmation requirement is not something
--                                  real users can actually satisfy. Turning it
--                                  back on requires a custom SMTP provider, and
--                                  needs no code change - the client already
--                                  handles the no-session-yet result (see
--                                  SignUpResult in src/lib/auth.ts).
--   Anonymous sign-ins ...... OFF  No longer used. Sessions belong to accounts.
--
-- Storage > Buckets > figure-images:
--
--   Public bucket ........... ON   Re-running this file does NOT flip it: the
--                                  insert below is `on conflict do nothing`, so
--                                  an existing bucket keeps whatever it has.
--                                  Toggle it in the dashboard, or run the
--                                  `update storage.buckets` alongside it. See
--                                  the bucket section for why it is public.
--
--
-- WHO THE POLICIES BELOW ARE TALKING ABOUT
-- ========================================
-- Two kinds of user, both first-class:
--
--   'anon'          - signed out. Real people, most of the time: the app is
--                     local-first, and shelves live in AsyncStorage until an
--                     account claims them (src/lib/localCollection.ts). They
--                     browse the catalog and see approved images. They own no
--                     rows, because there is no auth.uid() to own them.
--   'authenticated' - signed in with email + password. Owns shelves, favorites,
--                     and image submissions, all keyed by auth.uid().
--
-- supabase-js sends the anon key when signed out and the session's access token
-- when signed in (SupabaseClient._getAccessToken returns
-- `session?.access_token ?? supabaseKey`), which is what selects between the two
-- roles. So anything a *browsing* user must be able to read has to name both -
-- granting only `to authenticated` locks out every signed-out visitor, and
-- granting only `to anon` locks out every signed-in one.
--
-- Submitting an image is 'authenticated' only, on purpose. A submission is owned
-- (figure_images.owner_id, and the owner's id in the storage path), and there is
-- no owner without an auth.uid(). A signed-out user can still pick an image and
-- see it on their own shelf; it just stays on their device instead of reaching
-- the review queue (see useUserImages.add).
--
-- Moderation is still unguarded: the policies here (read pending/rejected, flip
-- status, DELETE rows and objects) cover both roles, which means any client can
-- approve or destroy any *community* image. Until release the moderation screen
-- is only ever used by Garrett. Before release this needs real access control -
-- now that accounts exist, an `admins` table keyed by auth.uid() is finally
-- possible.
--
-- The app's own catalog artwork is deliberately not exposed to that hole. It is
-- a third thing, neither anon nor authenticated: rows and objects written by the
-- service role key, which bypasses RLS entirely and lives only in .env on
-- Garrett's machine (never in the app bundle - see
-- scripts/upload-catalog-images.mjs). No client can create, alter, or delete it.
-- See the `source` column below.

-- 'rejected' is a tombstone, not an archive: it means "this row and its bytes
-- are pending deletion". Nothing reads rejected rows. The client deletes the
-- storage object first and the row second (see deleteImages in
-- src/lib/remoteFigureImages.ts), so an interrupted purge leaves a rejected row
-- pointing at missing bytes - harmless, and swept up by purgeRejected() on the
-- next moderation-screen load. Deleting the row first would strand the bytes in
-- the bucket with nothing left to find them by.
create table if not exists public.figure_images (
  id uuid primary key default gen_random_uuid(),
  figure_id text not null,
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- Added after the table shipped, so it's an alter rather than a column above.
-- Nullable: rows submitted before ownership existed have no owner and can only
-- ever be removed by a moderator. New rows must set it (see the insert policy).
alter table public.figure_images
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

create index if not exists figure_images_owner_id_idx on public.figure_images (owner_id);

-- Where an image came from. Two kinds, and the difference is who can destroy it:
--
--   'community' - a user submitted it and a moderator approved it. Replaceable
--                 and revocable; rejecting one deletes its bytes for good.
--   'catalog'   - the app's own artwork, seeded by scripts/upload-catalog-images.mjs
--                 under the `catalog/` storage prefix, owner-less, born approved.
--
-- Catalog images used to ship inside the app bundle as static require()s
-- (src/data/figureImages.ts, since deleted), which is exactly why they were
-- safe: nothing in the app could delete them. Moving them to Supabase puts them
-- one mis-tap in the moderation screen away from being purged, so the policies
-- below deliberately put them out of the client's reach - no client, moderator
-- or not, can update or delete a catalog row or its bytes. They are changed
-- only by re-running the upload script with the service role key.
--
-- Default 'community' so every pre-existing row (all of which were submissions)
-- is classified correctly without a backfill.
alter table public.figure_images
  add column if not exists source text not null default 'community'
    check (source in ('catalog', 'community'));

-- One approved image per figure *per source*, rather than one per figure. A
-- figure can hold both its catalog art and an approved community image at the
-- same time; the client prefers the community one and falls back to the catalog
-- one (see fetchApprovedImages in src/lib/remoteFigureImages.ts). That fallback
-- is the point: revoking a bad community image reveals the original art
-- underneath instead of a placeholder.
drop index if exists public.figure_images_one_approved_per_figure;
create unique index if not exists figure_images_one_approved_per_figure_source
  on public.figure_images (figure_id, source)
  where status = 'approved';

alter table public.figure_images enable row level security;

-- This script is safe to re-run: every `create policy` is preceded by a
-- `drop policy if exists`, including the names used by earlier iterations of
-- this schema (approved-only reads, the since-removed admin/auth policies,
-- and the anon-only policies these replace), so it converges to the same end
-- state no matter what's already in your project.
drop policy if exists "anon can submit pending images" on public.figure_images;
drop policy if exists "anon can list approved images" on public.figure_images;
drop policy if exists "anon can read all figure_images" on public.figure_images;
drop policy if exists "anon can update figure_images" on public.figure_images;
drop policy if exists "admin can read all figure_images" on public.figure_images;
drop policy if exists "admin can update figure_images" on public.figure_images;
drop policy if exists "anyone can submit pending images" on public.figure_images;
drop policy if exists "anyone can read all figure_images" on public.figure_images;
drop policy if exists "anyone can update figure_images" on public.figure_images;
drop policy if exists "owners can submit pending images" on public.figure_images;
drop policy if exists "anyone can delete figure_images" on public.figure_images;
drop policy if exists "anyone can update community figure_images" on public.figure_images;
drop policy if exists "anyone can delete community figure_images" on public.figure_images;

-- 'authenticated' only, and the row must be owned by the caller: you cannot
-- submit an image you don't own. See the note on submitting at the top.
--
-- `source = 'community'` is what stops a client from minting a catalog row for
-- itself and thereby writing something the other two policies won't let it take
-- back. Catalog rows come from the service role key, which bypasses RLS.
create policy "owners can submit pending images"
  on public.figure_images for insert
  to authenticated
  with check (status = 'pending' and owner_id = auth.uid() and source = 'community');

create policy "anyone can read all figure_images"
  on public.figure_images for select
  to anon, authenticated
  using (true);

-- Community rows only. Catalog art is not moderated - there is no pending
-- catalog row to approve and no reason to revoke one - so the moderation screen
-- has no business updating it, and a bug or a mis-tap there cannot tombstone it.
create policy "anyone can update community figure_images"
  on public.figure_images for update
  to anon, authenticated
  using (source = 'community')
  with check (source = 'community');

-- Deleting is how a bad approval is actually revoked, and how a submitter
-- withdraws their own still-pending image (withdrawPendingSubmissions in
-- src/lib/remoteFigureImages.ts scopes that to owner_id = auth.uid() client
-- side). This policy does not distinguish the two, for the same reason the
-- update policy above doesn't: there is no moderator identity yet. It grants
-- no more than the update policy already does - a client that can flip any row
-- to 'approved' is not meaningfully held back from deleting it.
--
-- Community rows only, again. Combined with the update policy, a catalog row
-- cannot be tombstoned and cannot be deleted, so purgeRejected() can never
-- reach one no matter what it selects.
create policy "anyone can delete community figure_images"
  on public.figure_images for delete
  to anon, authenticated
  using (source = 'community');

-- Leftover from an earlier iteration that added admin auth; never released,
-- so safe to drop unconditionally if it was ever applied.
drop function if exists public.is_admin();
drop table if exists public.admins;

-- Public bucket: reads are a plain GET of a stable, CDN-cacheable URL.
--
-- It used to be private, on the theory that signed URLs kept pending
-- submissions from being fetched by anyone who guessed their path. That theory
-- never held: the select policy below is bucket-wide and granted to `anon`, so
-- any client could already sign a URL for any object in it, submissions
-- included. Privacy was costing a round trip per object and buying nothing.
--
-- What it cost was the whole first-paint experience. The app bundles no
-- artwork, so every figure is a placeholder until its bytes arrive, and a
-- private bucket meant the client had to POST for a signed URL per figure -
-- hundreds of them - before it could request a single image. Public URLs are
-- derived from the path with no round trip at all, they survive in the browser
-- and CDN cache across visits, and they can carry Supabase's image transforms.
--
-- What actually protects submissions is the path: an unguessable
-- `submissions/<owner_id>/<figure_id>/<timestamp>.png`. If that is ever not
-- enough, the fix is a second private bucket for submissions, not re-privatising
-- the catalog art that every visitor must download to use the app.
insert into storage.buckets (id, name, public)
values ('figure-images', 'figure-images', true)
on conflict (id) do nothing;

-- The insert above no-ops on an existing bucket, so state the flip separately:
-- this is what makes re-running the file fix a bucket created as private.
update storage.buckets set public = true where id = 'figure-images';

drop policy if exists "anon can upload pending figure images" on storage.objects;
drop policy if exists "anon can read approved figure images" on storage.objects;
drop policy if exists "anon can read all figure images" on storage.objects;
drop policy if exists "admin can read all figure images" on storage.objects;
drop policy if exists "anyone can upload pending figure images" on storage.objects;
drop policy if exists "anyone can read all figure images" on storage.objects;
drop policy if exists "owners can upload figure images" on storage.objects;
drop policy if exists "anyone can delete figure images" on storage.objects;
drop policy if exists "anyone can delete submitted figure images" on storage.objects;

-- Catalog art lives at `catalog/<figure_id>.png`, written only by the service
-- role key (scripts/upload-catalog-images.mjs), which bypasses these policies.
-- No client-facing insert policy names that prefix, so no client can write
-- there; the delete policy below explicitly excludes it, so no client can
-- remove what's there. The bucket-wide select policy still covers it, which is
-- what lets every client sign a URL for it and display it.
--
-- Submissions live at `submissions/<owner_id>/<figure_id>/<timestamp>.png`.
--
-- The old layout was `pending/<figure_id>/<timestamp>.png`, which became a lie
-- the moment an image was approved: approving flips a row, it never relocates
-- the object. 'submissions' stays true for the object's whole life, and the
-- owner id in the path is what lets this policy scope writes to the owner at
-- the storage layer rather than trusting the client to pick an honest path.
--
-- Objects still at the old `pending/` prefix keep working: the select and
-- delete policies below are bucket-wide, and existing rows keep the
-- storage_path they recorded. Only new uploads use the new prefix.
create policy "owners can upload figure images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'figure-images'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Redundant with the bucket being public, and kept anyway: it is what a public
-- bucket grants, said out loud, so flipping the bucket back to private degrades
-- reads to signed URLs instead of breaking them outright.
create policy "anyone can read all figure images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'figure-images');

-- Not owner-scoped, because revoking a bad approval means deleting someone
-- else's bytes, and moderators have no identity yet. Same caveat as "anyone can
-- update community figure_images" above.
--
-- Everything except the catalog, though. This is the storage-layer half of the
-- protection the figure_images policies give the rows: without it, a client that
-- knows a catalog path could delete the bytes out from under a row it isn't
-- allowed to touch, leaving an approved row pointing at nothing.
create policy "anyone can delete submitted figure images"
  on storage.objects for delete
  to anon, authenticated
  using (
    bucket_id = 'figure-images'
    and (storage.foldername(name))[1] <> 'catalog'
  );

-- Atomically re-point the "one approved image per figure per source" slot:
-- demote the currently-approved row (if any) to 'rejected' FIRST so the partial
-- unique index (figure_images_one_approved_per_figure_source) has zero
-- 'approved' rows for this (figure_id, source) before the new row is promoted -
-- each UPDATE's constraint check runs after that statement completes, so
-- ordering avoids ever violating the index, without needing deferrable
-- constraints (which partial unique indexes can't be anyway).
--
-- Scoped to the target's own source, which in practice always means: approving
-- a community image displaces the community image it replaces, and leaves the
-- figure's catalog art alone. Without the source filter this would try to
-- tombstone the catalog row too - and, because the update policy above refuses
-- it, would silently demote nothing while the client believed it had.
create or replace function public.approve_figure_image(image_id uuid)
returns public.figure_images
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target public.figure_images;
  result public.figure_images;
begin
  select * into target from public.figure_images where id = image_id for update;
  if not found then
    raise exception 'figure_images row % not found', image_id;
  end if;
  -- Serializes concurrent approve calls for the same figure_id (belt and
  -- suspenders for a single-moderator app; cheap, released at transaction end).
  perform pg_advisory_xact_lock(hashtext(target.figure_id));

  update public.figure_images
    set status = 'rejected'
    where figure_id = target.figure_id
      and source = target.source
      and status = 'approved'
      and id <> target.id;

  update public.figure_images
    set status = 'approved'
    where id = target.id
    returning * into result;

  return result;
end;
$$;

-- `security invoker`, so the UPDATEs above still run under the caller's RLS -
-- the "anyone can update figure_images" policy is what lets them through.
-- EXECUTE must cover 'authenticated' too: a moderator on a device that has an
-- anonymous session calls this as 'authenticated', and an anon-only grant
-- fails the call outright with `permission denied for function` (42501),
-- independently of RLS.
revoke all on function public.approve_figure_image(uuid) from public;
grant execute on function public.approve_figure_image(uuid) to anon, authenticated;

-- Moderation: open the app, tap the "Browse" title 5 times to reach the
-- hidden moderation screen. Approve/reject from the pending queue, or revoke
-- an image from the approved list. Rejecting and revoking are the same
-- operation - both tombstone the row, then purge its bytes and the row itself.
-- Because approve_figure_image demotes the image it replaces, approving a
-- replacement purges the one it displaced too.
-- See src/app/admin.tsx and src/lib/adminModeration.ts.

-- Shelves + favorites: the app's collection data. The on-device copy (the
-- AsyncStorage key 'popshelf-v1', src/lib/localCollection.ts) stays the source
-- of truth for the device that made it, so the app works signed out and offline;
-- these tables are what make a collection outlive the device it was built on.
--
-- Rows appear here only once a user signs in. That sign-in unions the device's
-- shelves with whatever the account already holds, in both directions, and
-- leaves both sides holding the result - see useCollection.adoptRemoteCollection
-- and src/lib/mergeCollection.ts. Nothing is dropped in a merge, which is what
-- lets a user build a collection before ever creating an account and keep it.
-- See src/store/useCollection.ts and src/lib/remoteCollection.ts.

create table if not exists public.shelves (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  background text not null,
  texture text not null,
  figure_ids text[] not null default '{}',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shelves_owner_id_idx on public.shelves (owner_id);

-- Mirrors the "one approved image per figure" partial index above: at most
-- one active shelf per owner. Callers must clear the old active shelf
-- before setting a new one (see setActiveShelfRemote in remoteCollection.ts)
-- since a partial unique index isn't deferrable.
create unique index if not exists shelves_one_active_per_owner
  on public.shelves (owner_id) where is_active;

create table if not exists public.favorites (
  owner_id uuid not null references auth.users(id) on delete cascade,
  figure_id text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, figure_id)
);

create index if not exists favorites_owner_id_idx on public.favorites (owner_id);

alter table public.shelves enable row level security;
alter table public.favorites enable row level security;

-- This script is safe to re-run, same as the figure_images section above.
drop policy if exists "owner can manage own shelves" on public.shelves;
drop policy if exists "owner can manage own favorites" on public.favorites;

-- 'authenticated' only, and scoped to the caller's own rows. A signed-out user
-- has no auth.uid() and so cannot own, read, or write a shelf here at all; their
-- collection lives on their device until they sign in. This is the one place
-- where NOT naming 'anon' is the whole point.
create policy "owner can manage own shelves"
  on public.shelves for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owner can manage own favorites"
  on public.favorites for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());


-- CLEANING UP THE ANONYMOUS USERS THIS SCHEMA USED TO CREATE
-- =========================================================
-- Earlier builds signed every install in anonymously, so auth.users holds a row
-- per install, each owning that device's shelves and favorites. Those users are
-- now unreachable: the app no longer creates them, and it signs out of any it
-- finds still persisted on a device (retireAnonymousSession in src/lib/auth.ts).
-- Nobody can ever log back into one, so their shelves are dead rows.
--
-- No data is lost by removing them. The shelves they own are a *mirror* of what
-- is still sitting in AsyncStorage on the device that made them; that device
-- keeps displaying its collection while signed out, and folds it into a real
-- account on the first sign-in.
--
-- This is left commented out because it is destructive and irreversible, and
-- because it is only correct once the new build is the one your users are
-- running. Run it in the SQL editor when you are ready.
--
-- The two statements must run in this order. figure_images.owner_id is
-- `on delete cascade`, so deleting these users would take their *approved*
-- community images with them - images that belong to everyone now and are
-- cached on other people's devices. Detaching them first (owner_id = null, the
-- same state as rows submitted before ownership existed) means the cascade only
-- reaches the pending submissions of users who can no longer be reviewed anyway.
--
--   update public.figure_images
--     set owner_id = null
--     where status = 'approved'
--       and owner_id in (select id from auth.users where is_anonymous);
--
--   delete from auth.users where is_anonymous;
--
-- Shelves and favorites cascade away with the users. To see what would go first:
--
--   select count(*) from auth.users where is_anonymous;


-- REPOINTING THE 68 RETIRED HIRONO FIGURE IDS
-- ===========================================
-- The hirono catalog carried 68 duplicated figures. The scraper's first run
-- over an IP that had already been curated by hand could not tell that the row
-- sitting on its computed id WAS the figure it was about to write, so it forked
-- a '-2' twin beside each one. The twins have been merged back into the
-- hand-curated ids and deleted from src/data/figures.json.
--
-- Nothing here has referential integrity: shelves.figure_ids and
-- favorites.figure_id are bare text with no foreign key, and the app silently
-- drops an id it cannot resolve (shelf.tsx / favorites.tsx both filter on
-- getFigure). So a figure saved under a retired id does not error, it just
-- quietly disappears from the shelf while isOwned() still reports it as owned.
--
-- Unlike the anonymous-user cleanup above, this one SHOULD be run: paste it
-- into the SQL editor once the build carrying the v3 -> v4 local migration
-- (src/lib/collection/figureIdAliases.ts) is deployed. It is idempotent - no
-- id matching the pattern survives it - so re-running is a no-op, and it is
-- left commented out only to match this file's "nothing here executes" rule.
--
-- The pattern is exact rather than a 68-row VALUES list: every retired id was
-- '<surviving id>-2', and no hirono id ending in -2 exists in the catalog any
-- more, so anything still matching it in user data is by definition retired.
--
-- Shelves. Dedupe via group by, because a user who saved both twins would
-- otherwise end up holding the same figure twice on one shelf; min(ord) keeps
-- each survivor at the position of its first occurrence, so shelf order holds.
--
--   update public.shelves s
--     set figure_ids = array(
--       select fid from (
--         select regexp_replace(f, '^(hirono-.*)-2$', '\1') as fid, min(ord) as ord
--         from unnest(s.figure_ids) with ordinality as t(f, ord)
--         group by 1
--       ) x order by x.ord
--     )
--     where exists (select 1 from unnest(s.figure_ids) f where f ~ '^hirono-.*-2$');
--
-- Favorites, in this order. The primary key is (owner_id, figure_id), so a
-- plain update collides for anyone who favourited both twins; drop the retired
-- row where the survivor is already present, then rename what is left.
--
--   delete from public.favorites f
--     where f.figure_id ~ '^hirono-.*-2$'
--       and exists (
--         select 1 from public.favorites g
--         where g.owner_id = f.owner_id
--           and g.figure_id = regexp_replace(f.figure_id, '^(hirono-.*)-2$', '\1')
--       );
--
--   update public.favorites
--     set figure_id = regexp_replace(figure_id, '^(hirono-.*)-2$', '\1')
--     where figure_id ~ '^hirono-.*-2$';
--
-- To see what is affected first:
--
--   select count(*) from public.favorites where figure_id ~ '^hirono-.*-2$';
--   select count(*) from public.shelves s
--     where exists (select 1 from unnest(s.figure_ids) f where f ~ '^hirono-.*-2$');
