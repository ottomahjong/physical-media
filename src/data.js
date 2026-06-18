import { supabase } from "./supabaseClient.js";

export const TYPES = ["VHS", "DVD", "CD", "Cassette", "Blu-ray", "Vinyl", "Other"];
export const CONDITIONS = ["New", "Like New", "Good", "Fair", "Poor"];
export const STATUSES = ["Available", "Listed", "Sold"];

// The two lists an item can live on. Everything defaults to "collection"
// (what you own); "wishlist" is what you'd like to find.
export const LISTS = ["collection", "wishlist"];
export const DEFAULT_LIST = "collection";

// Formats that are movies vs. music. Used to label the "artist" field as
// either Studio (movies) or Artist (music).
const MOVIE_TYPES = ["VHS", "DVD", "Blu-ray"];
const MUSIC_TYPES = ["CD", "Cassette", "Vinyl"];

// What to call the "artist" column for a given format.
export function artistLabel(type) {
  if (MOVIE_TYPES.includes(type)) return "Studio";
  if (MUSIC_TYPES.includes(type)) return "Artist";
  return "Artists / Studio";
}

export function typeKey(type) {
  return (type || "Other").replace(/[^A-Za-z]/g, "") || "Other";
}

export function typeAbbr(type) {
  switch (type) {
    case "Cassette":
      return "CASS";
    case "Blu-ray":
      return "B-R";
    case "Vinyl":
      return "VIN";
    default:
      return (type || "Other").toUpperCase();
  }
}

const TABLE = "listings";

export async function fetchListings() {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("title", { ascending: true });
  if (error) throw error;
  // Treat any legacy rows without a list as part of the collection.
  return (data || []).map((i) => ({ ...i, list: i.list || DEFAULT_LIST }));
}

export async function fetchListing(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return { ...data, list: data.list || DEFAULT_LIST };
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

export async function uploadImageFromUrl(url) {
  const clean = String(url || "").trim();
  if (!/^https?:\/\//i.test(clean)) {
    throw new Error("Image URL must start with http:// or https://");
  }

  const res = await fetch(clean);
  if (!res.ok) throw new Error("Couldn't fetch that image URL");
  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("That URL did not return an image");
  }

  const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const file = new File([blob], `cover-from-url.${ext}`, { type: blob.type });
  return uploadImage(file);
}

export function formatMoney(n) {
  if (n === null || n === undefined || n === "") return null;
  const num = Number(n);
  if (Number.isNaN(num)) return null;
  return "$" + num.toLocaleString(undefined, { maximumFractionDigits: num % 1 ? 2 : 0 });
}
