# Database migrations

`schema.sql` is the full, current shape of the database and is **idempotent** —
running it on a fresh project creates everything. For a **fresh deploy you only
need `schema.sql`** (see `DEPLOY.md` step 3); the migrations here are already
baked into it.

This folder exists for **databases that are already live with data**, where you
can't just re-run the whole schema without thinking. Each file is a single,
ordered, idempotent change you apply once to bring an existing database up to
date.

## How to apply one

Supabase dashboard → **SQL Editor** → paste the file's contents → **Run**.
(Or use the Management API query endpoint exactly as in `DEPLOY.md` step 3.)

## Convention

- Numbered `NNNN_short_description.sql`, applied in order.
- Always written to be safe to run more than once (`if not exists`, etc.).
- When you add one, also fold the change into `schema.sql` so fresh deploys
  stay correct.

## Log

| #    | File                            | What it does                                              |
|------|---------------------------------|-----------------------------------------------------------|
| 0001 | `0001_add_list_column.sql`      | Adds the `list` column (collection vs. wish list).        |
| 0002 | `0002_open_write_policies.sql`  | Opens write/upload RLS (app now owns the login gate).     |
