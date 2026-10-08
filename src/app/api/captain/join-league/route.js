import { isValidJoinCode } from "@/utils/join-code";
import sql from "@/app/api/utils/sql";
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

  // Validate league code
  const [league] = await sql`
    SELECT id, name FROM leagues
    WHERE UPPER(join_code) = UPPER(${joinCode})
    AND status IN ('registration', 'active')
  `;
  if (!league) {
    return Response.json({ error: "Invalid or expired league code" }, { status: 400 });
  }

  // Check captain not already in this league
  const [existing] = await sql`
    SELECT t.id FROM teams t
    JOIN league_slots ls ON t.slot_id = ls.id
    WHERE ls.league_id = ${league.id}
    AND t.captain_user_id = ${user.id}
    AND t.status = 'active'
  `;
  if (existing) {
    return Response.json({ error: "You already have a team in this league" }, { status: 400 });
  }

  // Find available slot
  const [availableSlot] = await sql`
    SELECT ls.id FROM league_slots ls
    LEFT JOIN teams t ON t.slot_id = ls.id AND t.status = 'active'
    WHERE ls.league_id = ${league.id} AND t.id IS NULL
    ORDER BY ls.slot_number LIMIT 1
  `;
  if (!availableSlot) {
    return Response.json({ error: "League is full" }, { status: 400 });
  }

  const [team] = await sql`
    INSERT INTO teams (league_id, slot_id, name, captain_user_id)
    VALUES (${league.id}, ${availableSlot.id}, ${teamName}, ${user.id})
    RETURNING *
  `;

  return Response.json({ success: true, team, leagueName: league.name });
}
