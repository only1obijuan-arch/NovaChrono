import { Trophy, Plus } from "lucide-react";
import { LeagueCard } from "./LeagueCard";

export function LeaguesSection({ leagues, isLoading }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <div className="ad-section-title">
        // LEAGUES <div className="ad-section-line" />
      </div>
      {isLoading ? (
        <div className="ad-leagues">
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ height: 220, background: "rgba(11,20,40,0.8)", borderRadius: 8, border: "1px solid rgba(255,0,204,0.1)" }} />
          ))}
        </div>
      ) : leagues.length === 0 ? (
        <div className="ad-empty">
          <Trophy size={48} color="rgba(255,0,204,0.2)" style={{ margin: "0 auto 16px" }} />
          <h3 className="ad-empty-title">NO LEAGUES YET</h3>
          <p className="ad-empty-sub">Start by creating your first league</p>
          <a href="/admin/create-league" className="ad-create-btn" style={{ display: "inline-flex", margin: "0 auto" }}>
            <Plus size={16} /> CREATE LEAGUE
          </a>
        </div>
      ) : (
        <div className="ad-leagues">
          {leagues.map((league, i) => (
            <LeagueCard key={league.id} league={league} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
