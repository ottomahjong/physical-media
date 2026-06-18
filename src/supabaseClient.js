import { createClient } from "@supabase/supabase-js";

// These come from environment variables set at build time (Netlify) or in a
// local .env file. The anon key is SAFE to expose publicly — security is
// enforced by Row Level Security rules in the database.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// The owner credentials for the simple front-door login. This is a light
// barrier, NOT real security: anyone who views the page source can read these,
// and the database itself is writable with the public anon key. That's an
// accepted trade-off for this personal project. Override via env vars if you
// ever want to change them without editing code.
export const OWNER_EMAIL = (
  import.meta.env.VITE_OWNER_EMAIL || "kellyphillips029@gmail.com"
).toLowerCase();

export const OWNER_PASSWORD = import.meta.env.VITE_OWNER_PASSWORD || "keddy029";

export const isConfigured = Boolean(url && anonKey);

export const supabase = isConfigured
  ? createClient(url, anonKey)
  : null;
