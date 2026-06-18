// Cloudflare Worker for keddy-media.
//
// Serves the static SPA (via the ASSETS binding, with SPA fallback) and adds
// one tiny API route: GET /api/barcode?code=UPC — a server-side proxy for the
// barcode lookups. Doing them here (rather than in the browser) avoids CORS
// blocks and lets us send MusicBrainz a proper User-Agent, which makes music
// matches far more reliable. All free; no keys.

const MB_UA = "TheCollection/1.0 ( https://keddy-media.ottomahjong.workers.dev )";

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

function yearOf(d) {
  const m = /^(\d{4})/.exec(d || "");
  return m ? m[1] : "";
}

function musicFormat(release) {
  const fmts = (release.media || []).map((m) => (m.format || "").toLowerCase());
  if (fmts.some((f) => f.includes("vinyl") || f.includes("lp"))) return "Vinyl";
  return "CD";
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

async function fromMusicBrainz(code) {
  const url =
    "https://musicbrainz.org/ws/2/release/?query=barcode:" +
    encodeURIComponent(code) +
    "&fmt=json&limit=1";
  const res = await fetch(url, { headers: { "User-Agent": MB_UA, Accept: "application/json" } });
  if (!res.ok) return null;
  const data = await res.json();
  const rel = data.releases && data.releases[0];
  if (!rel) return null;
  const artist =
    (rel["artist-credit"] || [])
      .map((a) => a.name || (a.artist && a.artist.name))
      .filter(Boolean)
      .join(", ") || "";
  return {
    found: true,
    source: "MusicBrainz",
    fields: { title: rel.title || "", artist, year: yearOf(rel.date), type: musicFormat(rel) },
  };
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
      year: "",
      type: movieFormatFromTitle(item.title),
    },
  };
}

async function handleBarcode(url) {
  const code = (url.searchParams.get("code") || "").replace(/\D/g, "");
  if (!code) return json({ found: false });
  try {
    const music = await fromMusicBrainz(code);
    if (music) return json(music);
  } catch (_) {
    /* fall through */
  }
  try {
    const movie = await fromUpcItemDb(code);
    if (movie) return json(movie);
  } catch (_) {
    /* fail soft */
  }
  return json({ found: false, code });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/barcode") return handleBarcode(url);
    // Everything else: static assets, with SPA fallback handled by the
    // assets binding (not_found_handling = single-page-application).
    return env.ASSETS.fetch(request);
  },
};
