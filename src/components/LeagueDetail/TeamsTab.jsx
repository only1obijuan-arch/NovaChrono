export function TeamsTab({ teams, onManageTeam, onAddTeam }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <p style={{ fontFamily: "'Orbitron',monospace", fontSize: 16, color: "#F4F4F9", letterSpacing: 2 }}>
          // TEAM MANAGEMENT
        </p>
        <button className="ld-add-team-btn" onClick={onAddTeam}>+ ADD TEAM</button>
      </div>
      <div className="ld-table-wrap">
        <table className="ld-table">
          <thead>
            <tr>
              <th>SLOT</th>
              <th>TEAM NAME</th>
              <th>CAPTAIN</th>
              <th>REGISTERED</th>
              <th style={{ textAlign: "right" }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {teams.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: "center", padding: "40px", color: "rgba(180,200,220,0.3)", fontFamily: "'Share Tech Mono',monospace", fontSize: 11, letterSpacing: 2 }}>
                  NO TEAMS REGISTERED
                </td>
              </tr>
            ) : (
              teams.map((team, idx) => (
                <tr key={team.id}>
                  <td><span className="ld-table-slot">#{idx + 1}</span></td>
                  <td><span className="ld-table-name">{team.name}</span></td>
                  <td>{team.captain_name || "—"}</td>
                  <td>{new Date(team.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="ld-manage-btn" onClick={() => onManageTeam(team)}>MANAGE</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
