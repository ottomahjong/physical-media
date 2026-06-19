-- Add deterministic market-value fields and historical snapshots.

alter table public.listings
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
