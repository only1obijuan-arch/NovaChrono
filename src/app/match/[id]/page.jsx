"use client";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  Timer,
  MapPin,
  History,
  Trophy,
  Shield,
} from "lucide-react";

export default function MatchDetailPage({ params }) {
  const { id } = React.use(params);

  const { data, isLoading } = useQuery({
    queryKey: ["match-detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/matches?matchId=${id}`);
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: statsData } = useQuery({
    queryKey: ["league-stats", data?.match?.league_id],
    queryFn: async () => {
      const res = await fetch(`/api/stats?leagueId=${data.match.league_id}`);
      return res.json();
    },
    enabled: !!data?.match?.league_id,
  });

  if (isLoading || !data)
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
              border: "3px solid #00F5D4",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p
            style={{
              color: "#00F5D4",
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

  const { match, events = [] } = data;
  const isLive = match.status === "live";

  const standings = statsData?.standings || [];
  const homePos = standings.findIndex((s) => s.slot_id === match.home_slot_id) + 1;
  const awayPos = standings.findIndex((s) => s.slot_id === match.away_slot_id) + 1;
  const ordinal = (n) => n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
  const posLabel = homePos && awayPos ? `${ordinal(homePos)} vs ${ordinal(awayPos)}` : "—";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        @keyframes pulse-live { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes score-glow { 0%,100% { text-shadow:0 0 30px rgba(255,0,204,0.5),0 0 60px rgba(255,0,204,0.2); } 50% { text-shadow:0 0 50px rgba(255,0,204,0.8),0 0 100px rgba(255,0,204,0.4); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes event-enter { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:translateX(0); } }

        * { box-sizing:border-box; }
        .md-page { min-height:100vh; background:#091833; font-family:'Rajdhani',sans-serif; position:relative; overflow-x:hidden; }
        .md-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,245,212,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,212,0.02) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .md-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.3),transparent); animation:scanline 7s linear infinite; pointer-events:none; z-index:100; }

        .md-hero { position:relative; z-index:2; padding:40px 24px 0; border-bottom:1px solid rgba(0,245,212,0.1); background:rgba(0,245,212,0.02); overflow:hidden; }
        .md-hero-live { background:rgba(255,0,204,0.04); border-bottom-color:rgba(255,0,204,0.2); }
        .md-hero-inner { max-width:900px; margin:0 auto; }
        .md-back { display:inline-flex; align-items:center; gap:6px; color:rgba(0,245,212,0.5); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; text-decoration:none; margin-bottom:32px; transition:all 0.2s; }
        .md-back:hover { color:#00F5D4; }

        .md-status-pill { display:inline-flex; align-items:center; gap:8px; font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:3px; padding:6px 16px; border-radius:2px; margin-bottom:32px; }
        .md-status-pill.live { background:rgba(255,0,204,0.1); border:1px solid rgba(255,0,204,0.4); color:#FF00CC; }
        .md-status-pill.scheduled { background:rgba(0,245,212,0.08); border:1px solid rgba(0,245,212,0.3); color:#00F5D4; }
        .md-status-pill.final { background:rgba(180,200,220,0.06); border:1px solid rgba(180,200,220,0.2); color:rgba(180,200,220,0.5); }
        .md-live-dot { width:8px; height:8px; border-radius:50%; background:#FF00CC; box-shadow:0 0 8px #FF00CC; animation:pulse-live 1s infinite; }

        .md-scoreboard { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:24px; margin-bottom:40px; }
        .md-team { display:flex; flex-direction:column; }
        .md-team.home { align-items:flex-end; text-align:right; }
        .md-team.away { align-items:flex-start; }
        .md-team-name { font-family:'Orbitron',monospace; font-size:clamp(16px,3vw,28px); font-weight:700; color:#F4F4F9; letter-spacing:1px; margin-bottom:6px; line-height:1.2; }
        .md-team-label { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.4); letter-spacing:3px; }
        .md-score-center { display:flex; flex-direction:column; align-items:center; gap:8px; }
        .md-score-display { display:flex; align-items:center; gap:16px; }
        .md-score { font-family:'Orbitron',monospace; font-size:clamp(48px,10vw,96px); font-weight:900; color:#F4F4F9; line-height:1; }
        .md-score-sep { font-family:'Orbitron',monospace; font-size:32px; color:rgba(0,245,212,0.2); }

        .md-meta-strip { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; padding:24px 0; border-top:1px solid rgba(0,245,212,0.08); margin-bottom:0; }
        .md-meta-item { text-align:center; }
        .md-meta-label { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.4); letter-spacing:3px; margin-bottom:6px; }
        .md-meta-value { font-family:'Orbitron',monospace; font-size:14px; font-weight:700; color:#F4F4F9; }

        .md-main { max-width:900px; margin:0 auto; padding:32px 24px 80px; position:relative; z-index:1; display:grid; grid-template-columns:1fr 340px; gap:24px; }

        .md-timeline-title { font-family:'Orbitron',monospace; font-size:13px; font-weight:700; color:#F4F4F9; letter-spacing:2px; margin-bottom:20px; display:flex; align-items:center; gap:10px; }
        .md-timeline-icon { color:#00F5D4; }
        .md-timeline { position:relative; display:flex; flex-direction:column; gap:12px; }
        .md-timeline::before { content:''; position:absolute; left:11px; top:4px; bottom:4px; width:2px; background:linear-gradient(to bottom,rgba(0,245,212,0.3),rgba(0,245,212,0.05)); }
        .md-event { display:flex; align-items:flex-start; gap:16px; animation:event-enter 0.3s ease both; }
        .md-event-dot { width:24px; height:24px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; position:relative; z-index:1; border:2px solid rgba(9,24,51,0.9); }
        .md-event-dot.goal { background:#FF00CC; box-shadow:0 0 12px rgba(255,0,204,0.5); }
        .md-event-dot.other { background:rgba(0,245,212,0.2); border-color:rgba(0,245,212,0.3); }
        .md-event-card { background:rgba(11,20,40,0.9); border:1px solid rgba(0,245,212,0.1); border-radius:6px; padding:12px 16px; flex:1; transition:border-color 0.2s; }
        .md-event-card.goal { border-left:3px solid #FF00CC; }
        .md-event-time { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.4); letter-spacing:2px; margin-bottom:4px; }
        .md-event-text { font-family:'Rajdhani',sans-serif; font-size:15px; font-weight:700; color:#F4F4F9; }
        .md-event-player { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(180,200,220,0.4); letter-spacing:2px; margin-top:4px; }
        .md-timeline-empty { background:rgba(11,20,40,0.6); border:2px dashed rgba(0,245,212,0.08); border-radius:8px; padding:40px; text-align:center; font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.2); letter-spacing:3px; }

        .md-sidebar { display:flex; flex-direction:column; gap:16px; }
        .md-info-card { background:rgba(11,20,40,0.9); border:1px solid rgba(0,245,212,0.12); border-radius:8px; overflow:hidden; animation:fadeInUp 0.4s ease; }
        .md-info-header { padding:16px 20px; border-bottom:1px solid rgba(0,245,212,0.08); }
        .md-info-title { font-family:'Orbitron',monospace; font-size:12px; font-weight:700; color:#F4F4F9; letter-spacing:2px; }
        .md-info-body { padding:16px 20px; display:flex; flex-direction:column; gap:14px; }
        .md-info-row { display:flex; align-items:center; gap:12px; }
        .md-info-icon { width:32px; height:32px; background:rgba(0,245,212,0.06); border:1px solid rgba(0,245,212,0.12); border-radius:4px; display:flex; align-items:center; justify-content:center; color:rgba(0,245,212,0.5); flex-shrink:0; }
        .md-info-label { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.4); letter-spacing:2px; margin-bottom:3px; }
        .md-info-value { font-family:'Rajdhani',sans-serif; font-size:15px; font-weight:700; color:#F4F4F9; }

        .md-live-card { background:rgba(255,0,204,0.05); border:1px solid rgba(255,0,204,0.2); border-radius:8px; padding:24px; text-align:center; animation:fadeInUp 0.5s ease; }
        .md-live-card-title { font-family:'Orbitron',monospace; font-size:16px; font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:8px; }
        .md-live-card-sub { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,0,204,0.4); letter-spacing:3px; margin-bottom:20px; }
        .md-live-card-btn { width:100%; padding:14px; background:rgba(255,0,204,0.1); border:1px solid rgba(255,0,204,0.3); border-radius:4px; color:#FF00CC; font-family:'Orbitron',monospace; font-size:11px; font-weight:700; letter-spacing:2px; cursor:pointer; transition:all 0.2s; }
        .md-live-card-btn:hover { background:rgba(255,0,204,0.18); border-color:#FF00CC; box-shadow:0 0 20px rgba(255,0,204,0.15); }

        @media (max-width:768px) {
          .md-main { grid-template-columns:1fr; }
          .md-score { font-size:64px; }
        }
      `}</style>

      <div className="md-page">
        <div className="md-grid" />
        <div className="md-scanline" />

        <div className={`md-hero${isLive ? " md-hero-live" : ""}`}>
          <div className="md-hero-inner">
            <a href={`/league/${match.league_id}`} className="md-back">
              <ChevronLeft size={14} /> BACK TO LEAGUE
            </a>

            <div className={`md-status-pill ${match.status}`}>
              {isLive && <div className="md-live-dot" />}
              {match.status?.toUpperCase()}
            </div>

            <div className="md-scoreboard">
              <div className="md-team home">
                <h2 className="md-team-name">
                  {match.home_team_name || "HOME"}
                </h2>
                <span className="md-team-label">HOME</span>
              </div>
              <div className="md-score-center">
                <div className="md-score-display">
                  <span
                    className="md-score"
                    style={{
                      color: isLive ? "#FF00CC" : "#F4F4F9",
                      animation: isLive ? "score-glow 2s infinite" : "none",
                    }}
                  >
                    {match.home_score}
                  </span>
                  <span className="md-score-sep">:</span>
                  <span
                    className="md-score"
                    style={{
                      color: isLive ? "#FF00CC" : "#F4F4F9",
                      animation: isLive ? "score-glow 2s infinite" : "none",
                    }}
                  >
                    {match.away_score}
                  </span>
                </div>
              </div>
              <div className="md-team away">
                <h2 className="md-team-name">
                  {match.away_team_name || "AWAY"}
                </h2>
                <span className="md-team-label">AWAY</span>
              </div>
            </div>

            <div className="md-meta-strip">
              <div className="md-meta-item">
                <p className="md-meta-label">TIME SLOT</p>
                <p className="md-meta-value">{match.time_slot}</p>
              </div>
              <div className="md-meta-item">
                <p className="md-meta-label">FIELD</p>
                <p className="md-meta-value">#{match.field_number}</p>
              </div>
              <div className="md-meta-item">
                <p className="md-meta-label">DATE</p>
                <p className="md-meta-value">
                  {new Date(match.match_date).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="md-main">
          <div>
            <h3 className="md-timeline-title">
              <History size={16} className="md-timeline-icon" /> MATCH TIMELINE
            </h3>
            <div className="md-timeline">
              {events.length === 0 ? (
                <div className="md-timeline-empty">NO EVENTS RECORDED YET</div>
              ) : (
                events.map((event, i) => {
                  const isGoal = event.type.includes("goal");
                  return (
                    <div
                      key={i}
                      className="md-event"
                      style={{ animationDelay: `${i * 0.05}s` }}
                    >
                      <div
                        className={`md-event-dot ${isGoal ? "goal" : "other"}`}
                      >
                        {isGoal && <Trophy size={10} color="#091833" />}
                      </div>
                      <div className={`md-event-card${isGoal ? " goal" : ""}`}>
                        <p className="md-event-time">
                          {new Date(event.event_timestamp).toLocaleTimeString(
                            [],
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                        </p>
                        <p className="md-event-text">
                          {event.type === "goal_home"
                            ? `⚽ GOAL — ${match.home_team_name}`
                            : event.type === "goal_away"
                              ? `⚽ GOAL — ${match.away_team_name}`
                              : event.type.replace(/_/g, " ").toUpperCase()}
                        </p>
                        {event.player_name && (
                          <p className="md-event-player">
                            {event.player_name.toUpperCase()}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="md-sidebar">
            <div className="md-info-card">
              <div className="md-info-header">
                <p className="md-info-title">// MATCH INFO</p>
              </div>
              <div className="md-info-body">
                <div className="md-info-row">
                  <div className="md-info-icon">
                    <Shield size={14} />
                  </div>
                  <div>
                    <p className="md-info-label">REFEREE</p>
                    <p className="md-info-value">{match.referee_name || "Official League Ref"}</p>
                  </div>
                </div>
                <div className="md-info-row">
                  <div className="md-info-icon">
                    <Timer size={14} />
                  </div>
                  <div>
                    <p className="md-info-label">LEAGUE POSITION</p>
                    <p className="md-info-value">{posLabel}</p>
                  </div>
                </div>
                <div className="md-info-row">
                  <div className="md-info-icon">
                    <MapPin size={14} />
                  </div>
                  <div>
                    <p className="md-info-label">LOCATION</p>
                    <p className="md-info-value">Field {match.field_number}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="md-live-card">
              <h4 className="md-live-card-title">FOLLOW LIVE</h4>
              <p className="md-live-card-sub">// GET INSTANT GOAL ALERTS</p>
              <button className="md-live-card-btn">ENABLE NOTIFICATIONS</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
