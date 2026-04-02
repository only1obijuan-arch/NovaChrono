import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [team] = await sql`
      SELECT t.*, l.name as league_name, l.join_code
      FROM teams t
      LEFT JOIN leagues l ON l.id = t.league_id
      WHERE t.captain_user_id = ${session.user.id}
      AND t.status = 'active'
      LIMIT 1
    `;

    if (!team) {
      return Response.json({ team: null });
    }

    return Response.json({ team });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
