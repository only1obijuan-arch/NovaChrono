import { QrCode, CheckCircle, Copy } from "lucide-react";
import { useState } from "react";

export function OverviewTab({ league, teams, matches }) {
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopySignupLink = () => {
    const link = `${window.location.origin}/captain/join?code=${league.join_code}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const rounds = [...new Set(matches.map((m) => m.round_number))];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 340px",
        gap: 20,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="ld-card">
          <p className="ld-card-title">// QUICK STATS</p>
          <div className="ld-stats-grid">
            <div className="ld-stat">
              <p className="ld-stat-label">REGISTERED TEAMS</p>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "center",
                }}
              >
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
              <span className="ld-stat-value">
                {matches.filter((m) => m.status === "final").length}
              </span>
            </div>
          </div>
        </div>

        <div className="ld-card">
          <p className="ld-card-title">// JOIN DETAILS</p>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <div
              style={{
                background: "rgba(255,0,204,0.05)",
                border: "1px solid rgba(255,0,204,0.2)",
                borderRadius: 8,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <QrCode size={80} color="rgba(255,0,204,0.6)" />
              <p
                style={{
                  fontFamily: "'Share Tech Mono',monospace",
                  fontSize: 9,
                  color: "rgba(255,0,204,0.4)",
                  letterSpacing: 2,
                  marginTop: 8,
                }}
              >
                SCAN TO JOIN
              </p>
            </div>
            <div style={{ flex: 1 }}>
              <p
                style={{
                  fontFamily: "'Rajdhani',sans-serif",
                  color: "rgba(180,200,220,0.6)",
                  marginBottom: 16,
                  lineHeight: 1.6,
                }}
              >
                Share this code with team captains to let them register for this
                league.
              </p>
              <div className="ld-join-code-box">
                <p className="ld-join-code-label">LEAGUE JOIN CODE</p>
                <p className="ld-join-code">{league.join_code}</p>
                <div
                  style={{
                    marginTop: 20,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <button
                    onClick={handleCopySignupLink}
                    className="ld-btn"
                    style={{
                      width: "100%",
                      justifyContent: "center",
                      background: copiedLink
                        ? "rgba(0,255,156,0.15)"
                        : "rgba(255,0,204,0.08)",
                      border: `1px solid ${copiedLink ? "rgba(0,255,156,0.4)" : "rgba(255,0,204,0.3)"}`,
                      color: copiedLink ? "#00FF9C" : "#FF00CC",
                    }}
                  >
                    {copiedLink ? (
                      <CheckCircle size={14} />
                    ) : (
                      <Copy size={14} />
                    )}
                    {copiedLink ? "LINK COPIED!" : "COPY CAPTAIN SIGNUP LINK"}
                  </button>
                  <p
                    style={{
                      fontFamily: "'Share Tech Mono',monospace",
                      fontSize: 9,
                      color: "rgba(180,200,220,0.25)",
                      letterSpacing: 2,
                      textAlign: "center",
                      margin: 0,
                    }}
                  >
                    // SHARE WITH CAPTAINS — JOIN CODE IS PRE-FILLED
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ld-card" style={{ alignSelf: "start" }}>
        <p className="ld-card-title">// RULES & FORMAT</p>
        <div className="ld-rules">
          {[
            ["MATCH FORMAT", league.match_format],
            ["DURATION", `${league.match_duration_minutes} MINS`],
            ["FIELDS", league.fields_count],
            ["WIN POINTS", league.points_win],
            ["DRAW POINTS", league.points_draw],
            [
              "FORFEIT SCORE",
              `${league.forfeit_score_home}-${league.forfeit_score_away}`,
            ],
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
