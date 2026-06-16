import { useRef, useState } from "react";
import { uploadImage, TYPES, CONDITIONS, STATUSES } from "../data.js";

const DISCOGS_UA = "KeddyMedia/1.0 +keddy-media.netlify.com";
const OMDB_KEY   = import.meta.env.VITE_OMDB_API_KEY;

const MUSIC_TYPES = ["CD", "Cassette", "Vinyl"];
const VIDEO_TYPES = ["VHS", "DVD", "Blu-ray"];

const DISCOGS_FORMAT = { CD: "CD", Cassette: "Cassette", Vinyl: "Vinyl" };

async function searchDiscogs(title, type) {
  const fmt = DISCOGS_FORMAT[type] || "CD";
  const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(title)}&type=release&format=${fmt}&per_page=8`;
  const res = await fetch(url, { headers: { "User-Agent": DISCOGS_UA } });
  if (!res.ok) throw new Error("Discogs search failed");
  const data = await res.json();
  return (data.results || []).map((r) => ({
    title:  r.title?.split(" - ").slice(1).join(" - ") || r.title,
    artist: r.title?.split(" - ")[0] || "",
    year:   r.year ? String(r.year) : "",
    label:  r.label?.[0] || "",
    thumb:  r.cover_image || r.thumb || "",
    source: "Discogs",
  }));
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
    artist: r.Director || r.Writer || "",
    year:   r.Year?.replace(/[^0-9].*/, "") || "",
    label:  r.Type,
    thumb:  r.Poster !== "N/A" ? r.Poster : "",
    source: "OMDB",
    imdbID: r.imdbID,
  }));
}

const empty = {
  type: "VHS", title: "", artist: "", year: "",
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

  async function doLookup() {
    const q = (lookupQuery || v.title).trim();
    if (!q) return;
    setLookupBusy(true); setLookupError(null); setLookupResults(null);
    try {
      let results;
      if (MUSIC_TYPES.includes(v.type)) {
        results = await searchDiscogs(q, v.type);
      } else if (VIDEO_TYPES.includes(v.type)) {
        results = await searchOMDB(q, v.year);
        if (!results.length && !OMDB_KEY) {
          setLookupError("Add a free OMDB API key (VITE_OMDB_API_KEY) to enable VHS/DVD lookup. Get one at omdbapi.com — takes 30 seconds.");
          setLookupBusy(false); return;
        }
      } else {
        results = await searchDiscogs(q, "CD");
      }
      setLookupResults(results.length ? results : []);
      if (!results.length) setLookupError("No matches found. Try a shorter title.");
    } catch (e) { setLookupError(e.message); }
    finally { setLookupBusy(false); }
  }

  async function pickResult(r) {
    const next = { ...v, title: r.title, artist: r.artist, year: r.year };
    if (r.thumb && !v.image_url) {
      // Use external URL directly as image_url (no upload needed for preview)
      next.image_url = r.thumb;
    }
    setV(next);
    setLookupResults(null);
    setLookupQuery("");
  }

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const payload = {
        type: v.type, title: v.title.trim() || null,
        artist: v.artist.trim() || null,
        year: v.year ? String(v.year).trim() : null,
        media_condition: v.media_condition || null,
        case_condition: v.case_condition || null,
        quantity: Number(v.quantity) || 1,
        paid_price: v.paid_price === "" ? null : Number(v.paid_price),
        status: v.status || "Available",
        notes: v.notes.trim() || null,
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

      {/* Title with inline lookup */}
      <label>Title</label>
      <div className="lookup-row">
        <input
          value={v.title}
          onChange={(e) => { set("title")(e); setLookupQuery(e.target.value); }}
          placeholder="e.g. The Lion King"
        />
        <button
          type="button"
          className="btn ghost lookup-btn"
          onClick={doLookup}
          disabled={lookupBusy}
        >
          {lookupBusy ? "…" : "Look up"}
        </button>
      </div>

      {lookupError && <p className="err" style={{ marginTop: 6 }}>{lookupError}</p>}

      {lookupResults !== null && (
        <div className="lookup-results">
          {lookupResults.length === 0 ? (
            <p className="lookup-empty">No results</p>
          ) : lookupResults.map((r, idx) => (
            <button key={idx} type="button" className="lookup-item" onClick={() => pickResult(r)}>
              {r.thumb && <img src={r.thumb} alt="" className="lookup-thumb" />}
              <span className="lookup-info">
                <span className="lookup-title">{r.title}</span>
                <span className="lookup-meta">{[r.artist, r.year, r.label].filter(Boolean).join(" · ")}</span>
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
