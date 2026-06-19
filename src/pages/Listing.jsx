import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { fetchListing, updateListing, deleteListing, formatMoney, getListingEstimatedValue, saveListingValue } from "../data.js";
import { isConfigured } from "../supabaseClient.js";
import { useAuth } from "../auth.jsx";
import ListingForm from "../components/ListingForm.jsx";
import { CategoryPill } from "../components/MediaBits.jsx";
import { valueLookup } from "../values.js";

export default function Listing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isOwner } = useAuth();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [valueBusy, setValueBusy] = useState(false);
  const [valueMsg, setValueMsg] = useState(null);

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

  async function refreshValue() {
    setValueBusy(true);
    setValueMsg(null);
    try {
      const result = await valueLookup(item, { force: true });
      const updated = await saveListingValue(item.id, result);
      setItem({ ...updated, list: updated.list || item.list || "collection" });
      setValueMsg(result.status === "not_found" ? "No value found from configured sources." : "Market value refreshed.");
    } catch (err) {
      setValueMsg(err.message || "Market value refresh failed.");
    } finally {
      setValueBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this listing permanently?")) return;
    await deleteListing(id);
    navigate("/");
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

  const good = formatMoney(getListingEstimatedValue(item));
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
          <span className="tags">
            <CategoryPill type={item.type} />
            {(item.list || "collection") === "wishlist" && <span className="tag wish">Wish list</span>}
          </span>
          <h2>{item.title}</h2>
          {item.artist && <p className="dsub">{item.artist}{item.year ? ` · ${item.year}` : ""}</p>}

          <dl className="facts">
            {item.condition && (<><dt>Condition</dt><dd>{item.condition}</dd></>)}
            {item.status && (<><dt>Status</dt><dd>{item.status}</dd></>)}
            {item.quantity > 1 && (<><dt>Quantity</dt><dd>{item.quantity}</dd></>)}
            <dt>Est. Value</dt><dd>{good || "—"}</dd>
            <dt>Price Paid</dt><dd>{used || "—"}</dd>
          </dl>

          <section className="marketvalue">
            <div className="valuehead">
              <h3>Market value</h3>
              {isOwner && <button className="btn ghost valuebtn" onClick={refreshValue} disabled={valueBusy}>{valueBusy ? "Refreshing…" : "Refresh value"}</button>}
            </div>
            <div className="valueamount">{good || "—"}</div>
            <div className="valuebadges">
              {item.price_source && <span className="badge">{item.price_source.replaceAll("_", " ")}</span>}
              {item.price_source_kind && <span className="badge">{item.price_source_kind.replace("ebay_sold_comps", "Sold comps").replace("ebay_active_asking", "Active asking median").replace("discogs_marketplace_floor", "Discogs marketplace floor")}</span>}
              {item.price_confidence && <span className="badge">{item.price_confidence} confidence</span>}
            </div>
            <p className="valuemeta">
              {item.price_sample_count ? `${item.price_sample_count} samples · ` : ""}
              {item.price_last_checked_at ? `Checked ${new Date(item.price_last_checked_at).toLocaleDateString()}` : "Not checked yet"}
            </p>
            {item.price_notes && <p className="valuenotes">{item.price_notes}</p>}
            {item.price_error && <p className="err">{item.price_error}</p>}
            {valueMsg && <p className="scanmsg">{valueMsg}</p>}
          </section>

          {item.notes && <p className="notes">{item.notes}</p>}

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
