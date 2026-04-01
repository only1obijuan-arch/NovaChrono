import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const rows = await sql`SELECT role FROM auth_users WHERE id = ${session.user.id}`;
  return rows[0]?.role === "super_admin" ? session : null;
}

export async function GET() {
  try {
    const session = await requireSuperAdmin();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const organizations = await sql`
      SELECT
        o.id,
        o.name,
        o.created_at,
        COUNT(DISTINCT v.id)                                           AS venue_count,
        COUNT(DISTINCT CASE WHEN au.role = 'venue_admin' THEN au.id END) AS admin_count
      FROM organizations o
      LEFT JOIN venues     v  ON v.organization_id  = o.id
      LEFT JOIN auth_users au ON au.organization_id = o.id AND au.role = 'venue_admin'
      GROUP BY o.id, o.name, o.created_at
      ORDER BY o.created_at DESC
    `;

    return Response.json({ organizations });
  } catch (err) {
    console.error("GET /api/super-admin/organizations error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await requireSuperAdmin();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const { name } = await request.json();
    if (!name) return Response.json({ error: "Organization name is required" }, { status: 400 });

    const result = await sql`
      INSERT INTO organizations (name) VALUES (${name}) RETURNING *
    `;

    return Response.json({ organization: result[0] });
  } catch (err) {
    console.error("POST /api/super-admin/organizations error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await requireSuperAdmin();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("id");
    if (!orgId) return Response.json({ error: "Organization ID is required" }, { status: 400 });

    await sql`DELETE FROM organizations WHERE id = ${orgId}`;

    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/super-admin/organizations error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
