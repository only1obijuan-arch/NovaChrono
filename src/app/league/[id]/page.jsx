"use client";
import { weekdayLabel } from "@/utils/weekday";
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Trophy,
  Calendar,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  History,
} from "lucide-react";

export default function PublicLeagueView({ params }) {
  const { id } = React.use(params);
  const [activeTab, setActiveTab] = useState("standings");

  const { data: league } = useQuery({
    queryKey: ["league", id],
    queryFn: async () => {
      const res = await fetch(`/api/leagues?leagueId=${id}`);
      return res.json();
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["league-stats", id],
    queryFn: async () => {
      const res = await fetch(`/api/stats?leagueId=${id}`);
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: matches = [] } = useQuery({
    queryKey: ["league-matches", id],
    queryFn: async () => {
      const res = await fetch(`/api/matches?leagueId=${id}`);
      return res.json();
    },
    refetchInterval: 10000,
  });

  if (!league)
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

  const rounds = [...new Set(matches.map((m) => m.round_number))].sort(
    (a, b) => a - b,
  );

  const tabs = [
    { key: "standings", label: "STANDINGS", icon: <Trophy size={13} /> },
    { key: "fixtures", label: "FIXTURES", icon: <Calendar size={13} /> },
    { key: "scorers", label: "TOP SCORERS", icon: <BarChart3 size={13} /> },
    { key: "feed", label: "LIVE FEED", icon: <History size={13} /> },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        @keyframes pulse-live { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }

        * { box-sizing:border-box; }
        .plv-page { min-height:100vh; background:#091833; font-family:'Rajdhani',sans-serif; position:relative; overflow-x:hidden; }
        .plv-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,245,212,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,212,0.02) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .plv-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.3),transparent); animation:scanline 7s linear infinite; pointer-events:none; z-index:100; }
        .plv-glow-tl { position:fixed; top:-200px; left:-200px; width:600px; height:600px; background:radial-gradient(circle,rgba(0,245,212,0.04) 0%,transparent 70%); pointer-events:none; }

        .plv-hero { background:rgba(0,245,212,0.03); border-bottom:1px solid rgba(0,245,212,0.1); padding:48px 24px 0; position:relative; z-index:2; }
        .plv-hero-inner { max-width:1200px; margin:0 auto; }
        .plv-back { display:inline-flex; align-items:center; gap:6px; color:rgba(0,245,212,0.5); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; text-decoration:none; margin-bottom:24px; transition:all 0.2s; }
        .plv-back:hover { color:#00F5D4; }
        .plv-hero-badges { display:flex; align-items:center; gap:10px; margin-bottom:16px; }
        .plv-status-badge { font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:3px; padding:4px 12px; border-radius:2px; }
        .plv-status-active { color:#00FF9C; background:rgba(0,255,156,0.1); border:1px solid rgba(0,255,156,0.3); }
        .plv-status-registration { color:#FFD700; background:rgba(255,215,0,0.1); border:1px solid rgba(255,215,0,0.3); }
        .plv-status-completed { color:#00F5D4; background:rgba(0,245,212,0.1); border:1px solid rgba(0,245,212,0.3); }
        .plv-status-default { color:rgba(180,200,220,0.5); background:rgba(180,200,220,0.05); border:1px solid rgba(180,200,220,0.15); }
        .plv-day-badge { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(180,200,220,0.4); letter-spacing:2px; }
        .plv-title { font-family:'Orbitron',monospace; font-size:clamp(24px,5vw,52px); font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:16px; line-height:1.1; }
        .plv-hero-meta { display:flex; align-items:center; gap:20px; }
        .plv-hero-meta-item { display:flex; align-items:center; gap:6px; font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.4); letter-spacing:2px; }

        .plv-tabs { background:rgba(9,24,51,0.97); border-bottom:1px solid rgba(0,245,212,0.1); position:sticky; top:0; z-index:50; backdrop-filter:blur(10px); margin-top:24px; }
        .plv-tabs-inner { max-width:1200px; margin:0 auto; padding:0 24px; display:flex; gap:0; overflow-x:auto; }
        .plv-tab { display:flex; align-items:center; gap:8px; padding:16px 20px; font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:3px; border:none; background:none; cursor:pointer; color:rgba(180,200,220,0.4); border-bottom:2px solid transparent; transition:all 0.2s; white-space:nowrap; }
        .plv-tab:hover { color:rgba(0,245,212,0.7); }
        .plv-tab.active { color:#00F5D4; border-bottom-color:#00F5D4; }

        .plv-main { max-width:1200px; margin:0 auto; padding:32px 24px 80px; position:relative; z-index:1; }

        .plv-table-wrap { background:rgba(11,20,40,0.9); border:1px solid rgba(0,245,212,0.12); border-radius:8px; overflow:hidden; animation:fadeInUp 0.4s ease; }
        .plv-table { width:100%; border-collapse:collapse; }
        .plv-table th { background:rgba(0,245,212,0.06); padding:14px 16px; font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.5); letter-spacing:3px; text-align:center; border-bottom:1px solid rgba(0,245,212,0.1); }
        .plv-table th:nth-child(1), .plv-table th:nth-child(2) { text-align:left; }
        .plv-table td { padding:14px 16px; font-family:'Rajdhani',sans-serif; font-size:15px; color:rgba(180,200,220,0.7); text-align:center; border-bottom:1px solid rgba(0,245,212,0.05); }
        .plv-table td:nth-child(1), .plv-table td:nth-child(2) { text-align:left; }
        .plv-table tr:last-child td { border-bottom:none; }
        .plv-table tr:hover td { background:rgba(0,245,212,0.02); }
        .plv-table tr.top3 td { background:rgba(0,245,212,0.03); }
        .plv-pos { font-family:'Orbitron',monospace; font-size:12px; color:rgba(0,245,212,0.4); }
        .plv-pos.gold { color:#FFD700; }
        .plv-pos.silver { color:#C0C0C0; }
        .plv-pos.bronze { color:#CD7F32; }
        .plv-team-name { font-family:'Rajdhani',sans-serif; font-size:16px; font-weight:700; color:#F4F4F9; }
        .plv-pts { font-family:'Orbitron',monospace; font-size:16px; font-weight:900; color:#00F5D4; }
        .plv-win { color:#00FF9C; font-weight:700; }
        .plv-draw { color:rgba(180,200,220,0.5); font-weight:700; }
        .plv-loss { color:rgba(255,0,204,0.6); font-weight:700; }
        .plv-gd-pos { color:#00FF9C; font-weight:700; }
        .plv-gd-neg { color:rgba(255,0,204,0.6); font-weight:700; }

        .plv-round-title { font-family:'Orbitron',monospace; font-size:13px; font-weight:700; color:#F4F4F9; letter-spacing:3px; margin-bottom:16px; display:flex; align-items:center; gap:16px; }
        .plv-round-line { flex:1; height:1px; background:rgba(0,245,212,0.1); }
        .plv-match-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; margin-bottom:32px; }

        .plv-match { background:rgba(11,20,40,0.9); border:1px solid rgba(0,245,212,0.1); border-radius:8px; padding:20px; transition:all 0.2s; position:relative; overflow:hidden; }
        .plv-match:hover { border-color:rgba(0,245,212,0.3); transform:translateY(-2px); }
        .plv-match.is-live { border-color:rgba(255,0,204,0.4); box-shadow:0 0 20px rgba(255,0,204,0.08); }
        .plv-match-live-bar { position:absolute; top:0; left:0; bottom:0; width:3px; background:#FF00CC; animation:pulse-live 1s infinite; }
        .plv-match-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
        .plv-match-field { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.5); letter-spacing:2px; background:rgba(0,245,212,0.06); border:1px solid rgba(0,245,212,0.15); padding:3px 8px; border-radius:2px; }
        .plv-match-time { font-family:'Orbitron',monospace; font-size:12px; color:#F4F4F9; }
        .plv-match-status { font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:2px; padding:3px 8px; border-radius:2px; }
        .plv-match-status.scheduled { color:rgba(0,245,212,0.6); background:rgba(0,245,212,0.06); border:1px solid rgba(0,245,212,0.15); }
        .plv-match-status.live { color:#FF00CC; animation:pulse-live 1s infinite; }
        .plv-match-status.final { color:rgba(180,200,220,0.4); }
        .plv-match-teams { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:12px; margin-bottom:14px; }
        .plv-match-team-name { font-family:'Rajdhani',sans-serif; font-size:15px; font-weight:700; color:#F4F4F9; }
        .plv-match-team-name.home { text-align:right; }
        .plv-match-team-label { font-family:'Share Tech Mono',monospace; font-size:8px; color:rgba(180,200,220,0.3); letter-spacing:2px; }
        .plv-match-team-label.home { text-align:right; }
        .plv-match-score-wrap { display:flex; flex-direction:column; align-items:center; gap:2px; }
        .plv-match-score { display:flex; align-items:center; gap:8px; }
        .plv-score { font-family:'Orbitron',monospace; font-size:26px; font-weight:900; color:#F4F4F9; }
        .plv-score-sep { font-family:'Orbitron',monospace; font-size:16px; color:rgba(0,245,212,0.3); }
        .plv-match-footer { display:flex; justify-content:space-between; align-items:center; padding-top:12px; border-top:1px solid rgba(0,245,212,0.06); }
        .plv-match-date { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(180,200,220,0.3); letter-spacing:2px; }
        .plv-details-link { display:flex; align-items:center; gap:4px; font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.5); letter-spacing:2px; text-decoration:none; transition:color 0.2s; }
        .plv-details-link:hover { color:#00F5D4; }

        .plv-scorers-wrap { max-width:600px; margin:0 auto; background:rgba(11,20,40,0.9); border:1px solid rgba(0,245,212,0.12); border-radius:8px; overflow:hidden; animation:fadeInUp 0.4s ease; }
        .plv-scorers-header { padding:20px 24px; border-bottom:1px solid rgba(0,245,212,0.1); background:rgba(0,245,212,0.04); }
        .plv-scorers-title { font-family:'Orbitron',monospace; font-size:14px; font-weight:700; color:#F4F4F9; letter-spacing:2px; }
        .plv-scorer-row { display:flex; align-items:center; justify-content:space-between; padding:14px 24px; border-bottom:1px solid rgba(0,245,212,0.05); transition:background 0.2s; }
        .plv-scorer-row:last-child { border-bottom:none; }
        .plv-scorer-row:hover { background:rgba(0,245,212,0.02); }
        .plv-scorer-rank { font-family:'Orbitron',monospace; font-size:11px; color:rgba(0,245,212,0.3); width:28px; }
        .plv-scorer-name { font-family:'Rajdhani',sans-serif; font-size:16px; font-weight:700; color:#F4F4F9; }
        .plv-scorer-team { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.4); letter-spacing:2px; margin-top:2px; }
        .plv-scorer-goals { font-family:'Orbitron',monospace; font-size:24px; font-weight:900; color:#00F5D4; }
        .plv-scorer-empty { padding:40px; text-align:center; font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.2); letter-spacing:3px; }

        .plv-feed-card { background:rgba(11,20,40,0.9); border:1px solid rgba(0,245,212,0.1); border-radius:8px; padding:32px; text-align:center; max-width:600px; margin:0 auto; animation:fadeInUp 0.4s ease; }
        .plv-feed-icon { color:rgba(0,245,212,0.3); margin:0 auto 16px; }
        .plv-feed-title { font-family:'Orbitron',monospace; font-size:16px; color:#F4F4F9; letter-spacing:2px; margin-bottom:8px; }
        .plv-feed-sub { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.3); letter-spacing:3px; }

        @media (max-width:640px) {
          .plv-table th:nth-child(7), .plv-table th:nth-child(8),
          .plv-table td:nth-child(7), .plv-table td:nth-child(8) { display:none; }
        }
      `}</style>

      <div className="plv-page">
        <div className="plv-grid" />
        <div className="plv-scanline" />
        <div className="plv-glow-tl" />

        <div className="plv-hero">
          <div className="plv-hero-inner">
            <a href="/captain/team" className="plv-back">
              <ChevronLeft size={14} /> BACK TO CAPTAIN VIEW
            </a>
            <div className="plv-hero-badges">
              <span
                className={`plv-status-badge plv-status-${league.status || "default"}`}
              >
                {league.status?.toUpperCase()}
              </span>
              {Number.isInteger(league.day_of_week) && (
                <span className="plv-day-badge">
                  {weekdayLabel(league.day_of_week).toUpperCase()} LEAGUE
                </span>
              )}
            </div>
            <h1 className="plv-title">{league.name}</h1>
            <p className="plv-day-badge" style={{ marginBottom: 10 }}>VENUE: {league.venue_name || "TBD"}</p>
            <div className="plv-hero-meta">
              <span className="plv-hero-meta-item">
                <Calendar size={12} />{" "}
                {new Date(league.season_start_date).toLocaleDateString()}
              </span>
              <span className="plv-hero-meta-item">
                <BarChart3 size={12} /> {league.match_format}
              </span>
            </div>
          </div>

          <div className="plv-tabs">
            <div className="plv-tabs-inner">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`plv-tab${activeTab === tab.key ? " active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="plv-main">
          {activeTab === "standings" && stats && (
            <div className="plv-table-wrap">
              <table className="plv-table">
                <thead>
                  <tr>
                    <th>POS</th>
                    <th>TEAM</th>
                    <th>P</th>
                    <th>W</th>
                    <th>D</th>
                    <th>L</th>
                    <th>GF</th>
                    <th>GA</th>
                    <th>GD</th>
                    <th>FORM</th>
                    <th>MOV</th>
                    <th>PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.standings.map((team, idx) => (
                    <tr key={team.slot_id} className={idx < 3 ? "top3" : ""}>
                      <td>
                        <span
                          className={`plv-pos${
                            idx === 0 ? " gold" : idx === 1 ? " silver" : idx === 2 ? " bronze" : ""
                          }`}
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td>
                        <span className="plv-team-name">
                          {team.team_name || `Slot ${idx + 1}`}
                        </span>
                      </td>
                      <td>{team.played}</td>
                      <td><span className="plv-win">{team.wins}</span></td>
                      <td><span className="plv-draw">{team.draws}</span></td>
                      <td><span className="plv-loss">{team.losses}</span></td>
                      <td>{team.goals_for}</td>
                      <td>{team.goals_against}</td>
                      <td>
                        <span
                          className={
                            team.goal_difference > 0
                              ? "plv-gd-pos"
                              : team.goal_difference < 0
                                ? "plv-gd-neg"
                                : ""
                          }
                        >
                          {team.goal_difference > 0
                            ? `+${team.goal_difference}`
                            : team.goal_difference}
                        </span>
                      </td>
                      <td style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>{(team.form_last5 || []).join(" ") || "-"}</td><td style={{ color:"rgba(180,200,220,0.5)" }}>{team.movement == null ? "—" : team.movement}</td><td><span className="plv-pts">{team.points}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "fixtures" && (
            <div>
              {rounds.map((roundNum) => (
                <div key={roundNum}>
                  <div className="plv-round-title">
                    ROUND {roundNum}
                    <div className="plv-round-line" />
                  </div>
                  <div className="plv-match-grid">
                    {matches
                      .filter((m) => m.round_number === roundNum)
                      .map((match) => (
                        <MatchCard key={match.id} match={match} />
                      ))}
                  </div>
                </div>
              ))}
              {matches.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "60px 24px",
                    fontFamily: "'Share Tech Mono',monospace",
                    fontSize: 11,
                    color: "rgba(0,245,212,0.2)",
                    letterSpacing: 3,
                  }}
                >
                  NO FIXTURES GENERATED YET
                </div>
              )}
            </div>
          )}

          {activeTab === "scorers" && stats && (
            <div className="plv-scorers-wrap">
              <div className="plv-scorers-header">
                <p className="plv-scorers-title">// TOP GOAL SCORERS</p>
              </div>
              {stats.topScorers.length === 0 ? (
                <p className="plv-scorer-empty">NO GOALS RECORDED YET</p>
              ) : (
                stats.topScorers.map((scorer, idx) => (
                  <div key={idx} className="plv-scorer-row">
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <span className="plv-scorer-rank">#{idx + 1}</span>
                      <div>
                        <p className="plv-scorer-name">{scorer.player_name}</p>
                        <p className="plv-scorer-team">
                          {scorer.team_name?.toUpperCase()}
                        </p>
                      </div>
                    </div>
                    <span className="plv-scorer-goals">{scorer.goals}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "feed" && (
            <div>
              {matches.filter(m => m.status === "live").length === 0 ? (
                <div className="plv-feed-card">
                  <History size={40} className="plv-feed-icon" />
                  <h3 className="plv-feed-title">// LIVE MATCH FEED</h3>
                  <p className="plv-feed-sub">NO LIVE MATCHES RIGHT NOW</p>
                </div>
              ) : (
                matches.filter(m => m.status === "live").map(match => (
                  <LiveMatchFeed key={match.id} match={match} />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function LiveMatchFeed({ match }) {
  const { data } = useQuery({
    queryKey: ["live-events", match.id],
    queryFn: async () => {
      const res = await fetch(`/api/matches?matchId=${match.id}`);
      return res.json();
    },
    refetchInterval: 5000,
  });

  const goals = (data?.events || []).filter(e =>
    e.type === "goal_home" || e.type === "goal_away"
  );

  return (
    <div className="plv-table-wrap" style={{ maxWidth: 600, marginBottom: 20 }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(0,245,212,0.1)", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF00CC", boxShadow: "0 0 8px #FF00CC", animation: "pulse-live 1s infinite" }} />
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, color: "#F4F4F9", letterSpacing: 2 }}>
          {match.home_team_name} vs {match.away_team_name}
        </span>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 20, fontWeight: 900, color: "#FF00CC", marginLeft: "auto" }}>
          {match.home_score} — {match.away_score}
        </span>
      </div>
      <div style={{ padding: "12px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
        {goals.length === 0 ? (
          <p style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "rgba(0,245,212,0.2)", letterSpacing: 3, textAlign: "center", padding: "20px 0" }}>
            NO GOALS YET
          </p>
        ) : (
          goals.map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(255,0,204,0.05)", borderLeft: "3px solid #FF00CC", borderRadius: "0 4px 4px 0" }}>
              <span>⚽</span>
              <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 15, fontWeight: 700, color: "#F4F4F9", flex: 1 }}>
                {e.type === "goal_home" ? match.home_team_name : match.away_team_name}
                {e.player_name ? ` — ${e.player_name}` : ""}
              </span>
              <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "rgba(180,200,220,0.4)", letterSpacing: 1 }}>
                {new Date(e.event_timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MatchCard({ match }) {
  const isLive = match.status === "live";
  const shareResult = async () => {
    const text = `${match.home_team_name || 'TBD'} ${match.home_score} - ${match.away_score} ${match.away_team_name || 'TBD'}\nRound ${match.round_number} • ${new Date(match.match_date).toLocaleDateString()}\n${window.location.origin}/match/${match.id}\nPowered by NovaChrono`;
    if (navigator.share) { try { await navigator.share({ title: 'Match Result', text }); return; } catch {} }
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className={`plv-match${isLive ? " is-live" : ""}`}>
      {isLive && <div className="plv-match-live-bar" />}
      <div className="plv-match-top">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="plv-match-field">FIELD {match.field_number}</span>
          <span className="plv-match-time">{match.time_slot}</span>
        </div>
        <span className={`plv-match-status ${match.status}`}>
          {match.status?.toUpperCase()}
        </span>
      </div>
      <div className="plv-match-teams">
        <div>
          <p className="plv-match-team-name home">{match.home_team_name || "TBD"}</p>
          <p className="plv-match-team-label home">HOME</p>
        </div>
        <div className="plv-match-score-wrap">
          <div className="plv-match-score">
            <span className="plv-score" style={{ color: isLive ? "#FF00CC" : "#F4F4F9" }}>
              {match.home_score}
            </span>
            <span className="plv-score-sep">—</span>
            <span className="plv-score" style={{ color: isLive ? "#FF00CC" : "#F4F4F9" }}>
              {match.away_score}
            </span>
          </div>
        </div>
        <div>
          <p className="plv-match-team-name">{match.away_team_name || "TBD"}</p>
          <p className="plv-match-team-label">AWAY</p>
        </div>
      </div>
      <div className="plv-match-footer">
        <span className="plv-match-date">
          {new Date(match.match_date).toDateString().toUpperCase()}
        </span>
         <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{match.status === "final" && <button onClick={shareResult} className="plv-details-link" style={{ background: "none", border: "1px solid rgba(0,245,212,0.2)", padding: "4px 8px", borderRadius: 4 }}>SHARE RESULT</button>}<a href={`/match/${match.id}`} className="plv-details-link">DETAILS <ChevronRight size={12} /></a></div>
      </div>
    </div>
  );
}
