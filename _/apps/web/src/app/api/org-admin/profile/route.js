import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user with org
    const [user] = await sql`
      SELECT au.*, o.name as org_name
      FROM auth_users au
      LEFT JOIN organizations o ON o.id = au.organization_id
      WHERE au.id = ${session.user.id}
    `;

    if (!user || !["org_admin", "super_admin"].includes(user.role)) {
      return Response.json(
        { error: "Org admin access required" },
        { status: 403 }
      );
    }

    const orgId = user.organization_id;

    // Get venues for this org
    const venues = await sql`
      SELECT 
        v.*,
        COUNT(DISTINCT au.id) FILTER (WHERE au.role = 'venue_admin') as admin_count,
        COUNT(DISTINCT l.id) as league_count
      FROM venues v
      LEFT JOIN auth_users au ON au.venue_id = v.id
      LEFT JOIN leagues l ON l.venue_id = v.id
      WHERE v.organization_id = ${orgId}
      GROUP BY v.id
      ORDER BY v.created_at DESC
    `;

    // Get all admins in this org
    const admins = await sql`
      SELECT au.id, au.name, au.email, au.role, v.name as venue_name
      FROM auth_users au
      LEFT JOIN venues v ON au.venue_id = v.id
      WHERE au.organization_id = ${orgId}
      AND au.role IN ('venue_admin', 'org_admin')
      ORDER BY au.created_at DESC
    `;

    return Response.json({
      organization: { id: orgId, name: user.org_name },
      venues,
      admins,
    });
  } catch (err) {
    console.error("GET /api/org-admin/profile error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}