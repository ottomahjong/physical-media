import { createContext, useContext, useState } from "react";
import { OWNER_EMAIL, OWNER_PASSWORD } from "./supabaseClient.js";

// Simple front-door auth. We no longer use Supabase magic links — sign-in is a
// local email + password check against the owner credentials, remembered in
// localStorage. This is a deliberate, low-security barrier for a personal
// project (see the note in supabaseClient.js).
const KEY = "keddy_owner";

const AuthContext = createContext({ isOwner: false, ready: true, email: null });

export function AuthProvider({ children }) {
  const [isOwner, setIsOwner] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });

  function signIn(email, password) {
    const ok =
      String(email || "").trim().toLowerCase() === OWNER_EMAIL &&
      String(password || "") === OWNER_PASSWORD;
    if (ok) {
      try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
      setIsOwner(true);
    }
    return ok;
  }

  function doSignOut() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    setIsOwner(false);
  }

  return (
    <AuthContext.Provider value={{ isOwner, ready: true, email: isOwner ? OWNER_EMAIL : null, signIn, signOut: doSignOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Kept for the few call sites that import it directly; prefer useAuth().signOut.
export function signOut() {
  try { localStorage.removeItem("keddy_owner"); } catch { /* ignore */ }
}
