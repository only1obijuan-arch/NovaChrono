"use client";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Timer, Home, LogOut } from "lucide-react";

export default function RefereeMatchList() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  useEffect(() => {
    if (status !== "loading" && session?.user) {
      if (
        session.user.role !== "referee" &&
        session.user.role !== "super_admin"
      ) {
        router.replace("/");
      }
    }
  }, [session, status, router]);

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ["referee-matches", selectedDate, session?.user?.venue_id],
    queryFn: async () => {
      const params = new URLSearchParams({ date: selectedDate });
      if (session?.user?.venue_id)
        params.append("venueId", session.user.venue_id);
      if (session?.user?.field_number)
        params.append("fieldNumber", session.user.field_number);
      const res = await fetch(`/api/matches?${params}`);
      return res.json();
    },
    enabled: !!session?.user,
  });

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes card-enter { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse-live { 0%,100% { box-shadow:0 0 8px #FF00CC, 0 0 16px rgba(255,0,204,0.4); } 50% { box-shadow:0 0 16px #FF00CC, 0 0 32px rgba(255,0,204,0.6); } }
        @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0.3; } }

        .ref-page { min-height:100vh; background:#091833; font-family:var(--font-ui); position:relative; overflow-x:hidden; }
        .ref-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,245,212,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,212,0.03) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .ref-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.3),transparent); animation:scanline 6s linear infinite; pointer-events:none; z-index:100; }
        .ref-glow { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:600px; height:600px; background:radial-gradient(circle,rgba(0,245,212,0.04) 0%,transparent 70%); pointer-events:none; }

        .ref-inner { max-width:900px; margin:0 auto; padding:32px 24px; position:relative; z-index:1; }

        .ref-nav { display:flex; align-items:center; justify-content:space-between; margin-bottom:40px; padding-bottom:16px; border-bottom:1px solid rgba(0,245,212,0.1); }
        .ref-nav-link { display:inline-flex; align-items:center; gap:8px; color:rgba(0,245,212,0.6); font-family:var(--font-code); font-size:11px; letter-spacing:2px; text-decoration:none; padding:8px 12px; border:1px solid rgba(0,245,212,0.2); border-radius:4px; transition:all 0.2s; }
        .ref-nav-link:hover { color:#00F5D4; border-color:#00F5D4; background:rgba(0,245,212,0.05); }
        .ref-signout { display:inline-flex; align-items:center; gap:8px; color:rgba(255,0,204,0.7); font-family:var(--font-code); font-size:11px; letter-spacing:2px; text-decoration:none; padding:8px 12px; border:1px solid rgba(255,0,204,0.3); border-radius:4px; transition:all 0.2s; }
        .ref-signout:hover { color:#FF00CC; border-color:#FF00CC; background:rgba(255,0,204,0.05); }

        .ref-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:40px; flex-wrap:wrap; gap:16px; }
        .ref-title-label { font-family:var(--font-code); font-size:10px; color:rgba(0,245,212,0.5); letter-spacing:4px; margin-bottom:8px; }
        .ref-title { font-family:var(--font-display); font-size:28px; font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:6px; }
        .ref-subtitle { font-family:var(--font-ui); font-size:15px; color:rgba(180,200,220,0.6); }

        .ref-date-wrap { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
        .ref-date-label { font-family:var(--font-code); font-size:9px; color:rgba(0,245,212,0.4); letter-spacing:3px; }
        .ref-date-input { background:rgba(0,245,212,0.05); border:1px solid rgba(0,245,212,0.3); border-radius:4px; padding:10px 16px; color:#00F5D4; font-family:var(--font-code); font-size:13px; outline:none; transition:all 0.2s; }
        .ref-date-input:focus { border-color:#00F5D4; box-shadow:0 0 15px rgba(0,245,212,0.2); }

        .ref-matches { display:flex; flex-direction:column; gap:16px; }

        .ref-match-card { background:rgba(11,20,40,0.8); border:1px solid rgba(0,245,212,0.15); border-radius:8px; padding:24px; backdrop-filter:blur(10px); transition:all 0.3s; text-decoration:none; display:block; position:relative; overflow:hidden; animation:card-enter 0.5s ease both; }
        .ref-match-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.4),transparent); opacity:0; transition:opacity 0.3s; }
        .ref-match-card:hover { border-color:rgba(0,245,212,0.4); transform:translateY(-3px); box-shadow:0 8px 30px rgba(0,245,212,0.08); }
        .ref-match-card:hover::before { opacity:1; }
        .ref-match-card.is-live { border-color:rgba(255,0,204,0.4); animation:card-enter 0.5s ease both, pulse-live 2s infinite; }
        .ref-match-card.is-live::before { background:linear-gradient(90deg,transparent,rgba(255,0,204,0.5),transparent); opacity:1; }

        .ref-match-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
        .ref-match-meta { display:flex; align-items:center; gap:12px; }
        .ref-field-badge { background:rgba(0,245,212,0.1); border:1px solid rgba(0,245,212,0.3); color:#00F5D4; font-family:var(--font-code); font-size:10px; letter-spacing:2px; padding:4px 10px; border-radius:2px; }
        .ref-time { font-family:var(--font-display); font-size:16px; font-weight:700; color:#F4F4F9; }

        .ref-status { display:flex; align-items:center; gap:8px; }
        .ref-status-dot { width:8px; height:8px; border-radius:50%; }
        .ref-status-dot.scheduled { background:#00F5D4; box-shadow:0 0 6px #00F5D4; }
        .ref-status-dot.live { background:#FF00CC; box-shadow:0 0 6px #FF00CC; animation:blink 1s infinite; }
        .ref-status-dot.final { background:rgba(180,200,220,0.4); }
        .ref-status-text { font-family:var(--font-code); font-size:10px; letter-spacing:2px; }
        .ref-status-text.scheduled { color:#00F5D4; }
        .ref-status-text.live { color:#FF00CC; }
        .ref-status-text.final { color:rgba(180,200,220,0.4); }

        .ref-match-teams { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:16px; }
        .ref-team { text-align:center; }
        .ref-team-name { font-family:var(--font-display); font-size:14px; font-weight:700; color:#F4F4F9; margin-bottom:4px; letter-spacing:1px; }
        .ref-team-label { font-family:var(--font-code); font-size:9px; color:rgba(0,245,212,0.4); letter-spacing:3px; }
        .ref-team.away .ref-team-label { color:rgba(255,0,204,0.4); }

        .ref-score-wrap { display:flex; align-items:center; gap:12px; }
        .ref-score { font-family:var(--font-display); font-size:44px; font-weight:900; color:#F4F4F9; line-height:1; }
        .ref-score-sep { font-family:var(--font-display); font-size:24px; color:rgba(0,245,212,0.3); }

        .ref-empty { background:rgba(11,20,40,0.8); border:2px dashed rgba(0,245,212,0.15); border-radius:8px; padding:80px 40px; text-align:center; }
        .ref-empty-title { font-family:var(--font-display); font-size:18px; color:#F4F4F9; margin-bottom:8px; }
        .ref-empty-sub { font-family:var(--font-ui); color:rgba(180,200,220,0.5); font-size:16px; }

        @media (max-width:600px) {
          .ref-score { font-size:32px; }
          .ref-team-name { font-size:12px; }
        }
      `}</style>

      <div className="ref-page">
        <div className="ref-grid" />
        <div className="ref-scanline" />
        <div className="ref-glow" />

        <div className="ref-inner">
          {/* Nav */}
          <nav className="ref-nav">
            <Link href="/" className="ref-nav-link">
              <Home size={14} /> HOME
            </Link>
            <a href="/account/logout" className="ref-signout">
              <LogOut size={14} /> SIGN OUT
            </a>
          </nav>

          {/* Header */}
          <div className="ref-header">
            <div>
              <p className="ref-title-label">MATCH KIOSK</p>
              <h1 className="ref-title">Referee Portal</h1>
              <p className="ref-subtitle">Scoring & match control</p>
            </div>
            <div className="ref-date-wrap">
              <span className="ref-date-label">SELECT DATE</span>
              <input
                type="date"
                className="ref-date-input"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          </div>

          {/* Matches */}
          {isLoading ? (
            <div className="ref-matches">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 140,
                    background: "rgba(11,20,40,0.8)",
                    borderRadius: 8,
                    border: "1px solid rgba(0,245,212,0.1)",
                  }}
                />
              ))}
            </div>
          ) : matches.length === 0 ? (
            <div className="ref-empty">
              <Timer
                size={48}
                color="rgba(0,245,212,0.2)"
                style={{ margin: "0 auto 16px" }}
              />
              <h3 className="ref-empty-title">NO MATCHES TODAY</h3>
              <p className="ref-empty-sub">
                Select another date to view scheduled games
              </p>
            </div>
          ) : (
            <div className="ref-matches">
              {matches.map((match, i) => (
                <a
                  key={match.id}
                  href={`/referee/match/${match.id}`}
                  className={`ref-match-card${
                    match.status === "live" ? " is-live" : ""
                  }`}
                  style={{ animationDelay: `${i * 0.08}s` }}
                >
                  <div className="ref-match-top">
                    <div className="ref-match-meta">
                      <span className="ref-field-badge">
                        FIELD {match.field_number}
                      </span>
                      <span className="ref-time">{match.time_slot}</span>
                    </div>
                    <div className="ref-status">
                      <div className={`ref-status-dot ${match.status}`} />
                      <span className={`ref-status-text ${match.status}`}>
                        {match.status?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="ref-match-teams">
                    <div className="ref-team">
                      <p className="ref-team-name">
                        {match.home_team_name || "TBD"}
                      </p>
                      <p className="ref-team-label">HOME</p>
                    </div>
                    <div className="ref-score-wrap">
                      <span className="ref-score">{match.home_score}</span>
                      <span className="ref-score-sep">—</span>
                      <span className="ref-score">{match.away_score}</span>
                    </div>
                    <div className="ref-team away">
                      <p className="ref-team-name">
                        {match.away_team_name || "TBD"}
                      </p>
                      <p className="ref-team-label">AWAY</p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
