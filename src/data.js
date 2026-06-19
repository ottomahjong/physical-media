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
const MARKET_VALUE_COLUMNS = new Set([
  "barcode", "catalog_number", "external_ids", "price_source", "price_source_kind",
  "price_source_id", "price_currency", "price_low", "price_median", "price_high",
  "price_sample_count", "price_confidence", "price_notes", "price_raw",
  "price_last_checked_at", "price_error",
]);

function missingColumn(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`;
  return /schema cache|Could not find .* column|column .* does not exist|PGRST204/i.test(msg) || error?.code === "PGRST204";
}

function withoutMarketValueColumns(values) {
  return Object.fromEntries(Object.entries(values || {}).filter(([key]) => !MARKET_VALUE_COLUMNS.has(key)));
}


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
  if (!error) return data;
  if (!missingColumn(error)) throw error;

  const { data: fallbackData, error: fallbackError } = await supabase
    .from(TABLE)
    .insert(withoutMarketValueColumns(values))
    .select()
    .single();
  if (fallbackError) throw fallbackError;
  return fallbackData;
}

export async function updateListing(id, values) {
  const payload = { ...values, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (!error) return data;
  if (!missingColumn(error)) throw error;

  const { data: fallbackData, error: fallbackError } = await supabase
    .from(TABLE)
    .update(withoutMarketValueColumns(payload))
    .eq("id", id)
    .select()
    .single();
  if (fallbackError) throw fallbackError;
  return fallbackData;
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

export function getListingEstimatedValue(listing) {
  return listing?.price_median ?? listing?.price_low ?? listing?.used_price ?? listing?.good_price ?? null;
}

export function isPriceStale(listing, days = 14) {
  if (!listing?.price_last_checked_at) return true;
  const checked = new Date(listing.price_last_checked_at).getTime();
  if (!Number.isFinite(checked)) return true;
  return Date.now() - checked > days * 24 * 60 * 60 * 1000;
}

export async function saveListingValue(listingId, result) {
  const hasPrice = result?.low != null || result?.median != null || result?.high != null;
  const update = {
    price_source: result.source,
    price_source_kind: result.source_kind,
    price_source_id: result.source_id,
    price_currency: result.currency || "USD",
    price_low: result.low,
    price_median: result.median,
    price_high: result.high,
    price_sample_count: result.sample_count || 0,
    price_confidence: result.confidence || "low",
    price_notes: result.notes || null,
    price_raw: result.raw || {},
    price_last_checked_at: result.last_checked_at || new Date().toISOString(),
    price_error: ["error", "not_found"].includes(result.status) ? result.notes || result.status : null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from(TABLE).update(update).eq("id", listingId).select().single();
  if (error) {
    if (missingColumn(error)) {
      return fetchListing(listingId);
    }
    throw error;
  }
  if (["success", "partial"].includes(result.status) && hasPrice) {
    const { error: snapshotError } = await supabase.from("listing_value_snapshots").insert({
      listing_id: listingId,
      source: result.source,
      source_kind: result.source_kind,
      source_id: result.source_id,
      currency: result.currency || "USD",
      low: result.low,
      median: result.median,
      high: result.high,
      sample_count: result.sample_count || 0,
      confidence: result.confidence || "low",
      notes: result.notes || null,
      raw: result.raw || {},
    });
    if (snapshotError) throw snapshotError;
  }
  return data;
}

export function formatMoney(n) {
  if (n === null || n === undefined || n === "") return null;
  const num = Number(n);
  if (Number.isNaN(num)) return null;
  return "$" + num.toLocaleString(undefined, { maximumFractionDigits: num % 1 ? 2 : 0 });
}
