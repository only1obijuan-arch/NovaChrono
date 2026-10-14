import { escapeHtml } from "@/utils/escape-html";
import sql from "@/app/api/utils/sql";
import { sendEmail } from "@/app/api/utils/send-email";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const response = searchParams.get("response"); // 'yes' or 'no'

    if (!token || !response || !["yes", "no"].includes(response)) {
      return new Response(
        buildPage(
          "Invalid Link",
          "This confirmation link is invalid or missing required parameters.",
          false,
        ),
        {
          headers: { "Content-Type": "text/html" },
          status: 400,
        },
      );
    }

    const records = await sql`
      SELECT
        ar.*,
        m.match_date,
        m.time_slot,
        m.field_number,
        l.name as league_name,
        l.venue_id,
        home_team.name as home_team_name,
        away_team.name as away_team_name,
        t.name as team_name,
        t.captain_user_id,
        au.email as captain_email,
        au.name as captain_name
      FROM availability_responses ar
      JOIN matches m ON ar.match_id = m.id
      JOIN leagues l ON m.league_id = l.id
      JOIN teams home_team ON home_team.id = m.home_team_id
      JOIN teams away_team ON away_team.id = m.away_team_id
      LEFT JOIN teams t ON ar.team_id = t.id
      LEFT JOIN auth_users au ON t.captain_user_id = au.id
      WHERE ar.token = ${token}
    `;

    if (records.length === 0) {
      return new Response(
        buildPage(
          "Link Expired",
          "This confirmation link has already been used or has expired.",
          false,
        ),
        {
          headers: { "Content-Type": "text/html" },
          status: 400,
        },
      );
    }

    const record = records[0];

    if (record.responded_at) {
      return new Response(
        buildPage(
          "Already Confirmed",
          `You have already confirmed your team's availability as "${record.response?.toUpperCase()}" for this match.`,
          true,
        ),
        {
          headers: { "Content-Type": "text/html" },
        },
      );
    }

    await sql`
      UPDATE availability_responses
      SET
        response = ${response},
        responded_at = NOW(),
        token = NULL
      WHERE token = ${token}
    `;

    const adminUsers = await sql`
      SELECT id FROM auth_users
      WHERE venue_id = ${record.venue_id}
      AND role IN ('venue_admin', 'super_admin')
    `;

    const matchDate = new Date(record.match_date).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

    for (const admin of adminUsers) {
      await sql`
        INSERT INTO notifications (user_id, type, title, message, match_id)
        VALUES (
          ${admin.id},
          ${response === "yes" ? "availability_confirmed" : "availability_declined"},
          ${response === "yes" ? "✅ Team Confirmed" : "❌ Team Unavailable"},
          ${`${record.team_name} has ${
            response === "yes" ? "confirmed" : "declined"
          } availability for their match on ${matchDate} at ${record.time_slot}.`},
          ${record.match_id}
        )
      `;
    }

    const adminEmails = await sql`
      SELECT email, name FROM auth_users
      WHERE venue_id = ${record.venue_id}
      AND role IN ('venue_admin', 'super_admin')
      AND email IS NOT NULL
    `;

    const statusColor = response === "yes" ? "#00FF9C" : "#FF00CC";
    const statusText = response === "yes" ? "CONFIRMED ✅" : "DECLINED ❌";
    const statusMessage =
      response === "yes"
        ? "The team has confirmed they will be attending the match."
        : "The team has indicated they will NOT be attending. Please arrange a replacement or contact them directly.";

    for (const admin of adminEmails) {
      await sendEmail({
        to: admin.email,
        subject: `${response === "yes" ? "✅" : "❌"} ${record.team_name} — Availability ${response === "yes" ? "Confirmed" : "Declined"}`,
        html: `
          <!DOCTYPE html>
          <html>
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
            <body style="margin:0;padding:0;background:#091833;font-family:'Helvetica Neue',Arial,sans-serif;">
              <div style="max-width:520px;margin:40px auto;padding:20px;">
                <div style="text-align:center;margin-bottom:32px;">
                  <p style="margin:0;font-size:22px;font-weight:900;color:#00F5D4;letter-spacing:6px;font-family:monospace;">NOVACHRONO</p>
                </div>
                <div style="background:#0D1B2E;border:1px solid ${statusColor}40;border-radius:8px;overflow:hidden;">
                  <div style="height:3px;background:${statusColor};"></div>
                  <div style="padding:32px;">
                    <p style="margin:0 0 8px;font-size:10px;color:${statusColor};letter-spacing:4px;font-family:monospace;">AVAILABILITY UPDATE</p>
                    <h1 style="margin:0 0 24px;font-size:22px;font-weight:900;color:#F4F4F9;letter-spacing:2px;font-family:monospace;">${statusText}</h1>
                    <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:20px;margin-bottom:20px;">
                      <p style="margin:0 0 8px;font-size:13px;color:rgba(180,200,220,0.6);">TEAM</p>
                      <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#F4F4F9;">${escapeHtml(record.team_name)}</p>
                      <p style="margin:0 0 8px;font-size:13px;color:rgba(180,200,220,0.6);">MATCH</p>
                      <p style="margin:0 0 16px;font-size:15px;color:#F4F4F9;">${escapeHtml(record.home_team_name)} vs ${escapeHtml(record.away_team_name)}</p>
                      <p style="margin:0 0 8px;font-size:13px;color:rgba(180,200,220,0.6);">DATE & TIME</p>
                      <p style="margin:0;font-size:15px;color:#F4F4F9;">${escapeHtml(matchDate)} at ${escapeHtml(record.time_slot)}</p>
                    </div>
                    <p style="margin:0;font-size:15px;color:rgba(180,200,220,0.7);line-height:1.6;">${escapeHtml(statusMessage)}</p>
                  </div>
                </div>
              </div>
            </body>
          </html>
        `,
        text: `${record.team_name} has ${response === "yes" ? "confirmed" : "declined"} availability for ${record.home_team_name} vs ${record.away_team_name} on ${matchDate} at ${record.time_slot}.`,
      });
    }

    return new Response(
      buildPage(
        response === "yes" ? "✅ Confirmed!" : "❌ Declined",
        response === "yes"
          ? `Thank you! Your availability for the match on ${matchDate} at ${record.time_slot} has been confirmed. Your admin has been notified.`
          : `Understood. We've notified your admin that ${record.team_name} will not be attending the match on ${matchDate}. Please contact your admin directly if this changes.`,
        true,
      ),
      {
        headers: { "Content-Type": "text/html" },
      },
    );
  } catch (error) {
    console.error("Confirm availability error:", error);
    return new Response(
      buildPage(
        "Error",
        "Something went wrong. Please contact your admin directly.",
        false,
      ),
      {
        headers: { "Content-Type": "text/html" },
        status: 500,
      },
    );
  }
}

function buildPage(title, message, success) {
  const color = success ? "#00F5D4" : "#FF00CC";
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} — NovaChrono</title>
    <style>
      * { box-sizing:border-box; margin:0; padding:0; }
      body { min-height:100vh; background:#091833; display:flex; align-items:center; justify-content:center; padding:24px; font-family:'Rajdhani',sans-serif; }
      .card { background:#0D1B2E; border:1px solid ${color}40; border-radius:12px; padding:48px 40px; max-width:480px; width:100%; text-align:center; box-shadow:0 40px 80px rgba(0,0,0,0.5); }
      .icon { font-size:56px; margin-bottom:24px; }
      .title { font-family:'Orbitron',monospace; font-size:24px; font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:16px; }
      .message { font-size:16px; color:rgba(180,200,220,0.7); line-height:1.7; margin-bottom:32px; }
      .brand { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.3); letter-spacing:4px; }
      .top-bar { height:3px; background:${color}; margin:-48px -40px 40px; border-radius:12px 12px 0 0; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="top-bar"></div>
      <div class="icon">${success ? (title.includes("✅") ? "✅" : "👍") : "❌"}</div>
      <h1 class="title">${escapeHtml(title)}</h1>
      <p class="message">${escapeHtml(message)}</p>
      <p class="brand">NOVACHRONO — TIME PAUSES. YOUR LEAGUE NEVER DOES.</p>
    </div>
  </body>
</html>`;
}
