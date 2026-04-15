import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { sendEmail } from "@/app/api/utils/send-email";
import { sendPush } from "@/app/api/utils/send-push";
import { rateLimit } from "@/app/api/utils/rate-limit";

export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "venue_admin" && session.user.role !== "super_admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { allowed } = await rateLimit(`alert:${session.user.id}`, { max: 10, windowMinutes: 60 });
    if (!allowed) {
      return Response.json({ error: "Too many alerts sent. Try again later." }, { status: 429 });
    }

    const { league_id, alert_type, message } = await request.json();

    if (!league_id || !alert_type || !message) {
      return Response.json(
        { error: "league_id, alert_type, and message required" },
        { status: 400 }
      );
    }

    if (!["warning", "postponed"].includes(alert_type)) {
      return Response.json(
        { error: "alert_type must be 'warning' or 'postponed'" },
        { status: 400 }
      );
    }

    const [league] = await sql`SELECT * FROM leagues WHERE id = ${league_id}`;
    if (!league) {
      return Response.json({ error: "League not found" }, { status: 404 });
    }

    const captains = await sql`
      SELECT DISTINCT au.id, au.email, au.name, au.push_token
      FROM teams t
      JOIN league_slots ls ON t.slot_id = ls.id
      JOIN auth_users au ON t.captain_user_id = au.id
      WHERE ls.league_id = ${league_id} AND t.status = 'active'
    `;

    const isWarning = alert_type === "warning";
    const alertColor = isWarning ? "#FFD700" : "#FF00CC";
    const alertLabel = isWarning ? "⚠️ WEATHER WARNING" : "🚫 MATCH POSTPONED";
    const notifType = isWarning ? "weather_warning" : "match_postponed";
    const emailSubject = isWarning
      ? `⚠️ Weather Warning — ${league.name}`
      : `🚫 Match Postponed — ${league.name}`;

    let sent = 0;
    const errors = [];

    for (const captain of captains) {
      try {
        await sql`
          INSERT INTO notifications (user_id, type, title, message)
          VALUES (
            ${captain.id},
            ${notifType},
            ${alertLabel + " — " + league.name},
            ${message}
          )
        `;

        if (captain.push_token) {
          await sendPush(
            captain.push_token,
            alertLabel + " — " + league.name,
            message,
            { type: notifType }
          );
        }

        if (captain.email) {
          await sendEmail({
            to: captain.email,
            subject: emailSubject,
            html: `
              <!DOCTYPE html>
              <html>
                <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                <body style="margin:0;padding:0;background:#091833;font-family:'Helvetica Neue',Arial,sans-serif;">
                  <div style="max-width:520px;margin:40px auto;padding:20px;">
                    <div style="text-align:center;margin-bottom:32px;">
                      <p style="margin:0;font-size:22px;font-weight:900;color:#00F5D4;letter-spacing:6px;font-family:monospace;">NOVACHRONO</p>
                    </div>
                    <div style="background:#0D1B2E;border:1px solid ${alertColor}40;border-radius:8px;overflow:hidden;">
                      <div style="height:3px;background:${alertColor};"></div>
                      <div style="padding:32px;">
                        <p style="margin:0 0 8px;font-size:10px;color:${alertColor};letter-spacing:4px;font-family:monospace;">// ${alertLabel}</p>
                        <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#F4F4F9;letter-spacing:2px;font-family:monospace;">${isWarning ? "WEATHER ALERT" : "MATCH POSTPONED"}</h1>
                        <p style="margin:0 0 24px;font-size:15px;color:rgba(180,200,220,0.7);line-height:1.6;">
                          Hi ${captain.name || "Captain"},<br><br>
                          ${message}
                        </p>
                        <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:20px;">
                          <p style="margin:0 0 6px;font-size:11px;color:rgba(180,200,220,0.5);font-family:monospace;">LEAGUE</p>
                          <p style="margin:0;font-size:16px;font-weight:700;color:#F4F4F9;">${league.name}</p>
                        </div>
                      </div>
                    </div>
                    <p style="margin:24px 0 0;text-align:center;font-size:11px;color:rgba(180,200,220,0.3);font-family:monospace;">NOVACHRONO — Sports Management Platform</p>
                  </div>
                </body>
              </html>
            `,
            text: `${alertLabel} — ${league.name}\n\n${message}`,
          });
        }

        sent++;
      } catch (err) {
        errors.push({ captainId: captain.id, error: err.message });
      }
    }

    return Response.json({ success: true, sent, total: captains.length, errors });
  } catch (error) {
    console.error("Weather alert error:", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
