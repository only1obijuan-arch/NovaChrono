import sql from "@/app/api/utils/sql";
import { requireRole } from "@/app/api/utils/auth";
import { canAdministerVenue, canManageTeam, UUID_RE } from "@/app/api/utils/ownership";

export async function POST(request) {
  try {
    const user = await requireRole(request, "captain", "venue_admin", "super_admin");
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { action, ...data } = await request.json();

    if (action === "JOIN_LEAGUE") {
      const { joinCode, teamName } = data;
      const captainUserId = user.id;
      const [league] =
        await sql`SELECT id FROM leagues WHERE join_code = ${joinCode}`;
      if (!league)
        return Response.json({ error: "Invalid join code" }, { status: 404 });
      const [availableSlot] = await sql`
        SELECT ls.id
        FROM league_slots ls
        LEFT JOIN teams t ON t.slot_id = ls.id AND t.status = 'active'
        WHERE ls.league_id = ${league.id} AND t.id IS NULL
        ORDER BY ls.slot_number
        LIMIT 1
      `;
      if (!availableSlot)
        return Response.json({ error: "League is full" }, { status: 400 });
      const [team] = await sql`
        INSERT INTO teams (league_id, slot_id, name, captain_user_id)
        VALUES (${league.id}, ${availableSlot.id}, ${teamName}, ${captainUserId})
        RETURNING *
      `;
      return Response.json(team);
    }

    if (action === "ADD_TEAM") {
      if (!["venue_admin", "super_admin"].includes(user.role)) {
        return Response.json(
          { error: "Admin access required" },
          { status: 403 },
        );
      }
      const { leagueId, teamName, captainUserId } = data;
      if (!UUID_RE.test(leagueId)) return Response.json({ error: "Invalid league ID" }, { status: 400 });
      const [league] = await sql`SELECT venue_id FROM leagues WHERE id = ${leagueId}`;
      if (!league) return Response.json({ error: "League not found" }, { status: 404 });
      if (!canAdministerVenue(user, league.venue_id)) return Response.json({ error: "Forbidden" }, { status: 403 });
      const [availableSlot] = await sql`
        SELECT ls.id
        FROM league_slots ls
        LEFT JOIN teams t ON t.slot_id = ls.id AND t.status = 'active'
        WHERE ls.league_id = ${leagueId} AND t.id IS NULL
        ORDER BY ls.slot_number
        LIMIT 1
      `;
      if (!availableSlot)
        return Response.json({ error: "League is full" }, { status: 400 });
      const [team] = await sql`
        INSERT INTO teams (league_id, slot_id, name, captain_user_id)
        VALUES (${leagueId}, ${availableSlot.id}, ${teamName}, ${
          captainUserId || null
        })
        RETURNING *
      `;
      return Response.json(team);
    }

    if (action === "UPDATE_TEAM") {
      const { teamId, teamName } = data;
      if (!UUID_RE.test(teamId)) return Response.json({ error: "Invalid team ID" }, { status: 400 });
      const [existingTeam] = await sql`
        SELECT t.*, l.venue_id FROM teams t JOIN leagues l ON t.league_id = l.id WHERE t.id = ${teamId}
      `;
      if (!existingTeam) return Response.json({ error: "Team not found" }, { status: 404 });
      if (!canManageTeam(user, existingTeam)) return Response.json({ error: "Forbidden" }, { status: 403 });
      const [team] = await sql`
        UPDATE teams SET name = ${teamName} WHERE id = ${teamId} RETURNING *
      `;
      return Response.json(team);
    }

    if (action === "DELETE_TEAM") {
      const { teamId } = data;
      if (!UUID_RE.test(teamId)) return Response.json({ error: "Invalid team ID" }, { status: 400 });
      const [team] = await sql`
        SELECT t.id, l.venue_id FROM teams t JOIN leagues l ON t.league_id = l.id WHERE t.id = ${teamId}
      `;
      if (!team) return Response.json({ error: "Team not found" }, { status: 404 });
      if (!canAdministerVenue(user, team.venue_id)) return Response.json({ error: "Forbidden" }, { status: 403 });
      await sql`UPDATE teams SET status = 'inactive' WHERE id = ${teamId}`;
      return Response.json({ success: true });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get("leagueId");
  const teamId = searchParams.get("teamId");
  const joinCode = searchParams.get("joinCode");
  const captainUserId = searchParams.get("captainUserId");

  if (teamId) {
    const [team] = await sql`SELECT * FROM teams WHERE id = ${teamId}`;
    return Response.json(team);
  }
  if (captainUserId) {
    const [team] = await sql`
      SELECT t.*, au.name as captain_name
      FROM teams t
      LEFT JOIN auth_users au ON t.captain_user_id = au.id
      WHERE t.captain_user_id = ${captainUserId}
      AND t.status = 'active'
      ORDER BY t.created_at DESC
      LIMIT 1
    `;
    return Response.json(team || null);
  }
  if (joinCode) {
    const [league] =
      await sql`SELECT id FROM leagues WHERE join_code = ${joinCode}`;
    if (!league) return Response.json([]);
    const teams =
      await sql`SELECT * FROM teams WHERE league_id = ${league.id} AND status = 'active'`;
    return Response.json(teams);
  }
  if (leagueId) {
    const teams = await sql`
      SELECT t.*, au.name as captain_name
      FROM teams t
      LEFT JOIN auth_users au ON t.captain_user_id = au.id
      WHERE t.league_id = ${leagueId} AND t.status = 'active'
    `;
    return Response.json(teams);
  }
  return Response.json({ error: "Missing parameters" }, { status: 400 });
}
