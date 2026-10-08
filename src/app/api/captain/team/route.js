import sql from "@/app/api/utils/sql";
import { requireRole } from "@/app/api/utils/auth";
export async function GET(request) {
  try {
    const user = await requireRole(request, "captain");
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const teams = await sql`
      SELECT t.*, l.name as league_name, l.join_code, l.status as league_status
      FROM teams t
      LEFT JOIN leagues l ON l.id = t.league_id
      WHERE t.captain_user_id = ${user.id}
      AND t.status = 'active'
      ORDER BY l.created_at DESC
      `;

    return Response.json({ team: teams[0] ?? null, teams });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
