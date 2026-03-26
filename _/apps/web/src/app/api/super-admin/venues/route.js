import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

// Get venues for an organization (super admin only)
export async function GET(request) {
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
    const orgId = searchParams.get("organizationId");

    if (!orgId) {
      return Response.json(
        { error: "Organization ID is required" },
        { status: 400 },
      );
    }

    const venues = await sql`
      SELECT 
        v.id,
        v.name,
        v.location,
        v.created_at,
        v.organization_id,
        COUNT(DISTINCT l.id) as league_count,
        COUNT(DISTINCT au.id) as admin_count
      FROM venues v
      LEFT JOIN leagues l ON l.venue_id = v.id
      LEFT JOIN auth_users au ON au.venue_id = v.id
      WHERE v.organization_id = ${orgId}
      GROUP BY v.id, v.name, v.location, v.created_at, v.organization_id
      ORDER BY v.created_at DESC
    `;

    return Response.json({ venues });
  } catch (error) {
    console.error("GET /api/super-admin/venues error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Create new venue (super admin only)
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
    const { organizationId, name, location } = body;

    if (!organizationId || !name) {
      return Response.json(
        { error: "Organization ID and venue name are required" },
        { status: 400 },
      );
    }

    const result = await sql`
      INSERT INTO venues (organization_id, name, location)
      VALUES (${organizationId}, ${name}, ${location || null})
      RETURNING *
    `;

    return Response.json({ venue: result[0] });
  } catch (error) {
    console.error("POST /api/super-admin/venues error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Delete venue (super admin only)
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
    const venueId = searchParams.get("id");

    if (!venueId) {
      return Response.json({ error: "Venue ID is required" }, { status: 400 });
    }

    await sql`DELETE FROM venues WHERE id = ${venueId}`;

    return Response.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/super-admin/venues error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
