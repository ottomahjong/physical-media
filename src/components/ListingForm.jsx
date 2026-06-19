import { lazy, Suspense, useState } from "react";
import { uploadImage, uploadImageFromUrl, TYPES, CONDITIONS, STATUSES, DEFAULT_LIST, artistLabel } from "../data.js";
import { lookupListing } from "../barcode.js";
import { MediaThumb } from "./MediaBits.jsx";

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
  barcode: "",
  catalog_number: "",
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
  const [lookupValue, setLookupValue] = useState("");
  const [looking, setLooking] = useState(false);
  const [scanMsg, setScanMsg] = useState(null);
  const [dragging, setDragging] = useState(false);
  const creatorLabel = artistLabel(v.type);
  const creatorPlaceholder =
    creatorLabel === "Studio"
      ? "e.g. Walt Disney"
      : creatorLabel === "Artist"
        ? "e.g. Fleetwood Mac"
        : "e.g. Walt Disney or Fleetwood Mac";

  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  // Fill the form from a barcode. Only overwrites fields the lookup returns,
  // and leaves anything you've already typed if the source has nothing for it.
  async function lookup(rawValue = lookupValue) {
    const c = String(rawValue || "").trim();
    if (!c) return;
    setLooking(true);
    setScanMsg(null);
    try {
      const r = await lookupListing(c, v.type);
      if (r.found) {
        setV((cur) => ({
          ...cur,
          type: r.fields.type || cur.type,
          title: r.fields.title || cur.title,
          artist: r.fields.artist || cur.artist,
          year: r.fields.year || cur.year,
          image_url: r.fields.image_url || cur.image_url,
          barcode: /^\d{8,14}$/.test(c.replace(/\D/g, "")) ? c.replace(/\D/g, "") : cur.barcode,
          catalog_number: !/^\d{8,14}$/.test(c.replace(/\D/g, "")) ? c : cur.catalog_number,
        }));
        setScanMsg(`Found "${r.fields.title || c}" via ${r.source}. Check the details, then Save.`);
      } else {
        setScanMsg(`No match for ${c}. Try a UPC, catalog number, or exact title.`);
      }
    } catch {
      setScanMsg("Lookup failed. Enter the details by hand.");
    } finally {
      setLooking(false);
    }
  }

  function onScanned(scanned) {
    setScanning(false);
    setLookupValue(scanned.replace(/\D/g, ""));
    lookup(scanned);
  }

  async function useImageFile(file) {
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

  async function useImageUrl(url) {
    const clean = String(url || "").trim();
    if (!clean) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadImageFromUrl(clean);
      setV((cur) => ({ ...cur, image_url: uploaded }));
    } catch {
      // Many sites block browser-side image reads. Keep the dragged URL so the
      // cover still renders instead of failing the workflow.
      setV((cur) => ({ ...cur, image_url: clean }));
      setScanMsg("Using the dropped image URL. Save to keep it on this listing.");
    } finally {
      setUploading(false);
    }
  }

  function pickImage(e) {
    useImageFile(e.target.files?.[0]);
  }

  function droppedImageUrl(dt) {
    const uri = dt.getData("text/uri-list") || dt.getData("text/plain");
    if (/^https?:\/\//i.test(uri)) return uri.trim();
    const html = dt.getData("text/html");
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return match ? match[1] : "";
  }

  function dropImage(e) {
    e.preventDefault();
    setDragging(false);
    const file = Array.from(e.dataTransfer.files || []).find((f) => f.type.startsWith("image/"));
    if (file) {
      useImageFile(file);
      return;
    }
    useImageUrl(droppedImageUrl(e.dataTransfer));
  }

  function pasteImage(e) {
    const file = Array.from(e.clipboardData.files || []).find((f) => f.type.startsWith("image/"));
    if (file) useImageFile(file);
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
        barcode: v.barcode?.trim() || null,
        catalog_number: v.catalog_number?.trim() || null,
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
          <label>Autofill</label>
          <button type="button" className="btn ghost btn--block" onClick={() => { setScanMsg(null); setScanning(true); }}>
            Scan barcode
          </button>
          <div className="scaninput">
            <input
              type="text"
              placeholder="UPC, catalog no. or title"
              value={lookupValue}
              onChange={(e) => setLookupValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookup(); } }}
            />
            <button type="button" className="btn" onClick={() => lookup()} disabled={looking || !lookupValue.trim()}>
              {looking ? "Finding…" : "Find"}
            </button>
          </div>
        </div>

        <div className="formbox">
          <label>Cover image</label>
          <div
            className={`imgdrop${dragging ? " is-dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={dropImage}
            onPaste={pasteImage}
            tabIndex="0"
          >
            <div className="imgbox">
              {v.image_url ? (
                <MediaThumb item={v} size="form" />
              ) : (
                <span>Drop cover</span>
              )}
            </div>
            <div className="imgactions">
              <span className="dropcopy">Drag an image here, paste one, or upload.</span>
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

      <label>{creatorLabel}</label>
      <input
        value={v.artist || ""}
        onChange={set("artist")}
        placeholder={creatorPlaceholder}
      />

      <div className="grid2">
        <div>
          <label>Barcode / UPC / EAN</label>
          <input value={v.barcode || ""} onChange={set("barcode")} placeholder="012345678905" />
        </div>
        <div>
          <label>Catalog number</label>
          <input value={v.catalog_number || ""} onChange={set("catalog_number")} placeholder="D248042" />
        </div>
      </div>

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
