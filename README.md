# The Collection

A live, editable catalog for physical media (VHS · DVD · CD · and more).

- **Public visitors** see a searchable, filterable, sortable list with thumbnails
  and a detail page for every item.
- **You** (the owner) log in with a one-time email link and can **add, edit, and
  delete** listings and upload thumbnail images — right from the website.

Built as a single-page app (React + Vite) backed by **Supabase** (database, image
storage, and login) and hosted on **Netlify**. No server to maintain.

---

## How it works

| Piece | What it does |
|-------|--------------|
| Netlify | Hosts the website (the static files in `dist/`). Auto-deploys. |
| Supabase database | Stores every listing in the `listings` table. |
| Supabase storage | Holds the thumbnail images (`thumbnails` bucket). |
| Supabase auth | Emails you a one-time sign-in link. Only your email can edit. |
| Row Level Security | Database rules that let the public read but only you write. |

## Using the site

1. Go to your live URL.
2. Browse / search the collection. Tap any item for its own page.
3. To make changes, tap **Owner login**, enter your email, and click the link
   that lands in your inbox.
4. Once signed in you'll see a **Manage** button — add new listings there, or
   open any item and tap **Edit** / **Delete**. Use **Upload image** to attach a
   thumbnail.

## Project layout

```
index.html            App entry
src/
  pages/Home.jsx       Public collection list
  pages/Listing.jsx    Single item page (+ edit when logged in)
  pages/Admin.jsx      Owner dashboard (add / manage)
  pages/Login.jsx      Email sign-in
  components/ListingForm.jsx  Add/edit form with image upload
  data.js              All database reads/writes
  supabaseClient.js    Connection + owner email
  auth.jsx             Login state
db/
  schema.sql           Tables, security rules, image bucket (run once)
  seed.sql             Your existing ~100 titles (optional)
```

## Configuration

The app needs two values (set in Netlify → Environment variables, and locally in
a `.env` file — see `.env.example`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
```
