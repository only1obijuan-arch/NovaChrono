"use client";
import { weekdayLabel } from "@/utils/weekday";
import { withJoinCode } from "@/utils/join-navigation";
import { useEffect, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function CaptainTeamContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const { data: session, status } = useSession();
  const router = useRouter();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "loading" || !session?.user) return;
    fetch("/api/captain/teams")
      .then(res => res.json())
      .then(data => {
        const allTeams = data?.teams || [];
        if (allTeams.length === 0) {
          router.push(withJoinCode("/captain/join", code));
        } else if (allTeams.length === 1) {
          router.push(withJoinCode(`/captain/team/${allTeams[0].id}`, code));
        } else {
          setTeams(allTeams);
          setLoading(false);
        }
      })
      .catch(() => router.push(withJoinCode("/captain/join", code)));
  }, [session, status, router, code]);

  if (loading && teams.length === 0) return (
    <div style={{ minHeight:"100vh", background:"#091833", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width:48, height:48, border:"3px solid #00FF9C", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <p style={{ color:"rgba(0,255,156,0.5)", fontFamily:"monospace", letterSpacing:4, fontSize:12 }}>LOADING YOUR LEAGUES...</p>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap');
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        * { box-sizing:border-box; }
        .lp-page { min-height:100vh; background:#091833; font-family:'Rajdhani',sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px; position:relative; overflow:hidden; }
        .lp-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,255,156,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,156,0.025) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .lp-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,255,156,0.3),transparent); animation:scanline 7s linear infinite; pointer-events:none; }
        .lp-inner { max-width:560px; width:100%; position:relative; z-index:1; animation:fadeInUp 0.5s ease; }
        .lp-eyebrow { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,255,156,0.5); letter-spacing:5px; margin-bottom:12px; }
        .lp-title { font-family:'Orbitron',monospace; font-size:28px; font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:32px; }
        .lp-card { background:rgba(11,20,40,0.9); border:1px solid rgba(0,255,156,0.15); border-radius:8px; padding:24px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; cursor:pointer; transition:all 0.2s; text-decoration:none; }
        .lp-card:hover { border-color:rgba(0,255,156,0.4); transform:translateY(-2px); box-shadow:0 8px 32px rgba(0,0,0,0.3); }
        .lp-league-name { font-family:'Orbitron',monospace; font-size:15px; font-weight:700; color:#F4F4F9; letter-spacing:1px; margin-bottom:6px; }
        .lp-league-meta { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,255,156,0.5); letter-spacing:2px; }
        .lp-team-name { font-family:'Rajdhani',sans-serif; font-size:13px; color:rgba(180,200,220,0.5); margin-top:4px; }
        .lp-status { font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:2px; padding:4px 10px; border-radius:2px; }
        .lp-status.active { color:#00FF9C; background:rgba(0,255,156,0.1); border:1px solid rgba(0,255,156,0.25); }
        .lp-status.registration { color:#FFD700; background:rgba(255,215,0,0.08); border:1px solid rgba(255,215,0,0.25); }
        .lp-status.completed { color:rgba(180,200,220,0.4); background:rgba(180,200,220,0.05); border:1px solid rgba(180,200,220,0.15); }
        .lp-join-btn { margin-top:20px; width:100%; height:52px; background:rgba(0,255,156,0.06); border:1px solid rgba(0,255,156,0.2); border-radius:6px; color:rgba(0,255,156,0.6); font-family:'Orbitron',monospace; font-size:11px; font-weight:700; letter-spacing:3px; cursor:pointer; transition:all 0.2s; }
        .lp-join-btn:hover { background:rgba(0,255,156,0.1); color:#00FF9C; border-color:rgba(0,255,156,0.4); }
      `}</style>
      <div className="lp-page">
        <div className="lp-grid" />
        <div className="lp-scanline" />
        <div className="lp-inner">
          <p className="lp-eyebrow">// CAPTAIN PORTAL</p>
          <h1 className="lp-title">SELECT YOUR LEAGUE</h1>
          {teams.map(team => (
            <a key={team.id} href={withJoinCode(`/captain/team/${team.id}`, code)} className="lp-card">
              <div>
                <p className="lp-league-name">{team.league_name}</p>
                <p className="lp-league-meta">{team.venue_name}{weekdayLabel(team.day_of_week) ? ` · ${weekdayLabel(team.day_of_week).toUpperCase()}` : ""} · {team.match_format}</p>
                <p className="lp-team-name">{team.team_name}</p>
              </div>
              <span className={`lp-status ${team.league_status}`}>{team.league_status?.toUpperCase()}</span>
            </a>
          ))}
          <button className="lp-join-btn" onClick={() => router.push("/account/signup")}>
            + JOIN ANOTHER LEAGUE
          </button>
        </div>
      </div>
    </>
  );
}

export default function CaptainTeamRedirect() {
  return <Suspense fallback={null}><CaptainTeamContent /></Suspense>;
}
