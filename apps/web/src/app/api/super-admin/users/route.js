import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { hash } from "argon2";

// Get users (super admin only)
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
    const venueId = searchParams.get("venueId");
    const organizationId = searchParams.get("organizationId");

    let users;

    if (venueId) {
      users = await sql`
        SELECT 
          au.id,
          au.name,
          au.email,
          au.role,
          au.venue_id,
          au.organization_id,
          v.name as venue_name,
          o.name as organization_name
        FROM auth_users au
        LEFT JOIN venues v ON au.venue_id = v.id
        LEFT JOIN organizations o ON au.organization_id = o.id
        WHERE au.venue_id = ${venueId}
        ORDER BY au.name
      `;
    } else if (organizationId) {
      users = await sql`
        SELECT 
          au.id,
          au.name,
          au.email,
          au.role,
          au.venue_id,
          au.organization_id,
          v.name as venue_name,
          o.name as organization_name
        FROM auth_users au
        LEFT JOIN venues v ON au.venue_id = v.id
        LEFT JOIN organizations o ON au.organization_id = o.id
        WHERE au.organization_id = ${organizationId}
        ORDER BY au.name
      `;
    } else {
      users = await sql`
        SELECT 
          au.id,
          au.name,
          au.email,
          au.role,
          au.venue_id,
          au.organization_id,
          v.name as venue_name,
          o.name as organization_name
        FROM auth_users au
        LEFT JOIN venues v ON au.venue_id = v.id
        LEFT JOIN organizations o ON au.organization_id = o.id
        ORDER BY au.name
      `;
    }

    return Response.json({ users });
  } catch (error) {
    console.error("GET /api/super-admin/users error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Create venue admin user (super admin only)
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
    const { email, password, name, venueId, organizationId, role } = body;

    if (!email || !password || !name || !venueId || !organizationId) {
      return Response.json(
        { error: "All fields are required" },
        { status: 400 },
      );
    }

    // Check if user already exists
    const existingUser = await sql`
      SELECT id FROM auth_users WHERE email = ${email}
    `;

    if (existingUser.length > 0) {
      return Response.json(
        { error: "User with this email already exists" },
        { status: 400 },
      );
    }

    // Hash password
    const hashedPassword = await hash(password);

    // Create user
    const newUser = await sql`
      INSERT INTO auth_users (email, name, role, venue_id, organization_id)
      VALUES (${email}, ${name}, ${role || "venue_admin"}, ${venueId}, ${organizationId})
      RETURNING id, email, name, role, venue_id, organization_id
    `;

    // Create auth account with credentials
    await sql`
      INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
      VALUES (${newUser[0].id}, 'credentials', 'credentials', ${email}, ${hashedPassword})
    `;

    return Response.json({ user: newUser[0] });
  } catch (error) {
    console.error("POST /api/super-admin/users error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Delete user (super admin only)
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
    const userId = searchParams.get("id");

    if (!userId) {
      return Response.json({ error: "User ID is required" }, { status: 400 });
    }

    // Don't allow deleting yourself
    if (userId === session.user.id.toString()) {
      return Response.json(
        { error: "Cannot delete your own account" },
        { status: 400 },
      );
    }

    await sql`DELETE FROM auth_users WHERE id = ${userId}`;

    return Response.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/super-admin/users error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
