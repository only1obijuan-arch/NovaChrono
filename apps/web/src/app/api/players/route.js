import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

async function getSession() {
  const session = await auth();
  return session?.user ?? null;
}

export async function GET(request) {
  // GET is public — player lists visible on match pages etc.
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");
  if (!teamId)
    return Response.json({ error: "teamId is required" }, { status: 400 });
  const players =
    await sql`SELECT * FROM players WHERE team_id = ${teamId} ORDER BY name ASC`;
  return Response.json(players);
}

export async function POST(request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { teamId, name, playerNumber } = await request.json();

    if (!teamId || !name) {
      return Response.json(
        { error: "teamId and name are required" },
        { status: 400 },
      );
    }

    // Only the team's captain or an admin can add players
    const [team] = await sql`SELECT * FROM teams WHERE id = ${teamId}`;
    if (!team)
      return Response.json({ error: "Team not found" }, { status: 404 });

    const isOwnTeam = team.captain_user_id?.toString() === user.id?.toString();
    const isAdmin = ["venue_admin", "super_admin"].includes(user.role);

    if (!isOwnTeam && !isAdmin) {
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
    return Response.json({ error: error.message }, { status: 500 });
  }
}
