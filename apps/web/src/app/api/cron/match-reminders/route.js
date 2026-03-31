import sql from "@/app/api/utils/sql";
import { sendEmail } from "@/app/api/utils/send-email";
import crypto from "crypto";

// This endpoint is called by a scheduled cron job
// Schedule 1: Daily at 6:00 AM — send reminders for matches in 3, 2, 1 days
// Schedule 2: Daily at 12:00 PM — alert admin for same-day unconfirmed matches

export async function POST(request) {
  try {
    // Verify this is a legitimate cron call using a secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "reminders"; // 'reminders' or 'midday'

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (type === "midday") {
      return await handleMiddayCheck(appUrl);
    }

    return await handleMorningReminders(appUrl);
  } catch (error) {
    console.error("Cron job error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ─── MORNING REMINDERS (6AM) ──────────────────────────────────────────────────
async function handleMorningReminders(appUrl) {
  const today = new Date();
  const results = { sent: 0, skipped: 0, errors: [] };

  // Find matches in 1, 2, or 3 days that haven't been confirmed
  const upcomingMatches = await sql`
    SELECT 
      m.id as match_id,
      m.match_date,
      m.time_slot,
      m.field_number,
      l.name as league_name,
      l.venue_id,
      home_team.id as home_team_id,
      home_team.name as home_team_name,
      away_team.id as away_team_id,
      away_team.name as away_team_name,
      home_captain.id as home_captain_id,
      home_captain.email as home_captain_email,
      home_captain.name as home_captain_name,
      away_captain.id as away_captain_id,
      away_captain.email as away_captain_email,
      away_captain.name as away_captain_name,
      v.name as venue_name
    FROM matches m
    JOIN leagues l ON m.league_id = l.id
    JOIN venues v ON l.venue_id = v.id
    LEFT JOIN league_slots home_slot ON m.home_slot_id = home_slot.id
    LEFT JOIN league_slots away_slot ON m.away_slot_id = away_slot.id
    LEFT JOIN teams home_team ON home_slot.id = home_team.slot_id AND home_team.status = 'active'
    LEFT JOIN teams away_team ON away_slot.id = away_team.slot_id AND away_team.status = 'active'
    LEFT JOIN auth_users home_captain ON home_team.captain_user_id = home_captain.id
    LEFT JOIN auth_users away_captain ON away_team.captain_user_id = away_captain.id
    WHERE m.status = 'scheduled'
    AND m.match_date >= CURRENT_DATE + INTERVAL '1 day'
    AND m.match_date <= CURRENT_DATE + INTERVAL '3 days'
  `;

  for (const match of upcomingMatches) {
    const matchDate = new Date(match.match_date).toLocaleDateString("en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const daysUntil = Math.ceil(
      (new Date(match.match_date) - today) / (1000 * 60 * 60 * 24),
    );

    // Process each team
    for (const side of ["home", "away"]) {
      const teamId = match[`${side}_team_id`];
      const captainEmail = match[`${side}_captain_email`];
      const captainName = match[`${side}_captain_name`];
      const teamName = match[`${side}_team_name`];
      const opponentName =
        match[side === "home" ? "away_team_name" : "home_team_name"];
      const captainId = match[`${side}_captain_id`];

      if (!teamId || !captainEmail) continue;

      // Check existing availability response
      const existing = await sql`
        SELECT * FROM availability_responses
        WHERE match_id = ${match.match_id} AND team_id = ${teamId}
      `;

      // Skip if already responded
      if (existing.length > 0 && existing[0].responded_at) {
        results.skipped++;
        continue;
      }

      // Check if we already sent a reminder today
      if (existing.length > 0 && existing[0].last_reminder_at) {
        const lastSent = new Date(existing[0].last_reminder_at);
        const hoursSince = (today - lastSent) / (1000 * 60 * 60);
        if (hoursSince < 20) {
          results.skipped++;
          continue;
        }
      }

      try {
        // Get or create token
        let token;
        if (existing.length > 0) {
          token = existing[0].token;
          await sql`
            UPDATE availability_responses
            SET reminder_count = reminder_count + 1, last_reminder_at = NOW()
            WHERE match_id = ${match.match_id} AND team_id = ${teamId}
          `;
        } else {
          token = crypto.randomBytes(32).toString("hex");
          await sql`
            INSERT INTO availability_responses (match_id, team_id, token, reminder_count, last_reminder_at)
            VALUES (${match.match_id}, ${teamId}, ${token}, 1, NOW())
          `;
        }

        const confirmUrl = `${appUrl}/api/auth/confirm-availability?token=${token}&response=yes`;
        const declineUrl = `${appUrl}/api/auth/confirm-availability?token=${token}&response=no`;

        const urgencyColor =
          daysUntil === 1 ? "#FF00CC" : daysUntil === 2 ? "#FFD700" : "#00F5D4";
        const urgencyLabel =
          daysUntil === 1
            ? "⚠️ TOMORROW"
            : daysUntil === 2
              ? "📅 IN 2 DAYS"
              : "📅 IN 3 DAYS";

        await sendEmail({
          to: captainEmail,
          subject: `${urgencyLabel} — ${teamName} vs ${opponentName} — Confirm Availability`,
          html: `
            <!DOCTYPE html>
            <html>
              <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
              <body style="margin:0;padding:0;background:#091833;font-family:'Helvetica Neue',Arial,sans-serif;">
                <div style="max-width:520px;margin:40px auto;padding:20px;">
                  <div style="text-align:center;margin-bottom:32px;">
                    <p style="margin:0;font-size:22px;font-weight:900;color:#00F5D4;letter-spacing:6px;font-family:monospace;">NOVACHRONO</p>
                  </div>
                  <div style="background:#0D1B2E;border:1px solid ${urgencyColor}40;border-radius:8px;overflow:hidden;">
                    <div style="height:3px;background:${urgencyColor};"></div>
                    <div style="padding:32px;">
                      <p style="margin:0 0 8px;font-size:10px;color:${urgencyColor};letter-spacing:4px;font-family:monospace;">// ${urgencyLabel}</p>
                      <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#F4F4F9;letter-spacing:2px;font-family:monospace;">ARE YOU IN?</h1>
                      <p style="margin:0 0 24px;font-size:15px;color:rgba(180,200,220,0.7);line-height:1.6;">
                        Hi ${captainName || "Captain"},<br><br>
                        Please confirm <strong style="color:#F4F4F9;">${teamName}</strong>'s availability for your upcoming match.
                      </p>
                      <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:20px;margin-bottom:24px;">
                        <p style="margin:0 0 6px;font-size:11px;color:rgba(180,200,220,0.5);font-family:monospace;">MATCH DETAILS</p>
                        <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#F4F4F9;">${teamName} vs ${opponentName}</p>
                        <p style="margin:0 0 4px;font-size:14px;color:rgba(180,200,220,0.6);">${matchDate}</p>
                        <p style="margin:0;font-size:14px;color:rgba(180,200,220,0.6);">${
                          match.time_slot
                        } — Field ${match.field_number}</p>
                      </div>
                      <div style="display:flex;gap:12px;">
                        <a href="${confirmUrl}" style="flex:1;display:block;background:linear-gradient(135deg,#00FF9C,#00CC78);color:#091833;font-family:monospace;font-size:14px;font-weight:900;letter-spacing:2px;padding:16px;border-radius:4px;text-decoration:none;text-align:center;">
                          ✅ YES, WE'RE IN
                        </a>
                        <a href="${declineUrl}" style="flex:1;display:block;background:rgba(255,0,204,0.1);border:1px solid rgba(255,0,204,0.4);color:#FF00CC;font-family:monospace;font-size:14px;font-weight:900;letter-spacing:2px;padding:16px;border-radius:4px;text-decoration:none;text-align:center;">
                          ❌ CAN'T MAKE IT
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </body>
            </html>
          `,
          text: `Match reminder: ${teamName} vs ${opponentName} on ${matchDate} at ${match.time_slot}. Confirm: ${confirmUrl} | Decline: ${declineUrl}`,
        });

        // In-app notification
        if (captainId) {
          await sql`
            INSERT INTO notifications (user_id, type, title, message, match_id)
            VALUES (
              ${captainId},
              'match_reminder',
              ${`⚽ ${urgencyLabel} — Action Required`},
              ${`Your match against ${opponentName} is on ${matchDate} at ${match.time_slot}. Please confirm your availability.`},
              ${match.match_id}
            )
          `;
        }

        results.sent++;
      } catch (err) {
        console.error(
          `Error sending reminder for match ${match.match_id}:`,
          err,
        );
        results.errors.push({
          matchId: match.match_id,
          team: teamName,
          error: err.message,
        });
      }
    }
  }

  return Response.json({
    success: true,
    type: "morning_reminders",
    ...results,
    message: `Sent ${results.sent} reminders, skipped ${results.skipped}`,
  });
}

// ─── MIDDAY CHECK (12PM) ──────────────────────────────────────────────────────
async function handleMiddayCheck(appUrl) {
  const results = { alerted: 0, errors: [] };

  // Find today's matches with no confirmation
  const todayMatches = await sql`
    SELECT 
      m.id as match_id,
      m.match_date,
      m.time_slot,
      m.field_number,
      l.name as league_name,
      l.venue_id,
      home_team.name as home_team_name,
      away_team.name as away_team_name,
      home_team.id as home_team_id,
      away_team.id as away_team_id
    FROM matches m
    JOIN leagues l ON m.league_id = l.id
    LEFT JOIN league_slots home_slot ON m.home_slot_id = home_slot.id
    LEFT JOIN league_slots away_slot ON m.away_slot_id = away_slot.id
    LEFT JOIN teams home_team ON home_slot.id = home_team.slot_id AND home_team.status = 'active'
    LEFT JOIN teams away_team ON away_slot.id = away_team.slot_id AND away_team.status = 'active'
    WHERE m.status = 'scheduled'
    AND m.match_date = CURRENT_DATE
  `;

  for (const match of todayMatches) {
    const matchDate = new Date(match.match_date).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

    // Check which teams haven't confirmed
    const unconfirmedTeams = [];

    for (const side of ["home", "away"]) {
      const teamId = match[`${side}_team_id`];
      const teamName = match[`${side}_team_name`];
      if (!teamId) continue;

      const response = await sql`
        SELECT * FROM availability_responses
        WHERE match_id = ${match.match_id} AND team_id = ${teamId}
        AND responded_at IS NOT NULL
      `;

      if (response.length === 0) {
        unconfirmedTeams.push(teamName);
      }
    }

    if (unconfirmedTeams.length === 0) continue;

    // Get venue admins
    const admins = await sql`
      SELECT id, email, name FROM auth_users
      WHERE venue_id = ${match.venue_id}
      AND role IN ('venue_admin', 'super_admin')
    `;

    for (const admin of admins) {
      try {
        // In-app notification
        await sql`
          INSERT INTO notifications (user_id, type, title, message, match_id)
          VALUES (
            ${admin.id},
            'unconfirmed_alert',
            '⚠️ Unconfirmed Teams — Action Required',
            ${`${unconfirmedTeams.join(
              " and ",
            )} have not confirmed availability for their ${
              match.time_slot
            } match today (${match.home_team_name} vs ${
              match.away_team_name
            }). Please contact them directly.`},
            ${match.match_id}
          )
        `;

        // Email alert
        if (admin.email) {
          await sendEmail({
            to: admin.email,
            subject: `⚠️ Unconfirmed Teams — ${match.home_team_name} vs ${match.away_team_name} — TODAY`,
            html: `
              <!DOCTYPE html>
              <html>
                <head><meta charset="utf-8"></head>
                <body style="margin:0;padding:0;background:#091833;font-family:'Helvetica Neue',Arial,sans-serif;">
                  <div style="max-width:520px;margin:40px auto;padding:20px;">
                    <p style="margin:0 0 24px;font-size:22px;font-weight:900;color:#00F5D4;letter-spacing:6px;font-family:monospace;text-align:center;">NOVACHRONO</p>
                    <div style="background:#0D1B2E;border:1px solid rgba(255,200,0,0.3);border-radius:8px;overflow:hidden;">
                      <div style="height:3px;background:#FFD700;"></div>
                      <div style="padding:32px;">
                        <p style="margin:0 0 8px;font-size:10px;color:#FFD700;letter-spacing:4px;font-family:monospace;">// ⚠️ URGENT — ACTION REQUIRED</p>
                        <h1 style="margin:0 0 16px;font-size:20px;font-weight:900;color:#F4F4F9;letter-spacing:2px;font-family:monospace;">UNCONFIRMED TEAMS</h1>
                        <p style="margin:0 0 20px;font-size:15px;color:rgba(180,200,220,0.7);line-height:1.6;">
                          Hi ${admin.name || "Admin"},<br><br>
                          It is now 12:00 and the following team(s) have <strong style="color:#FFD700;">not confirmed their availability</strong> for today's match:
                        </p>
                        <div style="background:rgba(255,200,0,0.06);border:1px solid rgba(255,200,0,0.2);border-radius:6px;padding:20px;margin-bottom:20px;">
                          ${unconfirmedTeams
                            .map(
                              (t) =>
                                `<p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#F4F4F9;">⚠️ ${t}</p>`,
                            )
                            .join("")}
                          <p style="margin:8px 0 0;font-size:13px;color:rgba(180,200,220,0.5);">${
                            match.home_team_name
                          } vs ${match.away_team_name}</p>
                          <p style="margin:4px 0 0;font-size:13px;color:rgba(180,200,220,0.5);">${matchDate} at ${
                            match.time_slot
                          } — Field ${match.field_number}</p>
                        </div>
                        <p style="margin:0;font-size:14px;color:rgba(180,200,220,0.6);line-height:1.6;">
                          Please contact the team captain(s) directly to confirm whether they will be attending.
                        </p>
                      </div>
                    </div>
                  </div>
                </body>
              </html>
            `,
            text: `URGENT: ${unconfirmedTeams.join(
              " and ",
            )} have not confirmed for today's match (${
              match.home_team_name
            } vs ${match.away_team_name} at ${
              match.time_slot
            }). Please contact them immediately.`,
          });
        }

        results.alerted++;
      } catch (err) {
        console.error(`Midday alert error for match ${match.match_id}:`, err);
        results.errors.push({ matchId: match.match_id, error: err.message });
      }
    }
  }

  return Response.json({
    success: true,
    type: "midday_check",
    ...results,
    message: `Sent ${results.alerted} admin alerts`,
  });
}
