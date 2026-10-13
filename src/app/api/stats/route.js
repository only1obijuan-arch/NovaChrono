import sql from "@/app/api/utils/sql";
import { rateLimit } from "@/app/api/utils/rate-limit";

export async function GET(request) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { allowed } = await rateLimit(`public:${ip}`, { max: 60, windowMinutes: 1 });
  if (!allowed) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

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
    const formRows = await sql`
      SELECT m.id, m.home_team_id, m.away_team_id, m.home_score, m.away_score
      FROM matches m
      WHERE m.league_id = ${leagueId} AND m.status = 'final'
      ORDER BY m.match_date DESC, m.time_slot DESC
      LIMIT 80
    `;
    const formMap = new Map();
    for (const row of formRows) {
      const apply = (teamId, gf, ga) => {
        if (!teamId) return;
        const arr = formMap.get(String(teamId)) || [];
        if (arr.length >= 5) return;
        arr.push(gf > ga ? 'W' : gf === ga ? 'D' : 'L');
        formMap.set(String(teamId), arr);
      };
      apply(row.home_team_id, row.home_score, row.away_score);
      apply(row.away_team_id, row.away_score, row.home_score);
    }
    standings = standings.map((s) => ({ ...s, form_last5: formMap.get(String(s.team_id)) || [], movement: null }));
  } catch (error) {
    console.error('Form guide query error:', error);
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
