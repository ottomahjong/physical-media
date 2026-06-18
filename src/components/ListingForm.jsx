import { lazy, Suspense, useState } from "react";
import { uploadImage, TYPES, CONDITIONS, STATUSES, DEFAULT_LIST, artistLabel } from "../data.js";
import { lookupBarcode } from "../barcode.js";

// The camera scanner pulls in the (heavy) zxing library, so load it on demand
// only when the owner opens it — visitors never download it.
const BarcodeScanner = lazy(() => import("./BarcodeScanner.jsx"));

const empty = {
  type: "VHS",
  title: "",
  artist: "",
  year: "",
  condition: "Good",
  quantity: 1,
  used_price: "",
  good_price: "",
  status: "Available",
  notes: "",
  image_url: "",
  list: DEFAULT_LIST,
};

export default function ListingForm({ initial, onSave, onCancel, onDelete }) {
  const [v, setV] = useState({ ...empty, ...initial });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState("");
  const [looking, setLooking] = useState(false);
  const [scanMsg, setScanMsg] = useState(null);

  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  // Fill the form from a barcode. Only overwrites fields the lookup returns,
  // and leaves anything you've already typed if the source has nothing for it.
  async function lookup(rawCode) {
    const c = String(rawCode || "").replace(/\D/g, "");
    if (!c) return;
    setLooking(true);
    setScanMsg(null);
    try {
      const r = await lookupBarcode(c);
      if (r.found) {
        setV((cur) => ({
          ...cur,
          type: r.fields.type || cur.type,
          title: r.fields.title || cur.title,
          artist: r.fields.artist || cur.artist,
          year: r.fields.year || cur.year,
        }));
        setScanMsg(`Found “${r.fields.title}” via ${r.source}. Check the details, then Save.`);
      } else {
        setScanMsg(`No match for ${c}. Enter the details by hand.`);
      }
    } catch {
      setScanMsg("Lookup failed — enter the details by hand.");
    } finally {
      setLooking(false);
    }
  }

  function onScanned(scanned) {
    setScanning(false);
    setCode(scanned.replace(/\D/g, ""));
    lookup(scanned);
  }

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
        condition: v.condition || null,
        quantity: Number(v.quantity) || 1,
        used_price: v.used_price === "" ? null : Number(v.used_price),
        good_price: v.good_price === "" ? null : Number(v.good_price),
        status: v.status || "Available",
        notes: v.notes.trim() || null,
        image_url: v.image_url || null,
        list: v.list || DEFAULT_LIST,
      };
      await onSave(payload);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="lform" onSubmit={submit}>
      {scanning && (
        <Suspense fallback={<div className="scanoverlay"><div className="scanbox"><p className="scanhint">Starting camera…</p></div></div>}>
          <BarcodeScanner onDetected={onScanned} onClose={() => setScanning(false)} />
        </Suspense>
      )}

      <div className="grid2 topboxes">
        <div className="formbox">
          <label>Scan barcode</label>
          <button type="button" className="btn ghost btn--block" onClick={() => { setScanMsg(null); setScanning(true); }}>
            Scan barcode
          </button>
          <div className="scaninput">
            <input
              type="text"
              inputMode="numeric"
              placeholder="…or type a UPC/EAN"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookup(code); } }}
            />
            <button type="button" className="btn" onClick={() => lookup(code)} disabled={looking || !code.trim()}>
              {looking ? "Looking…" : "Look up"}
            </button>
          </div>
        </div>

        <div className="formbox">
          <label>Upload image</label>
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
                {uploading ? "Uploading…" : "Upload"}
                <input type="file" accept="image/*" hidden onChange={pickImage} disabled={uploading} />
              </label>
              {v.image_url && (
                <button type="button" className="btn ghost" onClick={() => setV({ ...v, image_url: "" })}>
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {scanMsg && <p className="scanmsg">{scanMsg}</p>}

      <label>List</label>
      <div className="seg">
        <button
          type="button"
          className="chip"
          aria-pressed={(v.list || DEFAULT_LIST) === "collection"}
          onClick={() => setV({ ...v, list: "collection" })}
        >
          Collection
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={(v.list || DEFAULT_LIST) === "wishlist"}
          onClick={() => setV({ ...v, list: "wishlist" })}
        >
          Wish list
        </button>
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

      <label>{artistLabel(v.type)}</label>
      <input
        value={v.artist || ""}
        onChange={set("artist")}
        placeholder={artistLabel(v.type) === "Studio" ? "e.g. Walt Disney" : "e.g. Fleetwood Mac"}
      />

      <div className="grid2">
        <div>
          <label>Condition</label>
          <select value={v.condition || ""} onChange={set("condition")}>
            {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label>Status</label>
          <select value={v.status || ""} onChange={set("status")}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="grid2">
        <div>
          <label>Price Paid ($)</label>
          <input type="number" step="0.01" value={v.used_price ?? ""} onChange={set("used_price")} placeholder="1" />
        </div>
        <div>
          <label>Est. Value ($)</label>
          <input type="number" step="0.01" value={v.good_price ?? ""} onChange={set("good_price")} placeholder="3" />
        </div>
      </div>

      <label>Quantity</label>
      <input type="number" min="1" value={v.quantity ?? 1} onChange={set("quantity")} />

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
