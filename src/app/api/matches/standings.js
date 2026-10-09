/**
 * Rebuild a league table from final matches. Current active teams are resolved
 * through their slots, matching the existing product model. Replacement and
 * withdrawal history remain a Gate 4 concern.
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
    UPDATE standings
    SET played = 0,
        won = 0,
        drawn = 0,
        lost = 0,
        goals_for = 0,
        goals_against = 0,
        goal_difference = 0,
        points = 0
    WHERE league_id = ${leagueId}
  `;

  await txSql`
    WITH active_teams AS (
      SELECT id, slot_id
      FROM teams
      WHERE league_id = ${leagueId}
        AND status = 'active'
    ),
    contributions AS (
      SELECT
        home.id AS team_id,
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
      JOIN active_teams home ON home.slot_id = m.home_slot_id
      JOIN active_teams away ON away.slot_id = m.away_slot_id
      WHERE m.league_id = ${leagueId} AND m.status = 'final'

      UNION ALL

      SELECT
        away.id AS team_id,
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
      JOIN active_teams home ON home.slot_id = m.home_slot_id
      JOIN active_teams away ON away.slot_id = m.away_slot_id
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
    FROM active_teams team
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
