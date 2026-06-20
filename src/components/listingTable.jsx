import { CategoryPill, MediaThumb } from "./MediaBits.jsx";
import { formatMoney, getListingEstimatedValue } from "../data.js";

const sortKey = (s) => (s || "").replace(/^(the|a|an)\s+/i, "").toLowerCase();

// Column definitions shared by the Home and Manage tables.
export const COLUMNS = {
  thumb: { key: "thumb", label: "", className: "col-thumb", sortable: false, render: (i) => <MediaThumb item={i} /> },
  title: { key: "title", label: "Title", className: "ctitle", render: (i) => i.title || <em className="blank">— untitled —</em> },
  artist: { key: "artist", label: "Artists / Studio", className: "cby", render: (i) => i.artist || "—" },
  year: { key: "year", label: "Year", render: (i) => i.year || "—" },
  type: { key: "type", label: "Category", render: (i) => (i.type ? <CategoryPill type={i.type} /> : "—") },
  condition: { key: "condition", label: "Condition", render: (i) => i.condition || "—" },
  status: { key: "status", label: "Status", render: (i) => i.status || "—" },
  used_price: { key: "used_price", label: "Price Paid", className: "num", render: (i) => formatMoney(i.used_price) || "—" },
  estimated_value: { key: "estimated_value", label: "Est. Value", className: "num cval", render: (i) => formatMoney(getListingEstimatedValue(i)) || "—" },
  quantity: { key: "quantity", label: "Qty", className: "num", render: (i) => i.quantity || 1 },
};

const COLLECTION_COLUMNS = ["thumb", "title", "artist", "year", "type", "condition", "status", "used_price", "estimated_value", "quantity"];
// Wish-list items aren't owned yet, so condition / status / price paid / qty
// don't apply — show only what you'd shop with.
const WISHLIST_COLUMNS = ["thumb", "title", "artist", "type", "estimated_value"];

export const isWishlist = (list) => list === "wishlist";

export function columnsFor(list) {
  return (isWishlist(list) ? WISHLIST_COLUMNS : COLLECTION_COLUMNS).map((k) => COLUMNS[k]);
}

export function sortItems(items, sortState) {
  const val = (item, key) => {
    if (key === "estimated_value") return Number(getListingEstimatedValue(item)) || 0;
    if (["used_price", "quantity"].includes(key)) return Number(item[key]) || 0;
    if (key === "title") return sortKey(item.title);
    return String(item[key] || "").toLowerCase();
  };
  return items.slice().sort((a, b) => {
    const av = val(a, sortState.key);
    const bv = val(b, sortState.key);
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return (sortState.dir === "asc" ? cmp : -cmp) || sortKey(a.title).localeCompare(sortKey(b.title));
  });
}

export function ListingTable({ rows, columns, sortState, onSortBy, onRowClick, summaryValue, wish }) {
  const arrow = (key) => (sortState?.key === key ? (sortState.dir === "asc" ? " ▲" : " ▼") : "");
  return (
    <div className="tablewrap">
      {summaryValue != null && <div className="tableSummary">Shown value {formatMoney(summaryValue) || "$0"}</div>}
      <table className={`ctable${wish ? " ctable--wish" : ""}`}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className || ""}>
                {col.sortable === false ? null : (
                  <button type="button" className="sorthead" onClick={() => onSortBy(col.key)}>
                    {col.label}{arrow(col.key)}
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id} onClick={() => onRowClick(i)} className="crow">
              {columns.map((col) => (
                <td key={col.key} className={col.className || ""}>{col.render(i)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
