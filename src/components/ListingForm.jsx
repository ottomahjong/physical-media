import { useRef, useState } from "react";
import { uploadImage, TYPES, CONDITIONS, STATUSES } from "../data.js";

const empty = {
  type: "VHS",
  title: "",
  artist: "",
  year: "",
  media_condition: "Not Specified",
  case_condition: "Not Specified",
  quantity: 1,
  paid_price: "",
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
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef();

  const set = (k) => (e) => setV((cur) => ({ ...cur, [k]: e.target.value }));

  async function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
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

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        type: v.type,
        title: v.title.trim() || null,
        artist: v.artist.trim() || null,
        year: v.year ? String(v.year).trim() : null,
        media_condition: v.media_condition || null,
        case_condition: v.case_condition || null,
        quantity: Number(v.quantity) || 1,
        paid_price: v.paid_price === "" ? null : Number(v.paid_price),
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
      {/* Drag-and-drop image area */}
      <div
        className={"dropzone" + (dragOver ? " dragover" : "") + (uploading ? " uploading" : "")}
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {uploading ? (
          <span className="dropzone-label">Uploading…</span>
        ) : v.image_url ? (
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

      <label>Title</label>
      <input value={v.title} onChange={set("title")} placeholder="e.g. The Lion King" />

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
          <label>Paid ($)</label>
          <input type="number" step="0.01" value={v.paid_price ?? ""} onChange={set("paid_price")} placeholder="1" />
        </div>
        <div>
          <label>Used price ($)</label>
          <input type="number" step="0.01" value={v.used_price ?? ""} onChange={set("used_price")} placeholder="1" />
        </div>
      </div>
      <div className="grid2">
        <div>
          <label>Good price ($)</label>
          <input type="number" step="0.01" value={v.good_price ?? ""} onChange={set("good_price")} placeholder="3" />
        </div>
        <div /></div>

      <label>Notes</label>
      <textarea rows="3" value={v.notes || ""} onChange={set("notes")}
        placeholder="Condition details, where it's stored, listing link, etc." />

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
