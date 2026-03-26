import sql from "@/app/api/utils/sql";

export async function GET(request) {
  // Stats are fully public — standings and scorers are visible to everyone
  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get("leagueId");
  if (!leagueId)
    return Response.json({ error: "leagueId is required" }, { status: 400 });

  const standings = await sql`
    SELECT * FROM standings 
    WHERE league_id = ${leagueId} 
    ORDER BY points DESC, goal_difference DESC, goals_for DESC
  `;
  const topScorers = await sql`
    SELECT * FROM top_scorers 
    WHERE league_id = ${leagueId} 
    ORDER BY goals DESC 
    LIMIT 10
  `;
  return Response.json({ standings, topScorers });
}