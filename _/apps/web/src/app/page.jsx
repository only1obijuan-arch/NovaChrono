"use client";
import { Shield, Users, Timer, Crown } from "lucide-react";
import useUser from "@/utils/useUser";
import { useEffect, useState } from "react";

export default function WelcomePage() {
  const { data: user, loading } = useUser();
  const userRole = user?.role;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (loading) {
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
            SYSTEM LOADING...
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!userRole) {
    window.location.href = "/account/signin";
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
        <p style={{ color: "#00F5D4", fontFamily: "monospace" }}>
          REDIRECTING...
        </p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body { background: #091833; }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-cyan { 0%, 100% { box-shadow: 0 0 20px #00F5D4, 0 0 40px #00F5D480; } 50% { box-shadow: 0 0 30px #00F5D4, 0 0 60px #00F5D4, 0 0 80px #00F5D440; } }
        @keyframes pulse-magenta { 0%, 100% { box-shadow: 0 0 20px #FF00CC, 0 0 40px #FF00CC80; } 50% { box-shadow: 0 0 30px #FF00CC, 0 0 60px #FF00CC, 0 0 80px #FF00CC40; } }
        @keyframes pulse-green { 0%, 100% { box-shadow: 0 0 20px #00FF9C, 0 0 40px #00FF9C80; } 50% { box-shadow: 0 0 30px #00FF9C, 0 0 60px #00FF9C, 0 0 80px #00FF9C40; } }
        @keyframes pulse-purple { 0%, 100% { box-shadow: 0 0 20px #A42DB4, 0 0 40px #A42DB480; } 50% { box-shadow: 0 0 30px #A42DB4, 0 0 60px #A42DB4, 0 0 80px #A42DB440; } }
        @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
        @keyframes flicker { 0%, 100% { opacity: 1; } 92% { opacity: 1; } 93% { opacity: 0.8; } 94% { opacity: 1; } 96% { opacity: 0.9; } 97% { opacity: 1; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes glitch { 0%, 100% { clip-path: none; transform: none; } 20% { clip-path: polygon(0 15%, 100% 15%, 100% 20%, 0 20%); transform: translate(-3px, 0); } 21% { clip-path: none; transform: none; } 40% { clip-path: polygon(0 60%, 100% 60%, 100% 65%, 0 65%); transform: translate(3px, 0); } 41% { clip-path: none; transform: none; } }
        @keyframes rotate-ring { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes counter-rotate { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        @keyframes card-enter { from { opacity: 0; transform: translateY(40px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }

        .nc-page {
          min-height: 100vh;
          background: #091833;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
          position: relative;
          overflow: hidden;
          animation: flicker 8s infinite;
        }

        /* Grid background */
        .nc-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(0,245,212,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,245,212,0.04) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none;
        }

        /* Scanline effect */
        .nc-scanline {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent, rgba(0,245,212,0.3), transparent);
          animation: scanline 6s linear infinite;
          pointer-events: none;
          z-index: 10;
        }

        /* Corner HUD decorations */
        .nc-corner {
          position: absolute;
          width: 80px; height: 80px;
          pointer-events: none;
        }
        .nc-corner.tl { top: 20px; left: 20px; border-top: 2px solid #00F5D4; border-left: 2px solid #00F5D4; }
        .nc-corner.tr { top: 20px; right: 20px; border-top: 2px solid #00F5D4; border-right: 2px solid #00F5D4; }
        .nc-corner.bl { bottom: 20px; left: 20px; border-bottom: 2px solid #00F5D4; border-left: 2px solid #00F5D4; }
        .nc-corner.br { bottom: 20px; right: 20px; border-bottom: 2px solid #00F5D4; border-right: 2px solid #00F5D4; }

        /* Status dots */
        .nc-status {
          position: absolute;
          top: 24px; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 8px;
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px; color: #00F5D4; letter-spacing: 3px;
        }
        .nc-status-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #00FF9C;
          box-shadow: 0 0 8px #00FF9C;
          animation: pulse-green 2s infinite;
        }

        /* Logo area */
        .nc-logo {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 48px;
          animation: fadeInUp 0.8s ease forwards;
        }

        .nc-logo-ring {
          position: relative;
          width: 120px; height: 120px;
          margin-bottom: 24px;
        }

        .nc-logo-ring-outer {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px solid transparent;
          border-top-color: #00F5D4;
          border-right-color: #00F5D4;
          animation: rotate-ring 3s linear infinite;
        }

        .nc-logo-ring-inner {
          position: absolute;
          inset: 12px;
          border-radius: 50%;
          border: 2px solid transparent;
          border-bottom-color: #FF00CC;
          border-left-color: #FF00CC;
          animation: counter-rotate 2s linear infinite;
        }

        .nc-logo-center {
          position: absolute;
          inset: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #0A1628, #091833);
          border: 1px solid rgba(0,245,212,0.3);
          display: flex; align-items: center; justify-content: center;
          box-shadow: inset 0 0 20px rgba(0,245,212,0.1), 0 0 20px rgba(0,245,212,0.2);
        }

        .nc-logo-ball {
          width: 32px; height: 32px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #00F5D4, #0066AA);
          box-shadow: 0 0 15px #00F5D4, 0 0 30px rgba(0,245,212,0.4);
          position: relative;
          overflow: hidden;
        }

        .nc-logo-ball::after {
          content: '';
          position: absolute;
          top: 20%; left: 20%;
          width: 60%; height: 60%;
          border-radius: 50%;
          background: rgba(255,255,255,0.15);
        }

        .nc-title {
          font-family: 'Orbitron', monospace;
          font-size: 42px;
          font-weight: 900;
          letter-spacing: 4px;
          background: linear-gradient(90deg, #00F5D4, #00FF9C, #00F5D4);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-shadow: none;
          filter: drop-shadow(0 0 20px rgba(0,245,212,0.6));
          position: relative;
        }

        .nc-title-glitch {
          position: relative;
          animation: glitch 5s infinite;
        }

        .nc-tagline {
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px;
          color: #FF00CC;
          letter-spacing: 3px;
          text-transform: uppercase;
          margin-top: 8px;
          text-shadow: 0 0 10px #FF00CC;
        }

        /* Cards grid */
        .nc-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
          width: 100%;
          max-width: 1000px;
        }

        .nc-card {
          position: relative;
          background: rgba(11, 20, 40, 0.8);
          border: 1px solid rgba(0,245,212,0.2);
          border-radius: 4px;
          padding: 32px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.3s ease;
          overflow: hidden;
          backdrop-filter: blur(10px);
        }

        .nc-card::before {
          content: '';
          position: absolute;
          inset: 0;
          opacity: 0;
          transition: opacity 0.3s;
        }

        .nc-card:hover {
          transform: translateY(-6px);
          border-color: var(--card-color);
        }

        .nc-card:hover::before { opacity: 1; }

        .nc-card-corner-tl, .nc-card-corner-br {
          position: absolute;
          width: 16px; height: 16px;
        }
        .nc-card-corner-tl { top: -1px; left: -1px; border-top: 2px solid var(--card-color); border-left: 2px solid var(--card-color); }
        .nc-card-corner-br { bottom: -1px; right: -1px; border-bottom: 2px solid var(--card-color); border-right: 2px solid var(--card-color); }

        .nc-card-badge {
          position: absolute;
          top: 12px; right: 12px;
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px;
          letter-spacing: 2px;
          padding: 3px 8px;
          border: 1px solid var(--card-color);
          color: var(--card-color);
          border-radius: 2px;
        }

        .nc-card-icon {
          width: 64px; height: 64px;
          border-radius: 4px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 20px;
          background: rgba(0,0,0,0.3);
          border: 1px solid var(--card-color);
          position: relative;
          transition: all 0.3s;
        }

        .nc-card:hover .nc-card-icon {
          box-shadow: 0 0 20px var(--card-color), inset 0 0 20px rgba(255,255,255,0.05);
        }

        .nc-card-title {
          font-family: 'Orbitron', monospace;
          font-size: 14px;
          font-weight: 700;
          color: #F4F4F9;
          letter-spacing: 2px;
          margin-bottom: 12px;
          text-transform: uppercase;
        }

        .nc-card-desc {
          font-family: 'Rajdhani', sans-serif;
          font-size: 14px;
          color: rgba(180,200,220,0.7);
          line-height: 1.6;
        }

        .nc-card-arrow {
          margin-top: 20px;
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px;
          color: var(--card-color);
          letter-spacing: 2px;
          opacity: 0;
          transform: translateX(-10px);
          transition: all 0.3s;
        }

        .nc-card:hover .nc-card-arrow {
          opacity: 1;
          transform: translateX(0);
        }

        /* Card color variants */
        .card-cyan { --card-color: #00F5D4; }
        .card-cyan::before { background: radial-gradient(ellipse at center, rgba(0,245,212,0.05) 0%, transparent 70%); }

        .card-magenta { --card-color: #FF00CC; }
        .card-magenta::before { background: radial-gradient(ellipse at center, rgba(255,0,204,0.05) 0%, transparent 70%); }

        .card-green { --card-color: #00FF9C; }
        .card-green::before { background: radial-gradient(ellipse at center, rgba(0,255,156,0.05) 0%, transparent 70%); }

        .card-purple { --card-color: #A42DB4; }
        .card-purple::before { background: radial-gradient(ellipse at center, rgba(164,45,180,0.05) 0%, transparent 70%); }

        /* Card animations */
        .nc-card:nth-child(1) { animation: card-enter 0.6s ease 0.1s both; }
        .nc-card:nth-child(2) { animation: card-enter 0.6s ease 0.2s both; }
        .nc-card:nth-child(3) { animation: card-enter 0.6s ease 0.3s both; }
        .nc-card:nth-child(4) { animation: card-enter 0.6s ease 0.4s both; }

        /* Bottom link */
        .nc-footer-link {
          margin-top: 40px;
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px;
          color: rgba(0,245,212,0.5);
          letter-spacing: 3px;
          text-decoration: none;
          text-transform: uppercase;
          transition: all 0.3s;
          animation: fadeInUp 1s ease 0.6s both;
        }

        .nc-footer-link:hover {
          color: #00F5D4;
          text-shadow: 0 0 10px #00F5D4;
        }

        /* Ambient glows */
        .nc-glow-left {
          position: absolute;
          left: -200px; top: 30%;
          width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(0,245,212,0.08) 0%, transparent 70%);
          pointer-events: none;
        }
        .nc-glow-right {
          position: absolute;
          right: -200px; bottom: 30%;
          width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(255,0,204,0.06) 0%, transparent 70%);
          pointer-events: none;
        }

        @media (max-width: 768px) {
          .nc-cards { grid-template-columns: repeat(2, 1fr); gap: 12px; }
          .nc-title { font-size: 28px; letter-spacing: 2px; }
          .nc-logo-ring { width: 90px; height: 90px; }
        }
      `}</style>

      <div className="nc-page">
        <div className="nc-grid" />
        <div className="nc-scanline" />
        <div className="nc-glow-left" />
        <div className="nc-glow-right" />

        {/* HUD corners */}
        <div className="nc-corner tl" />
        <div className="nc-corner tr" />
        <div className="nc-corner bl" />
        <div className="nc-corner br" />

        {/* Status bar */}
        <div className="nc-status">
          <div className="nc-status-dot" />
          SYSTEM ONLINE
        </div>

        {/* Logo */}
        <div className="nc-logo">
          <div className="nc-logo-ring">
            <div className="nc-logo-ring-outer" />
            <div className="nc-logo-ring-inner" />
            <div className="nc-logo-center">
              <div className="nc-logo-ball" />
            </div>
          </div>
          <h1 className="nc-title nc-title-glitch">NovaChrono</h1>
          <p className="nc-tagline">Time Pauses. Your League Never Does.</p>
        </div>

        {/* Role cards */}
        <div className="nc-cards">
          <a href="/super-admin" className="nc-card card-cyan">
            <div className="nc-card-corner-tl" />
            <div className="nc-card-corner-br" />
            <span className="nc-card-badge">GOD MODE</span>
            <div className="nc-card-icon">
              <Crown size={28} color="#00F5D4" />
            </div>
            <h3 className="nc-card-title">Super Admin</h3>
            <p className="nc-card-desc">
              Platform-level access. Manage all organizations, venues, and users
              across the entire system.
            </p>
            <span className="nc-card-arrow">ENTER →</span>
          </a>

          <a href="/admin" className="nc-card card-magenta">
            <div className="nc-card-corner-tl" />
            <div className="nc-card-corner-br" />
            <span className="nc-card-badge">ALL ACCESS</span>
            <div className="nc-card-icon">
              <Shield size={28} color="#FF00CC" />
            </div>
            <h3 className="nc-card-title">Venue Admin</h3>
            <p className="nc-card-desc">
              Full access to leagues, teams, fixtures, and match management.
            </p>
            <span className="nc-card-arrow">ENTER →</span>
          </a>

          <a href="/account/signin" className="nc-card card-green">
            <div className="nc-card-corner-tl" />
            <div className="nc-card-corner-br" />
            <span className="nc-card-badge">CAPTAIN</span>
            <div className="nc-card-icon">
              <Users size={28} color="#00FF9C" />
            </div>
            <h3 className="nc-card-title">Team Captain</h3>
            <p className="nc-card-desc">
              Manage your team, view fixtures, standings and respond to
              availability.
            </p>
            <span className="nc-card-arrow">ENTER →</span>
          </a>

          <a
            href="/account/signin?callbackUrl=/referee"
            className="nc-card card-purple"
          >
            <div className="nc-card-corner-tl" />
            <div className="nc-card-corner-br" />
            <span className="nc-card-badge">REF MODE</span>
            <div className="nc-card-icon">
              <Timer size={28} color="#A42DB4" />
            </div>
            <h3 className="nc-card-title">Referee</h3>
            <p className="nc-card-desc">
              View today's assigned matches and manage match events.
            </p>
            <span className="nc-card-arrow">ENTER →</span>
          </a>
        </div>

        <a href="/public" className="nc-footer-link">
          ⟶ View Public Standings & Fixtures
        </a>
      </div>
    </>
  );
}
