"use client";
import { useState, useEffect, Suspense } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Search,
  User,
  Users as UsersIcon,
  Mail,
  Lock,
  Home,
} from "lucide-react";

function JoinForm() {
  const [joinCode, setJoinCode] = useState("");
  const [teamName, setTeamName] = useState("");
  const [captainName, setCaptainName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);

  // Pre-fill join code from URL ?code= param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) setJoinCode(code.toUpperCase());
  }, []);

  const mutation = useMutation({
    mutationFn: async (data) => {
      // 1. Create account
      const signupRes = await fetch("/api/account/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          name: data.captainName,
        }),
      });
      const signupData = await signupRes.json();
      if (!signupRes.ok)
        throw new Error(signupData.error || "Failed to create account");
      const userId = signupData.user?.id;
      if (!userId) throw new Error("Failed to get user ID after signup");

      // 2. Update role to captain
      await fetch("/api/super-admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_USER_ROLE",
          userId,
          role: "captain",
        }),
      });

      // 3. Join league — creates team
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "JOIN_LEAGUE",
          joinCode: data.joinCode,
          teamName: data.teamName,
          captainUserId: userId,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to join league");
      }
      const team = await res.json();

      // 4. Send welcome email
      await fetch("/api/auth/captain-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          name: data.captainName,
          teamName: data.teamName,
          joinCode: data.joinCode,
        }),
      }).catch(() => {}); // Don't block on email failure

      return team;
    },
    onSuccess: () => {
      setDone(true);
    },
    onError: () => {},
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate({ joinCode, teamName, captainName, email, password });
  };

  if (done) {
    return (
      <div
        className="join-card"
        style={{ textAlign: "center", padding: "48px 32px" }}
      >
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
          YOU&apos;RE IN!
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
          Account created successfully! Check your email for league details,
          then sign in to access your captain portal.
        </p>
        <a
          href="/account/signin"
          style={{
            display: "inline-block",
            background: "linear-gradient(135deg,#00FF9C,#00CC78)",
            color: "#091833",
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
    <div className="join-card">
      <form onSubmit={handleSubmit}>
        {/* Join code */}
        <label className="join-label">
          <Search size={12} /> LEAGUE JOIN CODE
        </label>
        <input
          required
          className="join-code-input"
          placeholder="XXXXXX"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          maxLength={10}
        />

        {/* Team name */}
        <label className="join-label">
          <UsersIcon size={12} /> TEAM NAME
        </label>
        <input
          required
          className="join-input"
          placeholder="e.g. Scorpions FC"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
        />

        {/* Captain account section */}
        <hr className="join-section-divider" />
        <p className="join-section-label">// CAPTAIN ACCOUNT</p>

        <label className="join-label">
          <User size={12} /> YOUR NAME
        </label>
        <input
          required
          className="join-input"
          placeholder="e.g. John Smith"
          value={captainName}
          onChange={(e) => setCaptainName(e.target.value)}
        />

        <label className="join-label">
          <Mail size={12} /> EMAIL ADDRESS
        </label>
        <input
          required
          type="email"
          className="join-input"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="join-label">
          <Lock size={12} /> PASSWORD
        </label>
        <input
          required
          type="password"
          className="join-input"
          placeholder="Min. 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
        />

        {mutation.isError && (
          <div
            style={{
              background: "rgba(255,50,50,0.08)",
              border: "1px solid rgba(255,50,50,0.3)",
              borderRadius: 4,
              padding: "12px 16px",
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: 10,
              color: "rgba(255,100,100,0.9)",
              letterSpacing: 2,
              marginBottom: 16,
            }}
          >
            // {mutation.error?.message?.toUpperCase()}
          </div>
        )}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="join-submit"
        >
          {mutation.isPending ? (
            <div
              style={{
                width: 20,
                height: 20,
                border: "2px solid #091833",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
          ) : (
            "CREATE ACCOUNT & JOIN LEAGUE"
          )}
        </button>
      </form>

      <div className="join-footer">
        <p className="join-signin">
          Already have an account? <a href="/account/signin">SIGN IN</a>
        </p>
      </div>
    </div>
  );
}

export default function JoinLeague() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }

        * { box-sizing:border-box; }
        .join-page { min-height:100vh; background:#091833; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px 24px; position:relative; overflow:hidden; font-family:'Rajdhani',sans-serif; }
        .join-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,255,156,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,156,0.03) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .join-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,255,156,0.3),transparent); animation:scanline 7s linear infinite; pointer-events:none; z-index:100; }
        .join-glow { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:600px; height:600px; background:radial-gradient(circle,rgba(0,255,156,0.04) 0%,transparent 70%); pointer-events:none; }

        .join-inner { width:100%; max-width:480px; position:relative; z-index:1; animation:fadeInUp 0.6s ease; }

        .join-logo { display:flex; flex-direction:column; align-items:center; margin-bottom:32px; }
        .join-icon { width:72px; height:72px; background:rgba(0,255,156,0.1); border:1px solid rgba(0,255,156,0.3); border-radius:8px; display:flex; align-items:center; justify-content:center; margin-bottom:16px; box-shadow:0 0 20px rgba(0,255,156,0.15); }
        .join-title { font-family:'Orbitron',monospace; font-size:20px; font-weight:900; color:#F4F4F9; letter-spacing:3px; margin-bottom:6px; }
        .join-subtitle { font-family:'Share Tech Mono',monospace; font-size:11px; color:rgba(0,255,156,0.6); letter-spacing:3px; }

        .join-card { background:rgba(11,20,40,0.9); border:1px solid rgba(0,255,156,0.2); border-radius:8px; padding:32px; backdrop-filter:blur(10px); position:relative; overflow:hidden; }
        .join-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,255,156,0.5),transparent); }

        .join-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,255,156,0.6); letter-spacing:3px; display:flex; align-items:center; gap:8px; margin-bottom:8px; }
        .join-input { width:100%; height:48px; background:rgba(0,255,156,0.05); border:1px solid rgba(0,255,156,0.2); border-radius:4px; padding:0 16px; color:#F4F4F9; font-family:'Rajdhani',sans-serif; font-size:16px; outline:none; transition:all 0.2s; margin-bottom:20px; }
        .join-input:focus { border-color:#00FF9C; box-shadow:0 0 15px rgba(0,255,156,0.15); background:rgba(0,255,156,0.08); }
        .join-input::placeholder { color:rgba(180,200,220,0.3); }

        .join-code-input { width:100%; height:64px; background:rgba(0,255,156,0.05); border:1px solid rgba(0,255,156,0.3); border-radius:4px; padding:0 16px; color:#00FF9C; font-family:'Orbitron',monospace; font-size:24px; font-weight:700; letter-spacing:8px; text-align:center; outline:none; transition:all 0.2s; margin-bottom:20px; text-transform:uppercase; }
        .join-code-input:focus { border-color:#00FF9C; box-shadow:0 0 20px rgba(0,255,156,0.2); background:rgba(0,255,156,0.08); }
        .join-code-input::placeholder { color:rgba(0,255,156,0.2); letter-spacing:8px; }

        .join-section-divider { border:none; border-top:1px solid rgba(0,255,156,0.1); margin:8px 0 20px; }
        .join-section-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,255,156,0.4); letter-spacing:4px; margin-bottom:20px; }

        .join-submit { width:100%; height:52px; background:linear-gradient(135deg,#00FF9C,#00CC78); color:#091833; font-family:'Orbitron',monospace; font-size:11px; font-weight:700; letter-spacing:2px; border:none; border-radius:4px; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 0 20px rgba(0,255,156,0.3); margin-top:8px; }
        .join-submit:hover { transform:translateY(-2px); box-shadow:0 0 30px rgba(0,255,156,0.5); }
        .join-submit:disabled { opacity:0.5; cursor:not-allowed; transform:none; }

        .join-footer { display:flex; flex-direction:column; align-items:center; gap:12px; margin-top:16px; }
        .join-signin { font-family:'Share Tech Mono',monospace; font-size:11px; color:rgba(0,255,156,0.4); letter-spacing:2px; }
        .join-signin a { color:#00FF9C; text-decoration:none; transition:all 0.2s; }
        .join-signin a:hover { text-shadow:0 0 10px rgba(0,255,156,0.5); }
        .join-back { display:flex; align-items:center; gap:8px; color:rgba(0,255,156,0.3); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; text-decoration:none; transition:all 0.2s; }
        .join-back:hover { color:#00FF9C; }
      `}</style>

      <div className="join-page">
        <div className="join-grid" />
        <div className="join-scanline" />
        <div className="join-glow" />

        <div className="join-inner">
          <div className="join-logo">
            <div className="join-icon">
              <UsersIcon size={32} color="#00FF9C" />
            </div>
            <h1 className="join-title">REGISTER YOUR TEAM</h1>
            <p className="join-subtitle">// CREATE ACCOUNT & JOIN LEAGUE</p>
          </div>

          <Suspense
            fallback={
              <div
                style={{
                  color: "#00FF9C",
                  fontFamily: "monospace",
                  textAlign: "center",
                }}
              >
                LOADING...
              </div>
            }
          >
            <JoinForm />
          </Suspense>

          <a
            href="/"
            className="join-back"
            style={{ marginTop: 16, display: "flex", justifyContent: "center" }}
          >
            <Home size={12} /> BACK TO HOME
          </a>
        </div>
      </div>
    </>
  );
}
