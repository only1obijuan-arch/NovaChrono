import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";

    const notifications = unreadOnly
      ? await sql`
          SELECT * FROM notifications
          WHERE user_id = ${session.user.id}
          AND read = FALSE
          ORDER BY created_at DESC
          LIMIT 20
        `
      : await sql`
          SELECT * FROM notifications
          WHERE user_id = ${session.user.id}
          ORDER BY created_at DESC
          LIMIT 50
        `;

    const unreadCount = await sql`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ${session.user.id} AND read = FALSE
    `;

    return Response.json({
      notifications,
      unreadCount: parseInt(unreadCount[0].count),
    });
  } catch (error) {
    console.error("GET notifications error:", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { notificationId, markAllRead } = await request.json();

    if (markAllRead) {
      const updated = await sql`
        UPDATE notifications
        SET read = TRUE,
            read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE user_id = ${session.user.id}
          AND read = FALSE
        RETURNING id
      `;
      return Response.json({
        success: true,
        message: "All notifications marked as read",
        updated: updated.length,
      });
    }

    if (notificationId) {
      if (!UUID_RE.test(notificationId))
        return Response.json({ error: "Invalid notificationId" }, { status: 400 });
      const updated = await sql`
        UPDATE notifications
        SET read = TRUE,
            read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE id = ${notificationId} AND user_id = ${session.user.id}
        RETURNING id
      `;
      if (updated.length === 0) {
        return Response.json({ error: "Notification not found" }, { status: 404 });
      }
      return Response.json({ success: true });
    }

    return Response.json(
      { error: "notificationId or markAllRead required" },
      { status: 400 },
    );
  } catch (error) {
    console.error("PATCH notifications error:", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
