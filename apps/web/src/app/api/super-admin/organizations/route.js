import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

// Get all organizations (super admin only)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is super_admin
    const userCheck = await sql`
      SELECT role FROM auth_users WHERE id = ${session.user.id}
    `;

    if (!userCheck[0] || userCheck[0].role !== "super_admin") {
      return Response.json(
        { error: "Super admin access required" },
        { status: 403 },
      );
    }

    const organizations = await sql`
  SELECT 
    o.id,
    o.name,
    o.created_at,
    COUNT(DISTINCT v.id) as venue_count,
    COUNT(DISTINCT CASE WHEN au.role = 'venue_admin' THEN au.id END) as admin_count
  FROM organizations o
  LEFT JOIN venues v ON v.organization_id = o.id
  LEFT JOIN auth_users au ON au.organization_id = o.id AND au.role = 'venue_admin'
  GROUP BY o.id, o.name, o.created_at
  ORDER BY o.created_at DESC
`;

    return Response.json({ organizations });
  } catch (error) {
    console.error("GET /api/super-admin/organizations error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Create new organization (super admin only)
export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is super_admin
    const userCheck = await sql`
      SELECT role FROM auth_users WHERE id = ${session.user.id}
    `;

    if (!userCheck[0] || userCheck[0].role !== "super_admin") {
      return Response.json(
        { error: "Super admin access required" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { name } = body;

    if (!name) {
      return Response.json(
        { error: "Organization name is required" },
        { status: 400 },
      );
    }

    const result = await sql`
      INSERT INTO organizations (name)
      VALUES (${name})
      RETURNING *
    `;

    return Response.json({ organization: result[0] });
  } catch (error) {
    console.error("POST /api/super-admin/organizations error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Delete organization (super admin only)
export async function DELETE(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is super_admin
    const userCheck = await sql`
      SELECT role FROM auth_users WHERE id = ${session.user.id}
    `;

    if (!userCheck[0] || userCheck[0].role !== "super_admin") {
      return Response.json(
        { error: "Super admin access required" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("id");

    if (!orgId) {
      return Response.json(
        { error: "Organization ID is required" },
        { status: 400 },
      );
    }

    await sql`DELETE FROM organizations WHERE id = ${orgId}`;

    return Response.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/super-admin/organizations error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
