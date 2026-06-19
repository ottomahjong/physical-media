# DEPLOY — Cloudflare Pages

A free, Git-connected way to host this site (a Vite + React SPA backed by
Supabase). Cloudflare Pages auto-builds on every push to `main`, just like
Netlify did. Your data and login live in Supabase — this only serves the static
build, so migrating hosts is low-risk and changes nothing in the database.

## 1. Connect the repo
1. Go to the Cloudflare dashboard → **Workers & Pages** → **Create** →
   **Pages** → **Connect to Git**.
2. Authorize GitHub and pick `ottomahjong/physical-media`.
3. Production branch: **`main`**.

## 2. Build settings
| Setting | Value |
|---|---|
| Framework preset | None / Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |

SPA routing is handled by `not_found_handling = "single-page-application"` in
`wrangler.toml`, so deep links like `/listing/123` and a hard refresh on
`/admin` work. (We do NOT use a `_redirects` file — the Workers asset deployer
rejects a `/* /index.html 200` rule as an infinite loop.)

**This project deploys as a *Worker* (not a classic Pages site):** the deploy
command is `npx wrangler deploy`, and the repo's `wrangler.toml` tells it to
deploy the prebuilt `dist/` as static assets. This avoids the
"Vite 5 cannot be automatically configured / update to Vite >= 6" deploy error
you get when there's no wrangler config. The `name` in `wrangler.toml` must
match your Worker's name so it deploys to the same project.

## 3. Environment variables (BUILD-time — this is the common gotcha)
Because this is a static SPA, Vite bakes these values into the JS during
`npm run build`. They must be set as **build** variables, NOT (only) as the
Worker's runtime variables — a static site can't read runtime vars.

In the Worker → **Settings → Build → Variables and secrets** (the build
section, not the runtime one), add:

- `VITE_SUPABASE_URL`  → `https://<your-project-ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY` → your project's **anon / publishable** key

The anon key is a long JWT that starts with `eyJ...` (or a newer
`sb_publishable_...` key). It is meant to be public — it ships in the browser
bundle and is safe to expose; Row Level Security is what protects your data.
(Don't use the `service_role` key or an `sbp_...` personal access token here.)

Re-deploy after setting them. You can confirm they took effect: the built
`dist/assets/index-*.js` filename hash will change once the keys are embedded.

## 4. Deploy
Click **Save and Deploy**. You'll get a free URL like
`https://physical-media.pages.dev`. Every later push to `main` redeploys
automatically.

## 5. Point Supabase auth at the new URL (REQUIRED for owner login)
Your magic-link login is currently pinned to the old Netlify URL, so email
links would otherwise send you to a dead site. Update Supabase → **Auth → URL
Configuration**:

- **Site URL**: `https://<your-site>.pages.dev`
- **Redirect URLs** (allow list): add
  `https://<your-site>.pages.dev`, `https://<your-site>.pages.dev/admin`,
  and (for local dev) `http://localhost:5173`

If you prefer the API, it's the same call as `DEPLOY.md` step 6 with the new
URL.

## 6. (Optional) custom domain
**Custom domains** tab → add your domain and follow the DNS steps. Then add the
custom domain to the Supabase redirect allow-list too.

---

### Notes
- The `netlify.toml` in the repo is harmless to leave in place; Cloudflare
  ignores it. Delete it if you've fully moved off Netlify.
- Nothing about the database changes when you switch hosts. If you haven't
  already applied the wish-list migration to your live DB, see
  `db/migrations/0001_add_list_column.sql`.

## Optional market-value refresh providers
The market-value refresh feature uses deterministic source APIs through the
Cloudflare Worker only. Browser code calls `/api/value` and `/api/value/batch`;
it never receives provider secrets and no Groq, OpenAI, Claude, Gemini, or other
LLM/AI-token pricing path is used.

All of these Worker runtime secrets/variables are optional. If a provider is not
configured, the Worker records it as skipped and tries the next source.

| Variable | Required? | Notes |
|---|---:|---|
| `DISCOGS_TOKEN` | Optional | Preferred for Vinyl, CD, and Cassette. Discogs marketplace stats are treated as current marketplace floor/availability, not sold comps. |
| `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` | Optional | Enables eBay Browse active-listing fallback. Set these as Worker runtime secrets, not Vite build variables. |
| `EBAY_MARKETPLACE_ID` | Optional | Defaults to `EBAY_US`. |
| `EBAY_MARKETPLACE_INSIGHTS_ENABLED` | Optional | Defaults to `false`. Set to `true` only when your eBay app has Marketplace Insights access. If access is missing, the Worker falls back gracefully to Browse when configured. |
| `KEEPA_ACCESS_KEY` | Optional | Reserved for Amazon price-history support; not required. |
| `DISQAPIS_KEY` / `DISQAPIS_API_KEY` | Optional | Reserved as movie metadata helpers; not pricing sources. |
| `VALUE_REFRESH_CACHE_SECONDS` | Optional | Normalized Worker response cache TTL. Defaults to `43200` (12 hours). |
| `VALUE_REFRESH_STALE_DAYS` | Optional | UI stale threshold default is 14 days. |

To enable the eBay active-listing fallback, create eBay application credentials
and add `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` to the Worker runtime secrets.
Sold-comps support uses eBay Marketplace Insights and may require separate eBay
access; set `EBAY_MARKETPLACE_INSIGHTS_ENABLED=true` only after that access is
available.
