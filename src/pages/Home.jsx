import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchListings, formatMoney, getListingEstimatedValue, TYPES } from "../data.js";
import { isConfigured } from "../supabaseClient.js";
import { ListingTable, columnsFor, sortItems, isWishlist } from "../components/listingTable.jsx";

export default function Home() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [sortState, setSortState] = useState({ key: "title", dir: "asc" });
  const [list, setList] = useState("collection");
  const navigate = useNavigate();
  const wish = isWishlist(list);

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
    const r = listItems.filter((i) => {
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
    const emptyList = wish ? "Your wish list is empty." : "No listings yet.";
    body = (
      <div className="empty">
        <strong>{listItems.length ? `Nothing matches "${query}".` : emptyList}</strong>
        {listItems.length ? "Try fewer letters or another filter." : "Log in as the owner to add your first one."}
      </div>
    );
  } else {
    body = (
      <ListingTable
        rows={rows}
        columns={columnsFor(list)}
        sortState={sortState}
        onSortBy={sortBy}
        onRowClick={(i) => navigate(`/listing/${i.id}`)}
        summaryValue={totalValue}
        wish={wish}
      />
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
            {rows.length} items · est. value <b>{formatMoney(totalValue) || "$0"}</b>
            {!wish && <> · {formatMoney(totalPaid) || "$0"} paid</>}
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
