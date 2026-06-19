import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchListings, formatMoney, getListingEstimatedValue, TYPES } from "../data.js";
import { isConfigured } from "../supabaseClient.js";
import { CategoryPill, MediaThumb } from "../components/MediaBits.jsx";

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


export default function Home() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [sortState, setSortState] = useState({ key: "title", dir: "asc" });
  const [list, setList] = useState("collection");
  const navigate = useNavigate();

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return; }
    fetchListings()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const listItems = useMemo(
    () => items.filter((i) => (i.list || "collection") === list),
    [items, list]
  );

  const types = useMemo(
    () => ["All", ...TYPES.filter((t) => listItems.some((i) => i.type === t))],
    [listItems]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let r = listItems.filter((i) => {
      if (type !== "All" && i.type !== type) return false;
      if (!q) return true;
      return (`${i.title} ${i.artist || ""} ${i.year || ""}`).toLowerCase().includes(q);
    });
    return sortItems(r, sortState);
  }, [listItems, query, type, sortState]);

  const wishlistCount = useMemo(
    () => items.filter((i) => (i.list || "collection") === "wishlist").length,
    [items]
  );

  const totalValue = rows.reduce((s, i) => s + (Number(getListingEstimatedValue(i)) || 0) * (Number(i.quantity) || 1), 0);
  const totalPaid = rows.reduce((s, i) => s + (Number(i.used_price) || 0) * (Number(i.quantity) || 1), 0);

  function switchList(next) {
    setList(next);
    setType("All");
    setQuery("");
  }

  function sortBy(key) {
    setSortState((cur) => ({ key, dir: cur.key === key && cur.dir === "asc" ? "desc" : "asc" }));
  }

  function sortLabel(key) {
    if (sortState.key !== key) return "";
    return sortState.dir === "asc" ? " ▲" : " ▼";
  }

  let body;
  if (!isConfigured) {
    body = null;
  } else if (loading) {
    body = <div className="empty">Loading the inventory…</div>;
  } else if (error) {
    body = (
      <div className="empty">
        <strong>Couldn't load listings.</strong>
        {error}
      </div>
    );
  } else if (!rows.length) {
    const emptyList = list === "wishlist" ? "Your wish list is empty." : "No listings yet.";
    body = (
      <div className="empty">
        <strong>{listItems.length ? `Nothing matches "${query}".` : emptyList}</strong>
        {listItems.length ? "Try fewer letters or another filter." : "Log in as the owner to add your first one."}
      </div>
    );
  } else {
    body = (
      <div className="tablewrap">
        <div className="tableSummary">Shown value {formatMoney(totalValue) || "$0"}</div>
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
    );
  }

  return (
    <>
      {isConfigured && (
        <div className="listtabs">
          <button
            className="listtab"
            aria-pressed={list === "collection"}
            onClick={() => switchList("collection")}
          >
            Collection
          </button>
          <button
            className="listtab"
            aria-pressed={list === "wishlist"}
            onClick={() => switchList("wishlist")}
          >
            Wish list{wishlistCount ? ` (${wishlistCount})` : ""}
          </button>
        </div>
      )}

      <div className="controls">
        <div className="searchwrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
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
            <button
              key={t}
              className="chip"
              aria-pressed={t === type}
              onClick={() => setType(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {isConfigured && (
        <div className="metabar">
          <p className="meta">
            {rows.length} items · est. value <b>{formatMoney(totalValue) || "$0"}</b> ·{" "}
            {formatMoney(totalPaid) || "$0"} paid
          </p>
          <div className="sort">
            <button className="chip" aria-pressed={sortState.key === "title" && sortState.dir === "asc"} onClick={() => setSortState({ key: "title", dir: "asc" })}>A–Z</button>
            <button className="chip" aria-pressed={sortState.key === "estimated_value" && sortState.dir === "desc"} onClick={() => setSortState({ key: "estimated_value", dir: "desc" })}>Value</button>
          </div>
        </div>
      )}

      <div className="list">{body}</div>
    </>
  );
}
