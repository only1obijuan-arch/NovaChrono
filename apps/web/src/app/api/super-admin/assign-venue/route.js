import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

// Assign super admin to a venue temporarily
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
    const { venueId } = body;

    if (!venueId) {
      return Response.json({ error: "Venue ID is required" }, { status: 400 });
    }

    // Get venue details to also set organization
    const venue = await sql`
      SELECT id, organization_id FROM venues WHERE id = ${venueId}
    `;

    if (!venue || venue.length === 0) {
      return Response.json({ error: "Venue not found" }, { status: 404 });
    }

    // Assign super admin to this venue
    await sql`
      UPDATE auth_users 
      SET venue_id = ${venueId}, organization_id = ${venue[0].organization_id}
      WHERE id = ${session.user.id}
    `;

    return Response.json({
      success: true,
      venueId,
      organizationId: venue[0].organization_id,
    });
  } catch (error) {
    console.error("POST /api/super-admin/assign-venue error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Unassign super admin from venue
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

    // Unassign from venue (but keep super admin role)
    await sql`
      UPDATE auth_users 
      SET venue_id = NULL, organization_id = NULL
      WHERE id = ${session.user.id}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/super-admin/assign-venue error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
