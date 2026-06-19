import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchListings, formatMoney, getListingEstimatedValue, TYPES } from "../data.js";
import { isConfigured } from "../supabaseClient.js";
import { CategoryPill, MediaThumb } from "../components/MediaBits.jsx";

const sortKey = (s) => (s || "").replace(/^(the|a|an)\s+/i, "").toLowerCase();

export default function Home() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [sort, setSort] = useState("az");
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
    const byAZ = (a, b) => sortKey(a.title).localeCompare(sortKey(b.title));
    if (sort === "value") {
      r = r.slice().sort((a, b) => (Number(getListingEstimatedValue(b)) || 0) - (Number(getListingEstimatedValue(a)) || 0) || byAZ(a, b));
    } else {
      r = r.slice().sort(byAZ);
    }
    return r;
  }, [listItems, query, type, sort]);

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
            <button className="chip" aria-pressed={sort === "az"} onClick={() => setSort("az")}>A–Z</button>
            <button className="chip" aria-pressed={sort === "value"} onClick={() => setSort("value")}>Value</button>
          </div>
        </div>
      )}

      <div className="list">{body}</div>
    </>
  );
}
