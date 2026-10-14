export function matchBelongsToTeam(match, teamId) {
  return match.home_team_id === teamId || match.away_team_id === teamId;
}

export function isHomeTeam(match, teamId) {
  return match.home_team_id === teamId;
}

export function findTeamStanding(standings, teamId) {
  return standings.find((standing) => standing.team_id === teamId);
}

export function findTeamPosition(standings, teamId) {
  const index = standings.findIndex((standing) => standing.team_id === teamId);
  return index === -1 ? 0 : index + 1;
}

export function scorerBelongsToTeam(scorer, teamId) {
  return scorer.team_id === teamId;
}

export function standingRowKey(standing) {
  return standing.team_id;
}
