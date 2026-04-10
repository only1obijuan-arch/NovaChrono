import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { verifyMobileToken } from "@/app/api/utils/mobile-auth";

export async function GET(request) {
  try {
    const mobileUser = await verifyMobileToken(request);
    const session = mobileUser ? { user: mobileUser } : await auth();

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
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
