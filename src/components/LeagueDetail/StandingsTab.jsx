export function StandingsTab({ stats }) {
  const standings = stats?.standings ?? [];

  if (standings.length === 0) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center", fontFamily: "var(--font-code)", fontSize: 11, color: "rgba(180,200,220,0.3)", letterSpacing: 3 }}>
        NO STANDINGS YET — FIXTURES MUST BE GENERATED FIRST
      </div>
    );
  }

  return (
    <div className="ld-standings-wrap">
      <table className="ld-standings-table">
        <thead>
          <tr>
            <th>POS</th><th>TEAM</th><th>P</th><th>W</th><th>D</th><th>L</th>
             <th>GF</th><th>GA</th><th>GD</th><th>FORM</th><th>MOV</th><th>PTS</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((team, idx) => (
            <tr key={team.team_id} className={idx < 3 ? "top3" : ""}>
              <td>
                <span className={`ld-pos${idx === 0 ? " gold" : idx === 1 ? " silver" : idx === 2 ? " bronze" : ""}`}>
                  {idx + 1}
                </span>
              </td>
              <td><span className="ld-team-name-cell">{team.team_name || `Slot ${idx + 1}`}</span></td>
              <td>{team.played}</td>
              <td><span className="ld-win">{team.won}</span></td>
              <td><span className="ld-draw">{team.drawn}</span></td>
              <td><span className="ld-loss">{team.lost}</span></td>
              <td>{team.goals_for}</td>
              <td>{team.goals_against}</td>
              <td style={{ fontWeight: 700, color: team.goal_difference > 0 ? "#00FF9C" : team.goal_difference < 0 ? "rgba(255,0,204,0.7)" : "rgba(180,200,220,0.6)" }}>
                {team.goal_difference > 0 ? `+${team.goal_difference}` : team.goal_difference}
              </td>
              <td style={{ fontFamily:"var(--font-code)", fontSize:10 }}>{(team.form_last5 || []).join(" ") || "-"}</td><td style={{ color:"rgba(180,200,220,0.5)" }}>{team.movement == null ? "—" : team.movement}</td><td><span className="ld-pts">{team.points}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
