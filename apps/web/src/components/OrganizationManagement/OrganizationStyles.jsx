export function OrganizationStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
      @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
      @keyframes fadeInUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
      @keyframes shimmer { 0%,100% { opacity:0.3; } 50% { opacity:0.6; } }

      * { box-sizing:border-box; }
      .om-page { min-height:100vh; background:#091833; font-family:'Rajdhani',sans-serif; position:relative; }
      .om-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,245,212,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,212,0.02) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
      .om-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.3),transparent); animation:scanline 7s linear infinite; pointer-events:none; z-index:100; }
      .om-glow { position:fixed; top:-200px; right:-200px; width:600px; height:600px; background:radial-gradient(circle,rgba(0,245,212,0.04) 0%,transparent 70%); pointer-events:none; }

      .om-inner { max-width:1100px; margin:0 auto; padding:40px 24px 80px; position:relative; z-index:1; }

      .om-back { display:inline-flex; align-items:center; gap:6px; color:rgba(0,245,212,0.5); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; text-decoration:none; margin-bottom:32px; transition:all 0.2s; }
      .om-back:hover { color:#00F5D4; }

      .om-header { margin-bottom:40px; animation:fadeInUp 0.4s ease; }
      .om-header-row { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
      .om-header-icon { color:#00F5D4; }
      .om-title { font-family:'Orbitron',monospace; font-size:28px; font-weight:900; color:#F4F4F9; letter-spacing:2px; }
      .om-subtitle { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.4); letter-spacing:3px; }

      .om-stats { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:40px; }
      .om-stat { background:rgba(11,20,40,0.9); border:1px solid rgba(0,245,212,0.12); border-radius:8px; padding:20px 24px; display:flex; align-items:center; justify-content:space-between; animation:fadeInUp 0.4s ease; }
      .om-stat-label { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.4); letter-spacing:3px; margin-bottom:8px; }
      .om-stat-value { font-family:'Orbitron',monospace; font-size:32px; font-weight:900; color:#00F5D4; }
      .om-stat-icon { opacity:0.1; color:#00F5D4; }

      .om-section { margin-bottom:40px; animation:fadeInUp 0.5s ease; }
      .om-section-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid rgba(0,245,212,0.08); }
      .om-section-title { font-family:'Orbitron',monospace; font-size:14px; font-weight:700; color:#F4F4F9; letter-spacing:2px; }

      .om-btn-primary { display:inline-flex; align-items:center; gap:6px; background:rgba(0,245,212,0.08); border:1px solid rgba(0,245,212,0.3); color:#00F5D4; font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:2px; padding:8px 16px; border-radius:2px; cursor:pointer; transition:all 0.2s; }
      .om-btn-primary:hover:not(:disabled) { background:rgba(0,245,212,0.14); border-color:#00F5D4; box-shadow:0 0 15px rgba(0,245,212,0.15); }
      .om-btn-primary:disabled { opacity:0.3; cursor:not-allowed; }
      .om-btn-blue { display:inline-flex; align-items:center; gap:6px; background:rgba(0,100,255,0.08); border:1px solid rgba(0,100,255,0.3); color:#4488FF; font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:2px; padding:8px 16px; border-radius:2px; cursor:pointer; transition:all 0.2s; }
      .om-btn-blue:hover:not(:disabled) { background:rgba(0,100,255,0.14); border-color:#4488FF; }
      .om-btn-blue:disabled { opacity:0.3; cursor:not-allowed; }

      .om-venues { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }
      .om-venue-card { background:rgba(11,20,40,0.9); border:1px solid rgba(0,245,212,0.1); border-radius:8px; padding:20px; transition:all 0.2s; }
      .om-venue-card:hover { border-color:rgba(0,245,212,0.3); }
      .om-venue-name { font-family:'Orbitron',monospace; font-size:14px; font-weight:700; color:#F4F4F9; margin-bottom:6px; }
      .om-venue-location { font-family:'Rajdhani',sans-serif; font-size:13px; color:rgba(180,200,220,0.4); margin-bottom:10px; }
      .om-venue-meta { display:flex; gap:16px; }
      .om-venue-meta-item { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.4); letter-spacing:2px; }
      .om-venue-actions { display:flex; gap:6px; }
      .om-icon-btn { background:none; border:1px solid transparent; padding:6px; border-radius:2px; cursor:pointer; transition:all 0.2s; }
      .om-icon-btn.assign { color:rgba(0,100,255,0.5); }
      .om-icon-btn.assign:hover:not(:disabled) { border-color:rgba(0,100,255,0.4); color:#4488FF; background:rgba(0,100,255,0.08); }
      .om-icon-btn.assign:disabled { opacity:0.2; cursor:not-allowed; }
      .om-icon-btn.delete { color:rgba(255,80,80,0.4); }
      .om-icon-btn.delete:hover { border-color:rgba(255,80,80,0.4); color:rgba(255,80,80,0.9); background:rgba(255,80,80,0.08); }
      .om-assigned-badge { display:inline-flex; align-items:center; gap:4px; font-family:'Share Tech Mono',monospace; font-size:9px; color:#00FF9C; background:rgba(0,255,156,0.08); border:1px solid rgba(0,255,156,0.25); padding:3px 8px; border-radius:2px; margin-top:8px; }

      .om-empty { background:rgba(11,20,40,0.6); border:2px dashed rgba(0,245,212,0.1); border-radius:8px; padding:48px 24px; text-align:center; }
      .om-empty-icon { color:rgba(0,245,212,0.15); margin:0 auto 12px; }
      .om-empty-text { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.3); letter-spacing:3px; margin-bottom:16px; }

      .om-table-wrap { background:rgba(11,20,40,0.9); border:1px solid rgba(0,245,212,0.1); border-radius:8px; overflow:hidden; }
      .om-table { width:100%; border-collapse:collapse; }
      .om-table thead { background:rgba(0,245,212,0.04); border-bottom:1px solid rgba(0,245,212,0.1); }
      .om-table th { text-align:left; padding:12px 20px; font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.5); letter-spacing:3px; }
      .om-table td { padding:14px 20px; border-bottom:1px solid rgba(0,245,212,0.05); font-family:'Rajdhani',sans-serif; font-size:15px; color:rgba(180,200,220,0.7); }
      .om-table tr:last-child td { border-bottom:none; }
      .om-table tr:hover td { background:rgba(0,245,212,0.02); }
      .om-table .name { color:#F4F4F9; font-weight:700; }

      .om-skeleton { height:100px; background:rgba(11,20,40,0.9); border:1px solid rgba(0,245,212,0.06); border-radius:8px; animation:shimmer 1.5s infinite; }

      .om-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; z-index:200; padding:16px; }
      .om-modal { background:#0D1B2E; border:1px solid rgba(0,245,212,0.25); border-radius:8px; padding:32px; max-width:460px; width:100%; box-shadow:0 0 60px rgba(0,245,212,0.06); max-height:90vh; overflow-y:auto; }
      .om-modal-title { font-family:'Orbitron',monospace; font-size:16px; font-weight:700; color:#F4F4F9; letter-spacing:2px; margin-bottom:24px; }
      .om-modal-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.6); letter-spacing:3px; display:block; margin-bottom:8px; }
      .om-modal-input { width:100%; height:48px; background:rgba(0,245,212,0.04); border:1px solid rgba(0,245,212,0.15); border-radius:4px; padding:0 16px; color:#F4F4F9; font-family:'Rajdhani',sans-serif; font-size:16px; outline:none; transition:all 0.2s; margin-bottom:20px; }
      .om-modal-input:focus { border-color:#00F5D4; box-shadow:0 0 12px rgba(0,245,212,0.12); }
      .om-modal-input::placeholder { color:rgba(180,200,220,0.2); }
      .om-modal-select { width:100%; height:48px; background:rgba(0,245,212,0.04); border:1px solid rgba(0,245,212,0.15); border-radius:4px; padding:0 16px; color:#F4F4F9; font-family:'Rajdhani',sans-serif; font-size:16px; outline:none; margin-bottom:20px; cursor:pointer; }
      .om-modal-select option { background:#0D1B2E; }
      .om-modal-btns { display:flex; gap:12px; margin-top:8px; }
      .om-modal-cancel { flex:1; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); color:rgba(180,200,220,0.5); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; padding:12px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
      .om-modal-cancel:hover { color:#F4F4F9; }
      .om-modal-submit { flex:1; background:linear-gradient(135deg,rgba(0,245,212,0.2),rgba(0,245,212,0.1)); border:1px solid rgba(0,245,212,0.4); color:#00F5D4; font-family:'Orbitron',monospace; font-size:11px; font-weight:700; letter-spacing:2px; padding:12px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
      .om-modal-submit:hover:not(:disabled) { box-shadow:0 0 20px rgba(0,245,212,0.2); }
      .om-modal-submit:disabled { opacity:0.3; cursor:not-allowed; }
      .om-modal-submit-blue { flex:1; background:rgba(0,100,255,0.12); border:1px solid rgba(0,100,255,0.35); color:#4488FF; font-family:'Orbitron',monospace; font-size:11px; font-weight:700; letter-spacing:2px; padding:12px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
      .om-modal-submit-blue:hover:not(:disabled) { box-shadow:0 0 20px rgba(0,100,255,0.2); }
      .om-modal-submit-blue:disabled { opacity:0.3; cursor:not-allowed; }

      @media (max-width:640px) {
        .om-stats { grid-template-columns:1fr; }
      }
    `}</style>
  );
}
