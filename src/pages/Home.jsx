import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { fetchListings, updateListing, formatMoney, TYPES } from "../data.js";
import { isConfigured } from "../supabaseClient.js";
import { useAuth } from "../auth.jsx";

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;
const sortKey = (s) => (s || "").replace(/^(the|a|an)\s+/i, "").toLowerCase();

async function groqEstimate(item) {
  const details = [
    `Format: ${item.type}`,
    `Title: ${item.title || "Unknown"}`,
    item.artist && `Artist/Studio: ${item.artist}`,
    item.year && `Year: ${item.year}`,
    item.media_condition && `Media: ${item.media_condition}`,
    item.case_condition && `Case: ${item.case_condition}`,
  ].filter(Boolean).join(", ");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are a physical media pricing expert. Respond with ONLY a short price range like '$2–5' or '$10–20' based on typical resale/thrift/eBay values. No explanation. Just the range.",
        },
        { role: "user", content: `Resale value: ${details}` },
      ],
      temperature: 0.2,
      max_tokens: 20,
    }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

const FMT_ABBR = { Cassette: "CAS", Vinyl: "VIN" };
const fmtLabel = (t) => FMT_ABBR[t] || t || "?";

function Thumb({ item }) {
  if (item.image_url)
    return <img className="thumb" src={item.image_url} alt="" loading="lazy" />;
  return <span className={"thumb placeholder t-" + (item.type || "").replace(/[^A-Za-z]/g, "")}>{fmtLabel(item.type)}</span>;
}

function shortCond(c) {
  if (!c || c === "Not Specified") return "—";
  return c.replace(/ \(.*?\)/, "");
}

export default function Home() {
  const { isOwner } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [sort, setSort] = useState("az");
  const [valChecking, setValChecking] = useState(false);
  const [valProgress, setValProgress] = useState(null); // {done, total}
  const [lastPulled, setLastPulled] = useState(() => localStorage.getItem("est_value_pulled") || null);

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return; }
    fetchListings()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const types = useMemo(
    () => ["All", ...TYPES.filter((t) => items.some((i) => i.type === t))],
    [items]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (type !== "All" && i.type !== type) return false;
      if (!q) return true;
      return (`${i.title} ${i.artist || ""} ${i.year || ""}`).toLowerCase().includes(q);
    });
  }, [items, query, type]);

  const byAZ = (a, b) => sortKey(a.title).localeCompare(sortKey(b.title));
  const byValue = (a, b) =>
    (Number(b.good_price) || 0) - (Number(a.good_price) || 0) || byAZ(a, b);
  const sorted = sort === "value" ? rows.slice().sort(byValue) : rows.slice().sort(byAZ);

  const totalPaid  = rows.reduce((s, i) => s + (Number(i.paid_price) || 1), 0);
  const totalEst   = rows.reduce((s, i) => s + parseEstValue(i.est_value), 0);

  function parseEstValue(str) {
    if (!str) return 0;
    const nums = str.match(/[\d.]+/g);
    if (!nums) return 0;
    const vals = nums.map(Number).filter(Boolean);
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  const checkAllValues = useCallback(async () => {
    if (!GROQ_KEY || !items.length) return;
    setValChecking(true);
    setValProgress({ done: 0, total: items.length });
    const updated = [...items];
    for (let i = 0; i < updated.length; i++) {
      try {
        const est = await groqEstimate(updated[i]);
        const saved = await updateListing(updated[i].id, { est_value: est });
        updated[i] = { ...updated[i], est_value: saved.est_value };
        setItems([...updated]);
      } catch {
        // skip failures silently
      }
      setValProgress({ done: i + 1, total: updated.length });
      if (i < updated.length - 1) await new Promise((r) => setTimeout(r, 300));
    }
    const ts = new Date().toLocaleString();
    localStorage.setItem("est_value_pulled", ts);
    setLastPulled(ts);
    setValChecking(false);
    setValProgress(null);
  }, [items]);

  return (
    <>
      <div className="controls">
        <div className="searchwrap solo">
          <input
            type="search"
            placeholder="Search a title or studio…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && <button className="clearbtn" onClick={() => setQuery("")}>×</button>}
        </div>
        <div className="filters">
          {types.map((t) => (
            <button key={t} className="chip" aria-pressed={t === type} onClick={() => setType(t)}>{t}</button>
          ))}
        </div>
      </div>

      {isConfigured && (
        <div className="metabar">
          <p className="meta">
            {rows.length} items
            {totalPaid > 0 && <> · paid <b>{formatMoney(totalPaid)}</b></>}
            {totalEst > 0 && <> · est. <b>{formatMoney(Math.round(totalEst))}</b></>}
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {GROQ_KEY && isOwner && (
              <button
                className="btn ghost"
                style={{ padding: "5px 12px", fontSize: "0.7rem" }}
                onClick={checkAllValues}
                disabled={valChecking}
              >
                {valChecking
                  ? `Checking… ${valProgress?.done}/${valProgress?.total}`
                  : "Check all values"}
              </button>
            )}
            <div className="sort">
              <button className="chip" aria-pressed={sort === "az"} onClick={() => setSort("az")}>A–Z</button>
              <button className="chip" aria-pressed={sort === "value"} onClick={() => setSort("value")}>Value</button>
            </div>
          </div>
        </div>
      )}

      {lastPulled && (
        <p className="val-timestamp">Est. values last pulled: {lastPulled}</p>
      )}

      {!isConfigured || loading ? (
        <div className="empty">{loading ? "Loading the collection…" : null}</div>
      ) : error ? (
        <div className="empty"><strong>Couldn't load listings.</strong> {error}</div>
      ) : !rows.length ? (
        <div className="empty">
          <strong>{items.length ? `Nothing matches "${query}".` : "No listings yet."}</strong>
        </div>
      ) : (
        <div className="coll-table-wrap">
          <table className="coll-table">
            <thead>
              <tr>
                <th></th>
                <th>Title</th>
                <th>Format</th>
                <th>Media</th>
                <th>Case</th>
                <th>Paid</th>
                <th>Est. Value</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((i) => (
                <tr key={i.id}>
                  <td className="col-thumb">
                    <Link to={`/listing/${i.id}`}><Thumb item={i} /></Link>
                  </td>
                  <td className="col-title">
                    <Link to={`/listing/${i.id}`} className="row-title">
                      {i.title || <em className="blank">Untitled</em>}
                    </Link>
                    {i.artist && <span className="row-sub">{i.artist}{i.year ? ` · ${i.year}` : ""}</span>}
                  </td>
                  <td className="col-type">
                    <span className={"tag t-" + (i.type || "").replace(/[^A-Za-z]/g, "")}>{fmtLabel(i.type)}</span>
                  </td>
                  <td className="col-cond">{shortCond(i.media_condition)}</td>
                  <td className="col-cond">{shortCond(i.case_condition)}</td>
                  <td className="col-price">{formatMoney(i.paid_price) || "$1"}</td>
                  <td className="col-est">
                    {i.est_value
                      ? <span className="est-val">{i.est_value}</span>
                      : <span className="est-empty">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
