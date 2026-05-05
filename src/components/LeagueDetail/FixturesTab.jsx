import { Calendar } from "lucide-react";

export function FixturesTab({ matches, referees = [], onAssignReferee }) {
  const rounds = [...new Set(matches.map((m) => m.round_number))];

  if (matches.length === 0) {
    return (
      <div className="ld-empty">
        <Calendar size={40} color="rgba(255,0,204,0.2)" style={{ margin: "0 auto 16px" }} />
        <h3 className="ld-empty-title">NO FIXTURES GENERATED</h3>
        <p className="ld-empty-sub">Close registration to generate the season schedule</p>
      </div>
    );
  }

  return (
    <div>
      {rounds.map((roundNum) => (
        <div key={roundNum}>
          <div className="ld-round-title">
            ROUND {roundNum}
            <div className="ld-round-line" />
          </div>
          <div className="ld-match-grid">
            {matches
              .filter((m) => m.round_number === roundNum)
              .map((match) => (
                <div key={match.id} className={`ld-match${match.status === "live" ? " is-live" : ""}`}>
                  <div className="ld-match-top">
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="ld-match-field">FIELD {match.field_number}</span>
                      <span className="ld-match-time">{match.time_slot}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span className={`ld-match-status ${match.status}`}>{match.status?.toUpperCase()}</span>{!match.referee_id && <span className="ld-ref-badge">UNASSIGNED</span>}</div>
                  </div>
                  <div className="ld-match-teams">
                    <p className="ld-match-team home">{match.home_team_name || "TBD"}</p>
                    <div className="ld-match-score">
                      <span className="ld-score">{match.home_score}</span>
                      <span className="ld-score-sep">—</span>
                      <span className="ld-score">{match.away_score}</span>
                    </div>
                    <p className="ld-match-team">{match.away_team_name || "TBD"}</p>
                  </div>
                  <p className="ld-match-date">{new Date(match.match_date).toLocaleDateString()}</p>
                  <div style={{ marginTop: 10 }}>
                    <select
                      className="ld-ref-select"
                      value={match.referee_id || ""}
                      onChange={(e) => onAssignReferee?.(match.id, e.target.value || null)}
                    >
                      <option value="">Assign referee...</option>
                      {referees.map((r) => (
                        <option key={r.id} value={r.id}>{r.name} (Field {r.field_number ?? "-"})</option>
                      ))}
                    </select>
                  </div>

                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
