-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New query)
-- for your project. It sets up the shared, moderated store for user-submitted
-- figure images: a table tracking submissions + their approval status, a
-- private storage bucket for the actual image bytes, and RLS policies that
-- let anyone (anonymous, no auth in this app) submit an image but only ever
-- read back images that have been approved.

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

create policy "anon can submit pending images"
  on public.figure_images for insert
  to anon
  with check (status = 'pending');

create policy "anon can list approved images"
  on public.figure_images for select
  to anon
  using (status = 'approved');

-- Private bucket: `public = false` means reads go through the RLS policy
-- below (via signed URLs), not a bare public URL, so pending submissions
-- aren't fetchable just by knowing/guessing their path.
insert into storage.buckets (id, name, public)
values ('figure-images', 'figure-images', false)
on conflict (id) do nothing;

create policy "anon can upload pending figure images"
  on storage.objects for insert
  to anon
  with check (
    bucket_id = 'figure-images'
    and (storage.foldername(name))[1] = 'pending'
  );

create policy "anon can read approved figure images"
  on storage.objects for select
  to anon
  using (
    bucket_id = 'figure-images'
    and exists (
      select 1 from public.figure_images fi
      where fi.storage_path = storage.objects.name
        and fi.status = 'approved'
    )
  );

-- Moderation: in Table Editor, open figure_images, find a 'pending' row, and
-- change its status to 'approved' (or 'rejected'). That's it - the dashboard
-- connects as the project owner, which bypasses RLS, so no admin UI or extra
-- auth is needed to moderate. Approved images sync to every device on next
-- app launch.
