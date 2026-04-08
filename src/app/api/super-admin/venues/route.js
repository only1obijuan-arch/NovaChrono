import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const rows = await sql`SELECT role FROM auth_users WHERE id = ${session.user.id}`;
  return rows[0]?.role === "super_admin" ? session : null;
}

export async function GET(request) {
  try {
    const session = await requireSuperAdmin();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("organizationId");
    if (!orgId) return Response.json({ error: "Organization ID is required" }, { status: 400 });

    const venues = await sql`
      SELECT
        v.id,
        v.name,
        v.location,
        v.created_at,
        v.organization_id,
        COUNT(DISTINCT l.id)  AS league_count,
        COUNT(DISTINCT au.id) AS admin_count
      FROM venues v
      LEFT JOIN leagues    l  ON l.venue_id  = v.id
      LEFT JOIN auth_users au ON au.venue_id = v.id
      WHERE v.organization_id = ${orgId}
      GROUP BY v.id, v.name, v.location, v.created_at, v.organization_id
      ORDER BY v.created_at DESC
    `;

    return Response.json({ venues });
  } catch (err) {
    console.error("GET /api/super-admin/venues error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await requireSuperAdmin();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const { organizationId, name, location, lat, lng } = await request.json();
    if (!organizationId || !name) {
      return Response.json({ error: "Organization ID and venue name are required" }, { status: 400 });
    }

    const result = await sql`
      INSERT INTO venues (organization_id, name, location, lat, lng)
      VALUES (${organizationId}, ${name}, ${location || null}, ${lat || null}, ${lng || null})
      RETURNING *
    `;

    return Response.json({ venue: result[0] });
  } catch (err) {
    console.error("POST /api/super-admin/venues error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await requireSuperAdmin();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get("id");
    if (!venueId) return Response.json({ error: "Venue ID is required" }, { status: 400 });

    await sql`DELETE FROM venues WHERE id = ${venueId}`;

    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/super-admin/venues error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
