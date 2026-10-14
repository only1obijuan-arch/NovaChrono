/**
 * Rebuild a league table from immutable match participant identities. Active
 * teams remain visible at zero; withdrawn teams remain only when final history
 * references them.
 */
export async function recomputeLeagueStandings(txSql, leagueId) {
  const [league] = await txSql`
    SELECT id, win_points, draw_points
    FROM leagues
    WHERE id = ${leagueId}
    FOR UPDATE
  `;
  if (!league) throw new Error("League not found while recomputing standings");

  await txSql`
    DELETE FROM standings s
    WHERE s.league_id = ${leagueId}
      AND NOT EXISTS (
        SELECT 1 FROM teams t
        WHERE t.id = s.team_id AND t.league_id = ${leagueId} AND t.status = 'active'
      )
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE m.league_id = ${leagueId} AND m.status = 'final'
          AND (m.home_team_id = s.team_id OR m.away_team_id = s.team_id)
      )
  `;

  await txSql`
    WITH eligible_teams AS (
      SELECT id FROM teams WHERE league_id = ${leagueId} AND status = 'active'
      UNION
      SELECT m.home_team_id FROM matches m WHERE m.league_id = ${leagueId} AND m.status = 'final'
      UNION
      SELECT m.away_team_id FROM matches m WHERE m.league_id = ${leagueId} AND m.status = 'final'
    ),
    contributions AS (
      SELECT
        m.home_team_id AS team_id,
        1 AS played,
        CASE WHEN m.home_score > m.away_score THEN 1 ELSE 0 END AS won,
        CASE WHEN m.home_score = m.away_score THEN 1 ELSE 0 END AS drawn,
        CASE WHEN m.home_score < m.away_score THEN 1 ELSE 0 END AS lost,
        m.home_score AS goals_for,
        m.away_score AS goals_against,
        m.home_score - m.away_score AS goal_difference,
        CASE
          WHEN m.home_score > m.away_score THEN ${league.win_points}
          WHEN m.home_score = m.away_score THEN ${league.draw_points}
          ELSE 0
        END AS points
      FROM matches m
      WHERE m.league_id = ${leagueId} AND m.status = 'final'

      UNION ALL

      SELECT
        m.away_team_id AS team_id,
        1 AS played,
        CASE WHEN m.away_score > m.home_score THEN 1 ELSE 0 END AS won,
        CASE WHEN m.away_score = m.home_score THEN 1 ELSE 0 END AS drawn,
        CASE WHEN m.away_score < m.home_score THEN 1 ELSE 0 END AS lost,
        m.away_score AS goals_for,
        m.home_score AS goals_against,
        m.away_score - m.home_score AS goal_difference,
        CASE
          WHEN m.away_score > m.home_score THEN ${league.win_points}
          WHEN m.away_score = m.home_score THEN ${league.draw_points}
          ELSE 0
        END AS points
      FROM matches m
      WHERE m.league_id = ${leagueId} AND m.status = 'final'
    ),
    totals AS (
      SELECT
        team_id,
        sum(played)::int AS played,
        sum(won)::int AS won,
        sum(drawn)::int AS drawn,
        sum(lost)::int AS lost,
        sum(goals_for)::int AS goals_for,
        sum(goals_against)::int AS goals_against,
        sum(goal_difference)::int AS goal_difference,
        sum(points)::int AS points
      FROM contributions
      GROUP BY team_id
    )
    INSERT INTO standings (
      league_id, team_id, played, won, drawn, lost,
      goals_for, goals_against, goal_difference, points
    )
    SELECT
      ${leagueId},
      team.id,
      COALESCE(totals.played, 0),
      COALESCE(totals.won, 0),
      COALESCE(totals.drawn, 0),
      COALESCE(totals.lost, 0),
      COALESCE(totals.goals_for, 0),
      COALESCE(totals.goals_against, 0),
      COALESCE(totals.goal_difference, 0),
      COALESCE(totals.points, 0)
    FROM eligible_teams team
    LEFT JOIN totals ON totals.team_id = team.id
    ON CONFLICT (league_id, team_id) DO UPDATE SET
      played = EXCLUDED.played,
      won = EXCLUDED.won,
      drawn = EXCLUDED.drawn,
      lost = EXCLUDED.lost,
      goals_for = EXCLUDED.goals_for,
      goals_against = EXCLUDED.goals_against,
      goal_difference = EXCLUDED.goal_difference,
      points = EXCLUDED.points
  `;
}
