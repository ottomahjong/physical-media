-- ============================================================================
--  The Collection — database schema
--  Run this once in your Supabase project (SQL Editor → New query → paste → Run)
--  or it will be applied automatically via the Supabase Management API.
-- ============================================================================

-- 1. The listings table -------------------------------------------------------
create table if not exists public.listings (
  id          uuid primary key default gen_random_uuid(),
  type        text not null default 'VHS',
  title       text not null,
  artist      text,
  year        text,
  condition   text,
  quantity    integer not null default 1,
  used_price  numeric,
  good_price  numeric,
  status      text default 'Available',
  notes       text,
  image_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists listings_title_idx on public.listings (lower(title));
create index if not exists listings_type_idx  on public.listings (type);

-- 2. Row Level Security -------------------------------------------------------
-- Anyone can READ. Only the owner email can write.
alter table public.listings enable row level security;

drop policy if exists "public read"  on public.listings;
drop policy if exists "owner insert" on public.listings;
drop policy if exists "owner update" on public.listings;
drop policy if exists "owner delete" on public.listings;

create policy "public read" on public.listings
  for select using (true);

create policy "owner insert" on public.listings
  for insert with check ((auth.jwt() ->> 'email') = 'ottomahjong@gmail.com');

create policy "owner update" on public.listings
  for update using ((auth.jwt() ->> 'email') = 'ottomahjong@gmail.com');

create policy "owner delete" on public.listings
  for delete using ((auth.jwt() ->> 'email') = 'ottomahjong@gmail.com');

-- 3. Image storage bucket -----------------------------------------------------
insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', true)
on conflict (id) do nothing;

drop policy if exists "thumbnails public read"   on storage.objects;
drop policy if exists "thumbnails owner insert"  on storage.objects;
drop policy if exists "thumbnails owner update"  on storage.objects;
drop policy if exists "thumbnails owner delete"  on storage.objects;

create policy "thumbnails public read" on storage.objects
  for select using (bucket_id = 'thumbnails');

create policy "thumbnails owner insert" on storage.objects
  for insert with check (
    bucket_id = 'thumbnails' and (auth.jwt() ->> 'email') = 'ottomahjong@gmail.com'
  );

create policy "thumbnails owner update" on storage.objects
  for update using (
    bucket_id = 'thumbnails' and (auth.jwt() ->> 'email') = 'ottomahjong@gmail.com'
  );

create policy "thumbnails owner delete" on storage.objects
  for delete using (
    bucket_id = 'thumbnails' and (auth.jwt() ->> 'email') = 'ottomahjong@gmail.com'
  );
