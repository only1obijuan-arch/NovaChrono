import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const teams = await sql`
    SELECT
      t.id, t.name as team_name,
      l.id as league_id, l.name as league_name,
      l.day_of_week, l.status as league_status,
      l.match_format, v.name as venue_name
    FROM teams t
    JOIN league_slots ls ON t.slot_id = ls.id
    JOIN leagues l ON ls.league_id = l.id
    JOIN venues v ON l.venue_id = v.id
    WHERE t.captain_user_id = ${session.user.id}
    AND t.status = 'active'
    ORDER BY l.created_at DESC
  `;

  return Response.json({ teams });
}
