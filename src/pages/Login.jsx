import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase, OWNER_EMAIL, isConfigured } from "../supabaseClient.js";
import { useAuth } from "../auth.jsx";

export default function Login() {
  const { isOwner } = useAuth();
  const [email, setEmail] = useState(OWNER_EMAIL);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (isOwner) return <Navigate to="/admin" replace />;

  async function send(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + "/admin" },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!isConfigured) {
    return <div className="empty">Login is unavailable until the database is connected.</div>;
  }

  return (
    <div className="panel">
      <h2>Owner login</h2>
      {sent ? (
        <p className="note">
          Check your inbox at <b>{email}</b>. Tap the link in the email to sign in,
          then you'll be able to add, edit, and remove listings.
        </p>
      ) : (
        <form onSubmit={send}>
          <p className="note">
            Enter your email and we'll send you a one-time sign-in link. No password needed.
            Only <b>{OWNER_EMAIL}</b> can make changes.
          </p>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {error && <p className="err">{error}</p>}
          <button className="btn primary" disabled={busy}>
            {busy ? "Sending…" : "Send me a sign-in link"}
          </button>
        </form>
      )}
    </div>
  );
}
