import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

// GET - fetch notifications for current user
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
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - mark notifications as read
export async function PATCH(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { notificationId, markAllRead } = await request.json();

    if (markAllRead) {
      await sql`
        UPDATE notifications
        SET read = TRUE
        WHERE user_id = ${session.user.id}
      `;
      return Response.json({
        success: true,
        message: "All notifications marked as read",
      });
    }

    if (notificationId) {
      await sql`
        UPDATE notifications
        SET read = TRUE
        WHERE id = ${notificationId} AND user_id = ${session.user.id}
      `;
      return Response.json({ success: true });
    }

    return Response.json(
      { error: "notificationId or markAllRead required" },
      { status: 400 },
    );
  } catch (error) {
    console.error("PATCH notifications error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
