import { createContext, useContext, useEffect, useState } from "react";
import { supabase, OWNER_EMAIL, isConfigured } from "./supabaseClient.js";

const AuthContext = createContext({ session: null, isOwner: false, ready: true });

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!isConfigured);

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const email = session?.user?.email?.toLowerCase() || null;
  const isOwner = Boolean(email && email === OWNER_EMAIL);

  return (
    <AuthContext.Provider value={{ session, email, isOwner, ready }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}
