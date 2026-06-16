import { supabase } from "./supabaseClient.js";

export const TYPES = ["VHS", "DVD", "CD", "Blu-ray", "Vinyl", "Cassette", "Other"];
export const CONDITIONS = [
  "Mint (M)",
  "Near Mint (NM or M-)",
  "Excellent (EX)",
  "Very Good Plus (VG+)",
  "Very Good (VG)",
  "Good Plus (G+)",
  "Good (G)",
  "Not Specified",
];
export const STATUSES = ["Available", "Listed", "Sold"];

const TABLE = "listings";

export async function fetchListings() {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("title", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchListing(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createListing(values) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(values)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateListing(id, values) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteListing(id) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

// Upload an image file to Supabase Storage and return its public URL.
export async function uploadImage(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("thumbnails")
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("thumbnails").getPublicUrl(path);
  return data.publicUrl;
}

export function formatMoney(n) {
  if (n === null || n === undefined || n === "") return null;
  const num = Number(n);
  if (Number.isNaN(num)) return null;
  return "$" + num.toLocaleString(undefined, { maximumFractionDigits: num % 1 ? 2 : 0 });
}
