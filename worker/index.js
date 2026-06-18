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
  const m = /^(\d{4})/.exec(dateStr || "");
  return m ? m[1] : "";
}

function isBarcode(value) {
  return /^\d{8,14}$/.test(String(value || "").replace(/\D/g, ""));
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
  } else if (/^[A-Z0-9][A-Z0-9 ._-]{2,}$/i.test(q)) {
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
    .replace(/\((blu-?ray|dvd|vhs|widescreen|full ?screen|unrated|special edition)[^)]*\)/gi, "")
    .replace(/\b(blu-?ray|dvd|vhs)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s\-–—:]+$/, "")
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
      year: "",
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
  const code = q.replace(/\D/g, "");

  try {
    if (isBarcode(q)) {
      const music = await fromMusicBrainz(`barcode:${code}`);
      if (music) return json(music);
    }
  } catch (_) {
    /* continue */
  }

  try {
    const discogs = await fromDiscogs(isBarcode(q) ? code : q, musicType ? type : "", env);
    if (discogs) return json(discogs);
  } catch (_) {
    /* continue */
  }

  try {
    if (isBarcode(q)) {
      const movie = await fromUpcItemDb(code);
      if (movie) return json(movie);
    }
  } catch (_) {
    /* continue */
  }

  try {
    const query = /^[A-Z0-9][A-Z0-9 ._-]{2,}$/i.test(q) ? `catno:"${q}"` : `release:"${q}"`;
    const music = await fromMusicBrainz(query);
    if (music) return json(music);
  } catch (_) {
    /* fail soft */
  }

  return json({ found: false, code: q });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/lookup" || url.pathname === "/api/barcode") {
      return handleLookup(url, env);
    }
    return env.ASSETS.fetch(request);
  },
};
