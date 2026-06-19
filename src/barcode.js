// Product lookup: barcode first, catalog/title fallback.
//
// In production the Cloudflare Worker handles /api/lookup so the browser avoids
// CORS limits and can use server-side provider keys later. Local dev falls back
// to the public MusicBrainz / Cover Art Archive and UPCitemdb endpoints.

function yearOf(dateStr) {
  const m = /^(\d{4})/.exec(dateStr || "");
  return m ? m[1] : "";
}

function isBarcode(value) {
  return /^\d{8,14}$/.test(String(value || "").replace(/\D/g, ""));
}

// A catalog number is a compact alphanumeric token with no spaces and at least
// one digit (e.g. "D248042"); anything else is treated as a title.
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
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return "";
  const data = await res.json();
  const image = (data.images || []).find((i) => i.front) || (data.images || [])[0];
  return image?.thumbnails?.large || image?.thumbnails?.["500"] || image?.image || "";
}

async function releaseToFields(release, source) {
  return {
    found: true,
    source,
    fields: {
      title: release.title || "",
      artist: musicArtist(release),
      year: yearOf(release.date),
      type: musicFormat(release),
      image_url: await coverArtForRelease(release.id),
    },
  };
}

async function searchMusicBrainz(query, source) {
  const res = await fetch(
    "https://musicbrainz.org/ws/2/release/?query=" +
      encodeURIComponent(query) +
      "&fmt=json&limit=5",
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const rel = (data.releases || []).find((r) => r.title) || null;
  return rel ? releaseToFields(rel, source) : null;
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
    .replace(/\((blu-?ray|dvd|vhs|widescreen|full ?screen|unrated|special edition)[^)]*\)/gi, "")
    .replace(/\b(blu-?ray|dvd|vhs)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s\-–—:]+$/, "")
    .trim();
}

async function lookupUpcItemDb(code) {
  const url = "https://api.upcitemdb.com/prod/trial/lookup?upc=" + encodeURIComponent(code);
  const res = await fetch(url);
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
      year: "",
      type: movieFormatFromTitle(item.title),
      image_url: (item.images || [])[0] || "",
    },
  };
}

async function lookupViaProxy(value, type) {
  const res = await fetch(
    "/api/lookup?q=" +
      encodeURIComponent(value) +
      "&type=" +
      encodeURIComponent(type || ""),
    { headers: { Accept: "application/json" } }
  );
  const ct = res.headers.get("content-type") || "";
  if (!res.ok || !ct.includes("application/json")) return null;
  return res.json();
}

async function lookupDirect(value, type) {
  const clean = String(value || "").trim();
  if (!clean) return { found: false };

  // A barcode is unambiguous: try music, then the movie UPC database.
  if (isBarcode(clean)) {
    const code = clean.replace(/\D/g, "");
    const music = await searchMusicBrainz(`barcode:${code}`, "MusicBrainz");
    if (music) return music;
    const movie = await lookupUpcItemDb(code);
    if (movie) return movie;
    return { found: false, code: clean };
  }

  // Catalog number / title text only resolves against music databases. There's
  // no free movie-title source, so don't guess for a movie format.
  if (["VHS", "DVD", "Blu-ray"].includes(type)) return { found: false, code: clean };

  const query = isCatalogNumber(clean)
    ? `catno:"${clean}"`
    : `release:"${clean}"`;
  const music = await searchMusicBrainz(query, "MusicBrainz");
  return music || { found: false, code: clean };
}

export async function lookupListing(value, type) {
  const clean = String(value || "").trim();
  if (!clean) return { found: false };

  try {
    const viaProxy = await lookupViaProxy(clean, type);
    if (viaProxy) return viaProxy;
  } catch {
    /* local dev or proxy unavailable */
  }

  try {
    return await lookupDirect(clean, type);
  } catch {
    return { found: false, code: clean };
  }
}

export async function lookupBarcode(code, type) {
  return lookupListing(code, type);
}
