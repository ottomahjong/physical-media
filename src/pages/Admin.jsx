import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { fetchListings, createListing, formatMoney, getListingEstimatedValue, isPriceStale, saveListingValue } from "../data.js";
import { isConfigured } from "../supabaseClient.js";
import { useAuth } from "../auth.jsx";
import ListingForm from "../components/ListingForm.jsx";
import { CategoryPill, MediaThumb } from "../components/MediaBits.jsx";
import { valueLookupBatch } from "../values.js";

const sortKey = (s) => (s || "").replace(/^(the|a|an)\s+/i, "").toLowerCase();

const columns = [
  { key: "title", label: "Title" },
  { key: "artist", label: "Artists / Studio" },
  { key: "year", label: "Year", className: "colhide" },
  { key: "type", label: "Category", className: "colhide" },
  { key: "condition", label: "Condition", className: "colhide" },
  { key: "status", label: "Status", className: "colhide" },
  { key: "used_price", label: "Price Paid", className: "colhide num" },
  { key: "estimated_value", label: "Est. Value", className: "num" },
  { key: "quantity", label: "Qty", className: "num" },
];

function columnValue(item, key) {
  if (key === "estimated_value") return Number(getListingEstimatedValue(item)) || 0;
  if (["used_price", "quantity"].includes(key)) return Number(item[key]) || 0;
  if (key === "title") return sortKey(item.title);
  return String(item[key] || "").toLowerCase();
}

function sortItems(items, sortState) {
  return items.slice().sort((a, b) => {
    const av = columnValue(a, sortState.key);
    const bv = columnValue(b, sortState.key);
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return (sortState.dir === "asc" ? cmp : -cmp) || sortKey(a.title).localeCompare(sortKey(b.title));
  });
}

function isMissingMarketValueSchemaError(error) {
  return /schema cache|Could not find .* column|column .* does not exist/i.test(error?.message || "");
}

export default function Admin() {
  const { isOwner, ready } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [list, setList] = useState("all");
  const [sortState, setSortState] = useState({ key: "title", dir: "asc" });
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState(null);

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

  async function refreshRows(targets) {
    if (!targets.length) return;
    setError(null);
    setRefreshing(true);
    setProgress(`Refreshing 0 of ${targets.length}`);
    let done = 0;
    for (let i = 0; i < targets.length; i += 3) {
      const chunk = targets.slice(i, i + 3);
      try {
        const batch = await valueLookupBatch(chunk, { force: true });
        await Promise.all((batch.results || []).map(async (result, idx) => {
          const id = result.listing_id || chunk[idx]?.id;
          if (!id) return;
          const updated = await saveListingValue(id, result);
          setItems((cur) => cur.map((item) => item.id === id ? { ...item, ...updated } : item));
        }));
      } catch (err) {
        if (isMissingMarketValueSchemaError(err)) {
          setProgress("Market-value migration has not been applied yet; refresh skipped without changing listings.");
          break;
        }
        setError(err.message || "Some values failed to refresh.");
      }
      done += chunk.length;
      setProgress(`Refreshing ${Math.min(done, targets.length)} of ${targets.length}`);
    }
    setRefreshing(false);
  }

  function sortBy(key) {
    setSortState((cur) => ({ key, dir: cur.key === key && cur.dir === "asc" ? "desc" : "asc" }));
  }

  function sortLabel(key) {
    if (sortState.key !== key) return "";
    return sortState.dir === "asc" ? " ▲" : " ▼";
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((i) => {
      if (list !== "all" && (i.list || "collection") !== list) return false;
      return (`${i.title} ${i.artist || ""}`).toLowerCase().includes(q);
    });
    return sortItems(filtered, sortState);
  }, [items, list, query, sortState]);

  const shownValue = rows.reduce((sum, item) => sum + (Number(getListingEstimatedValue(item)) || 0) * (Number(item.quantity) || 1), 0);

  return (
    <div className="admin">
      <div className="adminhead">
        <h2>Manage listings</h2>
        {!adding && (
          <div className="adminactions">
            <button className="btn ghost" disabled={refreshing} onClick={() => refreshRows(items.filter((i) => isPriceStale(i)))}>{refreshing ? "Refreshing…" : "Refresh stale values"}</button>
            <button className="btn primary" onClick={() => setAdding(true)}>+ Add listing</button>
          </div>
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
      {progress && <p className="progressText">{progress}</p>}
      {loading ? (
        <div className="empty">Loading…</div>
      ) : (
        <div className="adminlist">
          <div className="meta">{rows.length} of {items.length} listings</div>
          {!!rows.length && (
            <div className="tablewrap">
              <div className="tableSummary">Shown value {formatMoney(shownValue) || "$0"}</div>
              <table className="ctable">
                <thead>
                  <tr>
                    <th className="colhide col-thumb"></th>
                    {columns.map((col) => (
                      <th key={col.key} className={col.className || ""}>
                        <button type="button" className="sorthead" onClick={() => sortBy(col.key)}>
                          {col.label}{sortLabel(col.key)}
                        </button>
                      </th>
                    ))}
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
                      <td className="num cval">{formatMoney(getListingEstimatedValue(i)) || "—"}</td>
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
