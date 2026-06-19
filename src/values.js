export function normalizeValueResult(result = {}) {
  return {
    status: result.status || "not_found",
    listing_id: result.listing_id || null,
    source: result.source || null,
    source_kind: result.source_kind || null,
    source_id: result.source_id || null,
    matched_title: result.matched_title || null,
    matched_format: result.matched_format || null,
    currency: result.currency || "USD",
    low: result.low ?? null,
    median: result.median ?? null,
    high: result.high ?? null,
    sample_count: result.sample_count ?? 0,
    confidence: result.confidence || "low",
    notes: result.notes || "",
    last_checked_at: result.last_checked_at || new Date().toISOString(),
    raw: result.raw || {},
  };
}

function listingParams(listing = {}, force = false) {
  const params = new URLSearchParams();
  ["type", "title", "artist", "year", "barcode", "catalog_number", "condition"].forEach((key) => {
    if (listing[key] !== undefined && listing[key] !== null && listing[key] !== "") params.set(key, listing[key]);
  });
  if (force) params.set("force", "true");
  return params;
}

export async function valueLookup(listing, { force = false } = {}) {
  const res = await fetch(`/api/value?${listingParams(listing, force)}`);
  if (!res.ok) throw new Error("Value lookup failed");
  return normalizeValueResult({ ...(await res.json()), listing_id: listing?.id });
}

export async function valueLookupBatch(listings, { force = false } = {}) {
  const res = await fetch("/api/value/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listings, force }),
  });
  if (!res.ok) throw new Error("Batch value lookup failed");
  const data = await res.json();
  return { ...data, results: (data.results || []).map(normalizeValueResult) };
}
