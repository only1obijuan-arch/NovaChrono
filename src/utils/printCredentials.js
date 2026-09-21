import { escapeHtml } from "@/utils/escape-html";
export function printCredentials(credentials) {
  if (!credentials) return;

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <html>
      <head>
        <title>Referee Credentials — Field ${escapeHtml(credentials.fieldNumber)}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Share+Tech+Mono&family=Rajdhani:wght@600;700&display=swap');
          body { background:#091833; color:#F4F4F9; font-family:'Rajdhani',sans-serif; padding:40px; margin:0; }
          .card { background:#0D1B2E; border:2px solid rgba(0,245,212,0.4); border-radius:12px; padding:40px; max-width:480px; margin:0 auto; }
          .logo { font-family:'Orbitron',monospace; font-size:22px; font-weight:900; color:#00F5D4; letter-spacing:4px; margin-bottom:8px; }
          .tagline { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.4); letter-spacing:3px; margin-bottom:32px; }
          .title { font-family:'Orbitron',monospace; font-size:14px; color:rgba(0,245,212,0.6); letter-spacing:3px; margin-bottom:24px; }
          .row { display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid rgba(0,245,212,0.1); }
          .row:last-child { border-bottom:none; }
          .label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.5); letter-spacing:2px; }
          .value { font-family:'Orbitron',monospace; font-size:14px; color:#F4F4F9; font-weight:700; }
          .password { font-family:'Orbitron',monospace; font-size:20px; color:#00F5D4; font-weight:900; letter-spacing:3px; text-shadow:0 0 10px rgba(0,245,212,0.4); }
          .footer { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(180,200,220,0.2); letter-spacing:3px; text-align:center; margin-top:32px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">NOVACHRONO</div>
          <div class="tagline">// TIME PAUSES. YOUR LEAGUE NEVER DOES.</div>
          <div class="title">REFEREE ACCESS CREDENTIALS</div>
          <div class="row"><span class="label">VENUE</span><span class="value">${escapeHtml(credentials.venueName)}</span></div>
          <div class="row"><span class="label">FIELD</span><span class="value">${escapeHtml(credentials.fieldNumber)}</span></div>
          <div class="row"><span class="label">EMAIL</span><span class="value">${escapeHtml(credentials.email)}</span></div>
          <div class="row"><span class="label">PASSWORD</span><span class="password">${escapeHtml(credentials.password)}</span></div>
          <div class="footer">KEEP THESE CREDENTIALS SECURE — DO NOT SHARE</div>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
}
