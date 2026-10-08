import sql from "@/app/api/utils/sql";
import { resolveCurrentUser } from "@/app/api/utils/auth";

export async function POST(request) {
  try {
    const user = await resolveCurrentUser(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token } = await request.json();

    if (!token || !token.startsWith("ExponentPushToken")) {
      return Response.json({ error: "Invalid push token" }, { status: 400 });
    }

    await sql`
      UPDATE auth_users
      SET push_token = ${token}
      WHERE id = ${user.id}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Push token registration error:", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const user = await resolveCurrentUser(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await sql`
      UPDATE auth_users
      SET push_token = NULL
      WHERE id = ${user.id}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Push token removal error:", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
