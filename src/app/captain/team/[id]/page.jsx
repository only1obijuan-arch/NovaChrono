"use client";
import { isValidJoinCode } from "@/utils/join-code";
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users, ChevronLeft, Shield, X, Calendar, Trophy, Trash2 } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";

export default function TeamDashboard({ params, searchParams }) {
  const { code } = React.use(searchParams);
  const pendingCode = isValidJoinCode(code) ? code.trim().toUpperCase() : "";
  const { id } = React.use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [playerForm, setPlayerForm] = useState({ name: "", playerNumber: "" });
  const [showJoinLeague, setShowJoinLeague] = useState(!!pendingCode);
  const [joinForm, setJoinForm] = useState({ joinCode: pendingCode, teamName: "" });
  const [joinError, setJoinError] = useState(null);

  const { data: team, isLoading: teamLoading } = useQuery({
    queryKey: ["team", id],
    queryFn: async () => {
      const res = await fetch(`/api/teams?teamId=${id}`);
      return res.json();
    },
  });

  const { data: players = [] } = useQuery({
    queryKey: ["team-players", id],
    queryFn: async () => {
      const res = await fetch(`/api/players?teamId=${id}`);
      return res.json();
    },
    enabled: !!team,
  });

  const { data: matches = [] } = useQuery({
    queryKey: ["team-matches", team?.league_id],
    queryFn: async () => {
      const res = await fetch(`/api/matches?leagueId=${team.league_id}`);
      return res.json();
    },
    enabled: !!team?.league_id,
  });

  const { data: stats } = useQuery({
    queryKey: ["league-stats", team?.league_id],
    queryFn: async () => {
      const res = await fetch(`/api/stats?leagueId=${team.league_id}`);
      return res.json();
    },
    enabled: !!team?.league_id,
  });

  const liveMatch = matches.find(
    (m) => (m.home_slot_id === team?.slot_id || m.away_slot_id === team?.slot_id) && m.status === "live"
  );

  const { data: liveMatchData } = useQuery({
    queryKey: ["live-match-events", liveMatch?.id],
    queryFn: async () => {
      const res = await fetch(`/api/matches?matchId=${liveMatch.id}`);
      return res.json();
    },
    enabled: !!liveMatch?.id,
    refetchInterval: 5000,
  });

  const deletePlayerMutation = useMutation({
    mutationFn: async (playerId) => {
      const res = await fetch(`/api/players?playerId=${playerId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove player");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Player removed");
      queryClient.invalidateQueries({ queryKey: ["team-players", id] });
    },
    onError: (err) => toast.error(err.message),
  });

  const addPlayerMutation = useMutation({
    mutationFn: async (playerData) => {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: id, ...playerData }),
      });
      if (!res.ok) throw new Error("Failed to add player");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Player added!");
      queryClient.invalidateQueries({ queryKey: ["team-players", id] });
      setShowAddPlayer(false);
      setPlayerForm({ name: "", playerNumber: "" });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleAddPlayer = (e) => {
    e.preventDefault();
    if (!playerForm.name.trim()) {
      toast.error("Player name is required");
      return;
    }
    addPlayerMutation.mutate(playerForm);
  };

  const joinLeagueMutation = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/captain/join-league", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to join league");
      return json;
    },
    onSuccess: (data) => {
      toast.success(`Joined ${data.leagueName}!`);
      setShowJoinLeague(false);
      setJoinForm({ joinCode: "", teamName: "" });
      setJoinError(null);
      router.push(`/captain/team/${data.team.id}`);
    },
    onError: (err) => setJoinError(err.message),
  });

  const handleJoinLeague = (e) => {
    e.preventDefault();
    setJoinError(null);
    if (!isValidJoinCode(joinForm.joinCode)) {
      setJoinError("League code must be 6 or 8 letters or digits");
      return;
    }
    if (!joinForm.teamName.trim()) {
      setJoinError("Team name is required");
      return;
    }
    joinLeagueMutation.mutate({ joinCode: joinForm.joinCode.trim(), teamName: joinForm.teamName.trim() });
  };

  if (teamLoading || !team)
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

  const teamMatches = matches.filter(
    (m) => m.home_slot_id === team.slot_id || m.away_slot_id === team.slot_id,
  );
  const upcomingMatches = teamMatches.filter((m) => m.status === "scheduled");
  const completedMatches = teamMatches.filter((m) => m.status === "final");
  const nextMatch = upcomingMatches[0];

  const standings = stats?.standings || [];
  const leaguePosition =
    standings.findIndex((s) => s.slot_id === team.slot_id) + 1;
  const teamStanding = standings.find((s) => s.slot_id === team.slot_id);

  const teamScorers = (stats?.topScorers || [])
    .filter(
      (s) =>
        s.team_slot_id === team.slot_id ||
        players.some((p) => p.name === s.player_name),
    )
    .slice(0, 5);

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes card-enter { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse-live { 0%,100% { opacity:1; } 50% { opacity:0.4; } }

        * { box-sizing:border-box; }
        .td-page { min-height:100vh; background:#091833; font-family:var(--font-ui); position:relative; overflow-x:hidden; }
        .td-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,255,156,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,156,0.025) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .td-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,255,156,0.3),transparent); animation:scanline 7s linear infinite; pointer-events:none; z-index:100; }
        .td-glow { position:fixed; top:-200px; left:-200px; width:600px; height:600px; background:radial-gradient(circle,rgba(0,255,156,0.05) 0%,transparent 70%); pointer-events:none; }

        .td-hero { background:rgba(0,255,156,0.03); border-bottom:1px solid rgba(0,255,156,0.1); padding:32px 24px; position:relative; z-index:1; }
        .td-hero-inner { max-width:960px; margin:0 auto; }
        .td-hero-topbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; }
        .td-back { display:inline-flex; align-items:center; gap:6px; color:rgba(0,255,156,0.5); font-family:var(--font-code); font-size:11px; letter-spacing:2px; text-decoration:none; transition:all 0.2s; }
        .td-back:hover { color:#00FF9C; }
        .td-hero-content { display:flex; align-items:center; gap:24px; }
        .td-team-avatar { width:80px; height:80px; background:rgba(0,255,156,0.1); border:2px solid rgba(0,255,156,0.4); border-radius:8px; display:flex; align-items:center; justify-content:center; font-family:var(--font-display); font-size:28px; font-weight:900; color:#00FF9C; flex-shrink:0; box-shadow:0 0 20px rgba(0,255,156,0.2); }
        .td-team-name { font-family:var(--font-display); font-size:28px; font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:8px; }
        .td-team-meta { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
        .td-meta-badge { display:inline-flex; align-items:center; gap:6px; font-family:var(--font-code); font-size:10px; color:rgba(0,255,156,0.6); letter-spacing:2px; padding:4px 10px; border:1px solid rgba(0,255,156,0.2); border-radius:2px; }
        .td-league-link { display:inline-flex; align-items:center; gap:6px; font-family:var(--font-code); font-size:10px; color:rgba(0,255,156,0.5); letter-spacing:2px; text-decoration:none; padding:4px 10px; border:1px solid rgba(0,255,156,0.2); border-radius:2px; transition:all 0.2s; }
        .td-league-link:hover { color:#00FF9C; border-color:#00FF9C; background:rgba(0,255,156,0.05); }

        .td-main { max-width:960px; margin:0 auto; padding:32px 24px; display:grid; grid-template-columns:1fr 300px; gap:20px; position:relative; z-index:1; }
        .td-card { background:rgba(11,20,40,0.9); border:1px solid rgba(0,255,156,0.15); border-radius:8px; overflow:hidden; backdrop-filter:blur(10px); animation:card-enter 0.5s ease both; }
        .td-card-header { padding:20px 24px; border-bottom:1px solid rgba(0,255,156,0.1); display:flex; align-items:center; justify-content:space-between; }
        .td-card-title { font-family:var(--font-display); font-size:13px; font-weight:700; color:#F4F4F9; letter-spacing:2px; }
        .td-card-body { padding:20px 24px; }
        .td-add-btn { display:inline-flex; align-items:center; gap:6px; background:rgba(0,255,156,0.08); border:1px solid rgba(0,255,156,0.3); color:#00FF9C; font-family:var(--font-code); font-size:10px; letter-spacing:2px; padding:8px 14px; border-radius:2px; cursor:pointer; transition:all 0.2s; }
        .td-add-btn:hover { background:rgba(0,255,156,0.14); border-color:#00FF9C; box-shadow:0 0 12px rgba(0,255,156,0.2); }
        .td-player-list { display:flex; flex-direction:column; gap:8px; }
        .td-player { display:flex; align-items:center; gap:12px; padding:10px 14px; background:rgba(0,255,156,0.03); border:1px solid rgba(0,255,156,0.08); border-radius:4px; transition:all 0.2s; }
        .td-player:hover { border-color:rgba(0,255,156,0.2); background:rgba(0,255,156,0.06); }
        .td-player-delete { margin-left:auto; background:rgba(255,50,50,0.06); border:1px solid rgba(255,50,50,0.2); border-radius:4px; padding:6px 8px; cursor:pointer; color:rgba(255,80,80,0.7); display:flex; align-items:center; transition:all 0.2s; }
        .td-player-delete:hover { background:rgba(255,50,50,0.12); border-color:rgba(255,80,80,0.4); color:rgba(255,80,80,1); }
        .td-player-num { width:36px; height:36px; background:rgba(0,255,156,0.1); border:1px solid rgba(0,255,156,0.25); border-radius:4px; display:flex; align-items:center; justify-content:center; font-family:var(--font-display); font-size:11px; color:#00FF9C; flex-shrink:0; }
        .td-player-name { font-family:var(--font-ui); font-size:16px; font-weight:700; color:#F4F4F9; }
        .td-player-empty { padding:32px; text-align:center; border:2px dashed rgba(0,255,156,0.1); border-radius:6px; }
        .td-player-empty-text { font-family:var(--font-code); font-size:10px; color:rgba(0,255,156,0.3); letter-spacing:3px; }
        .td-next-match { background:rgba(0,255,156,0.05); border:1px solid rgba(0,255,156,0.25); border-radius:6px; padding:20px; }
        .td-next-label { font-family:var(--font-code); font-size:9px; color:rgba(0,255,156,0.5); letter-spacing:4px; margin-bottom:12px; }
        .td-next-date { font-family:var(--font-code); font-size:11px; color:rgba(0,255,156,0.6); letter-spacing:2px; margin-bottom:8px; }
        .td-next-opponent { font-family:var(--font-display); font-size:16px; font-weight:700; color:#F4F4F9; margin-bottom:8px; }
        .td-next-meta { display:flex; gap:12px; }
        .td-next-meta-item { font-family:var(--font-code); font-size:10px; color:rgba(0,255,156,0.5); letter-spacing:2px; }
        .td-stats { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
        .td-stat { background:rgba(0,255,156,0.04); border:1px solid rgba(0,255,156,0.1); border-radius:4px; padding:14px; text-align:center; }
        .td-stat-label { font-family:var(--font-code); font-size:9px; color:rgba(0,255,156,0.4); letter-spacing:3px; margin-bottom:6px; }
        .td-stat-value { font-family:var(--font-display); font-size:24px; font-weight:900; color:#00FF9C; }
        .td-position-box { background:rgba(0,255,156,0.06); border:2px solid rgba(0,255,156,0.3); border-radius:6px; padding:20px; text-align:center; margin-bottom:10px; }
        .td-position-label { font-family:var(--font-code); font-size:9px; color:rgba(0,255,156,0.5); letter-spacing:4px; margin-bottom:8px; }
        .td-position-num { font-family:var(--font-display); font-size:56px; font-weight:900; color:#00FF9C; line-height:1; text-shadow:0 0 20px rgba(0,255,156,0.4); }
        .td-position-suffix { font-family:var(--font-code); font-size:16px; color:rgba(0,255,156,0.6); }
        .td-position-pts { font-family:var(--font-code); font-size:10px; color:rgba(0,255,156,0.4); letter-spacing:3px; margin-top:6px; }
        .td-scorer-list { display:flex; flex-direction:column; gap:8px; }
        .td-scorer { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:rgba(0,255,156,0.03); border:1px solid rgba(0,255,156,0.08); border-radius:4px; }
        .td-scorer-left { display:flex; align-items:center; gap:10px; }
        .td-scorer-rank { font-family:var(--font-display); font-size:10px; color:rgba(0,255,156,0.3); width:20px; }
        .td-scorer-name { font-family:var(--font-ui); font-size:15px; font-weight:700; color:#F4F4F9; }
        .td-scorer-goals { font-family:var(--font-display); font-size:18px; font-weight:900; color:#00FF9C; }
        .td-scorer-empty { font-family:var(--font-code); font-size:10px; color:rgba(0,255,156,0.2); letter-spacing:3px; text-align:center; padding:20px 0; }
        .td-fixture-list { display:flex; flex-direction:column; gap:8px; }
        .td-fixture { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:rgba(0,255,156,0.03); border:1px solid rgba(0,255,156,0.08); border-radius:4px; }
        .td-fixture-date { font-family:var(--font-code); font-size:10px; color:rgba(0,255,156,0.4); letter-spacing:1px; }
        .td-fixture-teams { font-family:var(--font-ui); font-size:15px; font-weight:700; color:#F4F4F9; text-align:center; flex:1; padding:0 12px; }
        .td-fixture-score { font-family:var(--font-display); font-size:14px; font-weight:700; color:#F4F4F9; }
        .td-fixture-status { font-family:var(--font-code); font-size:9px; letter-spacing:2px; padding:3px 8px; border-radius:2px; }
        .td-fixture-status.scheduled { color:rgba(0,245,212,0.7); background:rgba(0,245,212,0.08); border:1px solid rgba(0,245,212,0.2); }
        .td-fixture-status.final { color:rgba(180,200,220,0.5); background:rgba(180,200,220,0.05); border:1px solid rgba(180,200,220,0.1); }
        .td-fixture-status.live { color:#FF00CC; background:rgba(255,0,204,0.08); border:1px solid rgba(255,0,204,0.3); }
        .td-sidebar { display:flex; flex-direction:column; gap:20px; }
        .td-waiting { background:rgba(255,200,0,0.04); border:1px solid rgba(255,200,0,0.15); border-radius:6px; padding:20px; text-align:center; }
        .td-waiting-title { font-family:var(--font-code); font-size:10px; color:rgba(255,200,0,0.7); letter-spacing:3px; margin-bottom:6px; }
        .td-waiting-sub { font-family:var(--font-ui); font-size:13px; color:rgba(255,200,0,0.4); }
        .td-live-dot { width:8px; height:8px; border-radius:50%; background:#FF00CC; box-shadow:0 0 8px #FF00CC; animation:pulse-live 1s infinite; flex-shrink:0; }
        .td-live-score-row { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; padding:14px 16px; background:rgba(255,0,204,0.06); border:1px solid rgba(255,0,204,0.2); border-radius:6px; }
        .td-live-team { font-family:var(--font-ui); font-size:14px; font-weight:700; color:#F4F4F9; flex:1; }
        .td-live-team.away { text-align:right; }
        .td-live-score { font-family:var(--font-display); font-size:24px; font-weight:900; color:#FF00CC; white-space:nowrap; }
        .td-live-feed { display:flex; flex-direction:column; gap:6px; max-height:160px; overflow-y:auto; }
        .td-live-event { display:flex; align-items:center; gap:10px; padding:8px 12px; background:rgba(255,0,204,0.05); border-left:3px solid #FF00CC; border-radius:0 4px 4px 0; }
        .td-live-event-text { font-family:var(--font-ui); font-size:14px; font-weight:700; color:#F4F4F9; flex:1; }
        .td-live-event-time { font-family:var(--font-code); font-size:9px; color:rgba(180,200,220,0.4); letter-spacing:1px; flex-shrink:0; }
        .td-live-empty { font-family:var(--font-code); font-size:10px; color:rgba(255,0,204,0.3); letter-spacing:3px; text-align:center; padding:16px 0; }
        .td-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; z-index:200; padding:16px; }
        .td-modal { background:#0D1B2E; border:1px solid rgba(0,255,156,0.3); border-radius:8px; padding:32px; max-width:420px; width:100%; box-shadow:0 0 60px rgba(0,255,156,0.08); }
        .td-modal-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; }
        .td-modal-title { font-family:var(--font-display); font-size:16px; font-weight:700; color:#F4F4F9; letter-spacing:2px; }
        .td-modal-close { background:none; border:none; color:rgba(0,255,156,0.4); cursor:pointer; transition:color 0.2s; }
        .td-modal-close:hover { color:#00FF9C; }
        .td-modal-label { font-family:var(--font-code); font-size:10px; color:rgba(0,255,156,0.6); letter-spacing:3px; display:block; margin-bottom:8px; }
        .td-modal-input { width:100%; height:48px; background:rgba(0,255,156,0.05); border:1px solid rgba(0,255,156,0.2); border-radius:4px; padding:0 16px; color:#F4F4F9; font-family:var(--font-ui); font-size:16px; outline:none; transition:all 0.2s; margin-bottom:20px; }
        .td-modal-input:focus { border-color:#00FF9C; box-shadow:0 0 15px rgba(0,255,156,0.15); }
        .td-modal-input::placeholder { color:rgba(180,200,220,0.3); }
        .td-modal-btns { display:flex; gap:12px; }
        .td-modal-cancel { flex:1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:rgba(180,200,220,0.6); font-family:var(--font-code); font-size:11px; letter-spacing:2px; padding:12px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
        .td-modal-cancel:hover { color:#F4F4F9; }
        .td-modal-submit { flex:1; background:linear-gradient(135deg,#00FF9C,#00CC78); color:#091833; font-family:var(--font-display); font-size:11px; font-weight:700; letter-spacing:2px; padding:12px; border:none; border-radius:4px; cursor:pointer; transition:all 0.2s; }
        .td-modal-submit:hover { box-shadow:0 0 20px rgba(0,255,156,0.4); }
        .td-modal-submit:disabled { opacity:0.4; cursor:not-allowed; }

        @media (max-width:768px) {
          .td-main { grid-template-columns:1fr; }
          .td-hero-content { flex-direction:column; align-items:flex-start; }
          .td-stats { grid-template-columns:1fr 1fr 1fr; }
        }
      `}</style>

      <div className="td-page">
        <div className="td-grid" />
        <div className="td-scanline" />
        <div className="td-glow" />

        {/* Hero */}
        <div className="td-hero">
          <div className="td-hero-inner">
            <div className="td-hero-topbar">
              <button className="td-back" onClick={() => router.push("/captain/team")}>
                <ChevronLeft size={14} /> BACK
              </button>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <button
                  onClick={() => router.push("/captain/team")}
                  style={{ fontFamily:"var(--font-code)", fontSize:10, color:"rgba(0,255,156,0.5)", letterSpacing:2, background:"none", border:"1px solid rgba(0,255,156,0.2)", borderRadius:2, padding:"6px 12px", cursor:"pointer" }}
                >
                  ⇄ SWITCH LEAGUE
                </button>
                <NotificationBell accentColor="#00FF9C" />
              </div>
            </div>
            <div className="td-hero-content">
              <div className="td-team-avatar">{team.name?.[0]}</div>
              <div>
                <h1 className="td-team-name">{team.name}</h1>
                <div className="td-team-meta">
                  <span className="td-meta-badge">
                    <Shield size={10} /> CAPTAIN PORTAL
                  </span>
                  <a
                    href={`/league/${team.league_id}`}
                    className="td-league-link"
                  >
                    VIEW LEAGUE →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="td-main">
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {liveMatch && (
              <div className="td-card" style={{ borderColor: "rgba(255,0,204,0.5)" }}>
                <div className="td-card-header">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="td-live-dot" />
                    <span className="td-card-title">LIVE MATCH</span>
                  </div>
                </div>
                <div className="td-card-body">
                  <div className="td-live-score-row">
                    <span className="td-live-team">{liveMatch.home_team_name}</span>
                    <span className="td-live-score">{liveMatch.home_score} — {liveMatch.away_score}</span>
                    <span className="td-live-team away">{liveMatch.away_team_name}</span>
                  </div>
                  <div className="td-live-feed">
                    {(liveMatchData?.events || []).filter((e) => e.type === "goal_home" || e.type === "goal_away").length === 0 ? (
                      <p className="td-live-empty">NO GOALS YET</p>
                    ) : (
                      (liveMatchData?.events || [])
                        .filter((e) => e.type === "goal_home" || e.type === "goal_away")
                        .map((event, i) => (
                          <div key={i} className="td-live-event">
                            <span>⚽</span>
                            <span className="td-live-event-text">
                              {event.type === "goal_home" ? liveMatch.home_team_name : liveMatch.away_team_name}
                              {event.player_name ? ` — ${event.player_name}` : ""}
                            </span>
                            <span className="td-live-event-time">
                              {new Date(event.event_timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="td-card">
              <div className="td-card-header">
                <span className="td-card-title">TEAM ROSTER</span>
                <button
                  className="td-add-btn"
                  onClick={() => setShowAddPlayer(true)}
                >
                  + ADD PLAYER
                </button>
              </div>
              <div className="td-card-body">
                {players.length === 0 ? (
                  <div className="td-player-empty">
                    <p className="td-player-empty-text">
                      NO PLAYERS REGISTERED
                    </p>
                  </div>
                ) : (
                  <div className="td-player-list">
                    {players.map((player) => (
                      <div key={player.id} className="td-player">
                        <div className="td-player-num">
                          #{player.player_number || "--"}
                        </div>
                        <span className="td-player-name">{player.name}</span>
                        <span className="td-next-meta-item" style={{ marginLeft: "auto" }}>⚽ {player.season_goals ?? 0}</span>
                        <button
                          className="td-player-delete"
                          onClick={() => deletePlayerMutation.mutate(player.id)}
                          disabled={deletePlayerMutation.isPending}
                          title="Remove player"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="td-card" style={{ animationDelay: "0.08s" }}>
              <div className="td-card-header">
                <span className="td-card-title">TOP SCORERS</span>
              </div>
              <div className="td-card-body">
                {teamScorers.length === 0 ? (
                  <p className="td-scorer-empty">NO GOALS RECORDED YET</p>
                ) : (
                  <div className="td-scorer-list">
                    {teamScorers.map((scorer, idx) => (
                      <div key={idx} className="td-scorer">
                        <div className="td-scorer-left">
                          <span className="td-scorer-rank">#{idx + 1}</span>
                          <span className="td-scorer-name">
                            {scorer.player_name}
                          </span>
                        </div>
                        <span className="td-scorer-goals">{scorer.goals}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {teamMatches.length > 0 && (
              <div className="td-card" style={{ animationDelay: "0.1s" }}>
                <div className="td-card-header">
                  <span className="td-card-title">FIXTURES</span>
                </div>
                <div className="td-card-body">
                  <div className="td-fixture-list">
                    {teamMatches.map((match) => {
                      const isHome = match.home_slot_id === team.slot_id;
                      const opponent = isHome
                        ? match.away_team_name
                        : match.home_team_name;
                      return (
                        <div key={match.id} className="td-fixture">
                          <span className="td-fixture-date">
                            {new Date(match.match_date).toLocaleDateString()}
                          </span>
                          <span className="td-fixture-teams">
                            {isHome ? "HOME" : "AWAY"} vs {opponent || "TBD"}
                          </span>
                          {match.status === "final" ? (
                            <span className="td-fixture-score">
                              {isHome ? match.home_score : match.away_score} —{" "}
                              {isHome ? match.away_score : match.home_score}
                            </span>
                          ) : (
                            <span
                              className={`td-fixture-status ${match.status}`}
                            >
                              {match.status?.toUpperCase()}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="td-sidebar">
            {leaguePosition > 0 && (
              <div className="td-card" style={{ animationDelay: "0.12s" }}>
                <div className="td-card-header">
                  <span className="td-card-title">LEAGUE POSITION</span>
                </div>
                <div className="td-card-body">
                  <div className="td-position-box">
                    <p className="td-position-label">CURRENT STANDING</p>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "center",
                        gap: 4,
                      }}
                    >
                      <span className="td-position-num">{leaguePosition}</span>
                      <span className="td-position-suffix">
                        {leaguePosition === 1
                          ? "ST"
                          : leaguePosition === 2
                            ? "ND"
                            : leaguePosition === 3
                              ? "RD"
                              : "TH"}
                      </span>
                    </div>
                    {teamStanding && (
                      <p className="td-position-pts">
                        {teamStanding.points} PTS • {standings.length} TEAMS
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="td-card" style={{ animationDelay: "0.15s" }}>
              <div className="td-card-header">
                <span className="td-card-title">NEXT MATCH</span>
              </div>
              <div className="td-card-body">
                {nextMatch ? (
                  <div className="td-next-match">
                    <p className="td-next-label">UPCOMING</p>
                    <p className="td-next-date">
                      {new Date(nextMatch.match_date).toLocaleDateString()} •{" "}
                      {nextMatch.time_slot}
                    </p>
                    <p className="td-next-opponent">
                      vs{" "}
                      {nextMatch.home_slot_id === team.slot_id
                        ? nextMatch.away_team_name || "TBD"
                        : nextMatch.home_team_name || "TBD"}
                    </p>
                    <div className="td-next-meta">
                      <span className="td-next-meta-item">
                        FIELD {nextMatch.field_number}
                      </span>
                      <span className="td-next-meta-item">
                        {nextMatch.home_slot_id === team.slot_id
                          ? "HOME"
                          : "AWAY"}
                      </span>
                    </div>
                    <button className="td-add-btn" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/match/${nextMatch.id}`); toast.success("Next match link copied"); }}>COPY/SHARE MATCH LINK</button>
                  </div>
                ) : matches.length > 0 ? (
                  <p
                    style={{
                      fontFamily: "var(--font-code)",
                      fontSize: 10,
                      color: "rgba(180,200,220,0.3)",
                      letterSpacing: 3,
                      textAlign: "center",
                      padding: "20px 0",
                    }}
                  >
                    NO UPCOMING MATCHES
                  </p>
                ) : (
                  <div className="td-waiting">
                    <p className="td-waiting-title">AWAITING FIXTURES</p>
                    <p className="td-waiting-sub">
                      Waiting for admin to close registration
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="td-card" style={{ animationDelay: "0.2s" }}>
              <div className="td-card-header">
                <span className="td-card-title">SEASON STATS</span>
              </div>
              <div className="td-card-body">
                <div className="td-stats">
                  <div className="td-stat">
                    <p className="td-stat-label">PLAYED</p>
                    <p className="td-stat-value">
                      {teamStanding?.played ?? completedMatches.length}
                    </p>
                  </div>
                  <div className="td-stat">
                    <p className="td-stat-label">WINS</p>
                    <p className="td-stat-value">{teamStanding?.won ?? 0}</p>
                  </div>
                  <div className="td-stat">
                    <p className="td-stat-label">UPCOMING</p>
                    <p className="td-stat-value">{upcomingMatches.length}</p>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="td-card"
              style={{ animationDelay: "0.28s", cursor: "pointer", transition: "all 0.2s" }}
              onClick={() => setShowJoinLeague(true)}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(0,245,212,0.4)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(0,255,156,0.15)")}
            >
              <div className="td-card-header">
                <span className="td-card-title">JOIN NEW LEAGUE</span>
                <span style={{ fontFamily: "var(--font-code)", fontSize: 10, color: "rgba(0,245,212,0.5)", letterSpacing: 2 }}>
                  + JOIN →
                </span>
              </div>
              <div className="td-card-body">
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "rgba(180,200,220,0.5)", lineHeight: 1.5 }}>
                  Have a league code? Join another league without re-registering.
                </p>
              </div>
            </div>

            {team?.league_id && (
              <a
                href={`/captain/rules/${team.league_id}`}
                className="td-card"
                style={{
                  animationDelay: "0.25s",
                  textDecoration: "none",
                  display: "block",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(0,255,156,0.4)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(0,255,156,0.15)")
                }
              >
                <div className="td-card-header">
                  <span className="td-card-title">LEAGUE RULES</span>
                  <span
                    style={{
                      fontFamily: "var(--font-code)",
                      fontSize: 10,
                      color: "rgba(0,255,156,0.5)",
                      letterSpacing: 2,
                    }}
                  >
                    VIEW →
                  </span>
                </div>
                <div className="td-card-body">
                  <p
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: 14,
                      color: "rgba(180,200,220,0.5)",
                      lineHeight: 1.5,
                    }}
                  >
                    Match format, fair play, cards, points system and more.
                  </p>
                </div>
              </a>
            )}
          </div>
        </div>
      </div>

      {showAddPlayer && (
        <div className="td-modal-overlay">
          <div className="td-modal">
            <div className="td-modal-header">
              <h3 className="td-modal-title">ADD PLAYER</h3>
              <button
                className="td-modal-close"
                onClick={() => setShowAddPlayer(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddPlayer}>
              <label className="td-modal-label">PLAYER NAME *</label>
              <input
                required
                type="text"
                className="td-modal-input"
                placeholder="e.g. John Smith"
                value={playerForm.name}
                onChange={(e) =>
                  setPlayerForm({ ...playerForm, name: e.target.value })
                }
                autoFocus
              />
              <label className="td-modal-label">JERSEY NUMBER (OPTIONAL)</label>
              <input
                type="text"
                className="td-modal-input"
                placeholder="e.g. 10"
                value={playerForm.playerNumber}
                onChange={(e) =>
                  setPlayerForm({ ...playerForm, playerNumber: e.target.value })
                }
              />
              <div className="td-modal-btns">
                <button
                  type="button"
                  className="td-modal-cancel"
                  onClick={() => setShowAddPlayer(false)}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="td-modal-submit"
                  disabled={addPlayerMutation.isPending}
                >
                  {addPlayerMutation.isPending ? "ADDING..." : "ADD PLAYER"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showJoinLeague && (
        <div className="td-modal-overlay">
          <div className="td-modal">
            <div className="td-modal-header">
              <h3 className="td-modal-title">JOIN NEW LEAGUE</h3>
              <button className="td-modal-close" onClick={() => { setShowJoinLeague(false); setJoinError(null); }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleJoinLeague}>
              <label className="td-modal-label">LEAGUE CODE *</label>
              <input
                required
                type="text"
                className="td-modal-input"
                placeholder="XXXXXX"
                maxLength={8}
                value={joinForm.joinCode}
                onChange={(e) => setJoinForm({ ...joinForm, joinCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
                autoFocus
                style={{ textTransform: "uppercase", letterSpacing: 6, fontFamily: "var(--font-code)", fontSize: 18, textAlign: "center" }}
              />
              <label className="td-modal-label">TEAM NAME *</label>
              <input
                required
                type="text"
                className="td-modal-input"
                placeholder="e.g. Thunder FC"
                value={joinForm.teamName}
                onChange={(e) => setJoinForm({ ...joinForm, teamName: e.target.value })}
              />
              {joinError && (
                <p style={{ fontFamily: "var(--font-code)", fontSize: 10, color: "rgba(255,100,100,0.9)", letterSpacing: 2, marginBottom: 16 }}>
                  {joinError.toUpperCase()}
                </p>
              )}
              <div className="td-modal-btns">
                <button type="button" className="td-modal-cancel" onClick={() => { setShowJoinLeague(false); setJoinError(null); }}>
                  CANCEL
                </button>
                <button type="submit" className="td-modal-submit" disabled={joinLeagueMutation.isPending}>
                  {joinLeagueMutation.isPending ? "JOINING..." : "JOIN LEAGUE"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
