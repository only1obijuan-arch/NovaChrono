import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { sendEmail } from "@/app/api/utils/send-email";
import crypto from "crypto";

export async function POST(request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = session.user.role;
  if (userRole !== "venue_admin" && userRole !== "super_admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { matchId } = await request.json();

    // Get match details with captain info
    const matchResult = await sql`
      SELECT 
        m.id,
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
      WHERE m.id = ${matchId}
    `;

    if (matchResult.length === 0) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const match = matchResult[0];
    const matchDate = new Date(match.match_date).toLocaleDateString("en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const emailsSent = [];

    // Helper to get or create availability record with token
    async function getOrCreateAvailability(teamId) {
      const existing = await sql`
        SELECT * FROM availability_responses
        WHERE match_id = ${matchId} AND team_id = ${teamId}
      `;

      if (existing.length > 0) {
        // Update reminder count and timestamp
        await sql`
          UPDATE availability_responses
          SET 
            reminder_count = reminder_count + 1,
            last_reminder_at = NOW()
          WHERE match_id = ${matchId} AND team_id = ${teamId}
        `;
        return existing[0].token;
      }

      // Create new record with token
      const token = crypto.randomBytes(32).toString("hex");
      await sql`
        INSERT INTO availability_responses (match_id, team_id, token, reminder_count, last_reminder_at)
        VALUES (${matchId}, ${teamId}, ${token}, 1, NOW())
      `;
      return token;
    }

    // Build reminder email HTML
    function buildReminderEmail(
      captainName,
      teamName,
      opponentName,
      isHome,
      token
    ) {
      const confirmUrl = `${appUrl}/api/auth/confirm-availability?token=${token}&response=yes`;
      const declineUrl = `${appUrl}/api/auth/confirm-availability?token=${token}&response=no`;

      return `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
          <body style="margin:0;padding:0;background:#091833;font-family:'Helvetica Neue',Arial,sans-serif;">
            <div style="max-width:520px;margin:40px auto;padding:20px;">
              <div style="text-align:center;margin-bottom:32px;">
                <div style="display:inline-block;background:rgba(0,245,212,0.08);border:2px solid rgba(0,245,212,0.4);border-radius:8px;padding:16px 24px;">
                  <p style="margin:0;font-size:22px;font-weight:900;color:#00F5D4;letter-spacing:6px;font-family:monospace;">NOVACHRONO</p>
                  <p style="margin:4px 0 0;font-size:9px;color:rgba(0,245,212,0.4);letter-spacing:4px;font-family:monospace;">// TIME PAUSES. YOUR LEAGUE NEVER DOES.</p>
                </div>
              </div>
              <div style="background:#0D1B2E;border:1px solid rgba(0,245,212,0.2);border-radius:8px;overflow:hidden;">
                <div style="height:3px;background:linear-gradient(90deg,transparent,#00F5D4,transparent);"></div>
                <div style="padding:32px;">
                  <p style="margin:0 0 8px;font-size:10px;color:rgba(0,245,212,0.5);letter-spacing:4px;font-family:monospace;">// MATCH REMINDER</p>
                  <h1 style="margin:0 0 8px;font-size:22px;font-weight:900;color:#F4F4F9;letter-spacing:2px;font-family:monospace;">ARE YOU IN?</h1>
                  <p style="margin:0 0 24px;font-size:15px;color:rgba(180,200,220,0.7);line-height:1.6;">
                    Hi ${captainName || "Captain"},<br><br>
                    You have an upcoming match for <strong style="color:#F4F4F9;">${teamName}</strong>. Please confirm your team's availability.
                  </p>
                  <div style="background:rgba(0,245,212,0.04);border:1px solid rgba(0,245,212,0.15);border-radius:6px;padding:20px;margin-bottom:24px;">
                    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(0,245,212,0.08);">
                      <span style="font-size:11px;color:rgba(0,245,212,0.5);font-family:monospace;letter-spacing:2px;">LEAGUE</span>
                      <span style="font-size:13px;color:#F4F4F9;font-weight:600;">${
                        match.league_name
                      }</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(0,245,212,0.08);">
                      <span style="font-size:11px;color:rgba(0,245,212,0.5);font-family:monospace;letter-spacing:2px;">DATE</span>
                      <span style="font-size:13px;color:#F4F4F9;font-weight:600;">${matchDate}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(0,245,212,0.08);">
                      <span style="font-size:11px;color:rgba(0,245,212,0.5);font-family:monospace;letter-spacing:2px;">TIME</span>
                      <span style="font-size:13px;color:#F4F4F9;font-weight:600;">${
                        match.time_slot
                      }</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(0,245,212,0.08);">
                      <span style="font-size:11px;color:rgba(0,245,212,0.5);font-family:monospace;letter-spacing:2px;">FIELD</span>
                      <span style="font-size:13px;color:#F4F4F9;font-weight:600;">Field ${
                        match.field_number
                      }</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:8px 0;">
                      <span style="font-size:11px;color:rgba(0,245,212,0.5);font-family:monospace;letter-spacing:2px;">OPPONENT</span>
                      <span style="font-size:13px;color:#F4F4F9;font-weight:600;">${
                        opponentName || "TBD"
                      } (${isHome ? "HOME" : "AWAY"})</span>
                    </div>
                  </div>
                  <p style="margin:0 0 20px;font-size:14px;color:rgba(180,200,220,0.6);text-align:center;font-family:monospace;letter-spacing:2px;">CONFIRM YOUR AVAILABILITY:</p>
                  <div style="display:flex;gap:12px;justify-content:center;">
                    <a href="${confirmUrl}" style="flex:1;display:inline-block;background:linear-gradient(135deg,#00FF9C,#00CC78);color:#091833;font-family:monospace;font-size:14px;font-weight:900;letter-spacing:3px;padding:18px 24px;border-radius:4px;text-decoration:none;text-align:center;">
                      ✅ YES, WE'RE IN
                    </a>
                    <a href="${declineUrl}" style="flex:1;display:inline-block;background:rgba(255,0,204,0.1);border:1px solid rgba(255,0,204,0.4);color:#FF00CC;font-family:monospace;font-size:14px;font-weight:900;letter-spacing:3px;padding:18px 24px;border-radius:4px;text-decoration:none;text-align:center;">
                      ❌ CAN'T MAKE IT
                    </a>
                  </div>
                  <p style="margin:20px 0 0;font-size:11px;color:rgba(180,200,220,0.3);text-align:center;font-family:monospace;">
                    Please respond as soon as possible. Your admin will be notified of your response.
                  </p>
                </div>
              </div>
              <p style="text-align:center;margin-top:24px;font-size:9px;color:rgba(180,200,220,0.15);letter-spacing:3px;font-family:monospace;">
                © 2025 NOVACHRONO. ALL RIGHTS RESERVED.
              </p>
            </div>
          </body>
        </html>
      `;
    }

    // Send to home team captain
    if (match.home_captain_email && match.home_team_id) {
      const token = await getOrCreateAvailability(match.home_team_id);
      await sendEmail({
        to: match.home_captain_email,
        subject: `⚽ Match Reminder — ${match.home_team_name} vs ${match.away_team_name} — ${matchDate}`,
        html: buildReminderEmail(
          match.home_captain_name,
          match.home_team_name,
          match.away_team_name,
          true,
          token
        ),
        text: `Match Reminder: ${match.home_team_name} vs ${match.away_team_name} on ${matchDate} at ${match.time_slot}. Please confirm availability at: ${process.env.NEXT_PUBLIC_APP_URL}/api/auth/confirm-availability?token=${token}&response=yes`,
      });
      emailsSent.push(match.home_captain_email);

      // In-app notification for home captain
      await sql`
        INSERT INTO notifications (user_id, type, title, message, match_id)
        VALUES (
          ${match.home_captain_id},
          'match_reminder',
          '⚽ Upcoming Match — Action Required',
          ${`Your match against ${match.away_team_name} is on ${matchDate} at ${match.time_slot}. Please confirm your availability.`},
          ${matchId}
        )
      `;
    }

    // Send to away team captain
    if (match.away_captain_email && match.away_team_id) {
      const token = await getOrCreateAvailability(match.away_team_id);
      await sendEmail({
        to: match.away_captain_email,
        subject: `⚽ Match Reminder — ${match.home_team_name} vs ${match.away_team_name} — ${matchDate}`,
        html: buildReminderEmail(
          match.away_captain_name,
          match.away_team_name,
          match.home_team_name,
          false,
          token
        ),
        text: `Match Reminder: ${match.home_team_name} vs ${match.away_team_name} on ${matchDate} at ${match.time_slot}. Please confirm availability at: ${process.env.NEXT_PUBLIC_APP_URL}/api/auth/confirm-availability?token=${token}&response=yes`,
      });
      emailsSent.push(match.away_captain_email);

      // In-app notification for away captain
      await sql`
        INSERT INTO notifications (user_id, type, title, message, match_id)
        VALUES (
          ${match.away_captain_id},
          'match_reminder',
          '⚽ Upcoming Match — Action Required',
          ${`Your match against ${match.home_team_name} is on ${matchDate} at ${match.time_slot}. Please confirm your availability.`},
          ${matchId}
        )
      `;
    }

    if (emailsSent.length === 0) {
      return Response.json(
        { error: "No captain emails available for this match" },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      message: `Match reminder sent to ${emailsSent.length} captain(s)`,
      emailsSent,
    });
  } catch (error) {
    console.error("Error sending match reminder:", error);
    return Response.json(
      { error: "Failed to send match reminder", details: error.message },
      { status: 500 }
    );
  }
}