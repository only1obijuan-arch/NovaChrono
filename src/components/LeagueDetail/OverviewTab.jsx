import { QrCode, CheckCircle, Copy } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

export function OverviewTab({ league, teams, matches }) {
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopySignupLink = () => {
    const link = `${window.location.origin}/captain/join?code=${league.join_code}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const rounds = [...new Set(matches.map((m) => m.round_number))];

  const { data: refereesData } = useQuery({
    queryKey: ["league-overview-referees", league?.venue_id],
    queryFn: async () => {
      if (!league?.venue_id) return { referees: [] };
      const res = await fetch(`/api/admin/referees?venueId=${league.venue_id}`);
      if (!res.ok) return { referees: [] };
      return res.json();
    },
    enabled: !!league?.venue_id,
  });
  const referees = refereesData?.referees || [];
  const firstRoundMatches = matches.filter((m) => m.round_number === 1);
  const checklist = [
    { key: 'league', label: 'League created', done: !!league?.id, cta: null },
    { key: 'slots', label: 'Time slots configured', done: !!league?.time_slots?.length, cta: 'Configure in League Rules' },
    { key: 'teams', label: 'Minimum teams registered', done: teams.length >= 2, cta: 'Invite captains with join link' },
    { key: 'refs', label: 'Referees available', done: referees.length > 0, cta: 'Add referees in Admin Dashboard' },
    { key: 'fixtures', label: 'Fixtures generated', done: matches.length > 0, cta: 'Use Generate Fixtures' },
    { key: 'round1', label: 'First round scheduled', done: firstRoundMatches.length > 0, cta: 'Generate fixtures to schedule round 1' },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="ld-card">
          <p className="ld-card-title">QUICK STATS</p>
          <div className="ld-stats-grid">
            <div className="ld-stat">
              <p className="ld-stat-label">REGISTERED TEAMS</p>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center" }}>
                <span className="ld-stat-value">{teams.length}</span>
                <span className="ld-stat-sub">/ {league.max_teams}</span>
              </div>
            </div>
            <div className="ld-stat">
              <p className="ld-stat-label">TOTAL ROUNDS</p>
              <span className="ld-stat-value">{rounds.length}</span>
            </div>
            <div className="ld-stat">
              <p className="ld-stat-label">COMPLETED</p>
              <span className="ld-stat-value">{matches.filter((m) => m.status === "final").length}</span>
            </div>
          </div>
        </div>

        <div className="ld-card">
          <p className="ld-card-title">SETUP CHECKLIST</p>
          <div className="ld-rules">
            {checklist.map((item) => (
              <div key={item.key} className="ld-rule">
                <span className="ld-rule-label">{item.done ? "✓" : "○"} {item.label}</span>
                <span className="ld-rule-value" style={{ fontSize: 11, color: item.done ? "#00FF9C" : "rgba(255,200,0,0.8)" }}>{item.done ? "READY" : item.cta}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ld-card">
          <p className="ld-card-title">JOIN DETAILS</p>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <div style={{ background: "rgba(255,0,204,0.05)", border: "1px solid rgba(255,0,204,0.2)", borderRadius: 8, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <QrCode size={80} color="rgba(255,0,204,0.6)" />
              <p style={{ fontFamily: "var(--font-code)", fontSize: 9, color: "rgba(255,0,204,0.4)", letterSpacing: 2, marginTop: 8 }}>SCAN TO JOIN</p>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "var(--font-ui)", color: "rgba(180,200,220,0.6)", marginBottom: 16, lineHeight: 1.6 }}>
                Share this code with team captains to let them register for this league.
              </p>
              <div className="ld-join-code-box">
                <p className="ld-join-code-label">LEAGUE JOIN CODE</p>
                <p className="ld-join-code">{league.join_code}</p>
                <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                  <button
                    onClick={handleCopySignupLink}
                    className="ld-btn"
                    style={{
                      width: "100%",
                      justifyContent: "center",
                      background: copiedLink ? "rgba(0,255,156,0.15)" : "rgba(255,0,204,0.08)",
                      border: `1px solid ${copiedLink ? "rgba(0,255,156,0.4)" : "rgba(255,0,204,0.3)"}`,
                      color: copiedLink ? "#00FF9C" : "#FF00CC",
                    }}
                  >
                    {copiedLink ? <CheckCircle size={14} /> : <Copy size={14} />}
                    {copiedLink ? "LINK COPIED!" : "COPY CAPTAIN SIGNUP LINK"}
                  </button>
                  <p style={{ fontFamily: "var(--font-code)", fontSize: 9, color: "rgba(180,200,220,0.25)", letterSpacing: 2, textAlign: "center", margin: 0 }}>
                    SHARE WITH CAPTAINS — JOIN CODE IS PRE-FILLED
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ld-card" style={{ alignSelf: "start" }}>
        <p className="ld-card-title">RULES & FORMAT</p>
        <div className="ld-rules">
          {[
            ["MATCH FORMAT", league.match_format],
            ["DURATION", `${league.match_duration_minutes} MINS`],
            ["FIELDS", league.fields_count],
            ["WIN POINTS", league.win_points],
            ["DRAW POINTS", league.draw_points],
            ["FORFEIT SCORE", `${league.forfeit_score_home}-${league.forfeit_score_away}`],
          ].map(([label, value]) => (
            <div key={label} className="ld-rule">
              <span className="ld-rule-label">{label}</span>
              <span className="ld-rule-value">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
