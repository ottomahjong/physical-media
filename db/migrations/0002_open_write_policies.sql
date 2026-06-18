-- Migration 0002 — open write access (front-door auth moved into the app)
-- ---------------------------------------------------------------------------
-- We replaced Supabase magic-link auth with a simple email+password gate in
-- the app, so the database no longer receives an authenticated JWT. The old
-- RLS policies required the owner's email in the JWT, which would now block
-- ALL writes and image uploads. This migration replaces those with permissive
-- policies so the app can read/write with the public anon key.
--
-- SECURITY NOTE: this makes the listings table and the thumbnails bucket
-- writable by anyone who has the public anon key (it ships in the site's JS).
-- That's an accepted trade-off for this personal project — the in-app login is
-- a light barrier, not real security.
--
-- Idempotent: safe to run more than once.

-- Listings ------------------------------------------------------------------
drop policy if exists "owner insert"  on public.listings;
drop policy if exists "owner update"  on public.listings;
drop policy if exists "owner delete"  on public.listings;
drop policy if exists "public insert" on public.listings;
drop policy if exists "public update" on public.listings;
drop policy if exists "public delete" on public.listings;

create policy "public insert" on public.listings for insert with check (true);
create policy "public update" on public.listings for update using (true);
create policy "public delete" on public.listings for delete using (true);

-- Thumbnails storage --------------------------------------------------------
drop policy if exists "thumbnails owner insert"  on storage.objects;
drop policy if exists "thumbnails owner update"  on storage.objects;
drop policy if exists "thumbnails owner delete"  on storage.objects;
drop policy if exists "thumbnails public insert" on storage.objects;
drop policy if exists "thumbnails public update" on storage.objects;
drop policy if exists "thumbnails public delete" on storage.objects;

create policy "thumbnails public insert" on storage.objects
  for insert with check (bucket_id = 'thumbnails');
create policy "thumbnails public update" on storage.objects
  for update using (bucket_id = 'thumbnails');
create policy "thumbnails public delete" on storage.objects
  for delete using (bucket_id = 'thumbnails');
