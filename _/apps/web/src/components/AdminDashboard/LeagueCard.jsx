import {
  Calendar,
  MapPin,
  Users as UsersIcon,
  ChevronRight,
} from "lucide-react";

export function LeagueCard({ league, index }) {
  const getStatusClass = (status) => {
    if (status === "registration") return "ad-status-registration";
    if (status === "active") return "ad-status-active";
    return "ad-status-completed";
  };

  return (
    <a
      href={`/admin/league/${league.id}`}
      className="ad-league-card"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <span className={`ad-status-badge ${getStatusClass(league.status)}`}>
        {league.status?.toUpperCase()}
      </span>
      <h3 className="ad-league-name">{league.name}</h3>
      <p className="ad-league-day">
        {league.day_of_week?.toUpperCase()} LEAGUE
      </p>
      <div className="ad-league-meta">
        <span className="ad-league-meta-item">
          <Calendar size={14} color="rgba(255,0,204,0.5)" />{" "}
          {new Date(league.season_start_date).toLocaleDateString()}
        </span>
        <span className="ad-league-meta-item">
          <MapPin size={14} color="rgba(255,0,204,0.5)" /> {league.fields_count}{" "}
          Fields
        </span>
        <span className="ad-league-meta-item">
          <UsersIcon size={14} color="rgba(255,0,204,0.5)" /> Max{" "}
          {league.max_teams} Teams
        </span>
      </div>
      <div className="ad-league-footer">
        <div>
          <p className="ad-join-code-label">JOIN CODE</p>
          <p className="ad-join-code">{league.join_code}</p>
        </div>
        <div className="ad-arrow-btn">
          <ChevronRight size={18} color="#FF00CC" />
        </div>
      </div>
    </a>
  );
}
