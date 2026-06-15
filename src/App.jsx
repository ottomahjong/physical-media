import { Routes, Route, Link, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth, signOut } from "./auth.jsx";
import { isConfigured } from "./supabaseClient.js";
import Home from "./pages/Home.jsx";
import Listing from "./pages/Listing.jsx";
import Admin from "./pages/Admin.jsx";
import Login from "./pages/Login.jsx";

function Header() {
  const { isOwner, email } = useAuth();
  const navigate = useNavigate();
  return (
    <header>
      <div className="bar">
        <Link to="/" className="brand">
          <h1>The Collection</h1>
          <span className="sub">VHS · DVD · CD</span>
        </Link>
        <nav>
          {isOwner ? (
            <>
              <Link to="/admin" className="navbtn">Manage</Link>
              <button
                className="navbtn ghost"
                onClick={async () => { await signOut(); navigate("/"); }}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link to="/login" className="navbtn ghost">Owner login</Link>
          )}
        </nav>
      </div>
      {isOwner && <div className="ownerband">Signed in as {email} — you can edit listings</div>}
    </header>
  );
}

function NotConfigured() {
  return (
    <div className="empty">
      <strong>Almost there — the database isn't connected yet.</strong>
      The site is deployed, but it needs the Supabase keys to load listings.
      This banner disappears automatically once those are set.
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Header />
      <main>
        {!isConfigured && <NotConfigured />}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/listing/:id" element={<Listing />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </main>
    </AuthProvider>
  );
}
