import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { fetchListing, updateListing, deleteListing, formatMoney } from "../data.js";
import { isConfigured } from "../supabaseClient.js";
import { useAuth } from "../auth.jsx";
import ListingForm from "../components/ListingForm.jsx";

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;

async function fetchGroqValue(item) {
  const details = [
    `Format: ${item.type}`,
    `Title: ${item.title || "Unknown"}`,
    item.artist && `Artist/Studio: ${item.artist}`,
    item.year && `Year: ${item.year}`,
    item.media_condition && `Media condition: ${item.media_condition}`,
    item.case_condition && `Case condition: ${item.case_condition}`,
    item.notes && `Notes: ${item.notes}`,
  ].filter(Boolean).join("\n");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are a physical media collector and reseller expert. Given item details, provide a concise current market value estimate based on recent eBay sold listings, Discogs, and collector markets. Include a price range for 'used' and 'good/excellent' condition, note any factors affecting value, and mention if it's particularly sought after. Keep the response under 150 words.",
        },
        {
          role: "user",
          content: `What is the current resale market value for this item?\n\n${details}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });
  if (!res.ok) throw new Error(`Groq API error: ${res.status}`);
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
    setGroqBusy(true);
    setGroqError(null);
    setGroqResult(null);
    try {
      const result = await fetchGroqValue(item);
      setGroqResult(result);
    } catch (e) {
      setGroqError(e.message);
    } finally {
      setGroqBusy(false);
    }
  }

  if (loading) return <div className="empty">Loading…</div>;
  if (error) return <div className="empty"><strong>Couldn't load this listing.</strong>{error}</div>;
  if (!item) return <div className="empty">Not found. <Link to="/">Back to the collection</Link></div>;

  if (editing) {
    return (
      <div className="panel">
        <Link to="/" className="back">← Back</Link>
        <h2>Edit listing</h2>
        <ListingForm
          initial={item}
          onSave={save}
          onCancel={() => setEditing(false)}
          onDelete={remove}
        />
      </div>
    );
  }

  const good = formatMoney(item.good_price);
  const used = formatMoney(item.used_price);

  return (
    <div className="detail">
      <Link to="/" className="back">← Back to the collection</Link>
      <div className="detailcard">
        <div className="detailimg">
          {item.image_url ? (
            <img src={item.image_url} alt={item.title} />
          ) : (
            <span className="placeholder big">{item.type}</span>
          )}
        </div>
        <div className="detailinfo">
          <span className={"tag t-" + (item.type || "").replace(/[^A-Za-z]/g, "")}>{item.type}</span>
          <h2>{item.title || <em style={{ color: "var(--fg-muted)" }}>Untitled</em>}</h2>
          {item.artist && <p className="dsub">{item.artist}{item.year ? ` · ${item.year}` : ""}</p>}

          <dl className="facts">
            {item.media_condition && (<><dt>Media</dt><dd>{item.media_condition}</dd></>)}
            {item.case_condition && (<><dt>Case</dt><dd>{item.case_condition}</dd></>)}
            {item.status && (<><dt>Status</dt><dd>{item.status}</dd></>)}
            {item.quantity > 1 && (<><dt>Quantity</dt><dd>{item.quantity}</dd></>)}
            <dt>Good price</dt><dd>{good || "—"}</dd>
            <dt>Used price</dt><dd>{used || "—"}</dd>
          </dl>

          {item.notes && <p className="notes">{item.notes}</p>}

          {/* Groq value check — only shown when API key is configured */}
          {GROQ_KEY && (
            <div className="groq-block">
              <button
                className="btn ghost"
                onClick={checkValue}
                disabled={groqBusy}
              >
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
