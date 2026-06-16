import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchListings, formatMoney, TYPES } from "../data.js";
import { isConfigured } from "../supabaseClient.js";

const sortKey = (s) => (s || "").replace(/^(the|a|an)\s+/i, "").toLowerCase();

function Thumb({ item }) {
  if (item.image_url) {
    return <img className="thumb" src={item.image_url} alt="" loading="lazy" />;
  }
  return <span className={"thumb placeholder t-" + (item.type || "").replace(/[^A-Za-z]/g, "")}>{item.type || "?"}</span>;
}

export default function Home() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [sort, setSort] = useState("az");

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
    let r = items.filter((i) => {
      if (type !== "All" && i.type !== type) return false;
      if (!q) return true;
      return (`${i.title} ${i.artist || ""} ${i.year || ""}`).toLowerCase().includes(q);
    });
    return r;
  }, [items, query, type]);

  const totalGood = rows.reduce((s, i) => s + (Number(i.good_price) || 0), 0);
  const totalUsed = rows.reduce((s, i) => s + (Number(i.used_price) || 0), 0);

  const byAZ = (a, b) => sortKey(a.title).localeCompare(sortKey(b.title));
  const byValue = (a, b) =>
    (Number(b.good_price) || 0) - (Number(a.good_price) || 0) || byAZ(a, b);

  function Row({ i }) {
    const sub = [i.artist, i.year].filter(Boolean).join(" · ");
    const good = formatMoney(i.good_price);
    const used = formatMoney(i.used_price);
    return (
      <Link to={`/listing/${i.id}`} className="item">
        <Thumb item={i} />
        <span className="info">
          <span className="title">{i.title || <em className="blank">— untitled —</em>}</span>
          {sub && <span className="by">{sub}</span>}
        </span>
        <span className="val">
          {good || used ? (
            <>
              <span className="good">{good || "—"}</span>
              <span className="used">used {used || "—"}</span>
            </>
          ) : (
            <span className="none">—</span>
          )}
        </span>
      </Link>
    );
  }

  let body;
  if (!isConfigured) {
    body = null;
  } else if (loading) {
    body = <div className="empty">Loading the collection…</div>;
  } else if (error) {
    body = (
      <div className="empty">
        <strong>Couldn't load listings.</strong>
        {error}
      </div>
    );
  } else if (!rows.length) {
    body = (
      <div className="empty">
        <strong>{items.length ? `Nothing matches "${query}".` : "No listings yet."}</strong>
        {items.length ? "Try fewer letters or another filter." : "Log in as the owner to add your first one."}
      </div>
    );
  } else if (sort === "value") {
    body = rows.slice().sort(byValue).map((i) => <Row key={i.id} i={i} />);
  } else {
    body = [];
    TYPES.forEach((t) => {
      const g = rows.filter((r) => r.type === t).sort(byAZ);
      if (!g.length) return;
      if (type === "All") body.push(<div key={"h" + t} className="group-label">{t}</div>);
      g.forEach((i) => body.push(<Row key={i.id} i={i} />));
    });
  }

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
            {rows.length} items · est. <b>{formatMoney(totalGood) || "$0"}</b> good ·{" "}
            {formatMoney(totalUsed) || "$0"} used
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
