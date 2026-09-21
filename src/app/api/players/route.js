import sql from "@/app/api/utils/sql";
import { requireRole } from "@/app/api/utils/auth";
import { canManageTeam, UUID_RE } from "@/app/api/utils/ownership";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");
  if (!teamId)
    return Response.json({ error: "teamId is required" }, { status: 400 });
   const players = await sql`
    SELECT p.*, COALESCE(g.goals, 0)::int AS season_goals
    FROM players p
    LEFT JOIN (
      SELECT me.player_id, COUNT(*) AS goals
      FROM match_events me
      WHERE me.type IN ('goal_home','goal_away') AND me.player_id IS NOT NULL
      GROUP BY me.player_id
    ) g ON g.player_id = p.id
    WHERE p.team_id = ${teamId}
    ORDER BY p.name ASC
  `;
  return Response.json(players);
}

export async function POST(request) {
  try {
    const user = await requireRole(request, "captain", "venue_admin", "super_admin");
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { teamId, name, playerNumber } = await request.json();

    if (!UUID_RE.test(teamId) || !name) {
      return Response.json(
        { error: "teamId and name are required" },
        { status: 400 },
      );
    }

    const [team] = await sql`SELECT t.*, l.venue_id FROM teams t JOIN leagues l ON t.league_id = l.id WHERE t.id = ${teamId}`;
    if (!team)
      return Response.json({ error: "Team not found" }, { status: 404 });

    if (!canManageTeam(user, team)) {
      return Response.json(
        { error: "You can only add players to your own team" },
        { status: 403 },
      );
    }

    const [player] = await sql`
      INSERT INTO players (team_id, name, player_number)
      VALUES (${teamId}, ${name}, ${playerNumber || null})
      RETURNING *
    `;
    return Response.json(player);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const user = await requireRole(request, "captain", "venue_admin", "super_admin");
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get("playerId");
    if (!UUID_RE.test(playerId))
      return Response.json({ error: "playerId is required" }, { status: 400 });

    const [player] = await sql`SELECT * FROM players WHERE id = ${playerId}`;
    if (!player)
      return Response.json({ error: "Player not found" }, { status: 404 });

    const [team] = await sql`SELECT t.*, l.venue_id FROM teams t JOIN leagues l ON t.league_id = l.id WHERE t.id = ${player.team_id}`;
    if (!team) return Response.json({ error: "Team not found" }, { status: 404 });
    if (!canManageTeam(user, team))
      return Response.json({ error: "You can only remove players from your own team" }, { status: 403 });

    await sql`DELETE FROM players WHERE id = ${playerId}`;
    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
