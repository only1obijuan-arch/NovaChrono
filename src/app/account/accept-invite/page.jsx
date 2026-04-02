"use client";
import { useState, useEffect, Suspense } from "react";
import { ChevronLeft } from "lucide-react";

function AcceptInviteForm() {
  const [token, setToken] = useState(null);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) {
      setError("No invite token found. Please use the link from your email.");
      setLoading(false);
      return;
    }
    setToken(t);

    fetch(`/api/admin/invite?token=${t}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.valid) {
          setError(data.error || "Invalid or expired invite link.");
        } else {
          setInvite(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to validate invite. Please try again.");
        setLoading(false);
      });
  }, []);

  const strengthCheck = (p) => {
    if (!p) return null;
    if (p.length < 8)
      return { label: "TOO SHORT", color: "rgba(255,80,80,0.7)", width: "20%" };
    if (p.length < 10 || !/[0-9]/.test(p))
      return { label: "WEAK", color: "rgba(255,160,0,0.7)", width: "40%" };
    if (!/[A-Z]/.test(p) || !/[^a-zA-Z0-9]/.test(p))
      return { label: "FAIR", color: "rgba(255,215,0,0.7)", width: "65%" };
    return { label: "STRONG", color: "#00FF9C", width: "100%" };
  };
  const strength = strengthCheck(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!strength || strength.label === "TOO SHORT") {
      setError("Password must be at least 8 characters");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="ai-card" style={{ padding: 48, textAlign: "center" }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: "3px solid #FF00CC",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 16px",
          }}
        />
        <p
          style={{
            fontFamily: "'Share Tech Mono',monospace",
            fontSize: 11,
            color: "rgba(255,0,204,0.5)",
            letterSpacing: 3,
          }}
        >
          VALIDATING INVITE...
        </p>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="ai-card" style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <h2
          style={{
            fontFamily: "'Orbitron',monospace",
            fontSize: 18,
            color: "#F4F4F9",
            marginBottom: 12,
            letterSpacing: 2,
          }}
        >
          INVITE INVALID
        </h2>
        <p
          style={{
            fontFamily: "'Share Tech Mono',monospace",
            fontSize: 10,
            color: "rgba(255,80,80,0.8)",
            letterSpacing: 2,
            marginBottom: 24,
          }}
        >
          {error.toUpperCase()}
        </p>
        <a
          href="/account/signin"
          style={{
            fontFamily: "'Share Tech Mono',monospace",
            fontSize: 10,
            color: "rgba(255,0,204,0.5)",
            letterSpacing: 2,
            textDecoration: "none",
          }}
        >
          BACK TO SIGN IN →
        </a>
      </div>
    );
  }

  if (done) {
    return (
      <div className="ai-card" style={{ padding: 48, textAlign: "center" }}>
        <div
          style={{
            width: 72,
            height: 72,
            background: "rgba(0,255,156,0.08)",
            border: "2px solid rgba(0,255,156,0.4)",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            fontSize: 32,
          }}
        >
          ✓
        </div>
        <h2
          style={{
            fontFamily: "'Orbitron',monospace",
            fontSize: 20,
            color: "#F4F4F9",
            letterSpacing: 2,
            marginBottom: 12,
          }}
        >
          ACCOUNT CREATED!
        </h2>
        <p
          style={{
            fontFamily: "'Rajdhani',sans-serif",
            fontSize: 15,
            color: "rgba(180,200,220,0.5)",
            marginBottom: 28,
            lineHeight: 1.6,
          }}
        >
          Your account is ready. Check your email for confirmation, then sign in
          to access your admin portal.
        </p>
        <a
          href="/account/signin"
          style={{
            display: "inline-block",
            background: "linear-gradient(135deg,#FF00CC,#AA0088)",
            color: "#F4F4F9",
            fontFamily: "'Orbitron',monospace",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 2,
            padding: "16px 32px",
            borderRadius: 4,
            textDecoration: "none",
          }}
        >
          SIGN IN NOW →
        </a>
      </div>
    );
  }

  return (
    <div className="ai-card">
      <div className="ai-card-header">
        <p className="ai-eyebrow">// ACCEPT INVITE</p>
        <h1 className="ai-title">CREATE YOUR ACCOUNT</h1>
        <p className="ai-org">
          <span style={{ color: "rgba(255,0,204,0.5)" }}>ORGANISATION: </span>
          <span style={{ color: "#F4F4F9" }}>{invite?.organizationName}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="ai-form">
        <div>
          <label className="ai-label">EMAIL ADDRESS</label>
          <div className="ai-input-readonly">{invite?.email}</div>
        </div>

        <div>
          <label className="ai-label">FULL NAME</label>
          <input
            required
            type="text"
            className="ai-input"
            placeholder="e.g. John Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className="ai-label">PASSWORD</label>
          <input
            required
            type="password"
            className="ai-input"
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {strength && (
            <>
              <div className="ai-strength-track">
                <div
                  className="ai-strength-fill"
                  style={{ width: strength.width, background: strength.color }}
                />
              </div>
              <p
                className="ai-strength-label"
                style={{ color: strength.color }}
              >
                {strength.label}
              </p>
            </>
          )}
        </div>

        <div>
          <label className="ai-label">CONFIRM PASSWORD</label>
          <input
            required
            type="password"
            className="ai-input"
            placeholder="Re-enter password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {confirm && (
            <p
              className="ai-match"
              style={{
                color: password === confirm ? "#00FF9C" : "rgba(255,80,80,0.7)",
              }}
            >
              {password === confirm
                ? "✓ PASSWORDS MATCH"
                : "✗ PASSWORDS DO NOT MATCH"}
            </p>
          )}
        </div>

        {error && <div className="ai-error">// {error.toUpperCase()}</div>}

        <button
          type="submit"
          className="ai-submit"
          disabled={
            submitting ||
            password !== confirm ||
            !strength ||
            strength.label === "TOO SHORT" ||
            !name.trim()
          }
        >
          {submitting ? "CREATING ACCOUNT..." : "ACTIVATE ACCOUNT →"}
        </button>
      </form>
    </div>
  );
}

export default function AcceptInvite() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }

        * { box-sizing:border-box; }
        .ai-page { min-height:100vh; background:#091833; display:flex; align-items:center; justify-content:center; padding:24px; font-family:'Rajdhani',sans-serif; position:relative; overflow:hidden; }
        .ai-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(255,0,204,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,0,204,0.025) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .ai-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(255,0,204,0.4),transparent); animation:scanline 6s linear infinite; pointer-events:none; z-index:100; }
        .ai-glow { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:600px; height:600px; background:radial-gradient(circle,rgba(255,0,204,0.04) 0%,transparent 70%); pointer-events:none; }

        .ai-wrap { width:100%; max-width:440px; position:relative; z-index:10; animation:fadeInUp 0.5s ease; }
        .ai-back { display:inline-flex; align-items:center; gap:6px; color:rgba(255,0,204,0.5); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; text-decoration:none; margin-bottom:24px; transition:all 0.2s; }
        .ai-back:hover { color:#FF00CC; }

        .ai-card { background:rgba(11,20,40,0.95); border:1px solid rgba(255,0,204,0.2); border-radius:8px; overflow:hidden; box-shadow:0 40px 80px rgba(0,0,0,0.5); }
        .ai-card-header { padding:28px 28px 20px; border-bottom:1px solid rgba(255,0,204,0.1); }
        .ai-eyebrow { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(255,0,204,0.4); letter-spacing:4px; margin-bottom:8px; }
        .ai-title { font-family:'Orbitron',monospace; font-size:18px; font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:10px; }
        .ai-org { font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:2px; }

        .ai-form { padding:28px; display:flex; flex-direction:column; gap:18px; }
        .ai-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,0,204,0.6); letter-spacing:3px; display:block; margin-bottom:8px; }
        .ai-input { width:100%; height:48px; padding:0 16px; background:rgba(255,0,204,0.04); border:1px solid rgba(255,0,204,0.15); border-radius:4px; color:#F4F4F9; font-family:'Rajdhani',sans-serif; font-size:16px; outline:none; transition:all 0.2s; }
        .ai-input:focus { border-color:#FF00CC; box-shadow:0 0 15px rgba(255,0,204,0.15); }
        .ai-input::placeholder { color:rgba(180,200,220,0.2); }
        .ai-input-readonly { height:48px; padding:0 16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:4px; color:rgba(180,200,220,0.5); font-family:'Rajdhani',sans-serif; font-size:16px; display:flex; align-items:center; }

        .ai-strength-track { height:4px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden; margin-top:8px; }
        .ai-strength-fill { height:100%; border-radius:2px; transition:all 0.3s; }
        .ai-strength-label { font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:3px; margin-top:4px; }
        .ai-match { font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:2px; margin-top:6px; }
        .ai-error { background:rgba(255,50,50,0.08); border:1px solid rgba(255,50,50,0.3); border-radius:4px; padding:12px 16px; font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,100,100,0.9); letter-spacing:2px; }

        .ai-submit { height:52px; background:linear-gradient(135deg,rgba(255,0,204,0.15),rgba(255,0,204,0.08)); border:1px solid rgba(255,0,204,0.4); border-radius:4px; color:#FF00CC; font-family:'Orbitron',monospace; font-size:13px; font-weight:700; letter-spacing:3px; cursor:pointer; transition:all 0.2s; width:100%; }
        .ai-submit:hover:not(:disabled) { border-color:#FF00CC; box-shadow:0 0 25px rgba(255,0,204,0.2); transform:translateY(-1px); }
        .ai-submit:disabled { opacity:0.4; cursor:not-allowed; }
      `}</style>

      <div className="ai-page">
        <div className="ai-grid" />
        <div className="ai-scanline" />
        <div className="ai-glow" />

        <div className="ai-wrap">
          <a href="/account/signin" className="ai-back">
            <ChevronLeft size={14} /> BACK TO SIGN IN
          </a>
          <Suspense
            fallback={
              <div
                style={{
                  color: "#FF00CC",
                  fontFamily: "monospace",
                  textAlign: "center",
                }}
              >
                LOADING...
              </div>
            }
          >
            <AcceptInviteForm />
          </Suspense>
        </div>
      </div>
    </>
  );
}
