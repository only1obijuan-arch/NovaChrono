"use client";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes success-glow { 0%,100% { box-shadow:0 0 20px rgba(0,255,156,0.2); } 50% { box-shadow:0 0 40px rgba(0,255,156,0.4); } }

        * { box-sizing:border-box; }
        .fp-page { min-height:100vh; background:#091833; display:flex; align-items:center; justify-content:center; padding:24px; font-family:'Rajdhani',sans-serif; position:relative; overflow:hidden; }
        .fp-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,245,212,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,212,0.025) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .fp-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.4),transparent); animation:scanline 6s linear infinite; pointer-events:none; z-index:100; }
        .fp-glow { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:600px; height:600px; background:radial-gradient(circle,rgba(0,245,212,0.04) 0%,transparent 70%); pointer-events:none; }

        .fp-wrap { width:100%; max-width:420px; position:relative; z-index:10; animation:fadeInUp 0.5s ease; }
        .fp-back { display:inline-flex; align-items:center; gap:6px; color:rgba(0,245,212,0.5); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; text-decoration:none; margin-bottom:24px; transition:all 0.2s; }
        .fp-back:hover { color:#00F5D4; }
        .fp-card { background:rgba(11,20,40,0.95); border:1px solid rgba(0,245,212,0.2); border-radius:8px; overflow:hidden; box-shadow:0 40px 80px rgba(0,0,0,0.5); }
        .fp-card-header { padding:28px; border-bottom:1px solid rgba(0,245,212,0.1); }
        .fp-eyebrow { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.4); letter-spacing:4px; margin-bottom:8px; }
        .fp-title { font-family:'Orbitron',monospace; font-size:18px; font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:6px; }
        .fp-sub { font-family:'Rajdhani',sans-serif; font-size:14px; color:rgba(180,200,220,0.5); line-height:1.5; }
        .fp-form { padding:28px; display:flex; flex-direction:column; gap:20px; }
        .fp-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.6); letter-spacing:3px; display:block; margin-bottom:8px; }
        .fp-input { width:100%; height:48px; padding:0 16px; background:rgba(0,245,212,0.04); border:1px solid rgba(0,245,212,0.15); border-radius:4px; color:#F4F4F9; font-family:'Rajdhani',sans-serif; font-size:16px; outline:none; transition:all 0.2s; }
        .fp-input:focus { border-color:#00F5D4; box-shadow:0 0 15px rgba(0,245,212,0.15); }
        .fp-input::placeholder { color:rgba(180,200,220,0.2); }
        .fp-error { background:rgba(255,50,50,0.08); border:1px solid rgba(255,50,50,0.3); border-radius:4px; padding:12px 16px; font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,100,100,0.9); letter-spacing:2px; }
        .fp-submit { height:52px; background:linear-gradient(135deg,rgba(0,245,212,0.15),rgba(0,245,212,0.08)); border:1px solid rgba(0,245,212,0.4); border-radius:4px; color:#00F5D4; font-family:'Orbitron',monospace; font-size:13px; font-weight:700; letter-spacing:3px; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:10px; }
        .fp-submit:hover:not(:disabled) { border-color:#00F5D4; box-shadow:0 0 25px rgba(0,245,212,0.2); transform:translateY(-1px); }
        .fp-submit:disabled { opacity:0.4; cursor:not-allowed; }
        .fp-spinner { width:18px; height:18px; border:2px solid rgba(0,245,212,0.3); border-top-color:#00F5D4; border-radius:50%; animation:spin 0.8s linear infinite; }
        .fp-success { padding:32px; text-align:center; }
        .fp-success-icon { width:64px; height:64px; background:rgba(0,255,156,0.08); border:2px solid rgba(0,255,156,0.4); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 20px; font-size:28px; animation:success-glow 2s infinite; }
        .fp-success-title { font-family:'Orbitron',monospace; font-size:16px; font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:12px; }
        .fp-success-sub { font-family:'Rajdhani',sans-serif; font-size:15px; color:rgba(180,200,220,0.5); line-height:1.6; margin-bottom:24px; }
        .fp-success-note { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.3); letter-spacing:3px; }
      `}</style>

      <div className="fp-page">
        <div className="fp-grid" />
        <div className="fp-scanline" />
        <div className="fp-glow" />

        <div className="fp-wrap">
          <a href="/account/signin" className="fp-back">
            <ChevronLeft size={14} /> BACK TO SIGN IN
          </a>
          <div className="fp-card">
            {sent ? (
              <div className="fp-success">
                <div className="fp-success-icon">📨</div>
                <h2 className="fp-success-title">CHECK YOUR EMAIL</h2>
                <p className="fp-success-sub">
                  If an account exists for{" "}
                  <strong style={{ color: "#00F5D4" }}>{email}</strong>, a
                  password reset link has been sent. Check your inbox and spam
                  folder.
                </p>
                <p className="fp-success-note">// LINK EXPIRES IN 1 HOUR</p>
              </div>
            ) : (
              <>
                <div className="fp-card-header">
                  <p className="fp-eyebrow">// ACCOUNT RECOVERY</p>
                  <h1 className="fp-title">FORGOT PASSWORD</h1>
                  <p className="fp-sub">
                    Enter your email address and we'll send you a link to reset
                    your password.
                  </p>
                </div>
                <form onSubmit={handleSubmit} className="fp-form">
                  <div>
                    <label className="fp-label">EMAIL ADDRESS</label>
                    <input
                      required
                      type="email"
                      className="fp-input"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoFocus
                    />
                  </div>
                  {error && (
                    <div className="fp-error">// {error.toUpperCase()}</div>
                  )}
                  <button
                    type="submit"
                    className="fp-submit"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <div className="fp-spinner" /> SENDING...
                      </>
                    ) : (
                      "SEND RESET LINK →"
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