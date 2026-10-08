import sql, { withTransaction } from "@/app/api/utils/sql";
import { hash } from "argon2";
import { requireRole } from "@/app/api/utils/auth";
import { canonicalizeEmail } from "@/app/api/utils/email";

const SUPPORTED_CREATED_ROLES = new Set(["captain", "referee", "venue_admin", "org_admin"]);

export async function GET(request) {
  try {
    const actor = await requireRole(request, "super_admin");
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 403 });

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
    const actor = await requireRole(request, "super_admin");
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const { email: submittedEmail, password, name, venueId, organizationId, role } = await request.json();
    const email = canonicalizeEmail(submittedEmail);
    if (!email || !password || !name || !venueId || !organizationId) {
      return Response.json({ error: "All fields are required" }, { status: 400 });
    }

    const assignedRole = role || "venue_admin";
    if (!SUPPORTED_CREATED_ROLES.has(assignedRole)) {
      return Response.json({ error: "Unsupported role" }, { status: 400 });
    }

    const existing = await sql`SELECT id FROM auth_users WHERE lower(email) = ${email}`;
    if (existing.length > 0) {
      return Response.json({ error: "User with this email already exists" }, { status: 400 });
    }

    const hashedPassword = await hash(password);

    const newUser = await withTransaction(async (txSql) => {
      const [created] = await txSql`
        INSERT INTO auth_users (email, name, role, venue_id, organization_id, "emailVerified")
        VALUES (${email}, ${name.trim()}, ${assignedRole}, ${venueId}, ${organizationId}, NOW())
        RETURNING id, email, name, role, venue_id, organization_id
      `;
      await txSql`
        INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
        VALUES (${created.id}, 'credentials', 'credentials', ${email}, ${hashedPassword})
      `;
      return created;
    });

    return Response.json({ user: newUser });
  } catch (err) {
    console.error("POST /api/super-admin/users error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const actor = await requireRole(request, "super_admin");
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("id");
    if (!userId) return Response.json({ error: "User ID is required" }, { status: 400 });

    if (userId === actor.id.toString()) {
      return Response.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    await sql`DELETE FROM auth_users WHERE id = ${userId}`;

    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/super-admin/users error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
