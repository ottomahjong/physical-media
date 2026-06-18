import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { OWNER_EMAIL } from "../supabaseClient.js";
import { useAuth } from "../auth.jsx";

export default function Login() {
  const { isOwner, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  if (isOwner) return <Navigate to="/admin" replace />;

  function submit(e) {
    e.preventDefault();
    setError(null);
    if (signIn(email, password)) {
      navigate("/admin");
    } else {
      setError("Email or password is incorrect.");
    }
  }

  return (
    <div className="panel">
      <h2>Owner login</h2>
      <form onSubmit={submit}>
        <p className="note">
          Sign in to add, edit, and remove listings. Visitors can browse without
          signing in.
        </p>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={OWNER_EMAIL}
          autoComplete="username"
          required
        />
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        {error && <p className="err">{error}</p>}
        <button className="btn primary">Sign in</button>
      </form>
    </div>
  );
}
