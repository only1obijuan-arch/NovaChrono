"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [lockedUntil, setLockedUntil] = useState(null);

  useEffect(() => {
    if (searchParams.get("verified") === "true") {
      setToast("Email verified! You can now sign in.");
    }
  }, []);

  // Check rate limit when email is entered
  useEffect(() => {
    if (!email) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/auth/rate-limit?email=${encodeURIComponent(email)}`
        );
        const data = await res.json();
        if (!data.allowed) {
          setError(data.message);
          setLockedUntil(true);
        } else {
          setLockedUntil(false);
          if (error?.includes("Too many")) setError(null);
        }
      } catch {}
    }, 500);
    return () => clearTimeout(timer);
  }, [email]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!email || !password) {
      setError("Please fill in all fields");
      setLoading(false);
      return;
    }

    // Check rate limit
    try {
      const checkRes = await fetch(
        `/api/auth/rate-limit?email=${encodeURIComponent(email)}`
      );
      const checkData = await checkRes.json();
      if (!checkData.allowed) {
        setError(checkData.message);
        setLockedUntil(true);
        setLoading(false);
        return;
      }
    } catch {}

    try {
      const result = await signIn("credentials", {
        email,
        password,
        isSignup: "false",
        redirect: false,
      });

      if (result?.ok && !result?.error) {
        // Record successful login
        try {
          await fetch("/api/auth/rate-limit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, success: true }),
          });
        } catch {}
        // Soft navigation keeps the SessionProvider alive so the session
        // is already in-memory when the redirect page mounts.
        router.push("/account/redirect");
        return;
      }

      // Check whether the sign-in failed because the email isn't verified yet.
      // (NextAuth always returns "CredentialsSignin" so we check the DB directly.)
      try {
        const statusRes = await fetch(
          `/api/auth/email-status?email=${encodeURIComponent(email)}`
        );
        const statusData = await statusRes.json();
        if (statusData.unverified) {
          setError(
            "Please verify your email before signing in. Check your inbox for the verification link."
          );
          setLoading(false);
          return;
        }
      } catch {}

      // Failed — record attempt
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
        if (failData.warning) setAttemptsLeft(failData.attemptsLeft);
      }
      setLoading(false);
    } catch (err) {
      setError("Something went wrong. Please try again.");
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

        * { box-sizing:border-box; margin:0; padding:0; }
        .si-page { min-height:100vh; background:#091833; display:flex; align-items:center; justify-content:center; padding:24px; font-family:'Rajdhani',sans-serif; position:relative; overflow:hidden; }
        .si-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,245,212,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,212,0.025) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .si-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.4),transparent); animation:scanline 6s linear infinite; pointer-events:none; z-index:100; }
        .si-glow-tl { position:fixed; top:-300px; left:-300px; width:700px; height:700px; background:radial-gradient(circle,rgba(0,245,212,0.06) 0%,transparent 70%); pointer-events:none; }
        .si-glow-br { position:fixed; bottom:-300px; right:-300px; width:700px; height:700px; background:radial-gradient(circle,rgba(255,0,204,0.04) 0%,transparent 70%); pointer-events:none; }
        .si-wrap { width:100%; max-width:420px; position:relative; z-index:10; animation:fadeInUp 0.5s ease; }
        .si-logo-wrap { display:flex; flex-direction:column; align-items:center; margin-bottom:32px; }
        .si-logo { width:160px; height:160px; border-radius:12px; overflow:hidden; margin-bottom:16px; animation:logo-pulse 3s infinite; }
        .si-logo img { width:100%; height:100%; object-fit:contain; display:block; }
        .si-tagline { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.5); letter-spacing:4px; margin-top:6px; }
        .si-card { background:rgba(11,20,40,0.95); border:1px solid rgba(0,245,212,0.2); border-radius:8px; overflow:hidden; backdrop-filter:blur(20px); box-shadow:0 40px 80px rgba(0,0,0,0.5),0 0 40px rgba(0,245,212,0.05); }
        .si-card-header { padding:24px; border-bottom:1px solid rgba(0,245,212,0.1); text-align:center; }
        .si-card-title { font-family:'Orbitron',monospace; font-size:16px; font-weight:700; color:#F4F4F9; letter-spacing:2px; margin-bottom:6px; }
        .si-card-sub { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.4); letter-spacing:3px; }
        .si-form { padding:28px; display:flex; flex-direction:column; gap:20px; }
        .si-field { display:flex; flex-direction:column; gap:8px; }
        .si-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.6); letter-spacing:3px; }
        .si-input { height:48px; padding:0 16px; background:rgba(0,245,212,0.04); border:1px solid rgba(0,245,212,0.15); border-radius:4px; color:#F4F4F9; font-family:'Rajdhani',sans-serif; font-size:16px; outline:none; transition:all 0.2s; }
        .si-input:focus { border-color:#00F5D4; box-shadow:0 0 15px rgba(0,245,212,0.15); background:rgba(0,245,212,0.06); }
        .si-input::placeholder { color:rgba(180,200,220,0.2); }
        .si-error { background:rgba(255,50,50,0.08); border:1px solid rgba(255,50,50,0.3); border-radius:4px; padding:12px 16px; font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,100,100,0.9); letter-spacing:2px; }
        .si-submit { height:52px; background:linear-gradient(135deg,rgba(0,245,212,0.15),rgba(0,245,212,0.08)); border:1px solid rgba(0,245,212,0.4); border-radius:4px; color:#00F5D4; font-family:'Orbitron',monospace; font-size:13px; font-weight:700; letter-spacing:3px; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:10px; }
        .si-submit:hover:not(:disabled) { background:linear-gradient(135deg,rgba(0,245,212,0.25),rgba(0,245,212,0.12)); border-color:#00F5D4; box-shadow:0 0 25px rgba(0,245,212,0.2); transform:translateY(-1px); }
        .si-submit:disabled { opacity:0.4; cursor:not-allowed; }
        .si-spinner { width:18px; height:18px; border:2px solid rgba(0,245,212,0.3); border-top-color:#00F5D4; border-radius:50%; animation:spin 0.8s linear infinite; }
        .si-footer { text-align:center; margin-top:24px; font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(180,200,220,0.15); letter-spacing:3px; }
        .si-toast { background:rgba(0,255,156,0.08); border:1px solid rgba(0,255,156,0.35); border-radius:4px; padding:12px 16px; font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,255,156,0.9); letter-spacing:2px; margin-bottom:16px; }
      `}</style>

      <div className="si-page">
        <div className="si-grid" />
        <div className="si-scanline" />
        <div className="si-glow-tl" />
        <div className="si-glow-br" />

        <div className="si-wrap">
          <div className="si-logo-wrap">
            <div className="si-logo">
              <img
                src="https://ucarecdn.com/8aaa83a5-036d-4640-875b-46aff367bee7/-/format/auto/"
                alt="NovaChrono"
              />
            </div>
            <p className="si-tagline">// TIME PAUSES. YOUR LEAGUE NEVER DOES.</p>
          </div>

          {toast && (
            <div className="si-toast">✓ {toast.toUpperCase()}</div>
          )}

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
                <div className="si-error"
                  style={{
                    borderColor: isLocked ? "rgba(255,80,80,0.5)" : "rgba(255,50,50,0.3)",
                    background: isLocked ? "rgba(255,0,0,0.1)" : "rgba(255,50,50,0.08)",
                  }}
                >
                  {isLocked ? "🔒 " : "// "}{error.toUpperCase()}
                </div>
              )}

              {attemptsLeft !== null && !error?.includes("Too many") && (
                <div style={{
                  background: "rgba(255,200,0,0.06)",
                  border: "1px solid rgba(255,200,0,0.25)",
                  borderRadius: 4, padding: "10px 14px",
                  fontFamily: "'Share Tech Mono',monospace",
                  fontSize: 10, color: "rgba(255,200,0,0.7)", letterSpacing: 2,
                }}>
                  ⚠ {attemptsLeft} ATTEMPT{attemptsLeft === 1 ? "" : "S"} REMAINING BEFORE LOCKOUT
                </div>
              )}

              <button type="submit" className="si-submit" disabled={loading || isLocked}>
                {loading ? (
                  <><div className="si-spinner" /> AUTHENTICATING...</>
                ) : isLocked ? "🔒 ACCOUNT TEMPORARILY LOCKED" : "SIGN IN →"}
              </button>

              <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "12px" }}>
                <a href="/account/forgot-password"
                  style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "rgba(0,245,212,0.5)", letterSpacing: 2, textDecoration: "none" }}
                  onMouseEnter={(e) => (e.target.style.color = "rgba(0,245,212,0.8)")}
                  onMouseLeave={(e) => (e.target.style.color = "rgba(0,245,212,0.5)")}
                >
                  FORGOT PASSWORD?
                </a>
                <div style={{ height: "1px", background: "rgba(0,245,212,0.1)", margin: "4px 0" }} />
                <p style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "rgba(0,245,212,0.3)", letterSpacing: 2, lineHeight: 1.6 }}>
                  // CAPTAIN? GET YOUR LEAGUE CODE FROM YOUR VENUE ADMIN
                </p>
              </div>
            </form>
          </div>
          <p className="si-footer">© 2025 NOVACHRONO. ALL RIGHTS RESERVED.</p>
        </div>
      </div>
    </>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={null}>
      <SignInContent />
    </Suspense>
  );
}