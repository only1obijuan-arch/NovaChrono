"use client";
import useAuth from "@/utils/useAuth";

export default function LogoutPage() {
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/", redirect: true });
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap');
        @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse-ring { 0%,100% { box-shadow:0 0 20px rgba(255,0,204,0.2); } 50% { box-shadow:0 0 40px rgba(255,0,204,0.5); } }

        * { box-sizing:border-box; }
        .lo-page { min-height:100vh; background:#091833; display:flex; align-items:center; justify-content:center; padding:24px; font-family:'Rajdhani',sans-serif; position:relative; overflow:hidden; }
        .lo-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,245,212,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,212,0.02) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .lo-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.3),transparent); animation:scanline 6s linear infinite; pointer-events:none; z-index:100; }
        .lo-glow { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:600px; height:600px; background:radial-gradient(circle,rgba(255,0,204,0.04) 0%,transparent 70%); pointer-events:none; }

        .lo-wrap { width:100%; max-width:400px; position:relative; z-index:10; animation:fadeInUp 0.5s ease; }
        .lo-card { background:rgba(11,20,40,0.95); border:1px solid rgba(255,0,204,0.2); border-radius:8px; overflow:hidden; backdrop-filter:blur(20px); box-shadow:0 40px 80px rgba(0,0,0,0.5),0 0 40px rgba(255,0,204,0.04); }

        .lo-card-header { padding:32px 24px; border-bottom:1px solid rgba(255,0,204,0.1); text-align:center; }
        .lo-icon { width:64px; height:64px; background:rgba(255,0,204,0.08); border:2px solid rgba(255,0,204,0.3); border-radius:8px; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; animation:pulse-ring 3s infinite; font-size:24px; }
        .lo-title { font-family:'Orbitron',monospace; font-size:18px; font-weight:700; color:#F4F4F9; letter-spacing:3px; margin-bottom:8px; }
        .lo-sub { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,0,204,0.4); letter-spacing:3px; }

        .lo-body { padding:28px 24px; }
        .lo-message { font-family:'Rajdhani',sans-serif; font-size:16px; color:rgba(180,200,220,0.5); text-align:center; margin-bottom:24px; line-height:1.5; }

        .lo-btn { width:100%; height:52px; background:rgba(255,0,204,0.08); border:1px solid rgba(255,0,204,0.4); border-radius:4px; color:#FF00CC; font-family:'Orbitron',monospace; font-size:13px; font-weight:700; letter-spacing:3px; cursor:pointer; transition:all 0.2s; }
        .lo-btn:hover { background:rgba(255,0,204,0.15); border-color:#FF00CC; box-shadow:0 0 25px rgba(255,0,204,0.2); transform:translateY(-1px); }
        .lo-btn:active { transform:translateY(0); }

        .lo-cancel { display:block; text-align:center; margin-top:16px; font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.3); letter-spacing:2px; text-decoration:none; transition:color 0.2s; }
        .lo-cancel:hover { color:#00F5D4; }

        .lo-footer { text-align:center; margin-top:24px; font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(180,200,220,0.1); letter-spacing:3px; }
      `}</style>

      <div className="lo-page">
        <div className="lo-grid" />
        <div className="lo-scanline" />
        <div className="lo-glow" />

        <div className="lo-wrap">
          <div className="lo-card">
            <div className="lo-card-header">
              <div className="lo-icon">⏻</div>
              <h1 className="lo-title">SIGN OUT</h1>
              <p className="lo-sub">// TERMINATE SESSION</p>
            </div>
            <div className="lo-body">
              <p className="lo-message">
                Are you sure you want to end your current session?
              </p>
              <button className="lo-btn" onClick={handleSignOut}>
                CONFIRM SIGN OUT
              </button>
              <a href="/" className="lo-cancel">
                ← CANCEL, RETURN HOME
              </a>
            </div>
          </div>
          <p className="lo-footer">© 2025 NOVACHRONO. ALL RIGHTS RESERVED.</p>
        </div>
      </div>
    </>
  );
}