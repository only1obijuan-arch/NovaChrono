import {
  ChevronLeft,
  Users,
  Calendar,
  Trophy,
  BarChart3,
  Play,
  StopCircle,
  CheckCircle,
  Copy,
} from "lucide-react";

export function LeagueHeader({
  league,
  activeTab,
  setActiveTab,
  onGenerateFixtures,
  onCompleteSeason,
  onNewSeason,
  onCancelLeague,
  generateFixturesPending,
  teamsCount,
}) {
  return (
    <div className="ld-header">
      <div className="ld-header-inner">
        <a href="/admin" className="ld-back">
          <ChevronLeft size={14} /> BACK TO LEAGUES
        </a>
        <div className="ld-header-top">
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <h1 className="ld-league-name">{league.name}</h1>
              <span className={`ld-status-badge ld-status-${league.status}`}>
                {league.status?.toUpperCase()}
              </span>
            </div>
            <p className="ld-league-sub">
              {league.day_of_week?.toUpperCase()} LEAGUE
              {league.season_name
                ? ` • ${league.season_name.toUpperCase()}`
                : ""}
            </p>
          </div>
          <div className="ld-header-actions">
            {league.status === "registration" && (
              <button
                className="ld-btn ld-btn-primary"
                onClick={onGenerateFixtures}
                disabled={generateFixturesPending || teamsCount < 2}
              >
                <Play size={14} /> CLOSE REG & GENERATE
              </button>
            )}
            {league.status === "active" && (
              <button
                className="ld-btn ld-btn-green"
                onClick={() => {
                  if (confirm("Mark season as complete?")) onCompleteSeason();
                }}
              >
                <CheckCircle size={14} /> COMPLETE SEASON
              </button>
            )}
            {league.status === "completed" && (
              <button className="ld-btn ld-btn-cyan" onClick={onNewSeason}>
                <Copy size={14} /> NEW SEASON
              </button>
            )}
            {(league.status === "registration" ||
              league.status === "active") && (
              <button
                className="ld-btn ld-btn-danger"
                onClick={() => {
                  if (confirm("Cancel this league? Cannot be undone."))
                    onCancelLeague();
                }}
              >
                <StopCircle size={14} /> CANCEL
              </button>
            )}
          </div>
        </div>

        <div className="ld-tabs">
          {[
            {
              key: "overview",
              label: "OVERVIEW",
              icon: <BarChart3 size={14} />,
            },
            { key: "teams", label: "TEAMS", icon: <Users size={14} /> },
            {
              key: "fixtures",
              label: "FIXTURES",
              icon: <Calendar size={14} />,
            },
            {
              key: "standings",
              label: "STANDINGS",
              icon: <Trophy size={14} />,
            },
          ].map((tab) => (
            <button
              key={tab.key}
              className={`ld-tab${activeTab === tab.key ? " active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
