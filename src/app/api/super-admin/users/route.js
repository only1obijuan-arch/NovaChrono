import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { hash } from "argon2";

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
    const venueId = searchParams.get("venueId");
    const organizationId = searchParams.get("organizationId");

    const users = venueId
      ? await sql`
          SELECT au.id, au.name, au.email, au.role, au.venue_id, au.organization_id,
                 v.name AS venue_name, o.name AS organization_name
          FROM auth_users au
          LEFT JOIN venues        v ON au.venue_id        = v.id
          LEFT JOIN organizations o ON au.organization_id = o.id
          WHERE au.venue_id = ${venueId}
          ORDER BY au.name
        `
      : organizationId
      ? await sql`
          SELECT au.id, au.name, au.email, au.role, au.venue_id, au.organization_id,
                 v.name AS venue_name, o.name AS organization_name
          FROM auth_users au
          LEFT JOIN venues        v ON au.venue_id        = v.id
          LEFT JOIN organizations o ON au.organization_id = o.id
          WHERE au.organization_id = ${organizationId}
          ORDER BY au.name
        `
      : await sql`
          SELECT au.id, au.name, au.email, au.role, au.venue_id, au.organization_id,
                 v.name AS venue_name, o.name AS organization_name
          FROM auth_users au
          LEFT JOIN venues        v ON au.venue_id        = v.id
          LEFT JOIN organizations o ON au.organization_id = o.id
          ORDER BY au.name
        `;

    return Response.json({ users });
  } catch (err) {
    console.error("GET /api/super-admin/users error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await requireSuperAdmin();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const { email, password, name, venueId, organizationId, role } = await request.json();
    if (!email || !password || !name || !venueId || !organizationId) {
      return Response.json({ error: "All fields are required" }, { status: 400 });
    }

    const existing = await sql`SELECT id FROM auth_users WHERE email = ${email}`;
    if (existing.length > 0) {
      return Response.json({ error: "User with this email already exists" }, { status: 400 });
    }

    const hashedPassword = await hash(password);

    const newUser = await sql`
      INSERT INTO auth_users (email, name, role, venue_id, organization_id)
      VALUES (${email}, ${name}, ${role || "venue_admin"}, ${venueId}, ${organizationId})
      RETURNING id, email, name, role, venue_id, organization_id
    `;

    await sql`
      INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
      VALUES (${newUser[0].id}, 'credentials', 'credentials', ${email}, ${hashedPassword})
    `;

    return Response.json({ user: newUser[0] });
  } catch (err) {
    console.error("POST /api/super-admin/users error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await requireSuperAdmin();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("id");
    if (!userId) return Response.json({ error: "User ID is required" }, { status: 400 });

    if (userId === session.user.id.toString()) {
      return Response.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    await sql`DELETE FROM auth_users WHERE id = ${userId}`;

    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/super-admin/users error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
