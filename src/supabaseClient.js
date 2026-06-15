import { createClient } from "@supabase/supabase-js";

// These come from environment variables set at build time (Netlify) or in a
// local .env file. The anon key is SAFE to expose publicly — security is
// enforced by Row Level Security rules in the database.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// The single email address allowed to add / edit / delete listings.
// Everyone else gets a read-only view.
export const OWNER_EMAIL = (
  import.meta.env.VITE_OWNER_EMAIL || "ottomahjong@gmail.com"
).toLowerCase();

export const isConfigured = Boolean(url && anonKey);

export const supabase = isConfigured
  ? createClient(url, anonKey)
  : null;
