// Cloudflare Worker for keddy-media.
//
// Serves the Vite SPA and exposes /api/lookup for product autofill. The lookup
// path favors structured media databases and clean catalog imagery:
// - MusicBrainz + Cover Art Archive for music barcode/catalog/title lookups.
// - Optional Discogs when DISCOGS_TOKEN is configured as a Worker secret.
// - UPCitemdb for movie UPC fallbacks.

const UA = "KeddyMedia/1.0 ( https://keddy-media.ottomahjong.workers.dev )";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

function yearOf(dateStr) {
  const m = /(19|20)\d{2}/.exec(dateStr || "");
  return m ? m[0] : "";
}

function isBarcode(value) {
  return /^\d{8,14}$/.test(String(value || "").replace(/\D/g, ""));
}

// A catalog number is a compact alphanumeric token (e.g. "D248042", "WPCR-12345")
// with no spaces and at least one digit. Anything else — especially text with
// spaces or all letters — is treated as a title.
function isCatalogNumber(value) {
  const v = String(value || "").trim();
  return !/\s/.test(v) && /\d/.test(v) && /^[A-Za-z0-9._-]{3,}$/.test(v);
}

function musicFormat(release) {
  const fmts = (release.media || []).map((m) => (m.format || "").toLowerCase());
  if (fmts.some((f) => f.includes("cassette") || f.includes("tape"))) return "Cassette";
  if (fmts.some((f) => f.includes("vinyl") || f.includes("lp"))) return "Vinyl";
  return "CD";
}

function discogsFormat(result, fallback) {
  const fmts = (result.format || []).join(" ").toLowerCase();
  if (fmts.includes("cassette")) return "Cassette";
  if (fmts.includes("vinyl") || fmts.includes("lp")) return "Vinyl";
  if (fmts.includes("cd")) return "CD";
  return fallback || "CD";
}

function musicArtist(release) {
  return (
    (release["artist-credit"] || [])
      .map((a) => a.name || (a.artist && a.artist.name))
      .filter(Boolean)
      .join(", ") || ""
  );
}

async function coverArtForRelease(id) {
  if (!id) return "";
  const res = await fetch(`https://coverartarchive.org/release/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if (!res.ok) return "";
  const data = await res.json();
  const image = (data.images || []).find((i) => i.front) || (data.images || [])[0];
  return image?.thumbnails?.large || image?.thumbnails?.["500"] || image?.image || "";
}

async function fromMusicBrainz(query, source = "MusicBrainz") {
  const url =
    "https://musicbrainz.org/ws/2/release/?query=" +
    encodeURIComponent(query) +
    "&fmt=json&limit=5";
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA } });
  if (!res.ok) return null;
  const data = await res.json();
  const rel = (data.releases || []).find((r) => r.title) || null;
  if (!rel) return null;
  return {
    found: true,
    source,
    fields: {
      title: rel.title || "",
      artist: musicArtist(rel),
      year: yearOf(rel.date),
      type: musicFormat(rel),
      image_url: await coverArtForRelease(rel.id),
    },
  };
}

async function fromDiscogs(q, fallbackType, env) {
  if (!env.DISCOGS_TOKEN) return null;
  const params = new URLSearchParams({ type: "release", per_page: "5" });
  if (isBarcode(q)) {
    params.set("barcode", q.replace(/\D/g, ""));
  } else if (isCatalogNumber(q)) {
    params.set("catno", q);
  } else {
    params.set("q", q);
  }
  const res = await fetch("https://api.discogs.com/database/search?" + params.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": UA,
      Authorization: `Discogs token=${env.DISCOGS_TOKEN}`,
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const result = (data.results || []).find((r) => r.title) || null;
  if (!result) return null;
  const [artistPart, ...titleParts] = String(result.title || "").split(" - ");
  const title = titleParts.join(" - ") || result.title || "";
  const image = result.cover_image && !result.cover_image.includes("spacer.gif") ? result.cover_image : "";
  return {
    found: true,
    source: "Discogs",
    fields: {
      title,
      artist: titleParts.length ? artistPart : "",
      year: result.year ? String(result.year) : "",
      type: discogsFormat(result, fallbackType),
      image_url: image,
    },
  };
}

function movieFormatFromTitle(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("blu-ray") || t.includes("blu ray") || t.includes("bluray")) return "Blu-ray";
  if (t.includes("vhs")) return "VHS";
  if (t.includes("dvd")) return "DVD";
  return "DVD";
}

function cleanProductTitle(title) {
  return (title || "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\((blu-?ray|dvd|vhs|video tape|widescreen|full ?screen|unrated|special edition|clamshell)[^)]*\)/gi, "")
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/\b(blu-?ray|blu ray|bluray|dvd|vhs|video tape|clamshell|nearly new|brand new|sealed|used|good|very good|like new)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s\-–—:!]+$/, "")
    .trim();
}

async function fromUpcItemDb(code) {
  const res = await fetch("https://api.upcitemdb.com/prod/trial/lookup?upc=" + encodeURIComponent(code));
  if (!res.ok) return null;
  const data = await res.json();
  const item = data.items && data.items[0];
  if (!item || !item.title) return null;
  return {
    found: true,
    source: "UPCitemdb",
    fields: {
      title: cleanProductTitle(item.title) || item.title,
      artist: item.brand || "",
      year: yearOf(item.title),
      type: movieFormatFromTitle(item.title),
      image_url: (item.images || [])[0] || "",
    },
  };
}

async function handleLookup(url, env) {
  const q = (url.searchParams.get("q") || url.searchParams.get("code") || "").trim();
  const type = (url.searchParams.get("type") || "").trim();
  if (!q) return json({ found: false });

  const musicType = ["CD", "Cassette", "Vinyl"].includes(type);
  const movieType = ["VHS", "DVD", "Blu-ray"].includes(type);
  const code = q.replace(/\D/g, "");

  // A barcode is unambiguous, so query every source regardless of the chosen
  // format: music first (best metadata + clean cover art), then movie UPC.
  if (isBarcode(q)) {
    try {
      const music = await fromMusicBrainz(`barcode:${code}`);
      if (music) return json(music);
    } catch (_) {
      /* continue */
    }
    try {
      const discogs = await fromDiscogs(code, musicType ? type : "", env);
      if (discogs) return json(discogs);
    } catch (_) {
      /* continue */
    }
    try {
      const movie = await fromUpcItemDb(code);
      if (movie) return json(movie);
    } catch (_) {
      /* fail soft */
    }
    return json({ found: false, code: q });
  }

  // Plain text (catalog number or title) only resolves against music
  // databases. There's no free movie-title source, so for a movie format we
  // don't guess — a music match would be wrong. Scan/enter the UPC instead.
  if (movieType) {
    return json({ found: false, code: q, note: "Scan or enter the UPC for movie lookups." });
  }

  try {
    const discogs = await fromDiscogs(q, musicType ? type : "", env);
    if (discogs) return json(discogs);
  } catch (_) {
    /* continue */
  }

  try {
    const query = isCatalogNumber(q) ? `catno:"${q}"` : `release:"${q}"`;
    const music = await fromMusicBrainz(query);
    if (music) return json(music);
  } catch (_) {
    /* fail soft */
  }

  return json({ found: false, code: q });
}

function isMusicType(type) { return ["CD", "Cassette", "Vinyl"].includes(type); }
function isMovieType(type) { return ["VHS", "DVD", "Blu-ray"].includes(type); }
function normalizeListingInput(input = {}) {
  return {
    id: input.id || "", type: input.type || "Other", title: String(input.title || "").trim(),
    artist: String(input.artist || "").trim(), year: String(input.year || "").trim(),
    barcode: String(input.barcode || "").replace(/\D/g, ""), catalog_number: String(input.catalog_number || "").trim(),
    condition: String(input.condition || "").trim(), force: String(input.force || "") === "true" || input.force === true,
  };
}
function buildValueQuery(listing) {
  if (listing.barcode) return listing.barcode;
  const bits = [listing.title];
  if (isMusicType(listing.type) && listing.artist) bits.push(listing.artist);
  if (isMovieType(listing.type)) bits.push(listing.type);
  if (listing.year) bits.push(listing.year);
  if (listing.catalog_number) bits.push(listing.catalog_number);
  return bits.filter(Boolean).join(" ");
}
function median(values) { const v = values.slice().sort((a,b)=>a-b); if (!v.length) return null; const m = Math.floor(v.length/2); return v.length % 2 ? v[m] : (v[m-1]+v[m])/2; }
function removeOutliers(values) {
  let v = values.map(Number).filter((n) => Number.isFinite(n) && n > 0 && n < 5000).sort((a,b)=>a-b);
  if (v.length < 6) return v;
  const q1 = median(v.slice(0, Math.floor(v.length / 2))); const q3 = median(v.slice(Math.ceil(v.length / 2)));
  const iqr = q3 - q1; const lo = Math.max(0, q1 - 1.5 * iqr); const hi = q3 + 1.5 * iqr;
  return v.filter((n) => n >= lo && n <= hi);
}
function normalizeMoney(value, currency = "USD") { const n = Number(value); return { value: Number.isFinite(n) ? Number(n.toFixed(2)) : null, currency: currency || "USD" }; }
function sourceError(provider, err) { return { status:"error", source:provider, error: err?.message || String(err || "Provider error") }; }
async function timedFetch(url, opts = {}, ms = 8000) {
  const ac = new AbortController(); const id = setTimeout(() => ac.abort("timeout"), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); } finally { clearTimeout(id); }
}
async function getEbayAppToken(env) {
  if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) return null;
  const body = new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" });
  const res = await timedFetch("https://api.ebay.com/identity/v1/oauth2/token", { method:"POST", headers:{ Authorization:"Basic "+btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`), "Content-Type":"application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new Error(`eBay token ${res.status}`); return (await res.json()).access_token;
}
function excludedEbayTitle(title) { return /\b(lot|bundle|wholesale|job lot|collection|case only|artwork only|sleeve only|poster only|manual only|replacement case|empty case|damaged|parts|accessor(?:y|ies))\b/i.test(title || ""); }
function matchesFormat(title, type) { const t=(title||"").toLowerCase(); if (type === "DVD") return !/(blu.?ray|vhs|cassette|vinyl)\b/.test(t); if (type === "Blu-ray") return /(blu.?ray|bluray)/.test(t) || !/\bdvd\b|vhs/.test(t); if (type === "VHS") return /vhs/.test(t) || !/\bdvd\b|blu.?ray/.test(t); if (type === "CD") return !/vinyl|cassette/.test(t); if (type === "Vinyl") return /vinyl| lp\b|record/.test(t) || !/\bcd\b|cassette/.test(t); if (type === "Cassette") return /cassette|tape/.test(t) || !/\bcd\b|vinyl/.test(t); return true; }
function summarizePrices(prices, currency, fallbackConfidence, notes) { const kept = removeOutliers(prices); return { low: kept[0] ?? null, median: median(kept), high: kept[kept.length-1] ?? null, sample_count: kept.length, currency: currency || "USD", confidence: kept.length >= 5 ? fallbackConfidence : "low", notes }; }
function valueNotFound(listing, tried, skipped, errors = []) { return { status: errors.length && !tried.length ? "error" : "not_found", listing_id: listing.id || undefined, source:null, source_kind:null, currency:"USD", low:null, median:null, high:null, sample_count:0, confidence:"low", notes: errors.length ? "All attempted value providers failed" : "No configured source returned enough matching results", last_checked_at:new Date().toISOString(), raw:{ providers_tried:tried, providers_skipped:skipped, provider_errors:errors } }; }
async function fetchDiscogsValue(listing, env) {
  if (!env.DISCOGS_TOKEN || !isMusicType(listing.type)) return { status:"skipped", source:"discogs", reason:"not configured or not music" };
  const params = new URLSearchParams({ type:"release", per_page:"1" });
  if (listing.barcode) params.set("barcode", listing.barcode); else if (listing.catalog_number) params.set("catno", listing.catalog_number); else params.set("q", [listing.artist, listing.title, listing.year].filter(Boolean).join(" "));
  const search = await timedFetch("https://api.discogs.com/database/search?"+params, { headers:{ Accept:"application/json", "User-Agent":UA, Authorization:`Discogs token=${env.DISCOGS_TOKEN}` } });
  if (!search.ok) throw new Error(`Discogs search ${search.status}`); const hit = (await search.json()).results?.[0]; if (!hit?.id) return null;
  const stats = await timedFetch(`https://api.discogs.com/marketplace/stats/${hit.id}`, { headers:{ Accept:"application/json", "User-Agent":UA, Authorization:`Discogs token=${env.DISCOGS_TOKEN}` } });
  if (!stats.ok) throw new Error(`Discogs stats ${stats.status}`); const data = await stats.json(); const low = normalizeMoney(data.lowest_price?.value, data.lowest_price?.currency || "USD");
  if (low.value == null) return null;
  return { status:"success", listing_id:listing.id||undefined, source:"discogs", source_kind:"discogs_marketplace_floor", source_id:String(hit.id), matched_title:hit.title, matched_format:listing.type, currency:low.currency, low:low.value, median:null, high:null, sample_count:data.num_for_sale || 1, confidence:(listing.barcode || listing.catalog_number) && data.num_for_sale >= 5 ? "high" : "low", notes:"Discogs current marketplace lowest price; not sold comps.", last_checked_at:new Date().toISOString(), raw:{ providers_tried:["discogs"], discogs:{ num_for_sale:data.num_for_sale } } };
}
async function fetchEbaySoldComps(listing, env) {
  if (String(env.EBAY_MARKETPLACE_INSIGHTS_ENABLED || "false") !== "true") return { status:"skipped", source:"ebay_marketplace_insights", reason:"disabled" };
  const token = await getEbayAppToken(env); if (!token) return { status:"skipped", source:"ebay_marketplace_insights", reason:"not configured" };
  const q = buildValueQuery(listing); const url = `https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search?q=${encodeURIComponent(q)}&limit=50`;
  const res = await timedFetch(url, { headers:{ Authorization:`Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": env.EBAY_MARKETPLACE_ID || "EBAY_US", Accept:"application/json" } });
  if (!res.ok) throw new Error(`eBay insights ${res.status}`); const data = await res.json(); const items = data.itemSales || [];
  const prices = items.filter((i)=>!excludedEbayTitle(i.title) && matchesFormat(i.title, listing.type)).map((i)=>Number(i.price?.value)); const s = summarizePrices(prices, "USD", listing.barcode ? "high" : "medium", "Filtered sold comps using title/format exclusions and outlier removal.");
  if (!s.sample_count) return null; return { status:"success", listing_id:listing.id||undefined, source:"ebay_marketplace_insights", source_kind:"ebay_sold_comps", source_id:q, matched_title:listing.title, matched_format:listing.type, ...s, last_checked_at:new Date().toISOString(), raw:{ limited:true, providers_tried:["ebay_marketplace_insights"] } };
}
async function fetchEbayBrowseComps(listing, env) {
  const token = await getEbayAppToken(env); if (!token) return { status:"skipped", source:"ebay_browse", reason:"not configured" };
  const q = buildValueQuery(listing); const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=50&filter=buyingOptions:{FIXED_PRICE}`;
  const res = await timedFetch(url, { headers:{ Authorization:`Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": env.EBAY_MARKETPLACE_ID || "EBAY_US", Accept:"application/json" } });
  if (!res.ok) throw new Error(`eBay browse ${res.status}`); const data = await res.json();
  const prices = (data.itemSummaries || []).filter((i)=>!excludedEbayTitle(i.title) && matchesFormat(i.title, listing.type)).map((i)=>Number(i.price?.value)); const s = summarizePrices(prices, "USD", "low", "Active fixed-price listings only; not sold comps.");
  if (!s.sample_count) return null; return { status:"success", listing_id:listing.id||undefined, source:"ebay_browse", source_kind:"ebay_active_asking", source_id:q, matched_title:listing.title, matched_format:listing.type, ...s, confidence:"low", last_checked_at:new Date().toISOString(), raw:{ limited:true, providers_tried:["ebay_browse"] } };
}
async function fetchKeepaValue() { return { status:"skipped", source:"keepa", reason:"not implemented" }; }
async function fetchDisqMetadata() { return { status:"skipped", source:"disqapis", reason:"not implemented" }; }
function chooseBestValue(results) { return results.find((r)=>r && r.status === "success") || null; }
async function computeValue(listing, env) {
  const providers = isMusicType(listing.type) ? [fetchDiscogsValue, fetchEbaySoldComps, fetchEbayBrowseComps, fetchKeepaValue] : [fetchDisqMetadata, fetchEbaySoldComps, fetchEbayBrowseComps, fetchKeepaValue];
  const tried=[], skipped=[], errors=[], successes=[];
  for (const p of providers) { try { const r = await p(listing, env); if (r?.status === "skipped") skipped.push(r.source); else { tried.push(r?.source || p.name); if (r?.status === "success") successes.push(r); } } catch(e) { const name = p.name.replace(/^fetch/, "").replace(/Value|Comps|Metadata/g, "").toLowerCase(); tried.push(name); errors.push({ source:name, message:e.message }); } }
  const best = chooseBestValue(successes); if (best) return { ...best, status: errors.length ? "partial" : "success", raw:{ ...(best.raw||{}), providers_tried:tried, providers_skipped:skipped, provider_errors:errors } };
  return valueNotFound(listing, tried, skipped, errors);
}
async function handleValue(url, env) {
  const listing = normalizeListingInput(Object.fromEntries(url.searchParams)); const force = listing.force;
  const cacheKey = new Request(url.origin + "/api/value/cache?" + new URLSearchParams({ type:listing.type,title:listing.title,artist:listing.artist,year:listing.year,barcode:listing.barcode,catalog_number:listing.catalog_number }).toString());
  if (!force && caches?.default) { const hit = await caches.default.match(cacheKey); if (hit) return hit; }
  const body = await computeValue(listing, env); const res = json(body); if (!force && caches?.default) await caches.default.put(cacheKey, new Response(JSON.stringify(body), { headers:{ "content-type":"application/json", "cache-control":`max-age=${Number(env.VALUE_REFRESH_CACHE_SECONDS) || 43200}` } })); return res;
}
async function handleValueBatch(request, env) {
  const body = await request.json().catch(()=>({})); const all = Array.isArray(body.listings) ? body.listings : []; const batch = all.slice(0,20);
  const results = []; for (const item of batch) results.push(await computeValue(normalizeListingInput(item), env));
  return json({ status:"success", warning: all.length > 20 ? `Processed first 20 listings; skipped ${all.length - 20}.` : null, results });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/lookup" || url.pathname === "/api/barcode") {
      return handleLookup(url, env);
    }
    if (url.pathname === "/api/value") return handleValue(url, env);
    if (url.pathname === "/api/value/batch" && request.method === "POST") return handleValueBatch(request, env);
    return env.ASSETS.fetch(request);
  },
};
