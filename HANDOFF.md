# Keddy Media — Handoff

A personal **physical-media collection** app: catalog your VHS, DVD, Blu-ray,
CD, Cassette, and Vinyl, track condition / value / quantity, keep a wish list,
and autofill listing details by scanning or typing a barcode, catalog number,
or title. Public visitors can browse; the owner logs in to add/edit/delete.

Live worker: `https://keddy-media.ottomahjong.workers.dev`

---

## 1. Tech stack at a glance

| Layer | Choice |
|-------|--------|
| UI | React 18 + React Router 6, built with Vite 5 |
| Styling | One hand-written stylesheet (`src/styles.css`), "Two Islands" brand tokens, bundled webfonts |
| Data | Supabase (Postgres + Storage) via `@supabase/supabase-js` |
| Auth | Light client-side email+password gate (NOT real security — see §6) |
| Barcode scan | `@zxing/browser` (lazy-loaded, on-device camera) |
| Product lookup | Cloudflare Worker `/api/lookup` → MusicBrainz + Cover Art Archive, UPCitemdb, optional Discogs |
| Hosting | Cloudflare Workers (static `dist/` via ASSETS binding + the Worker in front) |

There is **no backend of our own** beyond the small Worker. The browser talks
to Supabase directly; the Worker exists only to proxy third-party lookups
(avoids CORS and lets us send a proper User-Agent / hold a Discogs token).

---

## 2. Project layout

```
index.html              Vite entry
vite.config.js
wrangler.toml           Cloudflare config (name=keddy-media, ASSETS=dist/, SPA fallback)
worker/index.js         The Worker: serves dist/ + the /api/lookup route
src/
  main.jsx              React bootstrap
  App.jsx               Header + routes (/, /listing/:id, /admin, /login)
  auth.jsx              AuthProvider / useAuth — localStorage owner flag
  supabaseClient.js     Supabase client + owner credentials + isConfigured flag
  data.js               All DB calls, image upload, type/label helpers, money fmt
  barcode.js            Lookup client: calls /api/lookup, falls back to direct APIs
  components/
    ListingForm.jsx     Add/edit form: Autofill + cover drop zone + all fields
    BarcodeScanner.jsx  Camera overlay (zxing), lazy-loaded
    MediaBits.jsx       <MediaThumb> and <CategoryPill> (shared presentational bits)
  pages/
    Home.jsx            Public browse: list tabs, search, filters, sort, table
    Listing.jsx         Detail view + inline edit (owner)
    Admin.jsx           "Manage" — owner-only table + add form
    Login.jsx           Owner email+password form
  styles.css            Entire design system
db/
  schema.sql            Table + RLS + storage bucket (run once in Supabase)
  seed.sql              Optional sample data
  migrations/           Incremental SQL (e.g. 0001 adds the `list` column)
DEPLOY.md               General deploy notes
DEPLOY-CLOUDFLARE.md    Cloudflare-specific setup
```

---

## 3. Data model

One table, `public.listings` (see `db/schema.sql`):

| Column | Notes |
|--------|-------|
| `id` | uuid, PK |
| `type` | format: `VHS`, `DVD`, `Blu-ray`, `CD`, `Cassette`, `Vinyl`, `Other` |
| `title` | required |
| `artist` | labeled **Studio** for movies, **Artist** for music (see `artistLabel`) |
| `year`, `condition`, `quantity`, `used_price`, `good_price`, `status`, `notes`, `image_url` | |
| `list` | `collection` or `wishlist` (defaults to `collection`) |
| `created_at`, `updated_at` | |

Images live in a public Supabase **Storage** bucket named `thumbnails`.
Row Level Security is **wide open** (public read AND write) — access control is
done in the app, not the database. Deliberate trade-off for a personal project.

---

## 4. Key features & where they live

- **Browse (Home.jsx):** Collection / Wish list tabs, search, per-format filter
  chips, A–Z / Value sort (right-aligned), and a fixed-layout inventory table.
  Mobile collapses to Title / Artist / Est. Value / Qty.
- **Category pills (MediaBits.jsx + styles.css):** colored pills — VHS, DVD, CD,
  CASS, B-R, VIN. Abbreviations come from `typeAbbr()`; colors from the
  `.typepill.t-*` rules.
- **Thumbnails (MediaBits.jsx + styles.css):** VHS/DVD/Blu-ray/Cassette render
  at **3:4** (case shape); CD/Vinyl render **1:1** (Vinyl is a circle). When
  there's no cover, a colored placeholder shows the format abbreviation.
- **Cover image drop zone (ListingForm.jsx):** drag a file, paste from
  clipboard, click Upload, **or drag an image straight from a web page** (reads
  `text/uri-list` / `text/html`). Files upload to Supabase Storage
  (`uploadImage`); web URLs try `uploadImageFromUrl` and fall back to keeping
  the remote URL if the site blocks cross-origin reads.
- **Autofill (ListingForm.jsx → barcode.js → worker/index.js):** scan a barcode
  with the camera, or type a UPC/EAN, catalog number, or title, then "Find".
  Only fills fields the lookup returns; you review before saving. See §5.
- **Auth (auth.jsx / Login.jsx):** owner signs in with email+password; a flag is
  kept in `localStorage`. `/admin` and edit/delete controls are owner-only.

---

## 5. How Autofill works (the important bit)

Entry point: `ListingForm.lookup()` → `lookupListing(value, type)` in
`barcode.js`. In production this calls the Worker `GET /api/lookup?q=…&type=…`;
in local `vite dev` (no Worker) it falls back to calling the public APIs
directly. **Both paths share the same routing logic:**

1. **Barcode (8–14 digits)** — unambiguous, so try every source in order:
   MusicBrainz (barcode search, with Cover Art Archive for the cover) →
   Discogs (if `DISCOGS_TOKEN` set) → UPCitemdb (movie UPC fallback).
2. **Movie format + text (no barcode)** — VHS/DVD/Blu-ray with a typed title or
   catalog number returns **no guess**. There's no free movie-title database, so
   rather than autofill a wrong *music* match (and clobber the format to "CD"),
   it asks you to scan/enter the UPC. Music formats still resolve from text.
3. **Catalog number vs. title** — a value with **no spaces and at least one
   digit** (e.g. `D248042`, `WPCR-12345`) is treated as a catalog number
   (`catno:` search); anything else (e.g. `Rumours`, `Abbey Road`) is searched
   as a release **title**. This is `isCatalogNumber()` in both files.

Providers (all free; keys optional):
- **MusicBrainz** — music metadata by barcode / catalog / title.
- **Cover Art Archive** — clean front cover for a MusicBrainz release.
- **UPCitemdb** (free trial, ~100/day) — movie UPC fallback.
- **Discogs** — optional, enabled only when `DISCOGS_TOKEN` is set as a Worker
  secret. Good for vinyl/cassette catalog numbers.

If nothing is found, fields are left as-is (no random cover search) — by design,
a listing keeps a blank image rather than a wrong one.

> Note: `barcode.js` duplicates the lookup logic so local dev works without the
> Worker. If you change the routing, **change both `worker/index.js` and
> `src/barcode.js`** to keep them in sync.

---

## 6. Security posture (read before changing anything)

This is a **personal project with intentionally light security**:

- The Supabase **anon key** is public (safe — but RLS is wide open, so anyone
  with the key can write to the DB). Editing is gated only in the UI.
- **Owner credentials are defaults in source code**
  (`src/supabaseClient.js`): email `kellyphillips029@gmail.com`, password
  `keddy029`, overridable via `VITE_OWNER_EMAIL` / `VITE_OWNER_PASSWORD` at
  build time. Anyone viewing page source can read them. This is an accepted
  trade-off, not real auth.
- If this ever needs to be genuinely locked down: move to real Supabase Auth +
  per-user RLS policies, and remove the public write policies in `schema.sql`.

⚠️ A Cloudflare API token was shared in plaintext during setup — **rotate it**
(Cloudflare dashboard → My Profile → API Tokens). Never commit secrets;
`private/` and `*.env` are gitignored.

---

## 7. Local development

Prereqs: Node ≥ 18 (repo pins Node 20 via `.nvmrc`).

```bash
npm install
# create .env with your Supabase project values:
#   VITE_SUPABASE_URL=...
#   VITE_SUPABASE_ANON_KEY=...
#   (optional) VITE_OWNER_EMAIL / VITE_OWNER_PASSWORD
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the built dist/
```

In `vite dev` there's no Worker, so Autofill uses the **direct API fallback**
in `barcode.js`. Some providers may CORS-block the browser locally — that path
is best-effort; the Worker is the reliable route in production.

There is **no test suite and no linter** configured. "Verification" = a clean
`npm run build` plus manual checks. The build env here has **no outbound
network**, so live lookup calls can't be exercised from CI/sandboxes — they
must be checked on the deployed Worker or a networked machine.

---

## 8. Deployment (Cloudflare)

The app is a prebuilt Vite SPA served by a Worker. `wrangler.toml` declares
`dist/` as static assets (`ASSETS` binding) with SPA fallback, and
`worker/index.js` as the Worker that adds `/api/lookup`.

```bash
npm run build
npx wrangler deploy            # deploys dist/ + the Worker

# optional: enable Discogs lookups
npx wrangler secret put DISCOGS_TOKEN
```

Build-time env vars (`VITE_SUPABASE_*`, owner overrides) must be set wherever
the build runs — a static SPA can't read Worker runtime vars. See
`DEPLOY-CLOUDFLARE.md` for the full setup (incl. Supabase auth URLs).

**Important:** the deployed Worker serves whatever was last `wrangler deploy`d.
Shipping changes to `worker/index.js` or the site requires a fresh build +
deploy (or merge to `main` and let the connected build run).

---

## 9. Recent changes / known gaps

Most recent work (branch `claude/laughing-babbage-6iwdib`) imported the Codex
updates into git and fixed three Autofill/UI issues:
- Lookups are now **format-aware** (movie + typed title no longer autofills a
  wrong music match).
- The **catalog-number vs. title** heuristic was fixed so plain titles search
  as releases — title-text autofill actually works for music now.
- **Blu-ray thumbnails** render 3:4 to match DVD/VHS.

Known gaps / future ideas:
- **No movie-title autofill** — movies only resolve by UPC (no free title API).
  Adding OMDb/TMDb would need an API key + a movie branch in the Worker.
- `wrangler.toml`'s comment still mentions the old `/api/barcode` route name;
  the Worker handles both `/api/lookup` and `/api/barcode`.
- Lookup logic is duplicated across `worker/index.js` and `src/barcode.js`
  (see §5) — keep them in sync.
- Auth/RLS are intentionally minimal (§6).
