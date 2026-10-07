"use client";
import { withJoinCode } from "@/utils/join-navigation";
import { isValidJoinCode } from "@/utils/join-code";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

function SignUpContent() {
  const searchParams = useSearchParams();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [joinCode, setJoinCode] = useState(() =>
    (searchParams.get("code") || "").toUpperCase()
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [teamName, setTeamName] = useState("");

  const strengthCheck = (p) => {
    if (!p) return null;
    if (p.length < 8) return { label: "TOO SHORT", color: "rgba(255,80,80,0.7)", width: "20%" };
    if (p.length < 10 || !/[0-9]/.test(p)) return { label: "WEAK", color: "rgba(255,160,0,0.7)", width: "40%" };
    if (!/[A-Z]/.test(p) || !/[^a-zA-Z0-9]/.test(p)) return { label: "FAIR", color: "rgba(255,215,0,0.7)", width: "65%" };
    return { label: "STRONG", color: "#00FF9C", width: "100%" };
  };
  const strength = strengthCheck(password);
  const passwordsMatch = confirm && password === confirm;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!joinCode.trim() || !name.trim() || !email || !password || !teamName.trim()) {
      setError("Please fill in all fields");
      return;
    }
    if (!isValidJoinCode(joinCode)) {
      setError("League code must be 6 or 8 letters or digits");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!strength || strength.label === "TOO SHORT") {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/account/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: joinCode.trim(), name, email, password, teamName }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error?.toLowerCase().includes("email already exists") || data.error?.toLowerCase().includes("already exists")) {
          setError("__EMAIL_EXISTS__");
        } else {
          setError(data.error || "Failed to create account. Please try again.");
        }
        setLoading(false);
        return;
      }

      setDone(true);
    } catch (err) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const canSubmit = !loading && isValidJoinCode(joinCode) && name.trim() && email &&
    strength && strength.label !== "TOO SHORT" && passwordsMatch && teamName.trim();

  if (done) {
    return (
      <>
        <style>{`
          @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
          @keyframes pulse-ring { 0%,100% { box-shadow:0 0 20px rgba(0,255,156,0.3); } 50% { box-shadow:0 0 40px rgba(0,255,156,0.6); } }
          * { box-sizing:border-box; margin:0; padding:0; }
          .su-page { min-height:100vh; background:#091833; display:flex; align-items:center; justify-content:center; padding:24px; font-family:var(--font-ui); }
        `}</style>
        <div className="su-page">
          <div style={{ textAlign: "center", animation: "fadeInUp 0.5s ease", maxWidth: 420, width: "100%" }}>
            <div style={{
              width: 80, height: 80,
              background: "rgba(0,255,156,0.08)",
              border: "2px solid rgba(0,255,156,0.4)",
              borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 24px",
              animation: "pulse-ring 3s infinite",
              fontSize: 36,
            }}>✓</div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, color: "#F4F4F9", letterSpacing: 2, marginBottom: 12 }}>
              WELCOME TO THE LEAGUE
            </h1>
            <p style={{ fontFamily: "var(--font-code)", fontSize: 11, color: "rgba(0,245,212,0.5)", letterSpacing: 2, marginBottom: 32, lineHeight: 1.8 }}>
              YOUR TEAM IS REGISTERED.<br />CHECK YOUR EMAIL, THEN SIGN IN.
            </p>
            <a href="/account/signin" style={{
              display: "inline-block",
              background: "linear-gradient(135deg,rgba(0,245,212,0.15),rgba(0,245,212,0.08))",
              border: "1px solid rgba(0,245,212,0.4)",
              color: "#00F5D4",
              fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, letterSpacing: 3,
              padding: "16px 32px", borderRadius: 4, textDecoration: "none",
            }}>
              SIGN IN NOW →
            </a>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes logo-pulse { 0%,100% { box-shadow:0 0 20px rgba(0,245,212,0.3),0 0 40px rgba(0,245,212,0.1); } 50% { box-shadow:0 0 35px rgba(0,245,212,0.6),0 0 70px rgba(0,245,212,0.2); } }
        * { box-sizing:border-box; margin:0; padding:0; }
        .su-page { min-height:100vh; background:#091833; display:flex; align-items:center; justify-content:center; padding:24px; font-family:var(--font-ui); position:relative; overflow:hidden; }
        .su-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,245,212,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,212,0.025) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .su-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.4),transparent); animation:scanline 6s linear infinite; pointer-events:none; z-index:100; }
        .su-glow-tl { position:fixed; top:-300px; left:-300px; width:700px; height:700px; background:radial-gradient(circle,rgba(0,245,212,0.06) 0%,transparent 70%); pointer-events:none; }
        .su-glow-br { position:fixed; bottom:-300px; right:-300px; width:700px; height:700px; background:radial-gradient(circle,rgba(255,0,204,0.04) 0%,transparent 70%); pointer-events:none; }
        .su-wrap { width:100%; max-width:420px; position:relative; z-index:10; animation:fadeInUp 0.5s ease; }
        .su-logo-wrap { display:flex; flex-direction:column; align-items:center; margin-bottom:28px; }
        .su-logo { width:160px; height:160px; border-radius:12px; overflow:hidden; margin-bottom:16px; animation:logo-pulse 3s infinite; }
        .su-logo img { width:100%; height:100%; object-fit:contain; display:block; }
        .su-tagline { font-family:var(--font-code); font-size:10px; color:rgba(0,245,212,0.5); letter-spacing:4px; margin-top:6px; }
        .su-card { background:rgba(11,20,40,0.95); border:1px solid rgba(0,245,212,0.2); border-radius:8px; overflow:hidden; backdrop-filter:blur(20px); box-shadow:0 40px 80px rgba(0,0,0,0.5),0 0 40px rgba(0,245,212,0.05); }
        .su-card-header { padding:24px; border-bottom:1px solid rgba(0,245,212,0.1); text-align:center; }
        .su-card-title { font-family:var(--font-display); font-size:16px; font-weight:700; color:#F4F4F9; letter-spacing:2px; margin-bottom:6px; }
        .su-card-sub { font-family:var(--font-code); font-size:10px; color:rgba(0,245,212,0.4); letter-spacing:3px; }
        .su-form { padding:28px; display:flex; flex-direction:column; gap:18px; }
        .su-field { display:flex; flex-direction:column; gap:8px; }
        .su-label { font-family:var(--font-code); font-size:10px; color:rgba(0,245,212,0.6); letter-spacing:3px; }
        .su-input { height:48px; padding:0 16px; background:rgba(0,245,212,0.04); border:1px solid rgba(0,245,212,0.15); border-radius:4px; color:#F4F4F9; font-family:var(--font-ui); font-size:16px; outline:none; transition:all 0.2s; }
        .su-input:focus { border-color:#00F5D4; box-shadow:0 0 15px rgba(0,245,212,0.15); background:rgba(0,245,212,0.06); }
        .su-input::placeholder { color:rgba(180,200,220,0.2); }
        .su-input-code { text-transform:uppercase; letter-spacing:6px; font-family:var(--font-code); font-size:18px; font-weight:700; text-align:center; }
        .su-strength-track { height:3px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden; margin-top:8px; }
        .su-strength-fill { height:100%; border-radius:2px; transition:all 0.3s; }
        .su-strength-label { font-family:var(--font-code); font-size:9px; letter-spacing:3px; margin-top:4px; }
        .su-match { font-family:var(--font-code); font-size:9px; letter-spacing:2px; margin-top:6px; }
        .su-error { background:rgba(255,50,50,0.08); border:1px solid rgba(255,50,50,0.3); border-radius:4px; padding:12px 16px; font-family:var(--font-code); font-size:10px; color:rgba(255,100,100,0.9); letter-spacing:2px; }
        .su-exists { background:rgba(0,245,212,0.06); border:1px solid rgba(0,245,212,0.3); border-radius:4px; padding:14px 16px; font-family:var(--font-code); font-size:10px; color:rgba(0,245,212,0.9); letter-spacing:2px; line-height:1.8; }
        .su-exists a { color:#00F5D4; text-decoration:underline; }
        .su-submit { height:52px; background:linear-gradient(135deg,rgba(0,245,212,0.15),rgba(0,245,212,0.08)); border:1px solid rgba(0,245,212,0.4); border-radius:4px; color:#00F5D4; font-family:var(--font-display); font-size:13px; font-weight:700; letter-spacing:3px; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:10px; width:100%; }
        .su-submit:hover:not(:disabled) { background:linear-gradient(135deg,rgba(0,245,212,0.25),rgba(0,245,212,0.12)); border-color:#00F5D4; box-shadow:0 0 25px rgba(0,245,212,0.2); transform:translateY(-1px); }
        .su-submit:disabled { opacity:0.4; cursor:not-allowed; }
        .su-spinner { width:18px; height:18px; border:2px solid rgba(0,245,212,0.3); border-top-color:#00F5D4; border-radius:50%; animation:spin 0.8s linear infinite; }
        .su-footer { text-align:center; margin-top:24px; font-family:var(--font-code); font-size:9px; color:rgba(180,200,220,0.15); letter-spacing:3px; }
      `}</style>

      <div className="su-page">
        <div className="su-grid" />
        <div className="su-scanline" />
        <div className="su-glow-tl" />
        <div className="su-glow-br" />

        <div className="su-wrap">
          <div className="su-logo-wrap">
            <div className="su-logo">
              <Image
                src="https://ucarecdn.com/8aaa83a5-036d-4640-875b-46aff367bee7/-/format/auto/"
                alt="NovaChrono"
                width={160}
                height={160}
                unoptimized
              />
            </div>
            <p className="su-tagline">TIME PAUSES. YOUR LEAGUE NEVER DOES.</p>
          </div>

          <div className="su-card">
            <div className="su-card-header">
              <h2 className="su-card-title">JOIN A LEAGUE</h2>
              <p className="su-card-sub">CAPTAIN REGISTRATION</p>
            </div>

            <form onSubmit={onSubmit} className="su-form">
              <div className="su-field">
                <label className="su-label">LEAGUE CODE</label>
                <input
                  required
                  type="text"
                  className="su-input su-input-code"
                  placeholder="XXXXXX"
                  maxLength={8}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  autoComplete="off"
                  autoFocus
                />
              </div>

              <div className="su-field">
                <label className="su-label">FULL NAME</label>
                <input required type="text" className="su-input" placeholder="e.g. John Smith"
                  value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>

              <div className="su-field">
                <label className="su-label">EMAIL ADDRESS</label>
                <input required type="email" className="su-input" placeholder="you@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>

              <div className="su-field">
                <label className="su-label">PASSWORD</label>
                <input required type="password" className="su-input" placeholder="Min. 8 characters"
                  value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                {strength && (
                  <>
                    <div className="su-strength-track">
                      <div className="su-strength-fill" style={{ width: strength.width, background: strength.color }} />
                    </div>
                    <p className="su-strength-label" style={{ color: strength.color }}>{strength.label}</p>
                  </>
                )}
              </div>

              <div className="su-field">
                <label className="su-label">CONFIRM PASSWORD</label>
                <input required type="password" className="su-input" placeholder="Re-enter password"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
                {confirm && (
                  <p className="su-match" style={{ color: passwordsMatch ? "#00FF9C" : "rgba(255,80,80,0.7)" }}>
                    {passwordsMatch ? "✓ PASSWORDS MATCH" : "✗ PASSWORDS DO NOT MATCH"}
                  </p>
                )}
              </div>

              <div className="su-field">
                <label className="su-label">TEAM NAME</label>
                <input required type="text" className="su-input" placeholder="e.g. Thunder FC"
                  value={teamName} onChange={(e) => setTeamName(e.target.value)} autoComplete="organization" />
              </div>

              {error === "__EMAIL_EXISTS__" ? (
                <div className="su-exists">
                  ALREADY HAVE AN ACCOUNT?{" "}
                  <a href={withJoinCode("/account/signin", joinCode)}>
                    SIGN IN AND USE YOUR LEAGUE CODE TO JOIN.
                  </a>
                </div>
              ) : error ? (
                <div className="su-error">{error.toUpperCase()}</div>
              ) : null}

              <button type="submit" className="su-submit" disabled={!canSubmit}>
                {loading ? <><div className="su-spinner" /> REGISTERING...</> : "JOIN LEAGUE →"}
              </button>
            </form>
          </div>
          <p className="su-footer">© 2025 NOVACHRONO. ALL RIGHTS RESERVED.</p>
        </div>
      </div>
    </>
  );
}

export default function SignUp() {
  return (
    <Suspense fallback={null}>
      <SignUpContent />
    </Suspense>
  );
}
