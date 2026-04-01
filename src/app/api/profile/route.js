import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

// Universal profile endpoint — works for ALL roles.
// Returns the authenticated user's full profile including
// venue_name and organization_name via JOIN.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await sql`
      SELECT
        au.id,
        au.email,
        au.name,
        au.role,
        au.venue_id,
        au.organization_id,
        au.field_number,
        v.name  AS venue_name,
        o.name  AS organization_name
      FROM auth_users au
      LEFT JOIN venues       v ON au.venue_id       = v.id
      LEFT JOIN organizations o ON au.organization_id = o.id
      WHERE au.id = ${session.user.id}
    `;

    if (!rows[0]) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    return Response.json({ user: rows[0] });
  } catch (err) {
    console.error("GET /api/profile error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
