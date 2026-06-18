// Barcode (UPC/EAN) lookup — all free, no API key, no server.
//
//   Music (CD / Vinyl)  -> MusicBrainz, which supports barcode search and
//                          sends CORS headers, so the browser can call it
//                          directly. Free, no key. Be gentle: ~1 req/sec.
//   Movies (DVD/Blu-ray/VHS) -> UPCitemdb free "trial" endpoint (~100/day per
//                          IP). Best-effort: coverage is spotty and it may be
//                          blocked by CORS on some networks; we fail soft and
//                          let the owner type the details in.
//
// Every lookup returns { found, fields, source } where `fields` is a partial
// listing ({ title, artist, year, type }) ready to merge into the form.

function yearOf(dateStr) {
  const m = /^(\d{4})/.exec(dateStr || "");
  return m ? m[1] : "";
}

// Pick CD vs Vinyl from a MusicBrainz release's media formats.
function musicFormat(release) {
  const fmts = (release.media || []).map((m) => (m.format || "").toLowerCase());
  if (fmts.some((f) => f.includes("vinyl") || f.includes("lp"))) return "Vinyl";
  return "CD";
}

async function lookupMusicBrainz(code) {
  const url =
    "https://musicbrainz.org/ws/2/release/?query=barcode:" +
    encodeURIComponent(code) +
    "&fmt=json&limit=1";
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = await res.json();
  const rel = data.releases && data.releases[0];
  if (!rel) return null;
  const artist =
    (rel["artist-credit"] || []).map((a) => a.name || (a.artist && a.artist.name)).filter(Boolean).join(", ") ||
    null;
  return {
    found: true,
    source: "MusicBrainz",
    fields: {
      title: rel.title || "",
      artist: artist || "",
      year: yearOf(rel.date),
      type: musicFormat(rel),
    },
  };
}

// Guess a movie format from the product title text.
function movieFormatFromTitle(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("blu-ray") || t.includes("blu ray") || t.includes("bluray")) return "Blu-ray";
  if (t.includes("vhs")) return "VHS";
  if (t.includes("dvd")) return "DVD";
  return "DVD";
}

// Trim format/edition noise from a product title so it reads like a real title.
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
    },
  };
}

// Look a barcode up across sources, music first. Returns a result object or a
// soft "not found". Never throws for an empty match — only for hard failures
// you might want to surface (which we still catch in the UI).
export async function lookupBarcode(code) {
  const clean = String(code || "").replace(/\D/g, "");
  if (!clean) return { found: false };

  try {
    const music = await lookupMusicBrainz(clean);
    if (music) return music;
  } catch {
    /* CORS/network — fall through to movies */
  }

  try {
    const movie = await lookupUpcItemDb(clean);
    if (movie) return movie;
  } catch {
    /* fail soft */
  }

  return { found: false, code: clean };
}
