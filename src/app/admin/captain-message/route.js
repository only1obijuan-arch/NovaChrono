import { escapeHtml } from "@/utils/escape-html";
import sql from "@/app/api/utils/sql";
import { requireRole } from "@/app/api/utils/auth";
import { canAdministerVenue } from "@/app/api/utils/ownership";
import { sendEmail } from "@/app/api/utils/send-email";
import { sendPush } from "@/app/api/utils/send-push";

export async function POST(request) {
  try {
    const user = await requireRole(request, "venue_admin", "super_admin");
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { league_id, message } = await request.json();
    if (!league_id || !message?.trim()) return Response.json({ error: "league_id and message required" }, { status: 400 });
    const [league] = await sql`SELECT id, name, venue_id FROM leagues WHERE id = ${league_id}`;
    if (!league) return Response.json({ error: "League not found" }, { status: 404 });
    if (!canAdministerVenue(user, league.venue_id)) return Response.json({ error: "Access denied" }, { status: 403 });
    const captains = await sql`SELECT DISTINCT au.id, au.email, au.push_token FROM teams t JOIN league_slots ls ON t.slot_id = ls.id JOIN auth_users au ON au.id = t.captain_user_id WHERE ls.league_id = ${league_id} AND t.status = 'active'`;
    let sent = 0;
    for (const captain of captains) {
      await sql`INSERT INTO notifications (user_id, type, title, message) VALUES (${captain.id}, 'admin_message', ${`Message from Admin — ${league.name}`}, ${message.trim()})`;
      if (captain.push_token) await sendPush(captain.push_token, `Message from Admin — ${league.name}`, message.trim(), { type: "admin_message" });
      if (captain.email) await sendEmail({ to: captain.email, subject: `Message from NovaChrono Admin — ${league.name}`, text: message.trim(), html: `<p>${escapeHtml(message.trim())}</p>` });
      sent++;
    }
    return Response.json({ success: true, sent, total: captains.length });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
