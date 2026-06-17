import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { fetchListing, updateListing, deleteListing, formatMoney } from "../data.js";
import { isConfigured } from "../supabaseClient.js";
import { useAuth } from "../auth.jsx";
import ListingForm from "../components/ListingForm.jsx";

export default function Listing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isOwner } = useAuth();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);

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

  const good = formatMoney(item.good_price);
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
            <span className={"tag t-" + (item.type || "").replace(/[^A-Za-z]/g, "")}>{item.type}</span>
            {(item.list || "collection") === "wishlist" && <span className="tag wish">Wish list</span>}
          </span>
          <h2>{item.title}</h2>
          {item.artist && <p className="dsub">{item.artist}{item.year ? ` · ${item.year}` : ""}</p>}

          <dl className="facts">
            {item.condition && (<><dt>Condition</dt><dd>{item.condition}</dd></>)}
            {item.status && (<><dt>Status</dt><dd>{item.status}</dd></>)}
            {item.quantity > 1 && (<><dt>Quantity</dt><dd>{item.quantity}</dd></>)}
            <dt>Good price</dt><dd>{good || "—"}</dd>
            <dt>Used price</dt><dd>{used || "—"}</dd>
          </dl>

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
