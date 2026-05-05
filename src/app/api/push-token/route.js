import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { verifyMobileToken } from "@/app/api/utils/mobile-auth";

// Ensure the column exists (idempotent — safe to call on every boot)
async function ensurePushTokenColumn() {
  await sql`
    ALTER TABLE auth_users
    ADD COLUMN IF NOT EXISTS push_token TEXT
  `;
}

export async function POST(request) {
  try {
    const mobileUser = await verifyMobileToken(request);
    const session = mobileUser ? { user: mobileUser } : await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token } = await request.json();

    if (!token || !token.startsWith("ExponentPushToken")) {
      return Response.json({ error: "Invalid push token" }, { status: 400 });
    }

    await ensurePushTokenColumn();

    await sql`
      UPDATE auth_users
      SET push_token = ${token}
      WHERE id = ${session.user.id}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Push token registration error:", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const mobileUser = await verifyMobileToken(request);
    const session = mobileUser ? { user: mobileUser } : await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await sql`
      UPDATE auth_users
      SET push_token = NULL
      WHERE id = ${session.user.id}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Push token removal error:", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
