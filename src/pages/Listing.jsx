import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { fetchListing, updateListing, deleteListing } from "../data.js";
import { isConfigured } from "../supabaseClient.js";
import { useAuth } from "../auth.jsx";
import { groqDetail } from "../pricing.js";
import ListingForm from "../components/ListingForm.jsx";

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;

// Pull the leading "$5–10" style range out of the detailed estimate so the
// stored Est. value stays in sync with what the detail page just reported.
function extractRange(text) {
  const m = (text || "").match(/\$\s?\d[\d,]*(?:\.\d+)?\s*[–\-—]?\s*\$?\s?\d*[\d,]*(?:\.\d+)?/);
  return m ? m[0].replace(/\s+/g, "") : null;
}

export default function Listing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isOwner } = useAuth();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [groqResult, setGroqResult] = useState(null);
  const [groqBusy, setGroqBusy] = useState(false);
  const [groqError, setGroqError] = useState(null);

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return; }
    fetchListing(id)
      .then(setItem)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function save(payload) {
    const updated = await updateListing(id, payload);
    setItem(updated);
    setEditing(false);
  }

  async function remove() {
    if (!confirm("Delete this listing permanently?")) return;
    await deleteListing(id);
    navigate("/");
  }

  async function checkValue() {
    setGroqBusy(true); setGroqError(null); setGroqResult(null);
    try {
      const text = await groqDetail(item);
      setGroqResult(text);
      // Keep the stored Est. value consistent with this fresh estimate.
      const range = extractRange(text);
      if (range && range !== item.est_value) {
        const updated = await updateListing(id, { est_value: range });
        setItem(updated);
      }
    }
    catch (e) { setGroqError(e.message); }
    finally { setGroqBusy(false); }
  }

  if (loading) return <div className="empty">Loading…</div>;
  if (error) return <div className="empty"><strong>Couldn't load this listing.</strong> {error}</div>;
  if (!item) return <div className="empty">Not found. <Link to="/">Back to the collection</Link></div>;

  if (editing) {
    return (
      <div className="panel">
        <Link to="/" className="back">← Back</Link>
        <h2>Edit listing</h2>
        <ListingForm initial={item} onSave={save} onCancel={() => setEditing(false)} onDelete={remove} />
      </div>
    );
  }

  return (
    <div className="detail">
      <Link to="/" className="back">← Back to the collection</Link>
      <div className="detailcard">
        <div className="detailimg">
          {item.image_url
            ? <img src={item.image_url} alt={item.title} />
            : <span className="placeholder big">{item.type}</span>}
        </div>
        <div className="detailinfo">
          <span className={"tag t-" + (item.type || "").replace(/[^A-Za-z]/g, "")}>{item.type}</span>
          <h2>{item.title || <em style={{ color: "var(--fg-muted)" }}>Untitled</em>}</h2>
          {item.artist && <p className="dsub">{item.artist}{item.year ? ` · ${item.year}` : ""}</p>}

          <dl className="facts">
            {item.genre           && (<><dt>Genre</dt><dd>{item.genre}</dd></>)}
            {item.media_condition && (<><dt>Media</dt><dd>{item.media_condition}</dd></>)}
            {item.case_condition  && (<><dt>Case</dt><dd>{item.case_condition}</dd></>)}
            {item.status          && (<><dt>Status</dt><dd>{item.status}</dd></>)}
            {item.quantity > 1    && (<><dt>Qty</dt><dd>{item.quantity}</dd></>)}
            {item.paid_price != null && (<><dt>Paid</dt><dd>${item.paid_price}</dd></>)}
            {item.est_value       && (<><dt>Est. value</dt><dd>{item.est_value}</dd></>)}
          </dl>

          {item.notes && <p className="notes">{item.notes}</p>}

          {GROQ_KEY && (
            <div className="groq-block">
              <button className="btn ghost" onClick={checkValue} disabled={groqBusy}>
                {groqBusy ? "Checking market value…" : "Check current market value"}
              </button>
              {groqError && <p className="err" style={{ marginTop: 8 }}>{groqError}</p>}
              {groqResult && (
                <div className="groq-result">
                  <p className="groq-eyebrow">AI market estimate</p>
                  <p>{groqResult}</p>
                </div>
              )}
            </div>
          )}

          {isOwner && (
            <div className="formbtns">
              <button className="btn primary" onClick={() => setEditing(true)}>Edit</button>
              <button className="btn danger" onClick={remove}>Delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
