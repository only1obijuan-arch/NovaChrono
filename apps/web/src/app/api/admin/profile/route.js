import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

export async function PUT(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { venueId, role } = body || {};

    if (!venueId) {
      return Response.json({ error: "Venue ID is required" }, { status: 400 });
    }

    await sql`
      UPDATE auth_users 
      SET venue_id = ${venueId}, role = ${role || "venue_admin"}
      WHERE id = ${userId}
    `;

    return Response.json({ success: true });
  } catch (err) {
    console.error("PUT /api/admin/profile error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    console.log("GET /api/admin/profile called");
    const session = await auth();
    console.log(
      "Session:",
      session ? `User ID: ${session.user?.id}` : "NO SESSION",
    );

    if (!session || !session.user?.id) {
      console.log("Unauthorized: no session or user ID");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    console.log("Fetching profile for user:", userId);

    const rows = await sql`
      SELECT 
        au.id, au.email, au.name, au.role, au.venue_id, au.organization_id,
        v.name as venue_name
      FROM auth_users au
      LEFT JOIN venues v ON au.venue_id = v.id
      WHERE au.id = ${userId}
    `;

    console.log("Profile fetched:", rows[0] ? "SUCCESS" : "NO USER FOUND");
    return Response.json({ user: rows[0] || null });
  } catch (err) {
    console.error("GET /api/admin/profile error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
