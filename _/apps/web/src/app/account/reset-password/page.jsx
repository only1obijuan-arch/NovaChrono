"use client";
import { useState, useEffect } from "react";
import { ChevronLeft } from "lucide-react";

export default function ResetPassword() {
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState(null);
  const [tokenValid, setTokenValid] = useState(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  // Fix hydration error - only render after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) {
      setTokenValid(false);
      return;
    }
    setToken(t);

    console.log("Validating token...");
    fetch(
      `${
        window.location.origin
      }/api/auth/reset-password?token=${encodeURIComponent(t)}`
    )
      .then((res) => res.json())
      .then((data) => {
        console.log("Token validation response:", data);
        setTokenValid(data.valid);
      })
      .catch((err) => {
        console.error("Token validation error:", err);
        setTokenValid(false);
      });
  }, [mounted]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      // Use fully qualified URL to avoid any path resolution issues
      const apiUrl = `${window.location.origin}/api/auth/reset-password`;
      console.log("Submitting password reset to:", apiUrl);
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      console.log("Password reset response:", data);
      if (!res.ok) throw new Error(data.error);
      setDone(true);
    } catch (err) {
      console.error("Password reset error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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

  // Don't render until mounted to avoid hydration errors
  if (!mounted) {
    return null;
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes success-glow { 0%,100% { box-shadow:0 0 20px rgba(0,255,156,0.2); } 50% { box-shadow:0 0 40px rgba(0,255,156,0.4); } }

        * { box-sizing:border-box; }
        .rp-page { min-height:100vh; background:#091833; display:flex; align-items:center; justify-content:center; padding:24px; font-family:'Rajdhani',sans-serif; position:relative; overflow:hidden; }
        .rp-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,245,212,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,212,0.025) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .rp-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.4),transparent); animation:scanline 6s linear infinite; pointer-events:none; z-index:100; }
        .rp-glow { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:600px; height:600px; background:radial-gradient(circle,rgba(0,245,212,0.04) 0%,transparent 70%); pointer-events:none; }

        .rp-wrap { width:100%; max-width:420px; position:relative; z-index:10; animation:fadeInUp 0.5s ease; }
        .rp-back { display:inline-flex; align-items:center; gap:6px; color:rgba(0,245,212,0.5); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; text-decoration:none; margin-bottom:24px; transition:all 0.2s; }
        .rp-back:hover { color:#00F5D4; }
        .rp-card { background:rgba(11,20,40,0.95); border:1px solid rgba(0,245,212,0.2); border-radius:8px; overflow:hidden; box-shadow:0 40px 80px rgba(0,0,0,0.5); }
        .rp-card-header { padding:28px; border-bottom:1px solid rgba(0,245,212,0.1); }
        .rp-eyebrow { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.4); letter-spacing:4px; margin-bottom:8px; }
        .rp-title { font-family:'Orbitron',monospace; font-size:18px; font-weight:900; color:#F4F4F9; letter-spacing:2px; }
        .rp-form { padding:28px; display:flex; flex-direction:column; gap:20px; }
        .rp-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.6); letter-spacing:3px; display:block; margin-bottom:8px; }
        .rp-input { width:100%; height:48px; padding:0 16px; background:rgba(0,245,212,0.04); border:1px solid rgba(0,245,212,0.15); border-radius:4px; color:#F4F4F9; font-family:'Rajdhani',sans-serif; font-size:16px; outline:none; transition:all 0.2s; }
        .rp-input:focus { border-color:#00F5D4; box-shadow:0 0 15px rgba(0,245,212,0.15); }
        .rp-input::placeholder { color:rgba(180,200,220,0.2); }
        .rp-strength-track { height:4px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden; margin-top:8px; }
        .rp-strength-fill { height:100%; border-radius:2px; transition:all 0.3s; }
        .rp-strength-label { font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:3px; margin-top:4px; }
        .rp-match { font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:2px; margin-top:6px; }
        .rp-error { background:rgba(255,50,50,0.08); border:1px solid rgba(255,50,50,0.3); border-radius:4px; padding:12px 16px; font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,100,100,0.9); letter-spacing:2px; }
        .rp-submit { height:52px; background:linear-gradient(135deg,rgba(0,245,212,0.15),rgba(0,245,212,0.08)); border:1px solid rgba(0,245,212,0.4); border-radius:4px; color:#00F5D4; font-family:'Orbitron',monospace; font-size:13px; font-weight:700; letter-spacing:3px; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:10px; }
        .rp-submit:hover:not(:disabled) { border-color:#00F5D4; box-shadow:0 0 25px rgba(0,245,212,0.2); transform:translateY(-1px); }
        .rp-submit:disabled { opacity:0.4; cursor:not-allowed; }
        .rp-spinner { width:18px; height:18px; border:2px solid rgba(0,245,212,0.3); border-top-color:#00F5D4; border-radius:50%; animation:spin 0.8s linear infinite; }
        .rp-invalid { padding:40px 32px; text-align:center; }
        .rp-invalid-icon { font-size:40px; margin-bottom:16px; }
        .rp-invalid-title { font-family:'Orbitron',monospace; font-size:16px; color:#F4F4F9; letter-spacing:2px; margin-bottom:8px; }
        .rp-invalid-sub { font-family:'Rajdhani',sans-serif; font-size:14px; color:rgba(180,200,220,0.4); margin-bottom:24px; line-height:1.5; }
        .rp-invalid-btn { display:inline-block; background:rgba(0,245,212,0.08); border:1px solid rgba(0,245,212,0.3); color:#00F5D4; font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:2px; padding:12px 24px; border-radius:4px; text-decoration:none; transition:all 0.2s; }
        .rp-invalid-btn:hover { background:rgba(0,245,212,0.14); border-color:#00F5D4; }
        .rp-success { padding:32px; text-align:center; }
        .rp-success-icon { width:64px; height:64px; background:rgba(0,255,156,0.08); border:2px solid rgba(0,255,156,0.4); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 20px; font-size:28px; animation:success-glow 2s infinite; }
        .rp-success-title { font-family:'Orbitron',monospace; font-size:16px; font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:12px; }
        .rp-success-sub { font-family:'Rajdhani',sans-serif; font-size:15px; color:rgba(180,200,220,0.5); margin-bottom:24px; }
        .rp-success-btn { display:inline-block; background:linear-gradient(135deg,#00FF9C,#00CC78); color:#091833; font-family:'Orbitron',monospace; font-size:12px; font-weight:700; letter-spacing:2px; padding:14px 32px; border-radius:4px; text-decoration:none; transition:all 0.2s; }
        .rp-success-btn:hover { box-shadow:0 0 20px rgba(0,255,156,0.4); }
      `}</style>

      <div className="rp-page">
        <div className="rp-grid" />
        <div className="rp-scanline" />
        <div className="rp-glow" />

        <div className="rp-wrap">
          <a href="/account/signin" className="rp-back">
            <ChevronLeft size={14} /> BACK TO SIGN IN
          </a>
          <div className="rp-card">
            {tokenValid === null ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    border: "2px solid #00F5D4",
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                    margin: "0 auto",
                  }}
                />
              </div>
            ) : tokenValid === false ? (
              <div className="rp-invalid">
                <div className="rp-invalid-icon">🔗</div>
                <h2 className="rp-invalid-title">LINK EXPIRED</h2>
                <p className="rp-invalid-sub">
                  This reset link is invalid or has expired. Reset links are
                  valid for 1 hour.
                </p>
                <a href="/account/forgot-password" className="rp-invalid-btn">
                  REQUEST NEW LINK →
                </a>
              </div>
            ) : done ? (
              <div className="rp-success">
                <div className="rp-success-icon">✓</div>
                <h2 className="rp-success-title">PASSWORD UPDATED</h2>
                <p className="rp-success-sub">
                  Your password has been successfully reset. You can now sign in
                  with your new password.
                </p>
                <a href="/account/signin" className="rp-success-btn">
                  SIGN IN →
                </a>
              </div>
            ) : (
              <>
                <div className="rp-card-header">
                  <p className="rp-eyebrow">// ACCOUNT RECOVERY</p>
                  <h1 className="rp-title">SET NEW PASSWORD</h1>
                </div>
                <form onSubmit={handleSubmit} className="rp-form">
                  <div>
                    <label className="rp-label">NEW PASSWORD</label>
                    <input
                      required
                      type="password"
                      className="rp-input"
                      placeholder="Min. 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                    />
                    {strength && (
                      <>
                        <div className="rp-strength-track">
                          <div
                            className="rp-strength-fill"
                            style={{
                              width: strength.width,
                              background: strength.color,
                            }}
                          />
                        </div>
                        <p
                          className="rp-strength-label"
                          style={{ color: strength.color }}
                        >
                          {strength.label}
                        </p>
                      </>
                    )}
                  </div>
                  <div>
                    <label className="rp-label">CONFIRM PASSWORD</label>
                    <input
                      required
                      type="password"
                      className="rp-input"
                      placeholder="Re-enter password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                    {confirm && (
                      <p
                        className="rp-match"
                        style={{
                          color:
                            password === confirm
                              ? "#00FF9C"
                              : "rgba(255,80,80,0.7)",
                        }}
                      >
                        {password === confirm
                          ? "✓ PASSWORDS MATCH"
                          : "✗ PASSWORDS DO NOT MATCH"}
                      </p>
                    )}
                  </div>
                  {error && (
                    <div className="rp-error">// {error.toUpperCase()}</div>
                  )}
                  <button
                    type="submit"
                    className="rp-submit"
                    disabled={
                      loading ||
                      password !== confirm ||
                      !strength ||
                      strength.label === "TOO SHORT"
                    }
                  >
                    {loading ? (
                      <>
                        <div className="rp-spinner" /> UPDATING...
                      </>
                    ) : (
                      "UPDATE PASSWORD →"
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}