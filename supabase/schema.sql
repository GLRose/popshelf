-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New query)
-- for your project. It sets up the shared store for user-submitted figure
-- images: a table tracking submissions + their approval status, a private
-- storage bucket for the actual image bytes, and RLS policies.
--
-- No auth/permissions yet - this app has no login, and until release the
-- moderation screen is only ever used by Garrett himself. Every policy here
-- is 'anon', including moderation (read pending/rejected + flip status).
-- Before release, this needs real access control on the moderation actions.

create table if not exists public.figure_images (
  id uuid primary key default gen_random_uuid(),
  figure_id text not null,
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- Only one approved image per figure at a time. When approving a replacement
-- for a figure that already has one, set the old row to 'rejected' first.
create unique index if not exists figure_images_one_approved_per_figure
  on public.figure_images (figure_id)
  where status = 'approved';

alter table public.figure_images enable row level security;

-- This script is safe to re-run: every `create policy` is preceded by a
-- `drop policy if exists`, including the names used by earlier iterations of
-- this schema (approved-only reads, and the since-removed admin/auth
-- policies), so it converges to the same end state no matter what's already
-- in your project.
drop policy if exists "anon can submit pending images" on public.figure_images;
drop policy if exists "anon can list approved images" on public.figure_images;
drop policy if exists "anon can read all figure_images" on public.figure_images;
drop policy if exists "anon can update figure_images" on public.figure_images;
drop policy if exists "admin can read all figure_images" on public.figure_images;
drop policy if exists "admin can update figure_images" on public.figure_images;

create policy "anon can submit pending images"
  on public.figure_images for insert
  to anon
  with check (status = 'pending');

create policy "anon can read all figure_images"
  on public.figure_images for select
  to anon
  using (true);

create policy "anon can update figure_images"
  on public.figure_images for update
  to anon
  using (true)
  with check (true);

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

create policy "anon can upload pending figure images"
  on storage.objects for insert
  to anon
  with check (
    bucket_id = 'figure-images'
    and (storage.foldername(name))[1] = 'pending'
  );

create policy "anon can read all figure images"
  on storage.objects for select
  to anon
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

revoke all on function public.approve_figure_image(uuid) from public;
grant execute on function public.approve_figure_image(uuid) to anon;

-- Moderation: open the app, tap the "Browse" title 5 times to reach the
-- hidden moderation screen, and approve/reject from the pending queue.
-- See src/app/admin.tsx and src/lib/adminModeration.ts.
