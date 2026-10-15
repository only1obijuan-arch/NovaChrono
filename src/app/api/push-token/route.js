import { sql } from "@/app/api/utils/db";
import { resolveCurrentUser } from "@/app/api/utils/auth";
import { isValidExpoPushToken } from "@/app/api/utils/push-token";
import { assignPushToken } from "@/app/api/utils/push-token-store";

export async function POST(request) {
  try {
    const user = await resolveCurrentUser(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token } = await request.json();

    if (!isValidExpoPushToken(token)) {
      return Response.json({ error: "Invalid push token" }, { status: 400 });
    }

    const registration = await assignPushToken(user.id, token);
    if (registration.status === "not_found") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (registration.status === "conflict") {
      return Response.json({ error: "Push token ownership changed; retry" }, { status: 409 });
    }

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
