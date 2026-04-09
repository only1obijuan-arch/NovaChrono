import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

async function getSession() {
  const session = await auth();
  return session?.user ?? null;
}

export async function POST(request) {
  try {
    const user = await getSession();
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
      const [dbUser] = await sql`
        SELECT role FROM auth_users WHERE id = ${user.id}
      `;
      if (!dbUser || !["venue_admin", "super_admin"].includes(dbUser.role)) {
        return Response.json(
          { error: "Admin access required" },
          { status: 403 },
        );
      }
      const { leagueId, teamName, captainUserId } = data;
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
      const [existingTeam] =
        await sql`SELECT * FROM teams WHERE id = ${teamId}`;

      const [dbUser] =
        await sql`SELECT role FROM auth_users WHERE id = ${user.id}`;

      const isOwnTeam =
        existingTeam?.captain_user_id?.toString() === user.id?.toString();
      const isAdmin =
        dbUser && ["venue_admin", "super_admin"].includes(dbUser.role);

      if (!isOwnTeam && !isAdmin) {
        return Response.json(
          { error: "Insufficient permissions" },
          { status: 403 },
        );
      }
      const [team] = await sql`
        UPDATE teams SET name = ${teamName} WHERE id = ${teamId} RETURNING *
      `;
      return Response.json(team);
    }

    if (action === "DELETE_TEAM") {
      const [dbUser] =
        await sql`SELECT role FROM auth_users WHERE id = ${user.id}`;

      if (!dbUser || !["venue_admin", "super_admin"].includes(dbUser.role)) {
        return Response.json(
          { error: "Admin access required" },
          { status: 403 },
        );
      }
      const { teamId } = data;
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
