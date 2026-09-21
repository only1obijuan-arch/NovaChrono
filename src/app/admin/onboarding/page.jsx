"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AdminOnboarding() {
  const { status } = useSession();
  const router = useRouter();
  const [venueId, setVenueId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const pendingVenueId = localStorage.getItem("pendingVenueId");
      if (pendingVenueId) setVenueId(pendingVenueId);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId }),
      });
      if (res.ok) {
        localStorage.removeItem("pendingVenueId");
        router.push("/admin");
      } else {
        alert("Failed to complete onboarding");
        setSaving(false);
      }
    } catch (error) {
      console.error(error);
      alert("An error occurred");
      setSaving(false);
    }
  };

  if (status === "loading")
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#091833",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 48,
              height: 48,
              border: "3px solid #FF00CC",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p
            style={{
              color: "#FF00CC",
              fontFamily: "monospace",
              letterSpacing: 4,
              fontSize: 12,
            }}
          >
            LOADING...
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        @keyframes logo-pulse { 0%,100% { box-shadow:0 0 20px rgba(255,0,204,0.3); } 50% { box-shadow:0 0 40px rgba(255,0,204,0.6); } }
        @keyframes progress { from { width:0%; } to { width:100%; } }

        * { box-sizing:border-box; }
        .ob-page { min-height:100vh; background:#091833; display:flex; align-items:center; justify-content:center; padding:24px; font-family:'Rajdhani',sans-serif; position:relative; overflow:hidden; }
        .ob-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(255,0,204,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,0,204,0.02) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .ob-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(255,0,204,0.3),transparent); animation:scanline 6s linear infinite; pointer-events:none; z-index:100; }
        .ob-glow { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:700px; height:700px; background:radial-gradient(circle,rgba(255,0,204,0.04) 0%,transparent 70%); pointer-events:none; }

        .ob-wrap { width:100%; max-width:440px; position:relative; z-index:10; animation:fadeInUp 0.5s ease; }

        .ob-icon-wrap { display:flex; flex-direction:column; align-items:center; margin-bottom:32px; }
        .ob-icon { width:72px; height:72px; background:rgba(255,0,204,0.08); border:2px solid rgba(255,0,204,0.4); border-radius:8px; display:flex; align-items:center; justify-content:center; margin-bottom:16px; animation:logo-pulse 3s infinite; font-size:28px; position:relative; }
        .ob-icon-corner { position:absolute; width:8px; height:8px; border-color:rgba(255,0,204,0.6); border-style:solid; }
        .ob-icon-corner.tl { top:-1px; left:-1px; border-width:2px 0 0 2px; }
        .ob-icon-corner.tr { top:-1px; right:-1px; border-width:2px 2px 0 0; }
        .ob-icon-corner.bl { bottom:-1px; left:-1px; border-width:0 0 2px 2px; }
        .ob-icon-corner.br { bottom:-1px; right:-1px; border-width:0 2px 2px 0; }
        .ob-brand { font-family:'Orbitron',monospace; font-size:20px; font-weight:900; color:#F4F4F9; letter-spacing:4px; }
        .ob-brand-sub { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,0,204,0.4); letter-spacing:4px; margin-top:6px; }

        .ob-card { background:rgba(11,20,40,0.95); border:1px solid rgba(255,0,204,0.2); border-radius:8px; overflow:hidden; box-shadow:0 40px 80px rgba(0,0,0,0.5),0 0 40px rgba(255,0,204,0.04); }

        .ob-progress-bar { height:3px; background:rgba(255,0,204,0.1); position:relative; overflow:hidden; }
        .ob-progress-fill { height:100%; width:60%; background:linear-gradient(90deg,#FF00CC,#AA0088); box-shadow:0 0 10px rgba(255,0,204,0.5); animation:progress 1s ease forwards; }

        .ob-card-header { padding:28px 28px 24px; border-bottom:1px solid rgba(255,0,204,0.1); }
        .ob-step-indicator { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(255,0,204,0.4); letter-spacing:4px; margin-bottom:10px; }
        .ob-title { font-family:'Orbitron',monospace; font-size:18px; font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:8px; }
        .ob-subtitle { font-family:'Rajdhani',sans-serif; font-size:15px; color:rgba(180,200,220,0.5); line-height:1.5; }

        .ob-steps { padding:24px 28px; border-bottom:1px solid rgba(255,0,204,0.08); display:flex; flex-direction:column; gap:12px; }
        .ob-step { display:flex; align-items:center; gap:12px; }
        .ob-step-dot { width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:'Orbitron',monospace; font-size:10px; font-weight:700; flex-shrink:0; }
        .ob-step-dot.done { background:rgba(0,255,156,0.15); border:1px solid rgba(0,255,156,0.4); color:#00FF9C; }
        .ob-step-dot.active { background:rgba(255,0,204,0.15); border:1px solid rgba(255,0,204,0.5); color:#FF00CC; box-shadow:0 0 10px rgba(255,0,204,0.2); }
        .ob-step-dot.pending { background:rgba(180,200,220,0.05); border:1px solid rgba(180,200,220,0.15); color:rgba(180,200,220,0.3); }
        .ob-step-label { font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:2px; }
        .ob-step-label.done { color:rgba(0,255,156,0.7); }
        .ob-step-label.active { color:#F4F4F9; }
        .ob-step-label.pending { color:rgba(180,200,220,0.3); }

        .ob-form { padding:28px; }
        .ob-submit { width:100%; height:52px; background:linear-gradient(135deg,rgba(255,0,204,0.2),rgba(255,0,204,0.1)); border:1px solid rgba(255,0,204,0.4); border-radius:4px; color:#FF00CC; font-family:'Orbitron',monospace; font-size:13px; font-weight:700; letter-spacing:3px; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:10px; }
        .ob-submit:hover:not(:disabled) { background:linear-gradient(135deg,rgba(255,0,204,0.3),rgba(255,0,204,0.15)); border-color:#FF00CC; box-shadow:0 0 30px rgba(255,0,204,0.2); transform:translateY(-1px); }
        .ob-submit:disabled { opacity:0.3; cursor:not-allowed; transform:none; }
        .ob-spinner { width:18px; height:18px; border:2px solid rgba(255,0,204,0.3); border-top-color:#FF00CC; border-radius:50%; animation:spin 0.8s linear infinite; }

        .ob-note { margin-top:16px; text-align:center; font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(180,200,220,0.2); letter-spacing:3px; }

        .ob-footer { text-align:center; margin-top:24px; font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(180,200,220,0.1); letter-spacing:3px; }
      `}</style>

      <div className="ob-page">
        <div className="ob-grid" />
        <div className="ob-scanline" />
        <div className="ob-glow" />

        <div className="ob-wrap">
          <div className="ob-icon-wrap">
            <div className="ob-icon">
              ⚡
              <div className="ob-icon-corner tl" />
              <div className="ob-icon-corner tr" />
              <div className="ob-icon-corner bl" />
              <div className="ob-icon-corner br" />
            </div>
            <p className="ob-brand">NOVACHRONO</p>
            <p className="ob-brand-sub">// ADMIN SETUP</p>
          </div>

          <div className="ob-card">
            <div className="ob-progress-bar">
              <div className="ob-progress-fill" />
            </div>

            <div className="ob-card-header">
              <p className="ob-step-indicator">STEP 2 OF 3</p>
              <h1 className="ob-title">COMPLETE SETUP</h1>
              <p className="ob-subtitle">
                Finalizing your venue admin account. This links your profile to
                your assigned venue.
              </p>
            </div>

            <div className="ob-steps">
              <div className="ob-step">
                <div className="ob-step-dot done">✓</div>
                <span className="ob-step-label done">ACCOUNT CREATED</span>
              </div>
              <div className="ob-step">
                <div className="ob-step-dot active">2</div>
                <span className="ob-step-label active">LINK VENUE PROFILE</span>
              </div>
              <div className="ob-step">
                <div className="ob-step-dot pending">3</div>
                <span className="ob-step-label pending">ACCESS DASHBOARD</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="ob-form">
              <button
                type="submit"
                className="ob-submit"
                disabled={saving || !venueId}
              >
                {saving ? (
                  <>
                    <div className="ob-spinner" /> FINALIZING...
                  </>
                ) : (
                  "COMPLETE SETUP →"
                )}
              </button>
              <p className="ob-note">
                YOUR VENUE ID WILL BE LINKED AUTOMATICALLY
              </p>
            </form>
          </div>

          <p className="ob-footer">© 2025 NOVACHRONO. ALL RIGHTS RESERVED.</p>
        </div>
      </div>
    </>
  );
}
