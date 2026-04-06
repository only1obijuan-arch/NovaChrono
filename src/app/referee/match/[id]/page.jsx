"use client";
import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  Play,
  Pause,
  AlertTriangle,
  CheckCircle2,
  X,
  Trash2,
} from "lucide-react";

const HALF_DURATION = 20 * 60; // 20 minutes in seconds

export default function MatchControl({ params }) {
  const { id } = React.use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [half, setHalf] = useState(1); // 1 or 2
  const [halfStatus, setHalfStatus] = useState("pre"); // pre | running | halftime | second | finished
  const [showPlayerSelect, setShowPlayerSelect] = useState(null);
  const timerRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ["match-detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/matches?matchId=${id}`);
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: homePlayers = [] } = useQuery({
    queryKey: ["home-players", data?.match?.home_team_id],
    queryFn: async () => {
      const res = await fetch(`/api/players?teamId=${data.match.home_team_id}`);
      return res.json();
    },
    enabled: !!data?.match?.home_team_id,
  });

  const { data: awayPlayers = [] } = useQuery({
    queryKey: ["away-players", data?.match?.away_team_id],
    queryFn: async () => {
      const res = await fetch(`/api/players?teamId=${data.match.away_team_id}`);
      return res.json();
    },
    enabled: !!data?.match?.away_team_id,
  });

  const startMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "START_MATCH", matchId: id }),
      });
      return res.json();
    },
    onSuccess: () => {
      setIsActive(true);
      setHalfStatus("running");
      setHalf(1);
      setSeconds(0);
      toast.success("1st half started!");
      queryClient.invalidateQueries({ queryKey: ["match-detail", id] });
    },
  });

  const recordGoalMutation = useMutation({
    mutationFn: async ({ type, playerId }) => {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RECORD_GOAL",
          matchId: id,
          type,
          playerId,
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match-detail", id] });
      setShowPlayerSelect(null);
      toast.success("Goal recorded!");
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (eventId) => {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DELETE_EVENT", eventId }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match-detail", id] });
      toast.success("Event deleted!");
    },
  });

  const endMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "END_MATCH", matchId: id }),
      });
      return res.json();
    },
    onSuccess: () => {
      setIsActive(false);
      setHalfStatus("finished");
      toast.success("Match ended!");
      router.push("/referee");
    },
  });

  // Timer tick — auto-stop at 20 mins
  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        setSeconds((prev) => {
          if (prev + 1 >= HALF_DURATION) {
            clearInterval(timerRef.current);
            setIsActive(false);
            if (halfStatus === "running") {
              setHalfStatus("halftime");
              toast("⏸ Half time!", {
                description: "Start the 2nd half when ready.",
              });
            } else if (halfStatus === "second") {
              setHalfStatus("finished_halves");
              toast("⏱ Full time!", {
                description: "End the match when ready.",
              });
            }
            return HALF_DURATION;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isActive, halfStatus]);

  useEffect(() => {
    console.log("match status sync:", data?.match?.status, halfStatus);
    if (!data?.match) return;
    const status = data.match.status;
    if (status === "live" && halfStatus === "pre") {
      setHalfStatus("running");
      setIsActive(true);
    } else if (status === "final") {
      setHalfStatus("finished");
      setIsActive(false);
    }
  }, [data?.match?.status]);

  const startSecondHalf = () => {
    setSeconds(0);
    setHalf(2);
    setHalfStatus("second");
    setIsActive(true);
    toast.success("2nd half started!");
  };

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const handleGoalClick = (type) => {
    const team = type === "goal_home" ? "home" : "away";
    const players = team === "home" ? homePlayers : awayPlayers;
    if (players.length === 0) {
      recordGoalMutation.mutate({ type, playerId: null });
    } else {
      setShowPlayerSelect(team);
    }
  };

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
            LOADING MATCH...
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );

  const { match, events } = data;

  const isLive = match?.status === "live";
  const isFinished = match?.status === "final";
  const canScoreGoals =
    isLive && (halfStatus === "running" || halfStatus === "second");
  const isHalftime = halfStatus === "halftime";
  const isFulltime = halfStatus === "finished_halves";

  // Timer color based on state
  const timerColor = isHalftime
    ? "#FFD700"
    : isFulltime
      ? "#00FF9C"
      : isActive
        ? "#00F5D4"
        : "#F4F4F9";

  const halfLabel = half === 1 ? "1ST HALF" : "2ND HALF";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
        @keyframes pulse-live { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes timer-glow { 0%,100% { text-shadow:0 0 20px rgba(0,245,212,0.6),0 0 40px rgba(0,245,212,0.3); } 50% { text-shadow:0 0 30px rgba(0,245,212,0.9),0 0 60px rgba(0,245,212,0.5); } }
        @keyframes halftime-glow { 0%,100% { text-shadow:0 0 20px rgba(255,215,0,0.6),0 0 40px rgba(255,215,0,0.3); } 50% { text-shadow:0 0 30px rgba(255,215,0,0.9),0 0 60px rgba(255,215,0,0.5); } }
        @keyframes goal-flash { 0% { transform:scale(1); } 50% { transform:scale(1.05); } 100% { transform:scale(1); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes halftime-pulse { 0%,100% { background:rgba(255,215,0,0.08); } 50% { background:rgba(255,215,0,0.16); } }

        * { box-sizing:border-box; }
        .mc-page { min-height:100vh; background:#091833; display:flex; flex-direction:column; font-family:'Rajdhani',sans-serif; position:relative; overflow:hidden; }
        .mc-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,245,212,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,212,0.02) 1px,transparent 1px); background-size:40px 40px; pointer-events:none; }
        .mc-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.4),transparent); animation:scanline 5s linear infinite; pointer-events:none; z-index:100; }

        .mc-header { display:flex; align-items:center; justify-content:space-between; padding:16px 24px; border-bottom:1px solid rgba(0,245,212,0.1); background:rgba(9,24,51,0.95); backdrop-filter:blur(10px); position:sticky; top:0; z-index:50; }
        .mc-back { display:flex; align-items:center; gap:6px; color:rgba(0,245,212,0.5); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; text-decoration:none; transition:all 0.2s; cursor:pointer; background:none; border:none; }
        .mc-back:hover { color:#00F5D4; }
        .mc-timer-wrap { text-align:center; }
        .mc-timer-label { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.4); letter-spacing:4px; margin-bottom:4px; }
        .mc-timer { font-family:'Orbitron',monospace; font-size:36px; font-weight:900; line-height:1; }
        .mc-half-label { font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:3px; margin-top:4px; text-align:center; }
        .mc-field-badge { background:rgba(0,245,212,0.08); border:1px solid rgba(0,245,212,0.3); color:#00F5D4; font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; padding:8px 16px; border-radius:4px; }
        .mc-live-indicator { display:flex; align-items:center; gap:8px; }
        .mc-live-dot { width:8px; height:8px; border-radius:50%; background:#FF00CC; box-shadow:0 0 8px #FF00CC; animation:pulse-live 1s infinite; }
        .mc-live-text { font-family:'Share Tech Mono',monospace; font-size:10px; color:#FF00CC; letter-spacing:3px; }

        .mc-progress-wrap { padding:0 24px 8px; }
        .mc-progress-track { height:4px; background:rgba(0,245,212,0.08); border-radius:2px; overflow:hidden; }
        .mc-progress-fill { height:100%; border-radius:2px; transition:width 1s linear; }

        .mc-score-section { display:grid; grid-template-columns:1fr auto 1fr; gap:12px; padding:12px 24px; flex:0 0 auto; }
        .mc-team-panel { background:rgba(11,20,40,0.9); border:1px solid var(--team-color); border-radius:8px; padding:20px; display:flex; flex-direction:column; align-items:center; gap:12px; position:relative; overflow:hidden; }
        .mc-team-panel::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:var(--team-color); box-shadow:0 0 10px var(--team-color); }
        .mc-team-name { font-family:'Orbitron',monospace; font-size:14px; font-weight:700; color:#F4F4F9; letter-spacing:1px; text-align:center; }
        .mc-score-display { font-family:'Orbitron',monospace; font-size:80px; font-weight:900; color:#F4F4F9; line-height:1; text-shadow:0 0 20px var(--team-color); }
        .mc-goal-btn { width:100%; padding:16px; background:var(--team-color); color:#091833; font-family:'Orbitron',monospace; font-size:18px; font-weight:900; letter-spacing:3px; border:none; border-radius:4px; cursor:pointer; transition:all 0.15s; }
        .mc-goal-btn:hover:not(:disabled) { transform:scale(1.02); }
        .mc-goal-btn:active:not(:disabled) { transform:scale(0.97); }
        .mc-goal-btn:disabled { opacity:0.25; cursor:not-allowed; }
        .mc-vs-center { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; }
        .mc-vs { font-family:'Orbitron',monospace; font-size:20px; font-weight:900; color:rgba(0,245,212,0.3); }
        .mc-match-time { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(180,200,220,0.4); letter-spacing:2px; text-align:center; }

        .mc-halftime-banner { margin:0 24px; background:rgba(255,215,0,0.08); border:2px solid rgba(255,215,0,0.4); border-radius:8px; padding:24px; text-align:center; animation:halftime-pulse 2s infinite; }
        .mc-halftime-title { font-family:'Orbitron',monospace; font-size:24px; font-weight:900; color:#FFD700; letter-spacing:4px; margin-bottom:8px; text-shadow:0 0 20px rgba(255,215,0,0.5); }
        .mc-halftime-sub { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,215,0,0.5); letter-spacing:3px; margin-bottom:20px; }
        .mc-halftime-btn { background:linear-gradient(135deg,#FFD700,#FFA500); color:#091833; font-family:'Orbitron',monospace; font-size:16px; font-weight:900; letter-spacing:3px; border:none; border-radius:4px; padding:18px 40px; cursor:pointer; transition:all 0.2s; box-shadow:0 0 25px rgba(255,215,0,0.4); }
        .mc-halftime-btn:hover { box-shadow:0 0 40px rgba(255,215,0,0.6); transform:translateY(-2px); }

        .mc-fulltime-banner { margin:0 24px; background:rgba(0,255,156,0.06); border:2px solid rgba(0,255,156,0.3); border-radius:8px; padding:20px; text-align:center; }
        .mc-fulltime-title { font-family:'Orbitron',monospace; font-size:18px; font-weight:900; color:#00FF9C; letter-spacing:4px; margin-bottom:6px; }
        .mc-fulltime-sub { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,255,156,0.5); letter-spacing:3px; }

        .mc-controls { display:grid; gap:12px; padding:12px 24px 0; }
        .mc-ctrl-btn { display:flex; align-items:center; justify-content:center; gap:12px; padding:16px; border-radius:4px; font-family:'Orbitron',monospace; font-size:14px; font-weight:700; letter-spacing:2px; border:none; cursor:pointer; transition:all 0.2s; width:100%; }
        .mc-start-btn { background:linear-gradient(135deg,#00FF9C,#00CC78); color:#091833; box-shadow:0 0 25px rgba(0,255,156,0.4); font-size:20px; padding:24px; }
        .mc-start-btn:hover { box-shadow:0 0 40px rgba(0,255,156,0.6); transform:translateY(-2px); }
        .mc-pause-btn { background:rgba(255,200,0,0.1); border:1px solid rgba(255,200,0,0.3); color:#FFD700; }
        .mc-pause-btn:hover { background:rgba(255,200,0,0.15); border-color:#FFD700; }
        .mc-end-btn { background:rgba(255,0,204,0.1); border:1px solid rgba(255,0,204,0.3); color:#FF00CC; }
        .mc-end-btn:hover { background:rgba(255,0,204,0.2); border-color:#FF00CC; }
        .mc-abandon-btn { background:rgba(255,80,80,0.08); border:1px solid rgba(255,80,80,0.2); color:rgba(255,80,80,0.6); }
        .mc-abandon-btn:hover { background:rgba(255,80,80,0.12); color:rgba(255,80,80,0.9); }
        .mc-finished-banner { background:rgba(180,200,220,0.05); border:1px solid rgba(180,200,220,0.1); color:rgba(180,200,220,0.4); font-family:'Orbitron',monospace; font-size:16px; letter-spacing:4px; padding:24px; border-radius:4px; text-align:center; }
        .mc-controls-row { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }

        .mc-feed { margin:12px 24px 24px; background:rgba(11,20,40,0.8); border:1px solid rgba(0,245,212,0.1); border-radius:8px; overflow:hidden; flex:1; display:flex; flex-direction:column; }
        .mc-feed-header { padding:14px 20px; border-bottom:1px solid rgba(0,245,212,0.1); display:flex; align-items:center; gap:8px; }
        .mc-feed-title { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.5); letter-spacing:3px; }
        .mc-feed-count { background:rgba(0,245,212,0.1); color:#00F5D4; font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:2px; padding:2px 8px; border-radius:2px; }
        .mc-feed-list { padding:12px; overflow-y:auto; max-height:180px; display:flex; flex-direction:column; gap:8px; }
        .mc-event { display:flex; align-items:center; gap:12px; background:rgba(0,0,0,0.2); border-radius:4px; padding:10px 14px; border-left:3px solid var(--event-color); animation:fadeInUp 0.3s ease; }
        .mc-event-time { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(180,200,220,0.4); letter-spacing:1px; flex-shrink:0; }
        .mc-event-text { font-family:'Rajdhani',sans-serif; font-size:14px; font-weight:700; color:#F4F4F9; flex:1; }
        .mc-event-delete { background:none; border:1px solid rgba(255,80,80,0.2); color:rgba(255,80,80,0.5); padding:4px 6px; border-radius:2px; cursor:pointer; transition:all 0.2s; flex-shrink:0; }
        .mc-event-delete:hover { border-color:rgba(255,80,80,0.6); color:rgba(255,80,80,0.9); }
        .mc-feed-empty { padding:30px; text-align:center; font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(180,200,220,0.2); letter-spacing:3px; }

        .mc-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; z-index:200; padding:16px; }
        .mc-modal { background:#0D1B2E; border:1px solid rgba(0,245,212,0.3); border-radius:8px; padding:28px; max-width:400px; width:100%; box-shadow:0 0 60px rgba(0,245,212,0.1); }
        .mc-modal-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
        .mc-modal-title { font-family:'Orbitron',monospace; font-size:16px; font-weight:700; color:#F4F4F9; letter-spacing:2px; }
        .mc-modal-close { background:none; border:none; color:rgba(0,245,212,0.4); cursor:pointer; transition:color 0.2s; }
        .mc-modal-close:hover { color:#00F5D4; }
        .mc-modal-list { display:flex; flex-direction:column; gap:8px; max-height:400px; overflow-y:auto; }
        .mc-player-btn { display:flex; align-items:center; gap:12px; padding:12px 16px; background:rgba(0,245,212,0.04); border:1px solid rgba(0,245,212,0.15); border-radius:4px; cursor:pointer; transition:all 0.2s; text-align:left; width:100%; }
        .mc-player-btn:hover { background:rgba(0,245,212,0.08); border-color:rgba(0,245,212,0.4); }
        .mc-player-num { width:36px; height:36px; background:rgba(0,245,212,0.1); border:1px solid rgba(0,245,212,0.3); border-radius:4px; display:flex; align-items:center; justify-content:center; font-family:'Orbitron',monospace; font-size:11px; color:#00F5D4; flex-shrink:0; }
        .mc-player-name { font-family:'Rajdhani',sans-serif; font-size:16px; font-weight:700; color:#F4F4F9; }
      `}</style>

      <div className="mc-page">
        <div className="mc-grid" />
        <div className="mc-scanline" />

        {/* Header */}
        <div className="mc-header">
          <button className="mc-back" onClick={() => router.push("/referee")}>
            <ChevronLeft size={16} /> EXIT
          </button>
          <div className="mc-timer-wrap">
            <p className="mc-timer-label">MATCH TIME</p>
            <p
              className="mc-timer"
              style={{
                color: timerColor,
                animation:
                  isActive && halfStatus === "running"
                    ? "timer-glow 2s infinite"
                    : isHalftime
                      ? "halftime-glow 2s infinite"
                      : "none",
              }}
            >
              {formatTime(seconds)}
            </p>
            {halfStatus !== "pre" && (
              <p
                className="mc-half-label"
                style={{
                  color: isHalftime
                    ? "#FFD700"
                    : isFulltime
                      ? "#00FF9C"
                      : "rgba(0,245,212,0.5)",
                }}
              >
                {isHalftime
                  ? "HALF TIME"
                  : isFulltime
                    ? "FULL TIME"
                    : halfLabel}
              </p>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 6,
            }}
          >
            <span className="mc-field-badge">FIELD {match.field_number}</span>
            {isLive && (
              <div className="mc-live-indicator">
                <div className="mc-live-dot" />
                <span className="mc-live-text">LIVE</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {halfStatus !== "pre" && halfStatus !== "finished" && (
          <div className="mc-progress-wrap">
            <div className="mc-progress-track">
              <div
                className="mc-progress-fill"
                style={{
                  width: `${Math.min((seconds / HALF_DURATION) * 100, 100)}%`,
                  background: isHalftime
                    ? "#FFD700"
                    : isFulltime
                      ? "#00FF9C"
                      : "#00F5D4",
                  boxShadow: `0 0 8px ${
                    isHalftime ? "rgba(255,215,0,0.6)" : "#00F5D4"
                  }`,
                }}
              />
            </div>
          </div>
        )}

        {/* Score */}
        <div className="mc-score-section">
          <div className="mc-team-panel" style={{ "--team-color": "#00F5D4" }}>
            <div className="mc-team-name">{match.home_team_name || "HOME"}</div>
            <div
              className="mc-score-display"
              style={{ "--team-color": "#00F5D4" }}
            >
              {match.home_score}
            </div>
            <button
              className="mc-goal-btn"
              style={{ "--team-color": "#00F5D4" }}
              onClick={() => handleGoalClick("goal_home")}
              disabled={!canScoreGoals}
            >
              + GOAL
            </button>
          </div>
          <div className="mc-vs-center">
            <span className="mc-vs">VS</span>
            <span className="mc-match-time">{match.time_slot}</span>
          </div>
          <div className="mc-team-panel" style={{ "--team-color": "#FF00CC" }}>
            <div className="mc-team-name">{match.away_team_name || "AWAY"}</div>
            <div
              className="mc-score-display"
              style={{ "--team-color": "#FF00CC" }}
            >
              {match.away_score}
            </div>
            <button
              className="mc-goal-btn"
              style={{ "--team-color": "#FF00CC" }}
              onClick={() => handleGoalClick("goal_away")}
              disabled={!canScoreGoals}
            >
              + GOAL
            </button>
          </div>
        </div>

        {/* Halftime banner */}
        {isHalftime && (
          <div className="mc-halftime-banner">
            <p className="mc-halftime-title">⏸ HALF TIME</p>
            <p className="mc-halftime-sub">1ST HALF COMPLETE — REST PERIOD</p>
            <button className="mc-halftime-btn" onClick={startSecondHalf}>
              ▶ START 2ND HALF
            </button>
          </div>
        )}

        {/* Full time banner (before match ended) */}
        {isFulltime && (
          <div className="mc-fulltime-banner">
            <p className="mc-fulltime-title">⏱ FULL TIME</p>
            {match.match_duration_minutes && (
              <p className="mc-fulltime-sub">
                {match.match_duration_minutes * 2} MINUTES COMPLETE — END THE MATCH BELOW
              </p>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="mc-controls">
          {match.status === "scheduled" && (
            <button
              className="mc-ctrl-btn mc-start-btn"
              onClick={() => startMatchMutation.mutate()}
            >
              <Play size={28} fill="currentColor" /> START MATCH
            </button>
          )}
          {isLive && !isHalftime && (
            <div className="mc-controls-row">
              <button
                className="mc-ctrl-btn mc-pause-btn"
                onClick={() => setIsActive(!isActive)}
              >
                {isActive ? <Pause size={20} /> : <Play size={20} />}
                {isActive ? "PAUSE" : "RESUME"}
              </button>
              <button
                className="mc-ctrl-btn mc-end-btn"
                onClick={() => {
                  if (confirm("End the match?")) endMatchMutation.mutate();
                }}
              >
                <CheckCircle2 size={20} /> END MATCH
              </button>
              <button className="mc-ctrl-btn mc-abandon-btn">
                <AlertTriangle size={20} /> ABANDON
              </button>
            </div>
          )}
          {isFinished && (
            <div className="mc-finished-banner">// MATCH FINISHED</div>
          )}
        </div>

        {/* Feed */}
        <div className="mc-feed">
          <div className="mc-feed-header">
            <span className="mc-feed-title">LIVE EVENT FEED</span>
            <span className="mc-feed-count">{events.length} EVENTS</span>
          </div>
          <div className="mc-feed-list">
            {events.length === 0 ? (
              <p className="mc-feed-empty">NO EVENTS RECORDED</p>
            ) : (
              events.map((event, i) => (
                <div
                  key={i}
                  className="mc-event"
                  style={{
                    "--event-color":
                      event.type === "goal_home"
                        ? "#00F5D4"
                        : event.type === "goal_away"
                          ? "#FF00CC"
                          : "rgba(180,200,220,0.3)",
                  }}
                >
                  <span className="mc-event-time">
                    {new Date(event.event_timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="mc-event-text">
                    {event.type === "goal_home"
                      ? `⚽ GOAL — ${match.home_team_name}${
                          event.player_name ? ` (${event.player_name})` : ""
                        }`
                      : event.type === "goal_away"
                        ? `⚽ GOAL — ${match.away_team_name}${
                            event.player_name ? ` (${event.player_name})` : ""
                          }`
                        : event.type.replace(/_/g, " ").toUpperCase()}
                  </span>
                  {(event.type === "goal_home" || event.type === "goal_away") &&
                    isLive && (
                      <button
                        className="mc-event-delete"
                        onClick={() => {
                          if (confirm("Delete this goal?"))
                            deleteEventMutation.mutate(event.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Player modal */}
      {showPlayerSelect && (
        <div className="mc-modal-overlay">
          <div className="mc-modal">
            <div className="mc-modal-header">
              <h3 className="mc-modal-title">// WHO SCORED?</h3>
              <button
                className="mc-modal-close"
                onClick={() => setShowPlayerSelect(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="mc-modal-list">
              <button
                className="mc-player-btn"
                onClick={() =>
                  recordGoalMutation.mutate({
                    type:
                      showPlayerSelect === "home" ? "goal_home" : "goal_away",
                    playerId: null,
                  })
                }
              >
                <div className="mc-player-num">?</div>
                <span className="mc-player-name">Unknown Player</span>
              </button>
              {(showPlayerSelect === "home" ? homePlayers : awayPlayers).map(
                (player) => (
                  <button
                    key={player.id}
                    className="mc-player-btn"
                    onClick={() =>
                      recordGoalMutation.mutate({
                        type:
                          showPlayerSelect === "home"
                            ? "goal_home"
                            : "goal_away",
                        playerId: player.id,
                      })
                    }
                  >
                    <div className="mc-player-num">
                      #{player.player_number || "--"}
                    </div>
                    <span className="mc-player-name">{player.name}</span>
                  </button>
                ),
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
