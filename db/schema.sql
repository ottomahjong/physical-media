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
  barcode     text,
  catalog_number text,
  external_ids jsonb default '{}'::jsonb,
  price_source text,
  price_source_kind text,
  price_source_id text,
  price_currency text default 'USD',
  price_low numeric,
  price_median numeric,
  price_high numeric,
  price_sample_count integer,
  price_confidence text,
  price_notes text,
  price_raw jsonb default '{}'::jsonb,
  price_last_checked_at timestamptz,
  price_error text,
  status      text default 'Available',
  notes       text,
  image_url   text,
  list        text not null default 'collection',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- For databases created before the wish list existed: add the column without
-- touching any saved rows. Existing items stay in the 'collection'.
alter table public.listings
  add column if not exists list text not null default 'collection',
  add column if not exists barcode text,
  add column if not exists catalog_number text,
  add column if not exists external_ids jsonb default '{}'::jsonb,
  add column if not exists price_source text,
  add column if not exists price_source_kind text,
  add column if not exists price_source_id text,
  add column if not exists price_currency text default 'USD',
  add column if not exists price_low numeric,
  add column if not exists price_median numeric,
  add column if not exists price_high numeric,
  add column if not exists price_sample_count integer,
  add column if not exists price_confidence text,
  add column if not exists price_notes text,
  add column if not exists price_raw jsonb default '{}'::jsonb,
  add column if not exists price_last_checked_at timestamptz,
  add column if not exists price_error text;

create index if not exists listings_title_idx on public.listings (lower(title));
create index if not exists listings_type_idx  on public.listings (type);
create index if not exists listings_list_idx  on public.listings (list);

-- 2. Row Level Security -------------------------------------------------------
-- Anyone can READ and WRITE with the public anon key. Access control for
-- editing lives in the app (a simple email+password gate), not the database.
-- This is a deliberate low-security trade-off for a personal project.
alter table public.listings enable row level security;

drop policy if exists "public read"   on public.listings;
drop policy if exists "owner insert"  on public.listings;
drop policy if exists "owner update"  on public.listings;
drop policy if exists "owner delete"  on public.listings;
drop policy if exists "public insert" on public.listings;
drop policy if exists "public update" on public.listings;
drop policy if exists "public delete" on public.listings;

create policy "public read"   on public.listings for select using (true);
create policy "public insert" on public.listings for insert with check (true);
create policy "public update" on public.listings for update using (true);
create policy "public delete" on public.listings for delete using (true);


create table if not exists public.listing_value_snapshots (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete cascade,
  source text not null,
  source_kind text not null,
  source_id text,
  currency text default 'USD',
  low numeric,
  median numeric,
  high numeric,
  sample_count integer,
  confidence text,
  notes text,
  raw jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.listing_value_snapshots enable row level security;
drop policy if exists "public read" on public.listing_value_snapshots;
drop policy if exists "public insert" on public.listing_value_snapshots;
drop policy if exists "public update" on public.listing_value_snapshots;
drop policy if exists "public delete" on public.listing_value_snapshots;
create policy "public read" on public.listing_value_snapshots for select using (true);
create policy "public insert" on public.listing_value_snapshots for insert with check (true);
create policy "public update" on public.listing_value_snapshots for update using (true);
create policy "public delete" on public.listing_value_snapshots for delete using (true);

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

drop policy if exists "thumbnails public insert" on storage.objects;
drop policy if exists "thumbnails public update" on storage.objects;
drop policy if exists "thumbnails public delete" on storage.objects;

create policy "thumbnails public insert" on storage.objects
  for insert with check (bucket_id = 'thumbnails');

create policy "thumbnails public update" on storage.objects
  for update using (bucket_id = 'thumbnails');

create policy "thumbnails public delete" on storage.objects
  for delete using (bucket_id = 'thumbnails');
