"use client";
import { useState, useEffect } from "react";
import useAuth from "@/utils/useAuth";

export default function AdminSignIn() {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [lockedUntil, setLockedUntil] = useState(null);

  const { signInWithCredentials } = useAuth();

  // Check if already locked on page load when email is entered
  useEffect(() => {
    if (!email) return;
    const timer = setTimeout(async () => {
      const res = await fetch(
        `/api/auth/rate-limit?email=${encodeURIComponent(email)}`,
      );
      const data = await res.json();
      if (!data.allowed) {
        setError(data.message);
        setLockedUntil(true);
      } else {
        setLockedUntil(false);
        if (error?.includes("Too many")) setError(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [email]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!email || !password) {
      setError("Please fill in all fields");
      setLoading(false);
      return;
    }

    // Check rate limit before attempting auth
    const checkRes = await fetch(
      `/api/auth/rate-limit?email=${encodeURIComponent(email)}`,
    );
    const checkData = await checkRes.json();
    if (!checkData.allowed) {
      setError(checkData.message);
      setLockedUntil(true);
      setLoading(false);
      return;
    }

    try {
      console.log("🔐 Attempting sign in for:", email);

      const result = await signInWithCredentials({
        email,
        password,
        callbackUrl: "/account/redirect",
        redirect: true,
      });

      console.log("🔐 signInWithCredentials result:", result);

      // Wait a moment to see if redirect happens
      // If we're still here after 1 second, auth likely failed
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // If we reach here and haven't redirected, auth failed
      console.error("🔐 Sign in failed - no redirect occurred");

      // Record failed attempt
      const failRes = await fetch("/api/auth/rate-limit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, success: false }),
      });
      const failData = await failRes.json();

      if (!failData.allowed) {
        setError(failData.message);
        setLockedUntil(true);
      } else {
        setError("Incorrect email or password. Please try again.");
        if (failData.warning) {
          setAttemptsLeft(failData.attemptsLeft);
        }
      }
      setLoading(false);
    } catch (err) {
      console.error("🔐 Sign in error:", err);
      // Record failed attempt
      await fetch("/api/auth/rate-limit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, success: false }),
      });
      setError("Incorrect email or password. Please try again.");
      setLoading(false);
    }
  };

  const isLocked = lockedUntil === true;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes logo-pulse { 0%,100% { box-shadow:0 0 20px rgba(0,245,212,0.3),0 0 40px rgba(0,245,212,0.1); } 50% { box-shadow:0 0 35px rgba(0,245,212,0.6),0 0 70px rgba(0,245,212,0.2); } }
        @keyframes border-spin { to { transform:rotate(360deg); } }

        * { box-sizing:border-box; }
        .si-page { min-height:100vh; background:#091833; display:flex; align-items:center; justify-content:center; padding:24px; font-family:'Rajdhani',sans-serif; position:relative; overflow:hidden; }
        .si-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,245,212,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,212,0.025) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .si-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.4),transparent); animation:scanline 6s linear infinite; pointer-events:none; z-index:100; }
        .si-glow-tl { position:fixed; top:-300px; left:-300px; width:700px; height:700px; background:radial-gradient(circle,rgba(0,245,212,0.06) 0%,transparent 70%); pointer-events:none; }
        .si-glow-br { position:fixed; bottom:-300px; right:-300px; width:700px; height:700px; background:radial-gradient(circle,rgba(255,0,204,0.04) 0%,transparent 70%); pointer-events:none; }

        .si-wrap { width:100%; max-width:420px; position:relative; z-index:10; animation:fadeInUp 0.5s ease; }

        /* Logo */
        .si-logo-wrap { display:flex; flex-direction:column; align-items:center; margin-bottom:32px; }
        .si-logo { width:72px; height:72px; background:rgba(0,245,212,0.08); border:2px solid rgba(0,245,212,0.4); border-radius:8px; display:flex; align-items:center; justify-content:center; margin-bottom:16px; animation:logo-pulse 3s infinite; position:relative; }
        .si-logo-inner { font-family:'Orbitron',monospace; font-size:22px; font-weight:900; color:#00F5D4; letter-spacing:1px; }
        .si-logo-corner { position:absolute; width:8px; height:8px; border-color:#00F5D4; border-style:solid; opacity:0.6; }
        .si-logo-corner.tl { top:-1px; left:-1px; border-width:2px 0 0 2px; }
        .si-logo-corner.tr { top:-1px; right:-1px; border-width:2px 2px 0 0; }
        .si-logo-corner.bl { bottom:-1px; left:-1px; border-width:0 0 2px 2px; }
        .si-logo-corner.br { bottom:-1px; right:-1px; border-width:0 2px 2px 0; }
        .si-brand { font-family:'Orbitron',monospace; font-size:24px; font-weight:900; color:#F4F4F9; letter-spacing:4px; }
        .si-tagline { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.5); letter-spacing:4px; margin-top:6px; }
.si-logo svg { animation: logo-ring-spin 12s linear infinite; }
        @keyframes logo-ring-spin { to { transform: rotate(360deg); } }
        /* Card */
        .si-card { background:rgba(11,20,40,0.95); border:1px solid rgba(0,245,212,0.2); border-radius:8px; overflow:hidden; backdrop-filter:blur(20px); box-shadow:0 40px 80px rgba(0,0,0,0.5),0 0 40px rgba(0,245,212,0.05); }
        .si-card-header { padding:24px; border-bottom:1px solid rgba(0,245,212,0.1); text-align:center; }
        .si-card-title { font-family:'Orbitron',monospace; font-size:16px; font-weight:700; color:#F4F4F9; letter-spacing:2px; margin-bottom:6px; }
        .si-card-sub { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.4); letter-spacing:3px; }

        /* Form */
        .si-form { padding:28px; display:flex; flex-direction:column; gap:20px; }
        .si-field { display:flex; flex-direction:column; gap:8px; }
        .si-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.6); letter-spacing:3px; }
        .si-input { height:48px; padding:0 16px; background:rgba(0,245,212,0.04); border:1px solid rgba(0,245,212,0.15); border-radius:4px; color:#F4F4F9; font-family:'Rajdhani',sans-serif; font-size:16px; outline:none; transition:all 0.2s; }
        .si-input:focus { border-color:#00F5D4; box-shadow:0 0 15px rgba(0,245,212,0.15); background:rgba(0,245,212,0.06); }
        .si-input::placeholder { color:rgba(180,200,220,0.2); }

        /* Error */
        .si-error { background:rgba(255,50,50,0.08); border:1px solid rgba(255,50,50,0.3); border-radius:4px; padding:12px 16px; font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,100,100,0.9); letter-spacing:2px; }

        /* Remember me */
        .si-remember { display:flex; align-items:center; gap:10px; }
        .si-checkbox { width:16px; height:16px; background:rgba(0,245,212,0.04); border:1px solid rgba(0,245,212,0.3); border-radius:2px; cursor:pointer; accent-color:#00F5D4; }
        .si-remember-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.4); letter-spacing:2px; cursor:pointer; }

        /* Submit */
        .si-submit { height:52px; background:linear-gradient(135deg,rgba(0,245,212,0.15),rgba(0,245,212,0.08)); border:1px solid rgba(0,245,212,0.4); border-radius:4px; color:#00F5D4; font-family:'Orbitron',monospace; font-size:13px; font-weight:700; letter-spacing:3px; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:10px; }
        .si-submit:hover:not(:disabled) { background:linear-gradient(135deg,rgba(0,245,212,0.25),rgba(0,245,212,0.12)); border-color:#00F5D4; box-shadow:0 0 25px rgba(0,245,212,0.2); transform:translateY(-1px); }
        .si-submit:active:not(:disabled) { transform:translateY(0); }
        .si-submit:disabled { opacity:0.4; cursor:not-allowed; }
        .si-spinner { width:18px; height:18px; border:2px solid rgba(0,245,212,0.3); border-top-color:#00F5D4; border-radius:50%; animation:spin 0.8s linear infinite; }

        /* Footer */
        .si-footer { text-align:center; margin-top:24px; font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(180,200,220,0.15); letter-spacing:3px; }
      `}</style>

      <div className="si-page">
        <div className="si-grid" />
        <div className="si-scanline" />
        <div className="si-glow-tl" />
        <div className="si-glow-br" />

        <div className="si-wrap">
          {/* Logo */}
          <div className="si-logo-wrap">
            <div className="si-logo">
              <svg
                width="44"
                height="44"
                viewBox="0 0 44 44"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Outer ring */}
                <circle
                  cx="22"
                  cy="22"
                  r="20"
                  stroke="#00F5D4"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  opacity="0.4"
                />
                {/* Inner circle */}
                <circle
                  cx="22"
                  cy="22"
                  r="13"
                  stroke="#00F5D4"
                  strokeWidth="1.5"
                  opacity="0.8"
                />
                {/* Clock hands */}
                <line
                  x1="22"
                  y1="22"
                  x2="22"
                  y2="11"
                  stroke="#00F5D4"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <line
                  x1="22"
                  y1="22"
                  x2="30"
                  y2="26"
                  stroke="#00F5D4"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                {/* Center dot */}
                <circle cx="22" cy="22" r="2.5" fill="#00F5D4" />
                {/* Lightning bolt */}
                <path
                  d="M20 18L17 23H21.5L19 29L26 21H21L23 18H20Z"
                  fill="#00F5D4"
                  opacity="0.9"
                />
              </svg>
              <div className="si-logo-corner tl" />
              <div className="si-logo-corner tr" />
              <div className="si-logo-corner bl" />
              <div className="si-logo-corner br" />
            </div>
            <h1 className="si-brand">NOVACHRONO</h1>
            <p className="si-tagline">
              // TIME PAUSES. YOUR LEAGUE NEVER DOES.
            </p>
          </div>

          {/* Card */}
          <div className="si-card">
            <div className="si-card-header">
              <h2 className="si-card-title">SYSTEM ACCESS</h2>
              <p className="si-card-sub">ENTER CREDENTIALS TO CONTINUE</p>
            </div>

            <form onSubmit={onSubmit} className="si-form">
              <div className="si-field">
                <label className="si-label">EMAIL ADDRESS</label>
                <input
                  required
                  type="email"
                  className="si-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={isLocked}
                />
              </div>

              <div className="si-field">
                <label className="si-label">PASSWORD</label>
                <input
                  required
                  type="password"
                  className="si-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={isLocked}
                />
              </div>

              {error && (
                <div
                  className="si-error"
                  style={{
                    borderColor: isLocked
                      ? "rgba(255,80,80,0.5)"
                      : "rgba(255,50,50,0.3)",
                    background: isLocked
                      ? "rgba(255,0,0,0.1)"
                      : "rgba(255,50,50,0.08)",
                  }}
                >
                  {isLocked ? "🔒 " : "// "}
                  {error.toUpperCase()}
                </div>
              )}

              {attemptsLeft !== null && !error?.includes("Too many") && (
                <div
                  style={{
                    background: "rgba(255,200,0,0.06)",
                    border: "1px solid rgba(255,200,0,0.25)",
                    borderRadius: 4,
                    padding: "10px 14px",
                    fontFamily: "'Share Tech Mono',monospace",
                    fontSize: 10,
                    color: "rgba(255,200,0,0.7)",
                    letterSpacing: 2,
                  }}
                >
                  ⚠ {attemptsLeft} ATTEMPT{attemptsLeft === 1 ? "" : "S"}{" "}
                  REMAINING BEFORE LOCKOUT
                </div>
              )}

              <div className="si-remember">
                <input
                  type="checkbox"
                  id="rememberMe"
                  className="si-checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <label htmlFor="rememberMe" className="si-remember-label">
                  REMEMBER ME
                </label>
              </div>

              <button
                type="submit"
                className="si-submit"
                disabled={loading || isLocked}
              >
                {loading ? (
                  <>
                    <div className="si-spinner" /> AUTHENTICATING...
                  </>
                ) : isLocked ? (
                  "🔒 ACCOUNT TEMPORARILY LOCKED"
                ) : (
                  "SIGN IN →"
                )}
              </button>

              <div style={{ textAlign: "center", marginTop: "16px" }}>
                <a
                  href="/account/forgot-password"
                  style={{
                    fontFamily: "'Share Tech Mono',monospace",
                    fontSize: 10,
                    color: "rgba(0,245,212,0.5)",
                    letterSpacing: 2,
                    textDecoration: "none",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) =>
                    (e.target.style.color = "rgba(0,245,212,0.8)")
                  }
                  onMouseLeave={(e) =>
                    (e.target.style.color = "rgba(0,245,212,0.5)")
                  }
                >
                  FORGOT PASSWORD?
                </a>
              </div>
            </form>
          </div>

          <p className="si-footer">© 2025 NOVACHRONO. ALL RIGHTS RESERVED.</p>
        </div>
      </div>
    </>
  );
}
