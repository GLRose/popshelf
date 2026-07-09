-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New query)
-- for your project. It sets up the shared store for user-submitted figure
-- images: a table tracking submissions + their approval status, a private
-- storage bucket for the actual image bytes, and RLS policies.
--
-- No auth/permissions yet - this app has no login, and until release the
-- moderation screen is only ever used by Garrett himself. The moderation
-- policies here (read pending/rejected, flip status, DELETE rows and objects)
-- cover both 'anon' and 'authenticated', which means any client can approve or
-- destroy any image.
-- Before release, this needs real access control on the moderation actions.
--
-- Why both roles, and not just 'anon': a regular user of this app is NOT the
-- 'anon' role. Every install opens a Supabase anonymous session at startup
-- (ensureAnonSession in src/lib/supabase.ts, added for shelves/favorites),
-- and an anonymous session is a real authenticated user - a genuine
-- auth.uid() with the 'authenticated' role, just no email/password. Once that
-- session exists, supabase-js sends its access token in place of the anon key
-- on every rest + storage request (SupabaseClient._getAccessToken returns
-- `session?.access_token ?? supabaseKey`), so policies granted only `to anon`
-- stop matching and reads and moderation all fail. 'anon' is kept alongside
-- 'authenticated' so those still work on installs where anonymous sign-in is
-- disabled or fails and no session is ever created.
--
-- Submitting is the exception: it is 'authenticated' only. A submission is
-- owned (figure_images.owner_id, and the owner's id in the storage path), and
-- there is no owner without an auth.uid(). So an install with no session can
-- still browse approved images, it just can't contribute one.

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

-- Only one approved image per figure at a time. When approving a replacement
-- for a figure that already has one, set the old row to 'rejected' first.
create unique index if not exists figure_images_one_approved_per_figure
  on public.figure_images (figure_id)
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

-- 'authenticated' only, and the row must be owned by the caller: you cannot
-- submit an image you don't own. See the note on submitting at the top.
create policy "owners can submit pending images"
  on public.figure_images for insert
  to authenticated
  with check (status = 'pending' and owner_id = auth.uid());

create policy "anyone can read all figure_images"
  on public.figure_images for select
  to anon, authenticated
  using (true);

create policy "anyone can update figure_images"
  on public.figure_images for update
  to anon, authenticated
  using (true)
  with check (true);

-- Deleting is how a bad approval is actually revoked, and how a submitter
-- withdraws their own still-pending image (withdrawPendingSubmissions in
-- src/lib/remoteFigureImages.ts scopes that to owner_id = auth.uid() client
-- side). This policy does not distinguish the two, for the same reason the
-- update policy above doesn't: there is no moderator identity yet. It grants
-- no more than the update policy already does - a client that can flip any row
-- to 'approved' is not meaningfully held back from deleting it.
create policy "anyone can delete figure_images"
  on public.figure_images for delete
  to anon, authenticated
  using (true);

-- Leftover from an earlier iteration that added admin auth; never released,
-- so safe to drop unconditionally if it was ever applied.
drop function if exists public.is_admin();
drop table if exists public.admins;

-- Private bucket: `public = false` means reads go through the RLS policy
-- below (via signed URLs), not a bare public URL, so pending submissions
-- aren't fetchable just by knowing/guessing their path.
insert into storage.buckets (id, name, public)
values ('figure-images', 'figure-images', false)
on conflict (id) do nothing;

drop policy if exists "anon can upload pending figure images" on storage.objects;
drop policy if exists "anon can read approved figure images" on storage.objects;
drop policy if exists "anon can read all figure images" on storage.objects;
drop policy if exists "admin can read all figure images" on storage.objects;
drop policy if exists "anyone can upload pending figure images" on storage.objects;
drop policy if exists "anyone can read all figure images" on storage.objects;
drop policy if exists "owners can upload figure images" on storage.objects;
drop policy if exists "anyone can delete figure images" on storage.objects;

-- Objects live at `submissions/<owner_id>/<figure_id>/<timestamp>.png`.
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

-- Also covers createSignedUrl(): signing a path requires select on the object,
-- so without this the review queue and the approved-image sync both come back
-- empty rather than erroring.
create policy "anyone can read all figure images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'figure-images');

-- Bucket-wide rather than owner-scoped, because revoking a bad approval means
-- deleting someone else's bytes, and moderators have no identity yet. Same
-- caveat as "anyone can delete figure_images" above.
create policy "anyone can delete figure images"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'figure-images');

-- Atomically re-point the "one approved image per figure" slot: demote the
-- currently-approved row (if any) to 'rejected' FIRST so the partial unique
-- index (figure_images_one_approved_per_figure) has zero 'approved' rows for
-- this figure_id before the new row is promoted - each UPDATE's constraint
-- check runs after that statement completes, so ordering avoids ever
-- violating the index, without needing deferrable constraints (which partial
-- unique indexes can't be anyway).
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

-- Shelves + favorites: the app's collection data, formerly AsyncStorage-only
-- (key 'popshelf-v1'), now the source of truth here. There's still no login
-- for regular users, so each install signs in via Supabase anonymous auth
-- (a real auth.uid(), just no email/password) and owns its rows under that
-- id. This requires enabling "Anonymous Sign-Ins" in the dashboard under
-- Authentication > Sign In / Providers - it can't be turned on from SQL.
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

-- RLS targets `authenticated`, not `anon`: anonymous Supabase sessions are
-- authenticated users with a real auth.uid(), so this correctly scopes each
-- owner to their own rows only.
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
