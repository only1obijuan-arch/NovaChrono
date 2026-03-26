"use client";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  ChevronLeft,
  MapPin,
  Clock,
  Users,
  Trophy,
} from "lucide-react";

export default function PublicLeaguesList() {
  const { data: leagues = [], isLoading } = useQuery({
    queryKey: ["public-leagues"],
    queryFn: async () => {
      const res = await fetch("/api/leagues");
      return res.json();
    },
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        @keyframes card-enter { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shimmer { 0%,100% { opacity:0.3; } 50% { opacity:0.7; } }
        @keyframes title-glow { 0%,100% { text-shadow:0 0 30px rgba(0,245,212,0.4),0 0 60px rgba(0,245,212,0.2); } 50% { text-shadow:0 0 50px rgba(0,245,212,0.7),0 0 100px rgba(0,245,212,0.3); } }

        * { box-sizing:border-box; }
        .pl-page { min-height:100vh; background:#091833; font-family:'Rajdhani',sans-serif; position:relative; overflow-x:hidden; }
        .pl-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,245,212,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,212,0.025) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .pl-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.3),transparent); animation:scanline 7s linear infinite; pointer-events:none; z-index:100; }
        .pl-glow-tl { position:fixed; top:-200px; left:-200px; width:700px; height:700px; background:radial-gradient(circle,rgba(0,245,212,0.05) 0%,transparent 70%); pointer-events:none; }
        .pl-glow-br { position:fixed; bottom:-200px; right:-200px; width:600px; height:600px; background:radial-gradient(circle,rgba(255,0,204,0.04) 0%,transparent 70%); pointer-events:none; }

        /* Hero */
        .pl-hero { text-align:center; padding:80px 24px 60px; position:relative; z-index:1; border-bottom:1px solid rgba(0,245,212,0.08); }
        .pl-back { display:inline-flex; align-items:center; gap:6px; color:rgba(0,245,212,0.5); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; text-decoration:none; margin-bottom:32px; transition:all 0.2s; }
        .pl-back:hover { color:#00F5D4; }
        .pl-eyebrow { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.5); letter-spacing:6px; margin-bottom:16px; }
        .pl-title { font-family:'Orbitron',monospace; font-size:clamp(40px,8vw,80px); font-weight:900; color:#F4F4F9; letter-spacing:4px; margin-bottom:16px; animation:title-glow 3s infinite; }
        .pl-title span { color:#00F5D4; }
        .pl-subtitle { font-family:'Rajdhani',sans-serif; font-size:18px; color:rgba(180,200,220,0.5); max-width:480px; margin:0 auto; }

        /* HUD corners on hero */
        .pl-corner { position:absolute; width:20px; height:20px; border-color:rgba(0,245,212,0.3); border-style:solid; }
        .pl-corner-tl { top:24px; left:24px; border-width:2px 0 0 2px; }
        .pl-corner-tr { top:24px; right:24px; border-width:2px 2px 0 0; }
        .pl-corner-bl { bottom:24px; left:24px; border-width:0 0 2px 2px; }
        .pl-corner-br { bottom:24px; right:24px; border-width:0 2px 2px 0; }

        /* Grid */
        .pl-main { max-width:1200px; margin:0 auto; padding:48px 24px 80px; position:relative; z-index:1; }
        .pl-grid-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:20px; }

        /* League card */
        .pl-card { display:block; text-decoration:none; background:rgba(11,20,40,0.9); border:1px solid rgba(0,245,212,0.12); border-radius:8px; overflow:hidden; transition:all 0.3s; position:relative; animation:card-enter 0.5s ease both; }
        .pl-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.5),transparent); opacity:0; transition:opacity 0.3s; }
        .pl-card:hover { border-color:rgba(0,245,212,0.35); transform:translateY(-4px); box-shadow:0 20px 60px rgba(0,0,0,0.4),0 0 30px rgba(0,245,212,0.08); }
        .pl-card:hover::before { opacity:1; }

        .pl-card-top { padding:24px 24px 20px; border-bottom:1px solid rgba(0,245,212,0.07); }
        .pl-card-badges { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
        .pl-status-badge { font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:2px; padding:4px 10px; border-radius:2px; }
        .pl-status-badge.active { color:#00FF9C; background:rgba(0,255,156,0.1); border:1px solid rgba(0,255,156,0.3); }
        .pl-status-badge.registration { color:#00F5D4; background:rgba(0,245,212,0.1); border:1px solid rgba(0,245,212,0.3); }
        .pl-status-badge.completed { color:rgba(180,200,220,0.5); background:rgba(180,200,220,0.05); border:1px solid rgba(180,200,220,0.15); }
        .pl-status-badge.default { color:rgba(255,200,0,0.7); background:rgba(255,200,0,0.08); border:1px solid rgba(255,200,0,0.2); }
        .pl-day-badge { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(180,200,220,0.4); letter-spacing:2px; }
        .pl-card-name { font-family:'Orbitron',monospace; font-size:18px; font-weight:700; color:#F4F4F9; letter-spacing:1px; line-height:1.3; transition:color 0.2s; }
        .pl-card:hover .pl-card-name { color:#00F5D4; }

        .pl-card-body { padding:20px 24px; display:flex; flex-direction:column; gap:10px; }
        .pl-card-meta { display:flex; align-items:center; gap:10px; }
        .pl-card-meta-icon { width:28px; height:28px; background:rgba(0,245,212,0.06); border:1px solid rgba(0,245,212,0.12); border-radius:4px; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:rgba(0,245,212,0.5); }
        .pl-card-meta-text { font-family:'Rajdhani',sans-serif; font-size:14px; font-weight:600; color:rgba(180,200,220,0.6); }

        .pl-card-footer { padding:16px 24px; border-top:1px solid rgba(0,245,212,0.07); display:flex; align-items:center; justify-content:space-between; }
        .pl-avatar-stack { display:flex; }
        .pl-avatar { width:28px; height:28px; border-radius:50%; border:2px solid rgba(9,24,51,0.9); background:rgba(0,245,212,0.1); display:flex; align-items:center; justify-content:center; color:rgba(0,245,212,0.4); margin-left:-6px; }
        .pl-avatar:first-child { margin-left:0; }
        .pl-view-link { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.5); letter-spacing:2px; transition:all 0.2s; display:flex; align-items:center; gap:6px; }
        .pl-card:hover .pl-view-link { color:#00F5D4; }

        /* Skeleton */
        .pl-skeleton { background:rgba(11,20,40,0.9); border:1px solid rgba(0,245,212,0.08); border-radius:8px; height:260px; animation:shimmer 1.5s infinite; }

        /* Empty */
        .pl-empty { text-align:center; padding:80px 24px; }
        .pl-empty-title { font-family:'Orbitron',monospace; font-size:16px; color:rgba(0,245,212,0.3); letter-spacing:4px; margin-bottom:12px; }
        .pl-empty-sub { font-family:'Share Tech Mono',monospace; font-size:11px; color:rgba(180,200,220,0.2); letter-spacing:3px; }

        @media (max-width:640px) {
          .pl-grid-cards { grid-template-columns:1fr; }
        }
      `}</style>

      <div className="pl-page">
        <div className="pl-grid" />
        <div className="pl-scanline" />
        <div className="pl-glow-tl" />
        <div className="pl-glow-br" />

        {/* Hero */}
        <div className="pl-hero">
          <div className="pl-corner pl-corner-tl" />
          <div className="pl-corner pl-corner-tr" />
          <div className="pl-corner pl-corner-bl" />
          <div className="pl-corner pl-corner-br" />
          <a href="/" className="pl-back">
            <ChevronLeft size={14} /> HOME
          </a>
          <p className="pl-eyebrow">// NOVACHRONO NETWORK</p>
          <h1 className="pl-title">
            LIVE <span>LEAGUES</span>
          </h1>
          <p className="pl-subtitle">
            Real-time standings, fixtures and results from your local venue.
          </p>
        </div>

        {/* Cards */}
        <div className="pl-main">
          {isLoading ? (
            <div className="pl-grid-cards">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="pl-skeleton"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          ) : leagues.length === 0 ? (
            <div className="pl-empty">
              <p className="pl-empty-title">NO ACTIVE LEAGUES</p>
              <p className="pl-empty-sub">CHECK BACK SOON</p>
            </div>
          ) : (
            <div className="pl-grid-cards">
              {leagues.map((league, i) => (
                <PublicLeagueCard key={league.id} league={league} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function PublicLeagueCard({ league, index }) {
  const statusClass =
    league.status === "active"
      ? "active"
      : league.status === "registration"
      ? "registration"
      : league.status === "completed"
      ? "completed"
      : "default";

  return (
    <a
      href={`/league/${league.id}`}
      className="pl-card"
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      <div className="pl-card-top">
        <div className="pl-card-badges">
          <span className={`pl-status-badge ${statusClass}`}>
            {league.status?.toUpperCase()}
          </span>
          {league.day_of_week && (
            <span className="pl-day-badge">
              {league.day_of_week?.toUpperCase()}
            </span>
          )}
        </div>
        <h3 className="pl-card-name">{league.name}</h3>
      </div>

      <div className="pl-card-body">
        <div className="pl-card-meta">
          <div className="pl-card-meta-icon">
            <Calendar size={13} />
          </div>
          <span className="pl-card-meta-text">
            Starts {new Date(league.season_start_date).toLocaleDateString()}
          </span>
        </div>
        <div className="pl-card-meta">
          <div className="pl-card-meta-icon">
            <Clock size={13} />
          </div>
          <span className="pl-card-meta-text">
            {league.match_format} Match Format
          </span>
        </div>
        <div className="pl-card-meta">
          <div className="pl-card-meta-icon">
            <MapPin size={13} />
          </div>
          <span className="pl-card-meta-text">Standard Venue</span>
        </div>
      </div>

      <div className="pl-card-footer">
        <div className="pl-avatar-stack">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="pl-avatar">
              <Users size={11} />
            </div>
          ))}
        </div>
        <span className="pl-view-link">VIEW TABLE →</span>
      </div>
    </a>
  );
}