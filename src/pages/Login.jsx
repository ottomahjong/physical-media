import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase, OWNER_EMAIL, isConfigured } from "../supabaseClient.js";
import { useAuth } from "../auth.jsx";

const OWNER_USERNAME = "keddy029";

export default function Login() {
  const { isOwner } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (isOwner) return <Navigate to="/admin" replace />;

  if (!isConfigured) {
    return <div className="empty">Login is unavailable until the database is connected.</div>;
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (username.trim().toLowerCase() !== OWNER_USERNAME) {
      setError("Incorrect username or password.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: OWNER_EMAIL,
        password,
      });
      if (err) throw err;
    } catch {
      setError("Incorrect username or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "64px auto", padding: "0 16px" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 350, fontSize: "2rem", letterSpacing: "-0.02em" }}>
          Keddy Media
        </h1>
        <p style={{ fontSize: "0.78rem", color: "var(--fg-muted)", marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Owner access
        </p>
      </div>
      <div className="panel">
        <form onSubmit={submit}>
          <label>Username</label>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <label>Password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="err">{error}</p>}
          <div style={{ marginTop: 20 }}>
            <button className="btn primary" style={{ width: "100%" }} disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
