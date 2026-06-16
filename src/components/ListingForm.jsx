import { useRef, useState } from "react";
import { uploadImage, TYPES, CONDITIONS, STATUSES } from "../data.js";

const DISCOGS_UA    = "KeddyMedia/1.0 +keddy-media.netlify.com";
const DISCOGS_TOKEN = import.meta.env.VITE_DISCOGS_TOKEN;
const OMDB_KEY      = import.meta.env.VITE_OMDB_API_KEY;

const MUSIC_TYPES = ["CD", "Cassette", "Vinyl"];
const VIDEO_TYPES = ["VHS", "DVD", "Blu-ray"];

const DISCOGS_FORMAT = { CD: "CD", Cassette: "Cassette", Vinyl: "Vinyl" };

function discogsHeaders() {
  const h = { "User-Agent": DISCOGS_UA };
  if (DISCOGS_TOKEN) h["Authorization"] = `Discogs token=${DISCOGS_TOKEN}`;
  return h;
}

async function searchDiscogs(title, type) {
  const fmt = DISCOGS_FORMAT[type] || "CD";
  const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(title)}&type=release&format=${fmt}&per_page=8`;
  const res = await fetch(url, { headers: discogsHeaders() });
  if (res.status === 401) throw new Error("Discogs needs a free token (VITE_DISCOGS_TOKEN) to return matches and cover art.");
  if (!res.ok) throw new Error("Discogs search failed");
  const data = await res.json();
  return (data.results || []).map((r) => ({
    title:  r.title?.split(" - ").slice(1).join(" - ") || r.title,
    artist: r.title?.split(" - ")[0] || "",
    year:   r.year ? String(r.year) : "",
    label:  r.label?.[0] || "",
    genre:  [...(r.genre || []), ...(r.style || [])].join(", "),
    thumb:  r.cover_image || r.thumb || "",
    source: "Discogs",
  }));
}

// OMDB detail fetch (by imdbID) returns Genre + a full poster.
async function omdbDetail(imdbID) {
  if (!OMDB_KEY || !imdbID) return {};
  try {
    const res = await fetch(`https://www.omdbapi.com/?i=${imdbID}&apikey=${OMDB_KEY}`);
    if (!res.ok) return {};
    const d = await res.json();
    if (d.Response === "False") return {};
    return {
      genre:  d.Genre && d.Genre !== "N/A" ? d.Genre : "",
      thumb:  d.Poster && d.Poster !== "N/A" ? d.Poster : "",
      artist: d.Director && d.Director !== "N/A" ? d.Director : "",
    };
  } catch { return {}; }
}

async function searchOMDB(title, year) {
  if (!OMDB_KEY) return [];
  const params = new URLSearchParams({ s: title, apikey: OMDB_KEY });
  if (year) params.set("y", year);
  const res = await fetch(`https://www.omdbapi.com/?${params}`);
  if (!res.ok) throw new Error("OMDB search failed");
  const data = await res.json();
  if (data.Response === "False") return [];
  return (data.Search || []).slice(0, 8).map((r) => ({
    title:  r.Title,
    artist: "",
    year:   r.Year?.replace(/[^0-9].*/, "") || "",
    label:  r.Type,
    genre:  "",
    thumb:  r.Poster !== "N/A" ? r.Poster : "",
    source: "OMDB",
    imdbID: r.imdbID,
  }));
}

const empty = {
  type: "VHS", title: "", artist: "", year: "", genre: "",
  media_condition: "Not Specified", case_condition: "Not Specified",
  quantity: 1, paid_price: "", status: "Available", notes: "", image_url: "",
};

export default function ListingForm({ initial, onSave, onCancel, onDelete }) {
  const [v, setV] = useState({ ...empty, ...initial });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef();

  // Lookup state
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState(null);

  const set = (k) => (e) => setV((cur) => ({ ...cur, [k]: e.target.value }));

  async function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true); setError(null);
    try {
      const url = await uploadImage(file);
      setV((cur) => ({ ...cur, image_url: url }));
    } catch (err) { setError("Image upload failed: " + err.message); }
    finally { setUploading(false); }
  }

  function onDrop(e) {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  async function runSearch() {
    const q = (lookupQuery || v.title || "").trim();
    if (!q) throw new Error("Enter a title first.");
    if (MUSIC_TYPES.includes(v.type)) return searchDiscogs(q, v.type);
    if (VIDEO_TYPES.includes(v.type)) {
      if (!OMDB_KEY) throw new Error("Add a free OMDB API key (VITE_OMDB_API_KEY) to enable VHS/DVD lookup. Get one at omdbapi.com — takes 30 seconds.");
      return searchOMDB(q, v.year);
    }
    return searchDiscogs(q, "CD");
  }

  // Show a list of matches to choose from.
  async function doLookup() {
    setLookupBusy(true); setLookupError(null); setLookupResults(null);
    try {
      const results = await runSearch();
      setLookupResults(results);
      if (!results.length) setLookupError("No matches found. Try a shorter title.");
    } catch (e) { setLookupError(e.message); }
    finally { setLookupBusy(false); }
  }

  // Auto-pick the single best (first) match and fill everything.
  async function doAutofill() {
    setLookupBusy(true); setLookupError(null); setLookupResults(null);
    try {
      const results = await runSearch();
      if (!results.length) { setLookupError("No matches found. Try a shorter title."); return; }
      await applyResult(results[0]);
    } catch (e) { setLookupError(e.message); }
    finally { setLookupBusy(false); }
  }

  async function applyResult(r) {
    let genre = r.genre || "";
    let thumb = r.thumb || "";
    let artist = r.artist || "";
    // OMDB search results lack genre/director — enrich from the detail endpoint.
    if (r.source === "OMDB" && r.imdbID) {
      const d = await omdbDetail(r.imdbID);
      genre  = genre  || d.genre  || "";
      thumb  = thumb  || d.thumb  || "";
      artist = artist || d.artist || "";
    }
    setV((cur) => ({
      ...cur,
      title:  r.title || cur.title,
      artist: artist || cur.artist,
      year:   r.year || cur.year,
      genre:  genre || cur.genre,
      image_url: thumb || cur.image_url,
    }));
    setLookupResults(null);
    setLookupQuery("");
  }

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const clean = (s) => (s == null ? "" : String(s)).trim() || null;
      const payload = {
        type: v.type, title: clean(v.title),
        artist: clean(v.artist),
        year: clean(v.year),
        genre: clean(v.genre),
        media_condition: v.media_condition || null,
        case_condition: v.case_condition || null,
        quantity: Number(v.quantity) || 1,
        paid_price: v.paid_price === "" || v.paid_price == null ? null : Number(v.paid_price),
        status: v.status || "Available",
        notes: clean(v.notes),
        image_url: v.image_url || null,
      };
      await onSave(payload);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <form className="lform" onSubmit={submit}>
      {/* Drag-and-drop image area */}
      <div
        className={"dropzone" + (dragOver ? " dragover" : "") + (uploading ? " uploading" : "")}
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {uploading ? <span className="dropzone-label">Uploading…</span>
        : v.image_url ? (
          <>
            <img src={v.image_url} alt="thumbnail" className="dropzone-img" />
            <span className="dropzone-replace">Drop or click to replace</span>
          </>
        ) : (
          <span className="dropzone-label">
            Drop image here<br />
            <span className="dropzone-sub">or click to browse</span>
          </span>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
      {v.image_url && (
        <button type="button" className="btn ghost" style={{ marginBottom: 8 }}
          onClick={() => setV((cur) => ({ ...cur, image_url: "" }))}>
          Remove image
        </button>
      )}

      {/* Format selector first so lookup knows which API to hit */}
      <div className="grid2" style={{ marginTop: 0 }}>
        <div>
          <label>Format</label>
          <select value={v.type} onChange={set("type")}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label>Year</label>
          <input value={v.year || ""} onChange={set("year")} placeholder="1994" />
        </div>
      </div>

      {/* Title with inline lookup + autofill */}
      <label>Title</label>
      <div className="lookup-row">
        <input
          value={v.title}
          onChange={(e) => { set("title")(e); setLookupQuery(e.target.value); }}
          placeholder="e.g. The Lion King"
        />
        <button
          type="button"
          className="btn primary lookup-btn"
          onClick={doAutofill}
          disabled={lookupBusy}
          title="Find the best match and fill all fields automatically"
        >
          {lookupBusy ? "…" : "Autofill"}
        </button>
        <button
          type="button"
          className="btn ghost lookup-btn"
          onClick={doLookup}
          disabled={lookupBusy}
          title="Show a list of matches to choose from"
        >
          Browse
        </button>
      </div>

      {lookupError && <p className="err" style={{ marginTop: 6 }}>{lookupError}</p>}

      {lookupResults !== null && (
        <div className="lookup-results">
          {lookupResults.length === 0 ? (
            <p className="lookup-empty">No results</p>
          ) : lookupResults.map((r, idx) => (
            <button key={idx} type="button" className="lookup-item" onClick={() => applyResult(r)}>
              {r.thumb && <img src={r.thumb} alt="" className="lookup-thumb" />}
              <span className="lookup-info">
                <span className="lookup-title">{r.title}</span>
                <span className="lookup-meta">{[r.artist, r.year, r.label, r.genre].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="lookup-src">{r.source}</span>
            </button>
          ))}
          <button type="button" className="btn ghost" style={{ width: "100%", marginTop: 4 }}
            onClick={() => setLookupResults(null)}>
            Dismiss
          </button>
        </div>
      )}

      <label>Artist / Studio / Director</label>
      <input value={v.artist || ""} onChange={set("artist")} placeholder="e.g. Walt Disney" />

      <label>Genre</label>
      <input value={v.genre || ""} onChange={set("genre")} placeholder="e.g. Animation, Family" />

      <div className="grid2">
        <div>
          <label>Media condition</label>
          <select value={v.media_condition || "Not Specified"} onChange={set("media_condition")}>
            {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label>Case condition</label>
          <select value={v.case_condition || "Not Specified"} onChange={set("case_condition")}>
            {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="grid2">
        <div>
          <label>Status</label>
          <select value={v.status || ""} onChange={set("status")}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label>Paid ($)</label>
          <input type="number" step="0.01" value={v.paid_price ?? ""} onChange={set("paid_price")} placeholder="1" />
        </div>
      </div>

      <div className="grid2">
        <div>
          <label>Quantity</label>
          <input type="number" min="1" value={v.quantity ?? 1} onChange={set("quantity")} />
        </div>
        <div />
      </div>

      <label>Notes</label>
      <textarea rows="3" value={v.notes || ""} onChange={set("notes")}
        placeholder="Condition details, storage location, etc." />

      {error && <p className="err">{error}</p>}

      <div className="formbtns">
        <button className="btn primary" disabled={busy || uploading}>
          {busy ? "Saving…" : "Save"}
        </button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
        {onDelete && <button type="button" className="btn danger" onClick={onDelete}>Delete</button>}
      </div>
    </form>
  );
}
