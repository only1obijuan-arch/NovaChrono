import { isValidJoinCode } from "@/utils/join-code";
import { withTransaction } from "@/app/api/utils/sql";
import { requireRole } from "@/app/api/utils/auth";

export async function POST(request) {
  const user = await requireRole(request, "captain");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { joinCode, teamName } = await request.json();
  if (!isValidJoinCode(joinCode) || !teamName) {
    return Response.json({ error: "League code and team name are required" }, { status: 400 });
  }

  try {
    return await withTransaction(async (txSql) => {
      const [league] = await txSql`
        SELECT id, name, status FROM leagues
        WHERE UPPER(join_code) = UPPER(${joinCode})
        FOR UPDATE
      `;
      if (!league || league.status !== "registration") {
        return Response.json({ error: "Invalid, expired, or closed league code" }, { status: 409 });
      }
      const [actor] = await txSql`SELECT id, role FROM auth_users WHERE id = ${user.id} FOR SHARE`;
      if (!actor || actor.role !== "captain") {
        return Response.json({ error: "Captain access required" }, { status: 403 });
      }
      const [existing] = await txSql`
        SELECT id FROM teams
        WHERE league_id = ${league.id} AND captain_user_id = ${actor.id} AND status = 'active'
        FOR SHARE
      `;
      if (existing) return Response.json({ error: "You already have a team in this league" }, { status: 409 });
      const [slot] = await txSql`
        SELECT ls.id FROM league_slots ls
        LEFT JOIN teams t ON t.slot_id = ls.id AND t.status = 'active'
        WHERE ls.league_id = ${league.id} AND t.id IS NULL
        ORDER BY ls.slot_number, ls.id LIMIT 1
        FOR UPDATE OF ls SKIP LOCKED
      `;
      if (!slot) return Response.json({ error: "League is full" }, { status: 409 });
      const [team] = await txSql`
        INSERT INTO teams (league_id, slot_id, name, captain_user_id)
        VALUES (${league.id}, ${slot.id}, ${teamName.trim()}, ${actor.id})
        RETURNING *
      `;
      return Response.json({ success: true, team, leagueName: league.name });
    });
  } catch (error) {
    if (error?.code === "23505") return Response.json({ error: "League slot is no longer available" }, { status: 409 });
    console.error(error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
