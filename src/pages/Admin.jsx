import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { fetchListings, createListing, formatMoney } from "../data.js";
import { isConfigured } from "../supabaseClient.js";
import { useAuth } from "../auth.jsx";
import ListingForm from "../components/ListingForm.jsx";
import { CategoryPill, MediaThumb } from "../components/MediaBits.jsx";

export default function Admin() {
  const { isOwner, ready } = useAuth();
  const navigate = useNavigate();
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
          {!!rows.length && (
            <div className="tablewrap">
              <table className="ctable">
                <thead>
                  <tr>
                    <th className="colhide col-thumb"></th>
                    <th>Title</th>
                    <th>Artists / Studio</th>
                    <th className="colhide">Year</th>
                    <th className="colhide">Category</th>
                    <th className="colhide">Condition</th>
                    <th className="colhide">Status</th>
                    <th className="colhide num">Price Paid</th>
                    <th className="num">Est. Value</th>
                    <th className="num">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id} onClick={() => navigate(`/listing/${i.id}`)} className="crow">
                      <td className="colhide col-thumb"><MediaThumb item={i} /></td>
                      <td className="ctitle">{i.title || <em className="blank">— untitled —</em>}</td>
                      <td className="cby">{i.artist || "—"}</td>
                      <td className="colhide">{i.year || "—"}</td>
                      <td className="colhide">{i.type ? <CategoryPill type={i.type} /> : "—"}</td>
                      <td className="colhide">{i.condition || "—"}</td>
                      <td className="colhide">{i.status || "—"}</td>
                      <td className="colhide num">{formatMoney(i.used_price) || "—"}</td>
                      <td className="num cval">{formatMoney(i.good_price) || "—"}</td>
                      <td className="num">{i.quantity || 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!rows.length && <div className="empty">No listings match.</div>}
        </div>
      )}
    </div>
  );
}
