import { Crown, PartyPopper } from "lucide-react";

export function ChampionBanner({ champion }) {
  return (
    <div className="ld-champion">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24 }}>
        <Crown size={32} color="#FFD700" />
        <div>
          <p className="ld-champion-title">🏆 SEASON CHAMPIONS 🏆</p>
          <h2 className="ld-champion-name">{champion.team_name || "Unknown Team"}</h2>
          <p className="ld-champion-stats">
            {champion.points} PTS • {champion.wins} WINS • {champion.goal_difference} GD
          </p>
        </div>
        <PartyPopper size={32} color="#FFD700" />
      </div>
    </div>
  );
}
