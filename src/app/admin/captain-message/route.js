import { escapeHtml } from "@/utils/escape-html";
import sql from "@/app/api/utils/sql";
import { requireRole } from "@/app/api/utils/auth";
import { canAdministerVenue, UUID_RE } from "@/app/api/utils/ownership";
import { sendEmail } from "@/app/api/utils/send-email";
import { sendPush } from "@/app/api/utils/send-push";
import { NOTIFICATION_TYPES } from "@/constants/notification-types";

export async function POST(request) {
  try {
    const user = await requireRole(request, "venue_admin", "super_admin");
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { league_id, message } = await request.json();
    if (!UUID_RE.test(league_id) || !message?.trim()) return Response.json({ error: "league_id and message required" }, { status: 400 });
    const [league] = await sql`SELECT id, name, venue_id FROM leagues WHERE id = ${league_id}`;
    if (!league) return Response.json({ error: "League not found" }, { status: 404 });
    if (!canAdministerVenue(user, league.venue_id)) return Response.json({ error: "Access denied" }, { status: 403 });
    const captains = await sql`SELECT DISTINCT au.id, au.email, au.push_token FROM teams t JOIN league_slots ls ON t.slot_id = ls.id JOIN auth_users au ON au.id = t.captain_user_id WHERE ls.league_id = ${league_id} AND t.status = 'active'`;
    const summary = {
      inApp: { sent: 0, failed: 0 },
      push: { sent: 0, failed: 0, skipped: 0 },
      email: { sent: 0, failed: 0, skipped: 0 },
    };
    const errors = [];
    for (const captain of captains) {
      try {
        await sql`INSERT INTO notifications (user_id, type, title, message) VALUES (${captain.id}, ${NOTIFICATION_TYPES.ADMIN_MESSAGE}, ${`Message from Admin — ${league.name}`}, ${message.trim()})`;
        summary.inApp.sent += 1;
      } catch (error) {
        summary.inApp.failed += 1;
        errors.push({ captainId: captain.id, channel: "in_app", code: error?.code || "DATABASE_ERROR" });
      }

      if (captain.push_token) {
        try {
          const push = await sendPush(
            captain.push_token,
            `Message from Admin — ${league.name}`,
            message.trim(),
            { type: NOTIFICATION_TYPES.ADMIN_MESSAGE },
          );
          if (push?.accepted) summary.push.sent += 1;
          else {
            summary.push.failed += 1;
            errors.push({ captainId: captain.id, channel: "push", code: push?.status || "provider_error" });
          }
        } catch {
          summary.push.failed += 1;
          errors.push({ captainId: captain.id, channel: "push", code: "provider_error" });
        }
      } else {
        summary.push.skipped += 1;
      }

      if (captain.email) {
        try {
          await sendEmail({
            to: captain.email,
            subject: `Message from NovaChrono Admin — ${league.name}`,
            text: message.trim(),
            html: `<p>${escapeHtml(message.trim())}</p>`,
          });
          summary.email.sent += 1;
        } catch (error) {
          summary.email.failed += 1;
          errors.push({ captainId: captain.id, channel: "email", code: error?.code || "EMAIL_DELIVERY_FAILED" });
        }
      } else {
        summary.email.skipped += 1;
      }
    }
    return Response.json({
      success: errors.length === 0,
      total: captains.length,
      channels: summary,
      errors,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
