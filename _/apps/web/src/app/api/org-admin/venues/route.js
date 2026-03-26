import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

async function getOrgAdmin(session) {
  const [user] = await sql`
    SELECT * FROM auth_users WHERE id = ${session.user.id}
  `;
  if (!user || !["org_admin", "super_admin"].includes(user.role)) return null;
  return user;
}

export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getOrgAdmin(session);
    if (!user)
      return Response.json(
        { error: "Org admin access required" },
        { status: 403 }
      );

    const { name, location } = await request.json();
    if (!name)
      return Response.json(
        { error: "Venue name is required" },
        { status: 400 }
      );

    const [venue] = await sql`
      INSERT INTO venues (organization_id, name, location)
      VALUES (${user.organization_id}, ${name}, ${location || null})
      RETURNING *
    `;

    return Response.json({ venue });
  } catch (err) {
    console.error("POST /api/org-admin/venues error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await auth();
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getOrgAdmin(session);
    if (!user)
      return Response.json(
        { error: "Org admin access required" },
        { status: 403 }
      );

    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get("id");
    if (!venueId)
      return Response.json({ error: "Venue ID required" }, { status: 400 });

    // Make sure venue belongs to this org
    const [venue] = await sql`
      SELECT id FROM venues WHERE id = ${venueId} AND organization_id = ${user.organization_id}
    `;
    if (!venue)
      return Response.json({ error: "Venue not found" }, { status: 404 });

    await sql`DELETE FROM venues WHERE id = ${venueId}`;
    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/org-admin/venues error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}