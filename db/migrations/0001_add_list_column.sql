-- Migration 0001 — add the wish list
-- ---------------------------------------------------------------------------
-- Adds the `list` column that separates the collection from the wish list.
-- Every existing row defaults to 'collection', so applying this is safe and
-- non-destructive on a database that already has data.
--
-- This is already folded into db/schema.sql (so fresh deploys get it for free).
-- This file exists so an EXISTING, already-live database can be brought up to
-- date without re-running the whole schema. Run it once:
--
--   Supabase dashboard → SQL Editor → paste → Run
--   (or via the Management API query endpoint, same as DEPLOY.md step 3)
--
-- Idempotent: safe to run more than once.

alter table public.listings
  add column if not exists list text not null default 'collection';

create index if not exists listings_list_idx on public.listings (list);
