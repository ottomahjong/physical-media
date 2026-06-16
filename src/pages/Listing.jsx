import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { fetchListing, updateListing, deleteListing } from "../data.js";
import { isConfigured } from "../supabaseClient.js";
import { useAuth } from "../auth.jsx";
import ListingForm from "../components/ListingForm.jsx";

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;

async function fetchGroqValue(item) {
  const isMint = (c) => c && (c.includes("Mint") || c.includes("NM"));
  const mint = isMint(item.media_condition) && isMint(item.case_condition);

  const details = [
    `Format: ${item.type}`,
    `Title: ${item.title || "Unknown"}`,
    item.artist && `Artist/Studio: ${item.artist}`,
    item.year && `Year: ${item.year}`,
    item.media_condition && `Media: ${item.media_condition}`,
    item.case_condition && `Case: ${item.case_condition}`,
    item.notes && `Notes: ${item.notes}`,
  ].filter(Boolean).join("\n");

  const priceInstruction = mint
    ? "This item is in mint/near-mint condition. Give the full market range including top-end collector pricing."
    : "Give the LOW-TO-MID market price range only — what a typical thrift/yard sale buyer would realistically sell it for, not the optimistic ceiling.";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are a physical media resale pricing expert. ${priceInstruction} Respond in under 120 words. Include the price range, key factors, and whether it's in demand.`,
        },
        { role: "user", content: `Market value for:\n${details}` },
      ],
      temperature: 0.2,
      max_tokens: 250,
    }),
  });
  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
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
    try { setGroqResult(await fetchGroqValue(item)); }
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
