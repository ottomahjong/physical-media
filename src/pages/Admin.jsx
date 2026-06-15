import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { fetchListings, createListing, deleteListing, formatMoney, TYPES } from "../data.js";
import { isConfigured } from "../supabaseClient.js";
import { useAuth } from "../auth.jsx";
import ListingForm from "../components/ListingForm.jsx";

const BATCH_PLACEHOLDER = `VHS,The Lion King,Walt Disney,1994,1,3
DVD,Frozen,Walt Disney,2013,4,7
CD,Breakaway,Kelly Clarkson,2004,2,4`;

function parseBatchCSV(text) {
  const rows = [];
  const errors = [];
  text.split("\n").forEach((line, i) => {
    const raw = line.trim();
    if (!raw) return;
    const parts = raw.split(",").map((s) => s.trim());
    if (parts.length < 2) { errors.push(`Line ${i + 1}: need at least type and title`); return; }
    const [type, title, artist, year, used_price, good_price] = parts;
    if (!title) { errors.push(`Line ${i + 1}: title is required`); return; }
    rows.push({
      type: TYPES.includes(type) ? type : "VHS",
      title,
      artist: artist || null,
      year: year || null,
      quantity: 1,
      condition: "Good",
      status: "Available",
      used_price: used_price ? Number(used_price) : null,
      good_price: good_price ? Number(good_price) : null,
      notes: null,
      image_url: null,
    });
  });
  return { rows, errors };
}

export default function Admin() {
  const { isOwner, ready } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [batchMode, setBatchMode] = useState(null); // null | "add" | "remove"
  const [batchText, setBatchText] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [query, setQuery] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isConfigured || !isOwner) { setLoading(false); return; }
    fetchListings()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOwner]);

  if (!ready) return <div className="empty">Loading…</div>;
  if (!isOwner) return <Navigate to="/login" replace />;

  async function add(payload) {
    const created = await createListing(payload);
    setItems((cur) => [...cur, created].sort((a, b) => a.title.localeCompare(b.title)));
    setAdding(false);
  }

  async function doBatchAdd() {
    setBatchError(null);
    const { rows, errors } = parseBatchCSV(batchText);
    if (errors.length) { setBatchError(errors.join("\n")); return; }
    if (!rows.length) { setBatchError("Nothing to add — paste at least one row."); return; }
    setBatchBusy(true);
    try {
      const created = await Promise.all(rows.map(createListing));
      setItems((cur) =>
        [...cur, ...created].sort((a, b) => a.title.localeCompare(b.title))
      );
      setBatchMode(null);
      setBatchText("");
    } catch (e) {
      setBatchError(e.message);
    } finally {
      setBatchBusy(false);
    }
  }

  async function doBatchRemove() {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} listing${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBatchBusy(true);
    try {
      await Promise.all([...selected].map(deleteListing));
      setItems((cur) => cur.filter((i) => !selected.has(i.id)));
      setSelected(new Set());
      setBatchMode(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBatchBusy(false);
    }
  }

  function toggleSelect(id) {
    setSelected((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll(visibleIds) {
    setSelected((cur) => {
      const allSelected = visibleIds.every((id) => cur.has(id));
      const next = new Set(cur);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  const rows = items.filter((i) =>
    (`${i.title} ${i.artist || ""}`).toLowerCase().includes(query.trim().toLowerCase())
  );
  const visibleIds = rows.map((i) => i.id);

  function cancelBatch() {
    setBatchMode(null);
    setBatchText("");
    setBatchError(null);
    setSelected(new Set());
  }

  return (
    <div className="admin">
      <div className="adminhead">
        <h2>Manage listings</h2>
        <div className="admin-actions">
          {!adding && batchMode === null && (
            <>
              <button className="btn primary" onClick={() => setAdding(true)}>+ Add one</button>
              <button className="btn ghost" onClick={() => setBatchMode("add")}>+ Batch add</button>
              <button className="btn ghost" onClick={() => { setBatchMode("remove"); setSelected(new Set()); }}>
                Batch remove
              </button>
            </>
          )}
        </div>
      </div>

      {adding && (
        <div className="panel">
          <h3>New listing</h3>
          <ListingForm initial={{}} onSave={add} onCancel={() => setAdding(false)} />
        </div>
      )}

      {batchMode === "add" && (
        <div className="panel">
          <h3>Batch add</h3>
          <p className="note">
            Paste one item per line as: <code>Type, Title, Artist, Year, Used$, Good$</code>
          </p>
          <textarea
            rows={8}
            placeholder={BATCH_PLACEHOLDER}
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
          />
          <p className="batch-hint">
            Type must be one of: {TYPES.join(", ")}. Artist, Year, and prices are optional.
            Defaults: condition = Good, status = Available, quantity = 1.
          </p>
          {batchError && <pre className="err" style={{ whiteSpace: "pre-wrap" }}>{batchError}</pre>}
          <div className="formbtns">
            <button className="btn primary" onClick={doBatchAdd} disabled={batchBusy || !batchText.trim()}>
              {batchBusy ? "Adding…" : `Add ${parseBatchCSV(batchText).rows.length || ""} items`}
            </button>
            <button className="btn ghost" onClick={cancelBatch}>Cancel</button>
          </div>
        </div>
      )}

      {batchMode === "remove" && selected.size > 0 && (
        <div className="batch-bar">
          <span>{selected.size} selected</span>
          <button className="btn danger" onClick={doBatchRemove} disabled={batchBusy}>
            {batchBusy ? "Deleting…" : `Delete ${selected.size}`}
          </button>
          <button className="btn ghost" onClick={cancelBatch}>Cancel</button>
        </div>
      )}

      {batchMode === "remove" && selected.size === 0 && (
        <div className="batch-bar">
          <span>Check items below to select them for removal.</span>
          <button className="btn ghost" onClick={cancelBatch} style={{ marginLeft: "auto" }}>Cancel</button>
        </div>
      )}

      <div className="searchwrap solo">
        <input
          type="search"
          placeholder="Filter your listings…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && <p className="err">{error}</p>}
      {loading ? (
        <div className="empty">Loading…</div>
      ) : (
        <div className="adminlist">
          <div className="meta" style={{ marginBottom: 6 }}>
            {rows.length} of {items.length} listings
            {batchMode === "remove" && rows.length > 0 && (
              <button
                className="btn ghost"
                style={{ marginLeft: 12, padding: "3px 10px", fontSize: "0.7rem" }}
                onClick={() => toggleAll(visibleIds)}
              >
                {visibleIds.every((id) => selected.has(id)) ? "Deselect all" : "Select all"}
              </button>
            )}
          </div>
          {rows.map((i) => (
            batchMode === "remove" ? (
              <label key={i.id} className="adminrow" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selected.has(i.id)}
                  onChange={() => toggleSelect(i.id)}
                />
                <span className="athumb">
                  {i.image_url ? <img src={i.image_url} alt="" /> : <span>{i.type}</span>}
                </span>
                <span className="info">
                  <span className="title">{i.title}</span>
                  <span className="by">{[i.type, i.artist, i.year].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="aval">
                  <span className="good">{formatMoney(i.good_price) || "—"}</span>
                </span>
              </label>
            ) : (
              <Link key={i.id} to={`/listing/${i.id}`} className="adminrow">
                <span className="athumb">
                  {i.image_url ? <img src={i.image_url} alt="" /> : <span>{i.type}</span>}
                </span>
                <span className="info">
                  <span className="title">{i.title}</span>
                  <span className="by">{[i.type, i.artist, i.year].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="aval">
                  <span className="good">{formatMoney(i.good_price) || "—"}</span>
                  <span className="badge">{i.status || "Available"}</span>
                </span>
              </Link>
            )
          ))}
          {!rows.length && <div className="empty">No listings match.</div>}
        </div>
      )}
    </div>
  );
}
