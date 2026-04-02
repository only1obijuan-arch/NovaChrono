"use client";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  Shield,
  AlertTriangle,
  Trophy,
  Clock,
  Users,
  BookOpen,
} from "lucide-react";

export default function LeagueRules({ params }) {
  const { leagueId } = React.use(params);

  const { data: league, isLoading } = useQuery({
    queryKey: ["league", leagueId],
    queryFn: async () => {
      const res = await fetch(`/api/leagues?leagueId=${leagueId}`);
      return res.json();
    },
  });

  if (isLoading)
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
              border: "3px solid #00FF9C",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p
            style={{
              color: "#00FF9C",
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

  const genericRules = [
    {
      icon: <Clock size={16} />,
      category: "MATCH FORMAT",
      rules: [
        `Matches consist of two ${
          league?.match_duration_minutes
            ? league.match_duration_minutes / 2
            : 20
        }-minute halves with a short half-time break.`,
        "The referee's clock is the official match time.",
        "Teams must be ready to play within 5 minutes of their scheduled kick-off time.",
        "A forfeit will be awarded if a team cannot field enough players after 10 minutes.",
        "The referee has full authority to pause, extend, or abandon a match.",
      ],
    },
    {
      icon: <Users size={16} />,
      category: "TEAM & PLAYERS",
      rules: [
        "Each team must have a minimum of 5 players to start a match.",
        "A team may play with a minimum of 4 players if a player is injured or sent off.",
        "All players must be registered on the team roster before the match starts.",
        "Substitutions are unlimited and can be made at any stoppage in play.",
        "Team captains are responsible for their team's conduct on and off the field.",
      ],
    },
    {
      icon: <Shield size={16} />,
      category: "PERMISSION TO PLAY",
      rules: [
        "If a team is short of players and wants to use members from another registered team, the referee is instructed to alert the opposition team, who will decide whether to allow participation of that player.",
        "This law applies to all players, including goalkeepers.",
      ],
    },
    {
      icon: <Shield size={16} />,
      category: "TRAVELLING",
      rules: [
        "Players are not permitted to dribble the ball against the wall whilst using their body to shield a defender.",
        "The referee is instructed to initiate a 3-second countdown during which the ball must be used or played. If the player has not made any usage of the ball within this period, a foul will be awarded to the opposing team.",
      ],
    },
    {
      icon: <Shield size={16} />,
      category: "BACKING",
      rules: [
        "No player is permitted to reverse into a defender while in control of the ball.",
        "No player is permitted to intentionally hold the ball for longer than 3 seconds with their back towards a defender.",
        "The referee is instructed to award the opposing team a foul for any violation of this rule.",
      ],
    },
    {
      icon: <Shield size={16} />,
      category: "2 ON 1",
      rules: [
        "Only one player is permitted to tackle an attacking player at any given time.",
        "Any other defending player who intentionally or unintentionally obstructs or impedes the attacking player's use of the ball will be considered a foul.",
      ],
    },
    {
      icon: <AlertTriangle size={16} />,
      category: "TACKLING FROM BEHIND",
      rules: [
        "Tackling from behind is not permitted under any circumstance.",
        "This includes lunging or swinging a leg around the ball carrier.",
        "The defending player's shoulder must be in front of the attacking player's shoulder for a clean tackle to be made.",
        "Goalkeepers are permitted to use their hands to retrieve the ball from behind an attacking player, but only within their own defensive box.",
      ],
    },
    {
      icon: <AlertTriangle size={16} />,
      category: "UPSTANDING",
      rules: [
        "No player is permitted to leave their feet, intentionally or unintentionally, to play the ball. This includes any part of their body or hands touching the ground.",
        "If a player in possession of the ball unintentionally leaves their feet during the speed of play, the opposing team will be awarded a foul.",
        "The goalkeeper is exempt from this law only if the challenge is clean and occurs within their own defensive box.",
      ],
    },
    {
      icon: <AlertTriangle size={16} />,
      category: "CHIPPING & BACK PASS",
      rules: [
        "Goalkeepers are not permitted to pick up a back pass from their own teammate, including wall passes.",
        "Goalkeepers are not permitted to score directly from a throw.",
      ],
    },
    {
      icon: <AlertTriangle size={16} />,
      category: "HANDBALL",
      rules: [
        "Any contact with the hand is considered handball.",
        "This includes intentional and unintentional contact from below the sleeve of a t-shirt.",
      ],
    },
    {
      icon: <Clock size={16} />,
      category: "5 SECONDS — CORNER RULE",
      rules: [
        "A player is only permitted 5 seconds to remain in the corner with the ball.",
        "If a player has not made any usage of the ball within those 5 seconds, this will result in a turnover of possession to the opposing team.",
      ],
    },
    {
      icon: <Clock size={16} />,
      category: "KICK OFF",
      rules: [
        "Players are allowed to take shots directly from kick-off.",
        "Players must wait for the referee's whistle before play can resume.",
        "The referee will initiate a 5-second countdown after blowing the whistle for play to resume.",
      ],
    },
    {
      icon: <Shield size={16} />,
      category: "PENALTIES",
      rules: [
        "One foot must always remain grounded and stationary next to the ball during a penalty kick.",
        "The goalkeeper must be on the goal line before the penalty is taken.",
      ],
    },
    {
      icon: <Shield size={16} />,
      category: "THE WALL",
      rules: [
        "Only a one-man wall is permitted.",
        "The wall must be positioned at least 2 metres away from the free kick spot.",
      ],
    },
    {
      icon: <Trophy size={16} />,
      category: "THE CARDS",
      rules: [
        "🔵 BLUE CARD — Direct substitution for the offending player with a 2-minute cooling-off period.",
        "🟡 YELLOW CARD — The offending player is sent off for a 2-minute period. The team plays with one player down before the same or a different player may re-enter the pitch.",
        "🔴 RED CARD — The offending player is dismissed for the remainder of the match. The team plays with one player down for a 5-minute period before being permitted to introduce another player.",
      ],
    },
    {
      icon: <Trophy size={16} />,
      category: "CARD COUNTING",
      rules: [
        "3 warnings for intentional fouls results in a Blue Card.",
        "1 further warning for intentional fouls after a Blue Card results in a Yellow or Red Card, dependent on the nature of the foul or the level of disrespect shown towards players and match officials.",
      ],
    },
    {
      icon: <Trophy size={16} />,
      category: "POINTS & STANDINGS",
      rules: [
        `A win is worth ${league?.points_win ?? 3} points.`,
        `A draw is worth ${league?.points_draw ?? 1} point per team.`,
        "A loss earns 0 points.",
        `A forfeit results in a ${league?.forfeit_score_home ?? 3}-${
          league?.forfeit_score_away ?? 0
        } score against the forfeiting team.`,
        "In the case of a tie on points, goal difference, then goals scored, then head-to-head result is used to determine the final standing.",
      ],
    },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes card-enter { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing:border-box; }
        .lr-page { min-height:100vh; background:#091833; font-family:'Rajdhani',sans-serif; position:relative; overflow-x:hidden; }
        .lr-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,255,156,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,156,0.025) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .lr-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,255,156,0.3),transparent); animation:scanline 7s linear infinite; pointer-events:none; z-index:100; }
        .lr-glow { position:fixed; top:-200px; right:-200px; width:600px; height:600px; background:radial-gradient(circle,rgba(0,255,156,0.04) 0%,transparent 70%); pointer-events:none; }
        .lr-hero { background:rgba(0,255,156,0.03); border-bottom:1px solid rgba(0,255,156,0.1); padding:32px 24px; position:relative; z-index:1; }
        .lr-hero-inner { max-width:800px; margin:0 auto; }
        .lr-back { display:inline-flex; align-items:center; gap:6px; color:rgba(0,255,156,0.5); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; text-decoration:none; margin-bottom:24px; transition:all 0.2s; }
        .lr-back:hover { color:#00FF9C; }
        .lr-eyebrow { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,255,156,0.5); letter-spacing:4px; margin-bottom:10px; }
        .lr-title { font-family:'Orbitron',monospace; font-size:28px; font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:8px; }
        .lr-league-name { font-family:'Share Tech Mono',monospace; font-size:11px; color:rgba(0,255,156,0.6); letter-spacing:3px; }
        .lr-format-strip { display:flex; gap:12px; flex-wrap:wrap; margin-top:20px; }
        .lr-format-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(0,255,156,0.06); border:1px solid rgba(0,255,156,0.2); border-radius:2px; padding:6px 12px; font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,255,156,0.7); letter-spacing:2px; }
        .lr-main { max-width:800px; margin:0 auto; padding:32px 24px 80px; position:relative; z-index:1; display:flex; flex-direction:column; gap:16px; }
        .lr-section { background:rgba(11,20,40,0.9); border:1px solid rgba(0,255,156,0.15); border-radius:8px; overflow:hidden; animation:card-enter 0.5s ease both; }
        .lr-section-header { padding:16px 24px; border-bottom:1px solid rgba(0,255,156,0.1); display:flex; align-items:center; gap:10px; background:rgba(0,255,156,0.04); }
        .lr-section-icon { color:#00FF9C; flex-shrink:0; }
        .lr-section-title { font-family:'Orbitron',monospace; font-size:12px; font-weight:700; color:#F4F4F9; letter-spacing:3px; }
        .lr-rules-list { padding:16px 24px; display:flex; flex-direction:column; gap:0; }
        .lr-rule { display:flex; align-items:flex-start; gap:12px; padding:12px 0; border-bottom:1px solid rgba(0,255,156,0.05); }
        .lr-rule:last-child { border-bottom:none; }
        .lr-rule-bullet { width:6px; height:6px; border-radius:50%; background:#00FF9C; flex-shrink:0; margin-top:7px; box-shadow:0 0 6px rgba(0,255,156,0.5); }
        .lr-rule-text { font-family:'Rajdhani',sans-serif; font-size:15px; color:rgba(180,200,220,0.8); line-height:1.5; }
        .lr-rule-text strong { color:#F4F4F9; font-weight:700; }
        .lr-footer-note { background:rgba(255,200,0,0.04); border:1px solid rgba(255,200,0,0.15); border-radius:8px; padding:20px 24px; display:flex; gap:12px; align-items:flex-start; }
        .lr-footer-note-icon { color:rgba(255,200,0,0.6); flex-shrink:0; margin-top:2px; }
        .lr-footer-note-text { font-family:'Rajdhani',sans-serif; font-size:14px; color:rgba(255,200,0,0.6); line-height:1.6; }
      `}</style>
      <div className="lr-page">
        <div className="lr-grid" />
        <div className="lr-scanline" />
        <div className="lr-glow" />
        <div className="lr-hero">
          <div className="lr-hero-inner">
            <a href={`/league/${leagueId}`} className="lr-back">
              <ChevronLeft size={14} /> BACK TO LEAGUE
            </a>
            <p className="lr-eyebrow">// CAPTAIN PORTAL</p>
            <h1 className="lr-title">LEAGUE RULES</h1>
            <p
              style={{
                fontFamily: "'Share Tech Mono',monospace",
                fontSize: 10,
                color: "rgba(0,255,156,0.3)",
                letterSpacing: 3,
                marginTop: 8,
              }}
            >
              // 16 LAWS OF THE GAME
            </p>
            {league?.name && (
              <p className="lr-league-name">{league.name.toUpperCase()}</p>
            )}
            {league && (
              <div className="lr-format-strip">
                <span className="lr-format-badge">
                  <Clock size={10} /> {league.match_format} FORMAT
                </span>
                <span className="lr-format-badge">
                  <Trophy size={10} /> {league.points_win ?? 3} PTS WIN
                </span>
                <span className="lr-format-badge">
                  <Shield size={10} /> {league.fields_count} FIELD
                  {league.fields_count > 1 ? "S" : ""}
                </span>
                <span className="lr-format-badge">
                  <Users size={10} /> {league.max_teams} TEAMS MAX
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="lr-main">
          {genericRules.map((section, i) => (
            <div
              key={section.category}
              className="lr-section"
              style={{ animationDelay: `${i * 0.07}s` }}
            >
              <div className="lr-section-header">
                <span className="lr-section-icon">{section.icon}</span>
                <span className="lr-section-title">{section.category}</span>
              </div>
              <div className="lr-rules-list">
                {section.rules.map((rule, j) => (
                  <div key={j} className="lr-rule">
                    <div className="lr-rule-bullet" />
                    <p className="lr-rule-text">{rule}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="lr-footer-note">
            <AlertTriangle size={16} className="lr-footer-note-icon" />
            <p className="lr-footer-note-text">
              Rules are subject to change at the discretion of the league
              administrator. Any amendments will be communicated to team
              captains before they take effect. If you have any questions,
              contact your venue admin directly.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
