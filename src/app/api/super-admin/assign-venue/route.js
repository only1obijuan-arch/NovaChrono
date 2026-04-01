import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const rows = await sql`SELECT role FROM auth_users WHERE id = ${session.user.id}`;
  return rows[0]?.role === "super_admin" ? session : null;
}

// Temporarily assign super admin to a specific venue (enables admin view)
export async function POST(request) {
  try {
    const session = await requireSuperAdmin();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const { venueId } = await request.json();
    if (!venueId) return Response.json({ error: "Venue ID is required" }, { status: 400 });

    const venue = await sql`SELECT id, organization_id FROM venues WHERE id = ${venueId}`;
    if (!venue.length) return Response.json({ error: "Venue not found" }, { status: 404 });

    await sql`
      UPDATE auth_users
      SET venue_id = ${venueId}, organization_id = ${venue[0].organization_id}
      WHERE id = ${session.user.id}
    `;

    return Response.json({ success: true, venueId, organizationId: venue[0].organization_id });
  } catch (err) {
    console.error("POST /api/super-admin/assign-venue error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Unassign super admin from venue, returning to super admin mode
export async function DELETE() {
  try {
    const session = await requireSuperAdmin();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 403 });

    await sql`
      UPDATE auth_users SET venue_id = NULL, organization_id = NULL
      WHERE id = ${session.user.id}
    `;

    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/super-admin/assign-venue error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
