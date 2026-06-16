import { useState } from "react";
import { uploadImage, TYPES, CONDITIONS, STATUSES } from "../data.js";

const empty = {
  type: "VHS",
  title: "",
  artist: "",
  year: "",
  media_condition: "Not Specified",
  case_condition: "Not Specified",
  quantity: 1,
  used_price: "",
  good_price: "",
  status: "Available",
  notes: "",
  image_url: "",
};

export default function ListingForm({ initial, onSave, onCancel, onDelete }) {
  const [v, setV] = useState({ ...empty, ...initial });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  async function pickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadImage(file);
      setV((cur) => ({ ...cur, image_url: url }));
    } catch (err) {
      setError("Image upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        type: v.type,
        title: v.title.trim(),
        artist: v.artist.trim() || null,
        year: v.year ? String(v.year).trim() : null,
        media_condition: v.media_condition || null,
        case_condition: v.case_condition || null,
        quantity: Number(v.quantity) || 1,
        used_price: v.used_price === "" ? null : Number(v.used_price),
        good_price: v.good_price === "" ? null : Number(v.good_price),
        status: v.status || "Available",
        notes: v.notes.trim() || null,
        image_url: v.image_url || null,
      };
      await onSave(payload);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="lform" onSubmit={submit}>
      <div className="imgrow">
        <div className="imgbox">
          {v.image_url ? (
            <img src={v.image_url} alt="thumbnail" />
          ) : (
            <span>No image</span>
          )}
        </div>
        <div className="imgactions">
          <label className="btn">
            {uploading ? "Uploading…" : "Upload image"}
            <input type="file" accept="image/*" hidden onChange={pickImage} disabled={uploading} />
          </label>
          {v.image_url && (
            <button type="button" className="btn ghost" onClick={() => setV({ ...v, image_url: "" })}>
              Remove image
            </button>
          )}
        </div>
      </div>

      <label>Title</label>
      <input value={v.title} onChange={set("title")} required placeholder="e.g. The Lion King" />

      <div className="grid2">
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

      <label>Artist / Studio / Company</label>
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
          <label>Quantity</label>
          <input type="number" min="1" value={v.quantity ?? 1} onChange={set("quantity")} />
        </div>
      </div>

      <div className="grid2">
        <div>
          <label>Used price ($)</label>
          <input type="number" step="0.01" value={v.used_price ?? ""} onChange={set("used_price")} placeholder="1" />
        </div>
        <div>
          <label>Good price ($)</label>
          <input type="number" step="0.01" value={v.good_price ?? ""} onChange={set("good_price")} placeholder="3" />
        </div>
      </div>

      <label>Notes</label>
      <textarea rows="3" value={v.notes || ""} onChange={set("notes")} placeholder="Condition details, where it's stored, listing link, etc." />

      {error && <p className="err">{error}</p>}

      <div className="formbtns">
        <button className="btn primary" disabled={busy || uploading}>
          {busy ? "Saving…" : "Save"}
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        )}
        {onDelete && (
          <button type="button" className="btn danger" onClick={onDelete}>Delete</button>
        )}
      </div>
    </form>
  );
}
