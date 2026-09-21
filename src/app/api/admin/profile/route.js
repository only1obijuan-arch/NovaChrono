import sql from "@/app/api/utils/sql";
import { requireRole } from "@/app/api/utils/auth";
import { UUID_RE } from "@/app/api/utils/ownership";
import { auth } from "@/auth";

export async function PUT(request) {
  try {
    const user = await requireRole(request, "venue_admin", "super_admin");
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { venueId, role, name } = await request.json();
    if (role !== undefined && role !== user.role) {
      return Response.json({ error: "Role changes require authorised administration" }, { status: 403 });
    }
    if (venueId !== undefined && !UUID_RE.test(venueId)) {
      return Response.json({ error: "Invalid venue ID" }, { status: 400 });
    }
    if (venueId !== undefined && venueId !== user.venue_id && user.role !== "super_admin") {
      return Response.json({ error: "Venue assignment requires an administrator or invitation" }, { status: 403 });
    }
    if (name !== undefined && (typeof name !== "string" || !name.trim() || name.length > 100)) {
      return Response.json({ error: "Invalid name" }, { status: 400 });
    }
    if (venueId !== undefined) {
      const [venue] = await sql`SELECT id FROM venues WHERE id = ${venueId}`;
      if (!venue) return Response.json({ error: "Venue not found" }, { status: 404 });
      // Platform administrators may select their working venue without changing role.
      await sql`UPDATE auth_users SET venue_id = ${venueId} WHERE id = ${user.id}`;
    }
    if (name !== undefined) {
      await sql`UPDATE auth_users SET name = ${name.trim()} WHERE id = ${user.id}`;
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("PUT /api/admin/profile error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const rows = await sql`
      SELECT
        au.id, au.email, au.name, au.role, au.venue_id, au.organization_id,
        v.name as venue_name, v.lat as venue_lat, v.lng as venue_lng
      FROM auth_users au
      LEFT JOIN venues v ON au.venue_id = v.id
      WHERE au.id = ${userId}
    `;

    return Response.json({ user: rows[0] || null });
  } catch (err) {
    console.error("GET /api/admin/profile error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
