export const AdminDashboardStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
    @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
    @keyframes card-enter { from { opacity:0; transform:translateY(30px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }

    * { box-sizing:border-box; }
    .ad-page { min-height:100vh; background:#091833; font-family:'Rajdhani',sans-serif; position:relative; overflow-x:hidden; }
    .ad-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,245,212,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,212,0.03) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
    .ad-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(255,0,204,0.2),transparent); animation:scanline 10s linear infinite; pointer-events:none; z-index:100; }
    .ad-glow-tl { position:fixed; top:-200px; left:-200px; width:500px; height:500px; background:radial-gradient(circle,rgba(255,0,204,0.05) 0%,transparent 70%); pointer-events:none; }
    .ad-glow-br { position:fixed; bottom:-200px; right:-200px; width:500px; height:500px; background:radial-gradient(circle,rgba(0,245,212,0.04) 0%,transparent 70%); pointer-events:none; }

    .ad-inner { max-width:1200px; margin:0 auto; padding:32px 24px; position:relative; z-index:1; }

    .ad-nav { display:flex; align-items:center; justify-content:space-between; margin-bottom:32px; padding-bottom:16px; border-bottom:1px solid rgba(255,0,204,0.1); }
    .ad-nav-left { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
    .ad-nav-link { display:inline-flex; align-items:center; gap:8px; color:rgba(0,245,212,0.6); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; text-decoration:none; padding:8px 12px; border:1px solid rgba(0,245,212,0.2); border-radius:4px; transition:all 0.2s; }
    .ad-nav-link:hover { color:#00F5D4; border-color:#00F5D4; background:rgba(0,245,212,0.05); }
    .ad-nav-link.magenta { color:rgba(255,0,204,0.6); border-color:rgba(255,0,204,0.2); }
    .ad-nav-link.magenta:hover { color:#FF00CC; border-color:#FF00CC; background:rgba(255,0,204,0.05); }
    .ad-nav-link.orange { color:rgba(255,160,0,0.7); border-color:rgba(255,160,0,0.2); }
    .ad-nav-link.orange:hover { color:#FFA000; border-color:#FFA000; background:rgba(255,160,0,0.05); }
    .ad-signout { display:inline-flex; align-items:center; gap:8px; color:rgba(255,0,204,0.7); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; text-decoration:none; padding:8px 12px; border:1px solid rgba(255,0,204,0.3); border-radius:4px; transition:all 0.2s; }
    .ad-signout:hover { color:#FF00CC; border-color:#FF00CC; background:rgba(255,0,204,0.05); }

    .ad-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:40px; }
    .ad-title-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,0,204,0.5); letter-spacing:4px; margin-bottom:8px; }
    .ad-title { font-family:'Orbitron',monospace; font-size:26px; font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:6px; }
    .ad-subtitle { font-family:'Rajdhani',sans-serif; font-size:15px; color:rgba(180,200,220,0.6); }
    .ad-create-btn { display:inline-flex; align-items:center; gap:8px; background:linear-gradient(135deg,#FF00CC,#AA0088); color:#F4F4F9; font-family:'Orbitron',monospace; font-size:11px; font-weight:700; letter-spacing:2px; padding:12px 20px; border:none; border-radius:4px; cursor:pointer; text-decoration:none; transition:all 0.2s; box-shadow:0 0 20px rgba(255,0,204,0.3); }
    .ad-create-btn:hover { transform:translateY(-2px); box-shadow:0 0 30px rgba(255,0,204,0.5); }

    .ad-section-title { font-family:'Orbitron',monospace; font-size:14px; font-weight:700; color:#F4F4F9; letter-spacing:3px; margin-bottom:16px; display:flex; align-items:center; gap:16px; }
    .ad-section-line { flex:1; height:1px; background:rgba(255,0,204,0.15); }

    .ad-leagues { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:16px; }
    .ad-league-card { background:rgba(11,20,40,0.8); border:1px solid rgba(255,0,204,0.15); border-radius:8px; padding:24px; backdrop-filter:blur(10px); transition:all 0.3s; position:relative; overflow:hidden; text-decoration:none; display:block; animation:card-enter 0.5s ease both; }
    .ad-league-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(255,0,204,0.5),transparent); opacity:0; transition:opacity 0.3s; }
    .ad-league-card:hover { border-color:rgba(255,0,204,0.4); transform:translateY(-4px); box-shadow:0 8px 30px rgba(255,0,204,0.1); }
    .ad-league-card:hover::before { opacity:1; }
    .ad-status-badge { position:absolute; top:0; right:0; padding:6px 14px; border-bottom-left-radius:8px; font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:2px; }
    .ad-status-registration { background:rgba(255,200,0,0.15); color:#FFD700; border-left:1px solid rgba(255,200,0,0.3); border-bottom:1px solid rgba(255,200,0,0.3); }
    .ad-status-active { background:rgba(0,255,156,0.1); color:#00FF9C; border-left:1px solid rgba(0,255,156,0.3); border-bottom:1px solid rgba(0,255,156,0.3); }
    .ad-status-completed { background:rgba(180,200,220,0.1); color:rgba(180,200,220,0.5); border-left:1px solid rgba(180,200,220,0.2); border-bottom:1px solid rgba(180,200,220,0.2); }
    .ad-league-name { font-family:'Orbitron',monospace; font-size:16px; font-weight:700; color:#F4F4F9; margin-bottom:4px; letter-spacing:1px; padding-right:80px; }
    .ad-league-day { font-family:'Share Tech Mono',monospace; font-size:11px; color:rgba(255,0,204,0.6); margin-bottom:16px; letter-spacing:2px; }
    .ad-league-meta { display:flex; flex-direction:column; gap:8px; margin-bottom:20px; }
    .ad-league-meta-item { display:flex; align-items:center; gap:8px; font-family:'Rajdhani',sans-serif; font-size:14px; color:rgba(180,200,220,0.6); }
    .ad-league-footer { display:flex; align-items:center; justify-content:space-between; padding-top:16px; border-top:1px solid rgba(255,0,204,0.1); }
    .ad-join-code-label { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(255,0,204,0.4); letter-spacing:3px; margin-bottom:4px; }
    .ad-join-code { font-family:'Orbitron',monospace; font-size:18px; font-weight:700; color:#FF00CC; letter-spacing:3px; text-shadow:0 0 10px rgba(255,0,204,0.4); }
    .ad-arrow-btn { width:36px; height:36px; background:rgba(255,0,204,0.1); border:1px solid rgba(255,0,204,0.3); border-radius:4px; display:flex; align-items:center; justify-content:center; transition:all 0.2s; }
    .ad-league-card:hover .ad-arrow-btn { background:rgba(255,0,204,0.2); border-color:#FF00CC; box-shadow:0 0 10px rgba(255,0,204,0.3); }

    .ad-refs-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px; }
    .ad-ref-card { background:rgba(11,20,40,0.8); border:1px solid rgba(0,245,212,0.15); border-radius:8px; padding:18px; display:flex; flex-direction:column; gap:8px; position:relative; animation:card-enter 0.4s ease both; }
    .ad-ref-field { font-family:'Orbitron',monospace; font-size:22px; font-weight:900; color:#00F5D4; line-height:1; }
    .ad-ref-field-label { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.4); letter-spacing:3px; }
    .ad-ref-email { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(180,200,220,0.4); letter-spacing:1px; word-break:break-all; }
    .ad-ref-delete { position:absolute; top:10px; right:10px; background:none; border:1px solid rgba(255,80,80,0.2); color:rgba(255,80,80,0.4); padding:4px; border-radius:2px; cursor:pointer; transition:all 0.2s; }
    .ad-ref-delete:hover { border-color:rgba(255,80,80,0.6); color:rgba(255,80,80,0.9); }
    .ad-ref-show-btn { background:rgba(0,245,212,0.06); border:1px solid rgba(0,245,212,0.2); color:rgba(0,245,212,0.6); font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:2px; padding:5px 8px; border-radius:2px; cursor:pointer; transition:all 0.2s; margin-top:4px; }
    .ad-ref-show-btn:hover { background:rgba(0,245,212,0.1); color:#00F5D4; }
    .ad-add-ref-btn { display:inline-flex; align-items:center; gap:8px; background:rgba(0,245,212,0.06); border:1px solid rgba(0,245,212,0.25); color:#00F5D4; font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:2px; padding:10px 16px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
    .ad-add-ref-btn:hover { background:rgba(0,245,212,0.12); border-color:#00F5D4; box-shadow:0 0 15px rgba(0,245,212,0.15); }

    .ad-empty { background:rgba(11,20,40,0.8); border:2px dashed rgba(255,0,204,0.2); border-radius:8px; padding:80px 40px; text-align:center; }
    .ad-empty-title { font-family:'Orbitron',monospace; font-size:18px; color:#F4F4F9; margin-bottom:8px; }
    .ad-empty-sub { font-family:'Rajdhani',sans-serif; color:rgba(180,200,220,0.5); margin-bottom:32px; font-size:16px; }

    .ad-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; z-index:200; padding:16px; }
    .ad-modal { background:#0D1B2E; border:1px solid rgba(0,245,212,0.3); border-radius:8px; padding:32px; max-width:480px; width:100%; box-shadow:0 0 60px rgba(0,245,212,0.08); }
    .ad-modal-title { font-family:'Orbitron',monospace; font-size:16px; font-weight:700; color:#F4F4F9; letter-spacing:2px; margin-bottom:8px; }
    .ad-modal-sub { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.4); letter-spacing:3px; margin-bottom:24px; }
    .ad-modal-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.6); letter-spacing:3px; display:block; margin-bottom:8px; }
    .ad-modal-input { width:100%; height:48px; background:rgba(0,245,212,0.05); border:1px solid rgba(0,245,212,0.2); border-radius:4px; padding:0 16px; color:#F4F4F9; font-family:'Orbitron',monospace; font-size:18px; outline:none; transition:all 0.2s; margin-bottom:24px; }
    .ad-modal-input:focus { border-color:#00F5D4; box-shadow:0 0 12px rgba(0,245,212,0.15); }
    .ad-modal-btns { display:flex; gap:12px; }
    .ad-modal-cancel { flex:1; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); color:rgba(180,200,220,0.5); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; padding:12px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
    .ad-modal-cancel:hover { color:#F4F4F9; }
    .ad-modal-submit { flex:1; background:rgba(0,245,212,0.1); border:1px solid rgba(0,245,212,0.4); color:#00F5D4; font-family:'Orbitron',monospace; font-size:12px; font-weight:700; letter-spacing:2px; padding:12px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
    .ad-modal-submit:hover { box-shadow:0 0 20px rgba(0,245,212,0.2); }
    .ad-modal-submit:disabled { opacity:0.3; cursor:not-allowed; }

    .ad-creds-card { background:rgba(0,245,212,0.04); border:2px solid rgba(0,245,212,0.3); border-radius:8px; padding:24px; margin-bottom:24px; }
    .ad-creds-row { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(0,245,212,0.08); }
    .ad-creds-row:last-child { border-bottom:none; }
    .ad-creds-label { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.5); letter-spacing:3px; }
    .ad-creds-value { font-family:'Orbitron',monospace; font-size:13px; color:#F4F4F9; font-weight:700; }
    .ad-creds-password { font-family:'Orbitron',monospace; font-size:20px; color:#00F5D4; font-weight:900; letter-spacing:3px; text-shadow:0 0 10px rgba(0,245,212,0.4); }
    .ad-creds-warning { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(255,200,0,0.6); letter-spacing:2px; text-align:center; margin-bottom:16px; }
    .ad-creds-btns { display:flex; gap:10px; }
    .ad-creds-copy { flex:1; display:flex; align-items:center; justify-content:center; gap:8px; background:rgba(0,245,212,0.08); border:1px solid rgba(0,245,212,0.3); color:#00F5D4; font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:2px; padding:12px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
    .ad-creds-copy:hover { background:rgba(0,245,212,0.14); }
    .ad-creds-print { flex:1; display:flex; align-items:center; justify-content:center; gap:8px; background:rgba(255,0,204,0.08); border:1px solid rgba(255,0,204,0.3); color:#FF00CC; font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:2px; padding:12px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
    .ad-creds-print:hover { background:rgba(255,0,204,0.14); }
    .ad-creds-done { width:100%; background:linear-gradient(135deg,#00FF9C,#00CC78); color:#091833; font-family:'Orbitron',monospace; font-size:12px; font-weight:700; letter-spacing:2px; padding:14px; border:none; border-radius:4px; cursor:pointer; margin-top:12px; transition:all 0.2s; }
    .ad-creds-done:hover { box-shadow:0 0 20px rgba(0,255,156,0.4); }

    @media (max-width:768px) {
      .ad-header { flex-direction:column; gap:16px; }
      .ad-leagues { grid-template-columns:1fr; }
      .ad-refs-grid { grid-template-columns:1fr 1fr; }
    }
  `}</style>
);
