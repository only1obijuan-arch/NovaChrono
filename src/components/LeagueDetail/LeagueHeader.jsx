import { useState } from "react";
import { ChevronLeft, Users, Calendar, Trophy, BarChart3, Play, StopCircle, CheckCircle, Copy, Share2, X } from "lucide-react";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://novachrono.app";

export function LeagueHeader({ league, activeTab, setActiveTab, onGenerateFixtures, onCompleteSeason, onNewSeason, onCancelLeague, generateFixturesPending, teamsCount }) {
  const [showShareModal, setShowShareModal] = useState(false);

  const inviteUrl = `${APP_URL}/captain/join?code=${league.join_code}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setShowShareModal(false);
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`Join my league on NovaChrono! Use this link to register your team: ${inviteUrl}`)}`);
  };

  return (
    <>
    <div className="ld-header">
      <div className="ld-header-inner">
        <a href="/admin" className="ld-back">
          <ChevronLeft size={14} /> BACK TO LEAGUES
        </a>
        <div className="ld-header-top">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h1 className="ld-league-name">{league.name}</h1>
              <span className={`ld-status-badge ld-status-${league.status}`}>
                {league.status?.toUpperCase()}
              </span>
            </div>
            <p className="ld-league-sub">
              {league.day_of_week?.toUpperCase()} LEAGUE
              {league.season_name ? ` • ${league.season_name.toUpperCase()}` : ""}
            </p>
          </div>
          <div className="ld-header-actions">
            {league.join_code && (
              <button className="ld-btn ld-btn-cyan" onClick={() => setShowShareModal(true)}>
                <Share2 size={14} /> SHARE INVITE
              </button>
            )}
            {league.status === "registration" && (
              <button className="ld-btn ld-btn-primary" onClick={onGenerateFixtures} disabled={generateFixturesPending || teamsCount < 2}>
                <Play size={14} /> CLOSE REG & GENERATE
              </button>
            )}
            {league.status === "active" && (
              <button className="ld-btn ld-btn-green" onClick={() => { if (confirm("Mark season as complete?")) onCompleteSeason(); }}>
                <CheckCircle size={14} /> COMPLETE SEASON
              </button>
            )}
            {league.status === "completed" && (
              <button className="ld-btn ld-btn-cyan" onClick={onNewSeason}>
                <Copy size={14} /> NEW SEASON
              </button>
            )}
            {(league.status === "registration" || league.status === "active") && (
              <button className="ld-btn ld-btn-danger" onClick={() => { if (confirm("Cancel this league? Cannot be undone.")) onCancelLeague(); }}>
                <StopCircle size={14} /> CANCEL
              </button>
            )}
          </div>
        </div>

        <div className="ld-tabs">
          {[
            { key: "overview", label: "OVERVIEW", icon: <BarChart3 size={14} /> },
            { key: "teams", label: "TEAMS", icon: <Users size={14} /> },
            { key: "fixtures", label: "FIXTURES", icon: <Calendar size={14} /> },
            { key: "standings", label: "STANDINGS", icon: <Trophy size={14} /> },
          ].map((tab) => (
            <button
              key={tab.key}
              className={`ld-tab${activeTab === tab.key ? " active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>

    {showShareModal && (
      <div
        style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, padding:16 }}
        onClick={() => setShowShareModal(false)}
      >
        <div
          style={{ background:"#0D1B2E", border:"1px solid rgba(0,255,156,0.25)", borderRadius:8, padding:32, maxWidth:440, width:"100%", boxShadow:"0 0 60px rgba(0,255,156,0.06)" }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <p style={{ fontFamily:"'Orbitron',monospace", fontSize:16, fontWeight:700, color:"#F4F4F9", letterSpacing:2 }}>SHARE INVITE LINK</p>
            <button onClick={() => setShowShareModal(false)} style={{ background:"none", border:"none", color:"rgba(180,200,220,0.4)", cursor:"pointer", padding:4 }}><X size={18} /></button>
          </div>
          <p style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"rgba(0,255,156,0.4)", letterSpacing:3, marginBottom:24 }}>// CAPTAINS JOIN VIA THIS LINK</p>

          <div style={{ background:"rgba(0,255,156,0.04)", border:"1px solid rgba(0,255,156,0.15)", borderRadius:4, padding:"12px 16px", marginBottom:20, fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"rgba(0,255,156,0.7)", wordBreak:"break-all", letterSpacing:1 }}>
            {inviteUrl}
          </div>

          <div style={{ display:"flex", gap:12 }}>
            <button
              onClick={handleCopyLink}
              style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8, background:"rgba(0,255,156,0.08)", border:"1px solid rgba(0,255,156,0.3)", color:"#00FF9C", fontFamily:"'Orbitron',monospace", fontSize:11, fontWeight:700, letterSpacing:2, padding:14, borderRadius:4, cursor:"pointer", transition:"all 0.2s" }}
            >
              <Copy size={14} /> COPY LINK
            </button>
            <button
              onClick={handleWhatsApp}
              style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8, background:"rgba(37,211,102,0.08)", border:"1px solid rgba(37,211,102,0.3)", color:"#25D366", fontFamily:"'Orbitron',monospace", fontSize:11, fontWeight:700, letterSpacing:2, padding:14, borderRadius:4, cursor:"pointer", transition:"all 0.2s" }}
            >
              WHATSAPP
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
