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

SPA routing is already handled by `public/_redirects` (Vite copies it into
`dist/`), so deep links like `/listing/123` and a hard refresh on `/admin`
work.

## 3. Environment variables
Add these under **Settings → Environment variables → Production** (same values
you used on Netlify):

- `VITE_SUPABASE_URL`  → `https://<your-project-ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY` → your project's **anon** key

(These are read at build time. Re-deploy after adding them if the first build
ran without them.)

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
