import { requireRole } from "@/app/api/utils/auth";
import { canAdministerVenue, UUID_RE } from "@/app/api/utils/ownership";
import { isValidJoinCode } from "@/utils/join-code";
import { withTransaction } from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const user = await requireRole(request, "captain", "venue_admin", "super_admin");
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { leagueId, teamName, captainUserId = user.id, joinCode } = await request.json();
    if (!UUID_RE.test(leagueId) || !UUID_RE.test(captainUserId) || typeof teamName !== "string" || !teamName.trim() || teamName.length > 100) {
      return Response.json({ error: "Invalid registration details" }, { status: 400 });
    }
    return await withTransaction(async (txSql) => {
      const [league] = await txSql`
        SELECT id, venue_id, status, join_code FROM leagues WHERE id = ${leagueId} FOR UPDATE
      `;
      if (!league) return Response.json({ error: "League not found" }, { status: 404 });
      const [actor] = await txSql`
        SELECT id, role, venue_id, organization_id FROM auth_users WHERE id = ${user.id} FOR SHARE
      `;
      if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
      if (actor.role === "captain") {
        if (captainUserId !== actor.id || !isValidJoinCode(joinCode) || joinCode.trim().toUpperCase() !== league.join_code.toUpperCase()) {
          return Response.json({ error: "A valid league code and your own captain account are required" }, { status: 403 });
        }
      } else if (!canAdministerVenue(actor, league.venue_id)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      if (league.status !== "registration") {
        return Response.json({ error: "League registration is closed" }, { status: 409 });
      }
      const [captain] = await txSql`SELECT id FROM auth_users WHERE id = ${captainUserId} AND role = 'captain' FOR SHARE`;
      if (!captain) return Response.json({ error: "Captain not found" }, { status: 404 });
      const [existing] = await txSql`
        SELECT id FROM teams WHERE league_id = ${leagueId} AND captain_user_id = ${captainUserId} AND status = 'active' FOR SHARE
      `;
      if (existing) return Response.json({ error: "Captain already has a team in this league" }, { status: 409 });
      const [slot] = await txSql`
        SELECT ls.id FROM league_slots ls
        LEFT JOIN teams t ON t.slot_id = ls.id AND t.status = 'active'
        WHERE ls.league_id = ${leagueId} AND t.id IS NULL
        ORDER BY ls.slot_number, ls.id LIMIT 1
        FOR UPDATE OF ls SKIP LOCKED
      `;
      if (!slot) return Response.json({ error: "League is full" }, { status: 409 });
      const [team] = await txSql`
        INSERT INTO teams (league_id, slot_id, name, captain_user_id)
        VALUES (${leagueId}, ${slot.id}, ${teamName.trim()}, ${captainUserId})
        RETURNING *
      `;
      return Response.json(team);
    });
  } catch (error) {
    if (error?.code === "23505") {
      return Response.json({ error: "League slot or captain assignment is no longer available" }, { status: 409 });
    }
    console.error(error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
