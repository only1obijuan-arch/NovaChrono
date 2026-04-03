import sql from "@/app/api/utils/sql";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get("leagueId");
  if (!leagueId)
    return Response.json({ error: "leagueId is required" }, { status: 400 });

  try {
    const standings = await sql`
      SELECT s.*, t.name as team_name, t.slot_id
      FROM standings s
      JOIN teams t ON t.id = s.team_id
      WHERE s.league_id = ${leagueId}
      ORDER BY s.points DESC, s.goal_difference DESC, s.goals_for DESC, t.name ASC
    `;
    const topScorers = await sql`
      SELECT * FROM top_scorers
      WHERE league_id = ${leagueId}
      ORDER BY goals DESC
      LIMIT 10
    `;
    return Response.json({ standings: standings ?? [], topScorers: topScorers ?? [] });
  } catch (error) {
    console.error("Stats error:", error);
    return Response.json({ standings: [], topScorers: [] });
  }
}
