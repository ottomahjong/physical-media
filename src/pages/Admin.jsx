import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { fetchListings, createListing, formatMoney } from "../data.js";
import { isConfigured } from "../supabaseClient.js";
import { useAuth } from "../auth.jsx";
import ListingForm from "../components/ListingForm.jsx";

export default function Admin() {
  const { isOwner, ready } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [list, setList] = useState("all");
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

  const rows = items.filter((i) => {
    if (list !== "all" && (i.list || "collection") !== list) return false;
    return (`${i.title} ${i.artist || ""}`).toLowerCase().includes(query.trim().toLowerCase());
  });

  return (
    <div className="admin">
      <div className="adminhead">
        <h2>Manage listings</h2>
        {!adding && (
          <button className="btn primary" onClick={() => setAdding(true)}>+ Add listing</button>
        )}
      </div>

      {adding && (
        <div className="panel">
          <h3>New listing</h3>
          <ListingForm initial={{}} onSave={add} onCancel={() => setAdding(false)} />
        </div>
      )}

      <div className="filters">
        {[["all", "All"], ["collection", "Collection"], ["wishlist", "Wish list"]].map(([val, label]) => (
          <button
            key={val}
            className="chip"
            aria-pressed={list === val}
            onClick={() => setList(val)}
          >
            {label}
          </button>
        ))}
      </div>

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
          <div className="meta">{rows.length} of {items.length} listings</div>
          {rows.map((i) => (
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
                <span className="badge">{(i.list || "collection") === "wishlist" ? "Wish list" : i.status || "Available"}</span>
              </span>
            </Link>
          ))}
          {!rows.length && <div className="empty">No listings match.</div>}
        </div>
      )}
    </div>
  );
}
