import { useState } from "react";
import { X } from "lucide-react";

export function AdminCredentialsModal({ credentials, onClose }) {
  const [copiedAdmin, setCopiedAdmin] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(
      `NovaChrono Venue Admin Login\nName: ${credentials.name}\nVenue: ${credentials.venueName}\nEmail: ${credentials.email}\nPassword: ${credentials.password}`,
    );
    setCopiedAdmin(true);
    setTimeout(() => setCopiedAdmin(false), 2000);
  };

  const handlePrint = () => {
    const w = window.open("", "_blank");
    w.document.write(`
      <html><head><title>Admin Credentials</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Share+Tech+Mono&family=Rajdhani:wght@600;700&display=swap');
        body { background:#091833; color:#F4F4F9; font-family:'Rajdhani',sans-serif; padding:40px; margin:0; }
        .card { background:#0D1B2E; border:2px solid rgba(0,245,212,0.4); border-radius:12px; padding:40px; max-width:480px; margin:0 auto; }
        .logo { font-family:'Orbitron',monospace; font-size:22px; font-weight:900; color:#00F5D4; letter-spacing:4px; margin-bottom:6px; }
        .tagline { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.4); letter-spacing:3px; margin-bottom:32px; }
        .title { font-family:'Orbitron',monospace; font-size:13px; color:rgba(0,245,212,0.6); letter-spacing:3px; margin-bottom:24px; }
        .row { display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid rgba(0,245,212,0.1); }
        .row:last-child { border-bottom:none; }
        .label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.5); letter-spacing:2px; }
        .value { font-family:'Orbitron',monospace; font-size:13px; color:#F4F4F9; font-weight:700; }
        .password { font-family:'Orbitron',monospace; font-size:20px; color:#00F5D4; font-weight:900; letter-spacing:3px; text-shadow:0 0 10px rgba(0,245,212,0.4); }
        .footer { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(180,200,220,0.2); letter-spacing:3px; text-align:center; margin-top:32px; }
      </style></head>
      <body><div class="card">
        <div class="logo">NOVACHRONO</div>
        <div class="tagline">// TIME PAUSES. YOUR LEAGUE NEVER DOES.</div>
        <div class="title">VENUE ADMIN CREDENTIALS</div>
        <div class="row"><span class="label">NAME</span><span class="value">${credentials.name}</span></div>
        <div class="row"><span class="label">VENUE</span><span class="value">${credentials.venueName}</span></div>
        <div class="row"><span class="label">EMAIL</span><span class="value">${credentials.email}</span></div>
        <div class="row"><span class="label">PASSWORD</span><span class="password">${credentials.password}</span></div>
        <div class="footer">KEEP THESE CREDENTIALS SECURE — DO NOT SHARE</div>
      </div></body></html>
    `);
    w.document.close();
    w.print();
  };

  return (
    <div className="om-modal-overlay">
      <div className="om-modal">
        <div className="om-modal-header">
          <h2 className="om-modal-title">// ADMIN CREDENTIALS</h2>
          <button className="om-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            background: "rgba(0,245,212,0.04)",
            border: "2px solid rgba(0,245,212,0.25)",
            borderRadius: 6,
            padding: 20,
            marginBottom: 16,
          }}
        >
          {[
            ["NAME", credentials.name],
            ["EMAIL", credentials.email],
            ["VENUE", credentials.venueName],
            ["PASSWORD", credentials.password],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 0",
                borderBottom: "1px solid rgba(0,245,212,0.08)",
              }}
            >
              <span
                style={{
                  fontFamily: "'Share Tech Mono',monospace",
                  fontSize: 9,
                  color: "rgba(0,245,212,0.5)",
                  letterSpacing: 3,
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontFamily: "'Orbitron',monospace",
                  fontSize: label === "PASSWORD" ? 16 : 12,
                  fontWeight: 700,
                  color: label === "PASSWORD" ? "#00F5D4" : "#F4F4F9",
                  textShadow:
                    label === "PASSWORD"
                      ? "0 0 10px rgba(0,245,212,0.4)"
                      : "none",
                  letterSpacing: label === "PASSWORD" ? 3 : 1,
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        <p
          style={{
            fontFamily: "'Share Tech Mono',monospace",
            fontSize: 9,
            color: "rgba(255,200,0,0.6)",
            letterSpacing: 2,
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          ⚠ SAVE THESE CREDENTIALS — THEY CANNOT BE RECOVERED LATER
        </p>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button
            onClick={handleCopy}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "rgba(0,245,212,0.08)",
              border: "1px solid rgba(0,245,212,0.3)",
              color: "#00F5D4",
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: 10,
              letterSpacing: 2,
              padding: 12,
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {copiedAdmin ? "✓ COPIED!" : "⎘ COPY"}
          </button>
          <button
            onClick={handlePrint}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "rgba(255,0,204,0.08)",
              border: "1px solid rgba(255,0,204,0.3)",
              color: "#FF00CC",
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: 10,
              letterSpacing: 2,
              padding: 12,
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            🖨 PRINT
          </button>
        </div>

        <button
          onClick={onClose}
          style={{
            width: "100%",
            background: "linear-gradient(135deg,#00FF9C,#00CC78)",
            color: "#091833",
            fontFamily: "'Orbitron',monospace",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 2,
            padding: 14,
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          DONE
        </button>
      </div>
    </div>
  );
}
