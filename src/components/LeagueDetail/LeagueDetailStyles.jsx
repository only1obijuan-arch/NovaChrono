export function LeagueDetailStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
      @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
      @keyframes pulse-live { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
      @keyframes champion-glow { 0%,100% { box-shadow:0 0 30px rgba(255,215,0,0.4); } 50% { box-shadow:0 0 60px rgba(255,215,0,0.7); } }

      * { box-sizing: border-box; }
      .ld-page { min-height:100vh; background:#091833; font-family:'Rajdhani',sans-serif; position:relative; overflow-x:hidden; }
      .ld-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(255,0,204,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,0,204,0.025) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
      .ld-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(255,0,204,0.3),transparent); animation:scanline 8s linear infinite; pointer-events:none; z-index:100; }

      .ld-champion { background:linear-gradient(135deg,rgba(255,215,0,0.15),rgba(255,180,0,0.1)); border-bottom:1px solid rgba(255,215,0,0.3); padding:24px; text-align:center; animation:champion-glow 3s infinite; position:relative; z-index:2; }
      .ld-champion-title { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,215,0,0.6); letter-spacing:4px; margin-bottom:8px; }
      .ld-champion-name { font-family:'Orbitron',monospace; font-size:28px; font-weight:900; color:#FFD700; text-shadow:0 0 20px rgba(255,215,0,0.5); }
      .ld-champion-stats { font-family:'Share Tech Mono',monospace; font-size:11px; color:rgba(255,215,0,0.6); letter-spacing:2px; margin-top:6px; }

      .ld-header { background:rgba(9,24,51,0.95); border-bottom:1px solid rgba(255,0,204,0.15); position:sticky; top:0; z-index:50; backdrop-filter:blur(10px); }
      .ld-header-inner { max-width:1200px; margin:0 auto; padding:20px 24px 0; }
      .ld-back { display:inline-flex; align-items:center; gap:6px; color:rgba(255,0,204,0.6); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; text-decoration:none; margin-bottom:16px; transition:all 0.2s; }
      .ld-back:hover { color:#FF00CC; }
      .ld-header-top { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:20px; flex-wrap:wrap; }
      .ld-league-name { font-family:'Orbitron',monospace; font-size:24px; font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:6px; }
      .ld-league-sub { font-family:'Share Tech Mono',monospace; font-size:11px; color:rgba(255,0,204,0.5); letter-spacing:3px; }
      .ld-status-badge { display:inline-block; padding:4px 12px; border-radius:2px; font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:3px; margin-left:12px; }
      .ld-status-registration { background:rgba(255,200,0,0.1); color:#FFD700; border:1px solid rgba(255,200,0,0.3); }
      .ld-status-active { background:rgba(0,255,156,0.1); color:#00FF9C; border:1px solid rgba(0,255,156,0.3); }
      .ld-status-completed { background:rgba(0,245,212,0.1); color:#00F5D4; border:1px solid rgba(0,245,212,0.3); }
      .ld-status-cancelled { background:rgba(255,0,204,0.1); color:#FF00CC; border:1px solid rgba(255,0,204,0.3); }

      .ld-header-actions { display:flex; gap:10px; flex-wrap:wrap; }
      .ld-btn { display:inline-flex; align-items:center; gap:8px; font-family:'Orbitron',monospace; font-size:10px; font-weight:700; letter-spacing:2px; padding:10px 16px; border-radius:4px; border:none; cursor:pointer; transition:all 0.2s; text-decoration:none; }
      .ld-btn-primary { background:linear-gradient(135deg,#FF00CC,#AA0088); color:#F4F4F9; box-shadow:0 0 15px rgba(255,0,204,0.3); }
      .ld-btn-primary:hover { box-shadow:0 0 25px rgba(255,0,204,0.5); transform:translateY(-1px); }
      .ld-btn-green { background:linear-gradient(135deg,#00FF9C,#00CC78); color:#091833; box-shadow:0 0 15px rgba(0,255,156,0.3); }
      .ld-btn-green:hover { box-shadow:0 0 25px rgba(0,255,156,0.5); transform:translateY(-1px); }
      .ld-btn-cyan { background:linear-gradient(135deg,#00F5D4,#00AAAA); color:#091833; box-shadow:0 0 15px rgba(0,245,212,0.3); }
      .ld-btn-cyan:hover { box-shadow:0 0 25px rgba(0,245,212,0.5); transform:translateY(-1px); }
      .ld-btn-danger { background:rgba(255,0,204,0.08); color:rgba(255,0,204,0.7); border:1px solid rgba(255,0,204,0.2); }
      .ld-btn-danger:hover { background:rgba(255,0,204,0.15); color:#FF00CC; }
      .ld-btn:disabled { opacity:0.4; cursor:not-allowed; transform:none; }

      .ld-tabs { display:flex; gap:0; border-top:1px solid rgba(255,0,204,0.1); }
      .ld-tab { display:flex; align-items:center; gap:8px; padding:14px 20px; font-family:'Share Tech Mono',monospace; font-size:11px; font-weight:700; letter-spacing:2px; border:none; background:none; cursor:pointer; color:rgba(180,200,220,0.4); border-bottom:2px solid transparent; transition:all 0.2s; }
      .ld-tab:hover { color:rgba(255,0,204,0.7); }
      .ld-tab.active { color:#FF00CC; border-bottom-color:#FF00CC; }

      .ld-inner { max-width:1200px; margin:0 auto; padding:32px 24px; position:relative; z-index:1; }

      .ld-card { background:rgba(11,20,40,0.8); border:1px solid rgba(255,0,204,0.15); border-radius:8px; padding:24px; backdrop-filter:blur(10px); }
      .ld-card-title { font-family:'Orbitron',monospace; font-size:14px; font-weight:700; color:#F4F4F9; letter-spacing:2px; margin-bottom:20px; }

      .ld-stats-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
      .ld-stat { background:rgba(255,0,204,0.05); border:1px solid rgba(255,0,204,0.15); border-radius:6px; padding:20px; text-align:center; }
      .ld-stat-label { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(255,0,204,0.5); letter-spacing:3px; margin-bottom:8px; }
      .ld-stat-value { font-family:'Orbitron',monospace; font-size:36px; font-weight:900; color:#FF00CC; }
      .ld-stat-sub { font-family:'Share Tech Mono',monospace; font-size:12px; color:rgba(180,200,220,0.4); margin-left:4px; }

      .ld-join-code-box { background:rgba(255,0,204,0.05); border:2px solid rgba(255,0,204,0.3); border-radius:8px; padding:24px; text-align:center; }
      .ld-join-code-label { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(255,0,204,0.5); letter-spacing:4px; margin-bottom:12px; }
      .ld-join-code { font-family:'Orbitron',monospace; font-size:40px; font-weight:900; color:#FF00CC; letter-spacing:8px; text-shadow:0 0 20px rgba(255,0,204,0.5); }

      .ld-rules { display:flex; flex-direction:column; gap:0; }
      .ld-rule { display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid rgba(255,0,204,0.08); }
      .ld-rule:last-child { border-bottom:none; }
      .ld-rule-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(180,200,220,0.5); letter-spacing:2px; }
      .ld-rule-value { font-family:'Orbitron',monospace; font-size:13px; font-weight:700; color:#F4F4F9; }

      .ld-table-wrap { background:rgba(11,20,40,0.8); border:1px solid rgba(255,0,204,0.15); border-radius:8px; overflow:hidden; }
      .ld-table { width:100%; border-collapse:collapse; }
      .ld-table th { background:rgba(255,0,204,0.08); padding:14px 20px; font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(255,0,204,0.6); letter-spacing:3px; text-align:left; border-bottom:1px solid rgba(255,0,204,0.15); }
      .ld-table td { padding:14px 20px; font-family:'Rajdhani',sans-serif; font-size:15px; color:rgba(180,200,220,0.8); border-bottom:1px solid rgba(255,0,204,0.06); }
      .ld-table tr:last-child td { border-bottom:none; }
      .ld-table tr:hover td { background:rgba(255,0,204,0.03); }
      .ld-table-name { color:#F4F4F9; font-weight:700; }
      .ld-table-slot { font-family:'Orbitron',monospace; font-size:12px; color:rgba(255,0,204,0.6); }
      .ld-manage-btn { color:#FF00CC; font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:2px; background:none; border:1px solid rgba(255,0,204,0.3); padding:4px 10px; border-radius:2px; cursor:pointer; transition:all 0.2s; }
      .ld-manage-btn:hover { background:rgba(255,0,204,0.1); border-color:#FF00CC; }

      .ld-round-title { font-family:'Orbitron',monospace; font-size:14px; font-weight:700; color:#F4F4F9; letter-spacing:3px; margin-bottom:16px; display:flex; align-items:center; gap:16px; }
      .ld-round-line { flex:1; height:1px; background:rgba(255,0,204,0.15); }
      .ld-match-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; margin-bottom:32px; }
      .ld-match { background:rgba(11,20,40,0.8); border:1px solid rgba(255,0,204,0.12); border-radius:6px; padding:16px; transition:all 0.2s; }
      .ld-match:hover { border-color:rgba(255,0,204,0.3); }
      .ld-match.is-live { border-color:rgba(255,0,204,0.5); box-shadow:0 0 15px rgba(255,0,204,0.1); }
      .ld-match-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
      .ld-match-field { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(255,0,204,0.6); letter-spacing:2px; background:rgba(255,0,204,0.08); padding:3px 8px; border-radius:2px; }
      .ld-match-time { font-family:'Orbitron',monospace; font-size:12px; color:#F4F4F9; }
      .ld-match-status { font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:2px; }
      .ld-match-status.scheduled { color:rgba(0,245,212,0.6); }
      .ld-match-status.live { color:#FF00CC; animation:pulse-live 1s infinite; }
      .ld-match-status.final { color:rgba(180,200,220,0.4); }
      .ld-match-teams { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:8px; }
      .ld-match-team { font-family:'Rajdhani',sans-serif; font-size:14px; font-weight:700; color:#F4F4F9; }
      .ld-match-team.home { text-align:right; }
      .ld-match-score { display:flex; align-items:center; gap:8px; }
      .ld-score { font-family:'Orbitron',monospace; font-size:22px; font-weight:900; color:#F4F4F9; }
      .ld-score-sep { font-family:'Orbitron',monospace; font-size:14px; color:rgba(255,0,204,0.3); }
      .ld-match-date { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(180,200,220,0.3); letter-spacing:2px; text-align:center; margin-top:10px; }

      .ld-standings-wrap { background:rgba(11,20,40,0.8); border:1px solid rgba(255,0,204,0.15); border-radius:8px; overflow:hidden; }
      .ld-standings-table { width:100%; border-collapse:collapse; }
      .ld-standings-table th { background:rgba(255,0,204,0.1); padding:14px 16px; font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(255,0,204,0.6); letter-spacing:3px; text-align:center; border-bottom:1px solid rgba(255,0,204,0.15); }
      .ld-standings-table th:first-child, .ld-standings-table th:nth-child(2) { text-align:left; }
      .ld-standings-table td { padding:12px 16px; font-family:'Rajdhani',sans-serif; font-size:15px; color:rgba(180,200,220,0.7); text-align:center; border-bottom:1px solid rgba(255,0,204,0.06); }
      .ld-standings-table td:first-child, .ld-standings-table td:nth-child(2) { text-align:left; }
      .ld-standings-table tr:last-child td { border-bottom:none; }
      .ld-standings-table tr:hover td { background:rgba(255,0,204,0.03); }
      .ld-standings-table tr.top3 td { background:rgba(255,0,204,0.04); }
      .ld-pos { font-family:'Orbitron',monospace; font-size:12px; color:rgba(255,0,204,0.5); }
      .ld-pos.gold { color:#FFD700; }
      .ld-pos.silver { color:#C0C0C0; }
      .ld-pos.bronze { color:#CD7F32; }
      .ld-team-name-cell { font-family:'Rajdhani',sans-serif; font-size:16px; font-weight:700; color:#F4F4F9; }
      .ld-pts { font-family:'Orbitron',monospace; font-size:16px; font-weight:900; color:#FF00CC; }
      .ld-win { color:#00FF9C; font-weight:700; }
      .ld-draw { color:rgba(180,200,220,0.6); font-weight:700; }
      .ld-loss { color:rgba(255,0,204,0.6); font-weight:700; }

      .ld-empty { border:2px dashed rgba(255,0,204,0.15); border-radius:8px; padding:60px 40px; text-align:center; }
      .ld-empty-title { font-family:'Orbitron',monospace; font-size:16px; color:#F4F4F9; margin-bottom:8px; }
      .ld-empty-sub { font-family:'Rajdhani',sans-serif; color:rgba(180,200,220,0.4); font-size:15px; }

      .ld-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; z-index:200; padding:16px; }
      .ld-modal { background:#0D1B2E; border:1px solid rgba(255,0,204,0.3); border-radius:8px; padding:32px; max-width:440px; width:100%; box-shadow:0 0 60px rgba(255,0,204,0.1); }
      .ld-modal-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; }
      .ld-modal-title { font-family:'Orbitron',monospace; font-size:16px; font-weight:700; color:#F4F4F9; letter-spacing:2px; }
      .ld-modal-close { background:none; border:none; color:rgba(255,0,204,0.5); cursor:pointer; transition:color 0.2s; padding:4px; }
      .ld-modal-close:hover { color:#FF00CC; }
      .ld-modal-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,0,204,0.6); letter-spacing:3px; display:block; margin-bottom:8px; }
      .ld-modal-input { width:100%; height:48px; background:rgba(255,0,204,0.05); border:1px solid rgba(255,0,204,0.3); border-radius:4px; padding:0 16px; color:#F4F4F9; font-family:'Rajdhani',sans-serif; font-size:16px; outline:none; transition:all 0.2s; margin-bottom:24px; }
      .ld-modal-input:focus { border-color:#FF00CC; box-shadow:0 0 15px rgba(255,0,204,0.15); }
      .ld-modal-input::placeholder { color:rgba(180,200,220,0.3); }
      .ld-modal-btns { display:flex; gap:12px; }
      .ld-modal-cancel { flex:1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:rgba(180,200,220,0.6); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; padding:12px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
      .ld-modal-cancel:hover { color:#F4F4F9; background:rgba(255,255,255,0.08); }
      .ld-modal-submit { flex:1; background:linear-gradient(135deg,#FF00CC,#AA0088); color:#F4F4F9; font-family:'Orbitron',monospace; font-size:11px; font-weight:700; letter-spacing:2px; padding:12px; border:none; border-radius:4px; cursor:pointer; transition:all 0.2s; }
      .ld-modal-submit:hover { box-shadow:0 0 20px rgba(255,0,204,0.4); }
      .ld-modal-submit:disabled { opacity:0.4; cursor:not-allowed; }
      .ld-modal-delete { flex:1; background:rgba(255,0,0,0.08); border:1px solid rgba(255,0,0,0.2); color:rgba(255,80,80,0.8); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; padding:12px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
      .ld-modal-delete:hover { background:rgba(255,0,0,0.15); color:#FF5050; }

      .ld-add-team-btn { display:inline-flex; align-items:center; gap:8px; background:rgba(255,0,204,0.08); border:1px solid rgba(255,0,204,0.3); color:#FF00CC; font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; padding:10px 16px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
      .ld-add-team-btn:hover { background:rgba(255,0,204,0.15); border-color:#FF00CC; box-shadow:0 0 15px rgba(255,0,204,0.2); }

      @media (max-width:768px) {
        .ld-stats-grid { grid-template-columns:1fr; }
        .ld-header-actions { flex-direction:column; }
        .ld-header-top { flex-direction:column; }
      }
    `}</style>
  );
}
