import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { verifyMobileToken } from "@/app/api/utils/mobile-auth";
export async function GET(request) {
  try {
    const authHeader = request.headers.get("authorization");
    console.log("[team] auth header:", authHeader?.slice(0, 30) ?? "MISSING");

    const mobileUser = await verifyMobileToken(request);
    console.log("[team] mobileUser:", mobileUser ? mobileUser.id : "NULL");

    const session = mobileUser ? { user: mobileUser } : await auth();
    console.log("[team] session user:", session?.user?.id ?? "NULL");

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [team] = await sql`
      SELECT t.*, l.name as league_name, l.join_code, l.status as league_status
      FROM teams t
      LEFT JOIN leagues l ON l.id = t.league_id
      WHERE t.captain_user_id = ${session.user.id}
      AND t.status = 'active'
      ORDER BY l.created_at DESC
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
