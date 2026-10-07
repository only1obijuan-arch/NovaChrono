"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Shield, Zap, Users, BarChart3, Calendar, Bell } from "lucide-react";

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const heroRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <style>{`

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --cyan: #00F5D4;
          --cyan-dim: rgba(0,245,212,0.15);
          --cyan-glow: rgba(0,245,212,0.06);
          --pink: #FF00CC;
          --pink-dim: rgba(255,0,204,0.15);
          --gold: #FFD700;
          --bg: #060e1e;
          --bg2: #0a1628;
          --bg3: #0d1b30;
          --text: #F4F4F9;
          --muted: rgba(180,200,220,0.55);
          --border: rgba(0,245,212,0.12);
        }

        html { scroll-behavior: smooth; }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: 'Rajdhani', sans-serif;
          overflow-x: hidden;
        }

        /* ── NAV ── */
        .nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          padding: 18px 40px;
          display: flex; align-items: center; justify-content: space-between;
          transition: background 0.3s, border-bottom 0.3s;
        }
        .nav.scrolled {
          background: rgba(6,14,30,0.92);
          border-bottom: 1px solid var(--border);
          backdrop-filter: blur(12px);
        }
        .nav-logo {
          font-family: 'Orbitron', monospace;
          font-size: 18px; font-weight: 900;
          color: var(--cyan);
          letter-spacing: 6px;
          text-decoration: none;
        }
        .nav-cta {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 22px;
          background: transparent;
          border: 1px solid var(--cyan);
          border-radius: 2px;
          color: var(--cyan);
          font-family: 'Orbitron', monospace;
          font-size: 10px; font-weight: 700; letter-spacing: 3px;
          text-decoration: none;
          transition: all 0.2s;
        }
        .nav-cta:hover {
          background: var(--cyan-dim);
          box-shadow: 0 0 20px rgba(0,245,212,0.2);
        }

        /* ── HERO ── */
        .hero {
          min-height: 100vh;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center;
          padding: 120px 24px 80px;
          position: relative;
          overflow: hidden;
        }

        .hero-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(0,245,212,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,245,212,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none;
        }
        .hero-glow-l {
          position: absolute; top: -100px; left: -200px;
          width: 700px; height: 700px;
          background: radial-gradient(circle, rgba(0,245,212,0.07) 0%, transparent 65%);
          pointer-events: none;
        }
        .hero-glow-r {
          position: absolute; bottom: -100px; right: -200px;
          width: 700px; height: 700px;
          background: radial-gradient(circle, rgba(255,0,204,0.06) 0%, transparent 65%);
          pointer-events: none;
        }
        .hero-scanline {
          position: absolute; top: 0; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, transparent, rgba(0,245,212,0.4), transparent);
          animation: scanline 8s linear infinite;
          pointer-events: none;
        }
        @keyframes scanline {
          0% { transform: translateY(0); }
          100% { transform: translateY(100vh); }
        }

        .hero-eyebrow {
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px; color: rgba(0,245,212,0.5);
          letter-spacing: 5px; margin-bottom: 24px;
          position: relative;
          animation: fadeUp 0.8s ease both;
        }
        .hero-title {
          font-family: 'Orbitron', monospace;
          font-size: clamp(42px, 8vw, 96px);
          font-weight: 900;
          color: var(--text);
          letter-spacing: 4px;
          line-height: 1;
          margin-bottom: 8px;
          position: relative;
          animation: fadeUp 0.8s 0.1s ease both;
        }
        .hero-title span { color: var(--cyan); }
        .hero-sub-title {
          font-family: 'Share Tech Mono', monospace;
          font-size: clamp(11px, 2vw, 15px);
          color: rgba(0,245,212,0.35);
          letter-spacing: 6px;
          margin-bottom: 40px;
          position: relative;
          animation: fadeUp 0.8s 0.2s ease both;
        }
        .hero-desc {
          max-width: 560px;
          font-size: 18px; font-weight: 500;
          color: var(--muted); line-height: 1.7;
          margin-bottom: 48px;
          position: relative;
          animation: fadeUp 0.8s 0.3s ease both;
        }
        .hero-actions {
          display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;
          position: relative;
          animation: fadeUp 0.8s 0.4s ease both;
        }
        .btn-primary {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 16px 36px;
          background: var(--cyan);
          border: none; border-radius: 2px;
          color: #060e1e;
          font-family: 'Orbitron', monospace;
          font-size: 11px; font-weight: 900; letter-spacing: 3px;
          text-decoration: none; cursor: pointer;
          transition: all 0.2s;
        }
        .btn-primary:hover {
          background: #00dfc0;
          box-shadow: 0 0 30px rgba(0,245,212,0.35);
          transform: translateY(-2px);
        }
        .btn-secondary {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 16px 36px;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.15); border-radius: 2px;
          color: rgba(180,200,220,0.7);
          font-family: 'Orbitron', monospace;
          font-size: 11px; font-weight: 700; letter-spacing: 3px;
          text-decoration: none; cursor: pointer;
          transition: all 0.2s;
        }
        .btn-secondary:hover {
          border-color: rgba(255,255,255,0.35);
          color: var(--text);
        }

        .hero-stats {
          display: flex; gap: 48px; flex-wrap: wrap; justify-content: center;
          margin-top: 80px;
          position: relative;
          animation: fadeUp 0.8s 0.5s ease both;
        }
        .hero-stat { text-align: center; }
        .hero-stat-value {
          font-family: 'Orbitron', monospace;
          font-size: 32px; font-weight: 900;
          color: var(--cyan);
        }
        .hero-stat-label {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px; color: var(--muted);
          letter-spacing: 3px; margin-top: 4px;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ── SECTION ── */
        .section { padding: 100px 24px; position: relative; }
        .section-inner { max-width: 1100px; margin: 0 auto; }
        .section-label {
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px; color: rgba(0,245,212,0.5);
          letter-spacing: 5px; margin-bottom: 16px;
        }
        .section-title {
          font-family: 'Orbitron', monospace;
          font-size: clamp(24px, 4vw, 40px); font-weight: 900;
          color: var(--text); letter-spacing: 2px;
          margin-bottom: 16px;
        }
        .section-desc {
          font-size: 17px; color: var(--muted);
          line-height: 1.7; max-width: 500px;
          margin-bottom: 60px;
        }

        /* ── FEATURES ── */
        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }
        .feature-card {
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 32px;
          transition: all 0.25s;
          position: relative;
          overflow: hidden;
        }
        .feature-card::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 2px;
          background: var(--cyan);
          opacity: 0;
          transition: opacity 0.25s;
        }
        .feature-card:hover {
          border-color: rgba(0,245,212,0.3);
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.3);
        }
        .feature-card:hover::before { opacity: 1; }
        .feature-icon {
          width: 44px; height: 44px;
          background: var(--cyan-glow);
          border: 1px solid rgba(0,245,212,0.2);
          border-radius: 4px;
          display: flex; align-items: center; justify-content: center;
          color: var(--cyan);
          margin-bottom: 20px;
        }
        .feature-title {
          font-family: 'Orbitron', monospace;
          font-size: 13px; font-weight: 700;
          color: var(--text); letter-spacing: 2px;
          margin-bottom: 12px;
        }
        .feature-desc {
          font-size: 15px; color: var(--muted);
          line-height: 1.6;
        }

        /* ── ROLES ── */
        .roles-section { background: var(--bg2); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
        .roles-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 2px;
          margin-top: 60px;
          border: 1px solid var(--border);
          border-radius: 6px;
          overflow: hidden;
        }
        .role-card {
          background: var(--bg3);
          padding: 32px 24px;
          border-right: 1px solid var(--border);
          transition: background 0.2s;
        }
        .role-card:last-child { border-right: none; }
        .role-card:hover { background: rgba(0,245,212,0.04); }
        .role-tag {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px; letter-spacing: 3px;
          padding: 4px 10px; border-radius: 2px;
          margin-bottom: 16px; display: inline-block;
        }
        .role-tag.admin { background: rgba(0,245,212,0.1); color: var(--cyan); border: 1px solid rgba(0,245,212,0.25); }
        .role-tag.captain { background: rgba(255,215,0,0.08); color: var(--gold); border: 1px solid rgba(255,215,0,0.25); }
        .role-tag.referee { background: rgba(255,0,204,0.08); color: var(--pink); border: 1px solid rgba(255,0,204,0.25); }
        .role-tag.org { background: rgba(180,200,220,0.08); color: rgba(180,200,220,0.6); border: 1px solid rgba(180,200,220,0.2); }
        .role-name {
          font-family: 'Orbitron', monospace;
          font-size: 14px; font-weight: 700;
          color: var(--text); letter-spacing: 1px;
          margin-bottom: 10px;
        }
        .role-desc { font-size: 14px; color: var(--muted); line-height: 1.6; }

        /* ── HOW IT WORKS ── */
        .steps { display: flex; flex-direction: column; gap: 0; margin-top: 60px; }
        .step {
          display: grid; grid-template-columns: 60px 1fr;
          gap: 32px; align-items: flex-start;
          padding: 32px 0;
          border-bottom: 1px solid var(--border);
        }
        .step:last-child { border-bottom: none; }
        .step-num {
          font-family: 'Orbitron', monospace;
          font-size: 32px; font-weight: 900;
          color: rgba(0,245,212,0.2);
          line-height: 1;
        }
        .step-content {}
        .step-title {
          font-family: 'Orbitron', monospace;
          font-size: 14px; font-weight: 700;
          color: var(--text); letter-spacing: 2px;
          margin-bottom: 8px;
        }
        .step-desc { font-size: 15px; color: var(--muted); line-height: 1.6; }

        /* ── CTA ── */
        .cta-section {
          padding: 120px 24px;
          text-align: center;
          background: linear-gradient(180deg, var(--bg) 0%, var(--bg2) 50%, var(--bg) 100%);
          position: relative; overflow: hidden;
        }
        .cta-glow {
          position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
          width: 800px; height: 400px;
          background: radial-gradient(ellipse, rgba(0,245,212,0.06) 0%, transparent 70%);
          pointer-events: none;
        }
        .cta-title {
          font-family: 'Orbitron', monospace;
          font-size: clamp(28px, 5vw, 52px); font-weight: 900;
          color: var(--text); letter-spacing: 2px;
          margin-bottom: 16px; position: relative;
        }
        .cta-sub {
          font-size: 17px; color: var(--muted);
          max-width: 480px; margin: 0 auto 48px; line-height: 1.7;
          position: relative;
        }

        /* ── FOOTER ── */
        .footer {
          padding: 40px 24px;
          border-top: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 16px;
          max-width: 1100px; margin: 0 auto;
        }
        .footer-logo {
          font-family: 'Orbitron', monospace;
          font-size: 14px; font-weight: 900;
          color: var(--cyan); letter-spacing: 5px;
        }
        .footer-copy {
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px; color: rgba(180,200,220,0.25);
          letter-spacing: 2px;
        }

        @media (max-width: 640px) {
          .nav { padding: 16px 20px; }
          .hero-stats { gap: 32px; }
          .roles-grid { grid-template-columns: 1fr 1fr; }
          .step { grid-template-columns: 40px 1fr; gap: 16px; }
        }
      `}</style>

      {/* NAV */}
      <nav className={`nav${scrolled ? " scrolled" : ""}`}>
        <span className="nav-logo">NOVACHRONO</span>
        <a href="/account/signin" className="nav-cta">
          SIGN IN <ChevronRight size={12} />
        </a>
      </nav>

      {/* HERO */}
      <section className="hero" ref={heroRef}>
        <div className="hero-grid" />
        <div className="hero-glow-l" />
        <div className="hero-glow-r" />
        <div className="hero-scanline" />

        <p className="hero-eyebrow">INDOOR FOOTBALL MANAGEMENT PLATFORM</p>
        <h1 className="hero-title">NOVA<span>CHRONO</span></h1>
        <p className="hero-sub-title">PRECISION. SPEED. CONTROL.</p>
        <p className="hero-desc">
          The complete platform for running indoor football leagues — from fixture generation to live match tracking, weather alerts, and real-time standings.
        </p>
        <div className="hero-actions">
          <a href="/account/signin" className="btn-primary">
            ENTER PLATFORM <ChevronRight size={14} />
          </a>
          <a href="#features" className="btn-secondary">
            LEARN MORE
          </a>
        </div>

        <div className="hero-stats">
          <div className="hero-stat">
            <p className="hero-stat-value">6</p>
            <p className="hero-stat-label">ROLE LEVELS</p>
          </div>
          <div className="hero-stat">
            <p className="hero-stat-value">LIVE</p>
            <p className="hero-stat-label">MATCH TRACKING</p>
          </div>
          <div className="hero-stat">
            <p className="hero-stat-value">AUTO</p>
            <p className="hero-stat-label">STANDINGS UPDATE</p>
          </div>
          <div className="hero-stat">
            <p className="hero-stat-value">⚡</p>
            <p className="hero-stat-label">WEATHER ALERTS</p>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section" id="features">
        <div className="section-inner">
          <p className="section-label">WHAT IT DOES</p>
          <h2 className="section-title">EVERYTHING YOUR LEAGUE NEEDS</h2>
          <p className="section-desc">Built specifically for indoor football — every feature designed around the real demands of running a league.</p>

          <div className="features-grid">
            {[
              { icon: <Calendar size={20} />, title: "FIXTURE GENERATION", desc: "Auto-generate full round-robin fixtures in seconds. Reschedule rounds with one click and notify all captains automatically." },
              { icon: <Zap size={20} />, title: "LIVE MATCH CONTROL", desc: "Referees start matches, record goals, manage halftime, and end matches. Standings update the moment the final whistle blows." },
              { icon: <BarChart3 size={20} />, title: "REAL-TIME STANDINGS", desc: "Live league tables, top scorer charts, and match results — always accurate, always up to date." },
              { icon: <Bell size={20} />, title: "WEATHER ALERTS", desc: "Integrated weather monitoring with one-click lightning warnings and postponement alerts sent directly to every captain." },
              { icon: <Users size={20} />, title: "TEAM MANAGEMENT", desc: "Captains register teams, manage players, and confirm match availability. Full roster control in one place." },
              { icon: <Shield size={20} />, title: "ROLE-BASED ACCESS", desc: "Six distinct roles — super admin, org admin, venue admin, referee, captain, and player. Everyone sees exactly what they need." },
            ].map((f) => (
              <div key={f.title} className="feature-card">
                <div className="feature-icon">{f.icon}</div>
                <p className="feature-title">{f.title}</p>
                <p className="feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROLES */}
      <section className="section roles-section" id="roles">
        <div className="section-inner">
          <p className="section-label">WHO IT’S FOR</p>
          <h2 className="section-title">BUILT FOR EVERYONE IN THE LEAGUE</h2>
          <p className="section-desc">From the people running the venue to the captains on the pitch — every role has a dedicated portal.</p>

          <div className="roles-grid">
            {[
              { tag: "admin", label: "VENUE ADMIN", desc: "Create leagues, generate fixtures, manage referees, send weather alerts, and oversee all teams." },
              { tag: "captain", label: "CAPTAIN", desc: "Register your team, confirm availability, follow the live feed, and track standings in real time." },
              { tag: "referee", label: "REFEREE", desc: "Start matches, record goals, manage cards, and end games — all from a dedicated match console." },
              { tag: "org", label: "ORG ADMIN", desc: "Oversee multiple venues and administrators across your entire organisation from one dashboard." },
            ].map((r) => (
              <div key={r.label} className="role-card">
                <span className={`role-tag ${r.tag}`}>{r.tag.toUpperCase()}</span>
                <p className="role-name">{r.label}</p>
                <p className="role-desc">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" id="how">
        <div className="section-inner">
          <p className="section-label">HOW IT WORKS</p>
          <h2 className="section-title">FROM SETUP TO KICKOFF</h2>
          <p className="section-desc">Get a league up and running in minutes, not days.</p>

          <div className="steps">
            {[
              { title: "SET UP YOUR VENUE", desc: "A super admin creates your organisation and venue, assigns a venue admin, and configures location for weather monitoring." },
              { title: "CREATE YOUR LEAGUE", desc: "Define the format, schedule, points system, and field configuration. Generate all fixtures automatically." },
              { title: "CAPTAINS JOIN", desc: "Team captains register their teams, add players to the roster, and confirm availability as match day approaches." },
              { title: "REFEREES TAKE CONTROL", desc: "On match day, referees log in, start the match timer, record goals in real time, and close out the match." },
              { title: "STANDINGS UPDATE INSTANTLY", desc: "The moment a match ends, the league table updates. Captains see results live. No admin required." },
            ].map((s, i) => (
              <div key={s.title} className="step">
                <span className="step-num">0{i + 1}</span>
                <div className="step-content">
                  <p className="step-title">{s.title}</p>
                  <p className="step-desc">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="cta-glow" />
        <h2 className="cta-title">READY TO RUN YOUR LEAGUE?</h2>
        <p className="cta-sub">Sign in to your NovaChrono portal and take control of your league today.</p>
        <a href="/account/signin" className="btn-primary">
          SIGN IN TO PORTAL <ChevronRight size={14} />
        </a>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer">
          <span className="footer-logo">NOVACHRONO</span>
          <span className="footer-copy">© {new Date().getFullYear()} NOVACHRONO — INDOOR FOOTBALL MANAGEMENT</span>
        </div>
      </footer>
    </>
  );
}
