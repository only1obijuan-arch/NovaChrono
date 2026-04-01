import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const rows = await sql`SELECT role FROM auth_users WHERE id = ${session.user.id}`;
    if (rows[0]?.role !== "super_admin") {
      return Response.json({ error: "Super admin access required" }, { status: 403 });
    }

    const venues = await sql`
      SELECT
        v.id,
        v.name,
        v.location,
        v.organization_id,
        o.name AS organization_name
      FROM venues v
      LEFT JOIN organizations o ON o.id = v.organization_id
      ORDER BY o.name, v.name
    `;

    return Response.json({ venues });
  } catch (err) {
    console.error("GET /api/super-admin/all-venues error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
