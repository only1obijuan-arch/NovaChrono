import sql from "@/app/api/utils/sql";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get("leagueId");
  if (!leagueId)
    return Response.json({ error: "leagueId is required" }, { status: 400 });

  let standings = [];
  let topScorers = [];

  try {
    standings = await sql`
      SELECT s.*, t.name as team_name, t.slot_id
      FROM standings s
      JOIN teams t ON t.id = s.team_id
      WHERE s.league_id = ${leagueId}
      ORDER BY s.points DESC, s.goal_difference DESC, s.goals_for DESC, t.name ASC
    `;
  } catch (error) {
    console.error("Standings query error:", error);
  }

  try {
    topScorers = await sql`
      SELECT
        p.name AS player_name,
        COUNT(*) AS goals,
        t.slot_id AS team_slot_id,
        m.league_id
      FROM match_events me
      JOIN players p ON me.player_id = p.id
      JOIN teams t ON p.team_id = t.id
      JOIN matches m ON me.match_id = m.id
      WHERE me.type IN ('goal_home', 'goal_away')
        AND me.player_id IS NOT NULL
        AND m.league_id = ${leagueId}
      GROUP BY p.id, p.name, t.slot_id, m.league_id
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `;
  } catch (error) {
    console.error("Top scorers query error:", error);
  }

  return Response.json({ standings, topScorers });
}
