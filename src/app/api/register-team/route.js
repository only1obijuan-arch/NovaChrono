import { requireRole } from "@/app/api/utils/auth";
import { canAdministerVenue, UUID_RE } from "@/app/api/utils/ownership";
import { isValidJoinCode } from "@/utils/join-code";
import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const user = await requireRole(request, "captain", "venue_admin", "super_admin");
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { leagueId, teamName, captainUserId = user.id, joinCode } = await request.json();
    if (!UUID_RE.test(leagueId) || !UUID_RE.test(captainUserId) || typeof teamName !== "string" || !teamName.trim() || teamName.length > 100) {
      return Response.json({ error: "Invalid registration details" }, { status: 400 });
    }
    const [league] = await sql`SELECT id, venue_id, status, join_code FROM leagues WHERE id = ${leagueId}`;
    if (!league) return Response.json({ error: "League not found" }, { status: 404 });
    if (user.role === "captain") {
      if (captainUserId !== user.id || !isValidJoinCode(joinCode) || joinCode.trim().toUpperCase() !== league.join_code.toUpperCase()) {
        return Response.json({ error: "A valid league code and your own captain account are required" }, { status: 403 });
      }
    } else if (!canAdministerVenue(user, league.venue_id)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!["registration", "active"].includes(league.status)) {
      return Response.json({ error: "League is not accepting registrations" }, { status: 409 });
    }
    const [captain] = await sql`SELECT id FROM auth_users WHERE id = ${captainUserId} AND role = 'captain'`;
    if (!captain) return Response.json({ error: "Captain not found" }, { status: 404 });
    const [existing] = await sql`SELECT id FROM teams WHERE league_id = ${leagueId} AND captain_user_id = ${captainUserId} AND status = 'active'`;
    if (existing) return Response.json({ error: "Captain already has a team in this league" }, { status: 409 });

    // Find next available slot
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
      VALUES (${leagueId}, ${availableSlot.id}, ${teamName}, ${captainUserId})
      RETURNING *
    `;

    return Response.json(team);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
