import { escapeHtml } from "@/utils/escape-html";
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

    const { league_id, round_number } = await request.json();

    if (!league_id || !round_number) {
      return Response.json(
        { error: "league_id and round_number required" },
        { status: 400 }
      );
    }

    const [league] = await sql`SELECT * FROM leagues WHERE id = ${league_id} AND venue_id = ${session.user.venue_id}`;
    if (!league) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const updatedMatches = await sql`
      UPDATE matches
      SET match_date = match_date + INTERVAL '7 days'
      WHERE league_id = ${league_id} AND round_number >= ${round_number}
      RETURNING id, match_date, time_slot, field_number
    `;

    if (updatedMatches.length === 0) {
      return Response.json(
        { error: "No matches found for this round" },
        { status: 404 }
      );
    }

    const captains = await sql`
      SELECT DISTINCT au.id, au.email, au.name, au.push_token
      FROM teams t
      JOIN league_slots ls ON t.slot_id = ls.id
      JOIN auth_users au ON t.captain_user_id = au.id
      WHERE ls.league_id = ${league_id} AND t.status = 'active'
    `;

    const newDate = new Date(updatedMatches[0].match_date).toLocaleDateString("en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const notifTitle = `📅 Round ${round_number}+ Postponed — ${league.name}`;
    const notifMessage = `Round ${round_number} and all following rounds of ${league.name} have been postponed by 7 days. Please check the fixtures for updated times.`;

    let sent = 0;
    const errors = [];

    for (const captain of captains) {
      try {
        await sql`
          INSERT INTO notifications (user_id, type, title, message)
          VALUES (
            ${captain.id},
            'round_postponed',
            ${notifTitle},
            ${notifMessage}
          )
        `;

        if (captain.push_token) {
          await sendPush(
            captain.push_token,
            `📅 Round ${round_number}+ Postponed`,
            `${league.name} — All rounds from ${round_number} shifted by 7 days. Check fixtures for new dates.`,
            { type: "round_postponed" }
          );
        }

        if (captain.email) {
          await sendEmail({
            to: captain.email,
            subject: `📅 Round ${round_number}+ Postponed — ${league.name}`,
            html: `
              <!DOCTYPE html>
              <html>
                <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                <body style="margin:0;padding:0;background:#091833;font-family:'Helvetica Neue',Arial,sans-serif;">
                  <div style="max-width:520px;margin:40px auto;padding:20px;">
                    <div style="text-align:center;margin-bottom:32px;">
                      <p style="margin:0;font-size:22px;font-weight:900;color:#00F5D4;letter-spacing:6px;font-family:monospace;">NOVACHRONO</p>
                    </div>
                    <div style="background:#0D1B2E;border:1px solid rgba(255,0,204,0.4);border-radius:8px;overflow:hidden;">
                      <div style="height:3px;background:#FF00CC;"></div>
                      <div style="padding:32px;">
                        <p style="margin:0 0 8px;font-size:10px;color:#FF00CC;letter-spacing:4px;font-family:monospace;">// 📅 ROUND POSTPONED</p>
                        <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#F4F4F9;letter-spacing:2px;font-family:monospace;">ROUND ${escapeHtml(round_number)}+ POSTPONED</h1>
                        <p style="margin:0 0 24px;font-size:15px;color:rgba(180,200,220,0.7);line-height:1.6;">
                          Hi ${escapeHtml(captain.name || "Captain")},<br><br>
                          Round ${escapeHtml(round_number)} and all following rounds of <strong style="color:#F4F4F9;">${escapeHtml(league.name)}</strong> have been postponed by 7 days due to weather conditions.
                        </p>
                        <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:20px;margin-bottom:24px;">
                          <p style="margin:0 0 6px;font-size:11px;color:rgba(180,200,220,0.5);font-family:monospace;">NEW DATE</p>
                          <p style="margin:0;font-size:18px;font-weight:700;color:#00F5D4;">${escapeHtml(newDate)}</p>
                          <p style="margin:8px 0 0;font-size:13px;color:rgba(180,200,220,0.5);">${updatedMatches.length} match${updatedMatches.length !== 1 ? "es" : ""} rescheduled</p>
                        </div>
                        <p style="margin:0;font-size:14px;color:rgba(180,200,220,0.6);line-height:1.6;">
                          Please check the fixtures schedule for your updated match time. Contact your venue admin if you have any questions.
                        </p>
                      </div>
                    </div>
                    <p style="margin:24px 0 0;text-align:center;font-size:11px;color:rgba(180,200,220,0.3);font-family:monospace;">NOVACHRONO — Sports Management Platform</p>
                  </div>
                </body>
              </html>
            `,
            text: `Round ${round_number}+ Postponed — ${league.name}\n\nRound ${round_number} and all following rounds have been postponed by 7 days. ${updatedMatches.length} match(es) rescheduled. Check fixtures for updated times.`,
          });
        }

        sent++;
      } catch (err) {
        errors.push({ captainId: captain.id, error: err.message });
      }
    }

    return Response.json({
      success: true,
      matchesUpdated: updatedMatches.length,
      sent,
      total: captains.length,
      newDate,
      errors,
    });
  } catch (error) {
    console.error("Postpone round error:", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
