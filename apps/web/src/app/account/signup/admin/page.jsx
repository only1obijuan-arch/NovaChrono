"use client";
import { useState, useEffect } from "react";
import useAuth from "@/utils/useAuth";
import { ChevronLeft } from "lucide-react";

export default function AdminSignUp() {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [venueId, setVenueId] = useState("");
  const [venues, setVenues] = useState([]);

  const { signUpWithCredentials } = useAuth();

  useEffect(() => {
    const fetchVenues = async () => {
      const res = await fetch("/api/venues");
      if (res.ok) {
        const data = await res.json();
        setVenues(data);
      }
    };
    fetchVenues();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!email || !password || !name || !venueId) {
      setError("Please fill in all fields");
      setLoading(false);
      return;
    }

    try {
      // Store venue_id in localStorage to be set during onboarding
      localStorage.setItem("pendingVenueId", venueId);

      await signUpWithCredentials({
        email,
        password,
        name,
        callbackUrl: "/admin/onboarding",
        redirect: true,
      });
    } catch (err) {
      setError("Could not create account. Email may already be in use.");
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }

        * { box-sizing:border-box; }
        .as-page { min-height:100vh; background:#091833; display:flex; align-items:center; justify-content:center; padding:24px; font-family:'Rajdhani',sans-serif; position:relative; overflow:hidden; }
        .as-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,245,212,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,212,0.025) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .as-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.4),transparent); animation:scanline 6s linear infinite; pointer-events:none; z-index:100; }
        .as-glow-tl { position:fixed; top:-300px; left:-300px; width:700px; height:700px; background:radial-gradient(circle,rgba(0,245,212,0.06) 0%,transparent 70%); pointer-events:none; }
        .as-glow-br { position:fixed; bottom:-300px; right:-300px; width:700px; height:700px; background:radial-gradient(circle,rgba(255,0,204,0.04) 0%,transparent 70%); pointer-events:none; }

        .as-wrap { width:100%; max-width:480px; position:relative; z-index:10; animation:fadeInUp 0.5s ease; }

        .as-back { display:flex; align-items:center; gap:8px; color:rgba(0,245,212,0.5); font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:2px; text-decoration:none; margin-bottom:24px; transition:color 0.2s; }
        .as-back:hover { color:#00F5D4; }

        .as-card { background:rgba(11,20,40,0.95); border:1px solid rgba(0,245,212,0.2); border-radius:8px; overflow:hidden; backdrop-filter:blur(20px); box-shadow:0 40px 80px rgba(0,0,0,0.5),0 0 40px rgba(0,245,212,0.05); }
        .as-card-header { padding:24px; border-bottom:1px solid rgba(0,245,212,0.1); text-align:center; }
        .as-card-title { font-family:'Orbitron',monospace; font-size:18px; font-weight:700; color:#F4F4F9; letter-spacing:2px; margin-bottom:6px; }
        .as-card-sub { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.4); letter-spacing:3px; }

        .as-form { padding:28px; display:flex; flex-direction:column; gap:20px; }
        .as-field { display:flex; flex-direction:column; gap:8px; }
        .as-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.6); letter-spacing:3px; }
        .as-input { height:48px; padding:0 16px; background:rgba(0,245,212,0.04); border:1px solid rgba(0,245,212,0.15); border-radius:4px; color:#F4F4F9; font-family:'Rajdhani',sans-serif; font-size:16px; outline:none; transition:all 0.2s; }
        .as-input:focus { border-color:#00F5D4; box-shadow:0 0 15px rgba(0,245,212,0.15); background:rgba(0,245,212,0.06); }
        .as-input::placeholder { color:rgba(180,200,220,0.2); }

        .as-error { background:rgba(255,50,50,0.08); border:1px solid rgba(255,50,50,0.3); border-radius:4px; padding:12px 16px; font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,100,100,0.9); letter-spacing:2px; }

        .as-submit { height:52px; background:linear-gradient(135deg,rgba(0,245,212,0.15),rgba(0,245,212,0.08)); border:1px solid rgba(0,245,212,0.4); border-radius:4px; color:#00F5D4; font-family:'Orbitron',monospace; font-size:13px; font-weight:700; letter-spacing:3px; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:10px; }
        .as-submit:hover:not(:disabled) { background:linear-gradient(135deg,rgba(0,245,212,0.25),rgba(0,245,212,0.12)); border-color:#00F5D4; box-shadow:0 0 25px rgba(0,245,212,0.2); transform:translateY(-1px); }
        .as-submit:disabled { opacity:0.4; cursor:not-allowed; }

        .as-footer { text-align:center; margin-top:16px; font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.4); letter-spacing:2px; }
        .as-footer a { color:#00F5D4; text-decoration:none; transition:color 0.2s; }
        .as-footer a:hover { color:rgba(0,245,212,0.8); }
      `}</style>

      <div className="as-page">
        <div className="as-grid" />
        <div className="as-scanline" />
        <div className="as-glow-tl" />
        <div className="as-glow-br" />

        <div className="as-wrap">
          <a href="/account/signup" className="as-back">
            <ChevronLeft size={12} /> BACK TO ROLE SELECTION
          </a>

          <div className="as-card">
            <div className="as-card-header">
              <h1 className="as-card-title">VENUE ADMIN SIGNUP</h1>
              <p className="as-card-sub">CREATE YOUR ADMINISTRATOR ACCOUNT</p>
            </div>

            <form onSubmit={onSubmit} className="as-form">
              <div className="as-field">
                <label className="as-label">FULL NAME</label>
                <input
                  required
                  type="text"
                  className="as-input"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="as-field">
                <label className="as-label">EMAIL ADDRESS</label>
                <input
                  required
                  type="email"
                  className="as-input"
                  placeholder="admin@venue.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div className="as-field">
                <label className="as-label">PASSWORD</label>
                <input
                  required
                  type="password"
                  className="as-input"
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div className="as-field">
                <label className="as-label">VENUE</label>
                <select
                  required
                  className="as-input"
                  value={venueId}
                  onChange={(e) => setVenueId(e.target.value)}
                >
                  <option value="">Select your venue</option>
                  {venues.map((venue) => (
                    <option key={venue.id} value={venue.id}>
                      {venue.name}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="as-error">// {error.toUpperCase()}</div>
              )}

              <button type="submit" disabled={loading} className="as-submit">
                {loading ? "CREATING ACCOUNT..." : "CREATE ADMIN ACCOUNT →"}
              </button>

              <div className="as-footer">
                ALREADY HAVE AN ACCOUNT? <a href="/account/signin">SIGN IN →</a>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
