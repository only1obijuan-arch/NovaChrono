import sql from "@/app/api/utils/sql";
import { sendEmail } from "@/app/api/utils/send-email";
import { sendPush } from "@/app/api/utils/send-push";
import { matchReminderEmail } from "@/emails/matchReminderEmail";
import { unconfirmedAlertEmail } from "@/emails/unconfirmedAlertEmail";
import crypto from "crypto";

// Called by a scheduled cron job
// ?type=reminders (default) — 6AM morning reminders (1–3 days out)
// ?type=midday             — 12PM alert for same-day unconfirmed matches

export async function POST(request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  try {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "reminders";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (type === "midday") {
      return await handleMiddayCheck(appUrl);
    }

    return await handleMorningReminders(appUrl);
  } catch (error) {
    console.error("Cron job error:", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

async function handleMorningReminders(appUrl) {
  const today = new Date();
  const results = { sent: 0, skipped: 0, errors: [] };

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
      home_captain.push_token as home_captain_push_token,
      away_captain.id as away_captain_id,
      away_captain.email as away_captain_email,
      away_captain.name as away_captain_name,
      away_captain.push_token as away_captain_push_token,
      v.name as venue_name
    FROM matches m
    JOIN leagues l ON m.league_id = l.id
    JOIN venues v ON l.venue_id = v.id
    JOIN teams home_team ON home_team.id = m.home_team_id
    JOIN teams away_team ON away_team.id = m.away_team_id
    LEFT JOIN auth_users home_captain ON home_team.captain_user_id = home_captain.id
    LEFT JOIN auth_users away_captain ON away_team.captain_user_id = away_captain.id
    WHERE m.status = 'scheduled'
    AND m.match_date >= CURRENT_DATE + INTERVAL '1 day'
    AND m.match_date <= CURRENT_DATE + INTERVAL '3 days'
  `;

  // Build candidate (match_id, team_id) pairs, filtering nulls up front.
  const candidates = [];
  for (const match of upcomingMatches) {
    for (const side of ["home", "away"]) {
      const teamId = match[`${side}_team_id`];
      const captainEmail = match[`${side}_captain_email`];
      if (!teamId || !captainEmail) continue;
      candidates.push({ match, side, teamId });
    }
  }

  if (candidates.length === 0) {
    return Response.json({
      success: true,
      type: "morning_reminders",
      ...results,
      message: `Sent 0 reminders, skipped 0`,
    });
  }

  // Single bulk read — one query for all (match_id, team_id) pairs.
  const existingRows = await sql`
    SELECT match_id, team_id, token, responded_at, last_reminder_at
    FROM availability_responses
    WHERE (match_id, team_id) IN (
      SELECT * FROM unnest(
        ${candidates.map((c) => c.match.match_id)}::uuid[],
        ${candidates.map((c) => c.teamId)}::uuid[]
      )
    )
  `;
  const existingMap = new Map(
    existingRows.map((r) => [`${r.match_id}-${r.team_id}`, r])
  );

  // Classify each candidate: skip / update existing row / insert new row.
  const toUpdate = [];
  const toInsert = [];
  const toSend = [];

  for (const { match, side, teamId } of candidates) {
    const existing = existingMap.get(`${match.match_id}-${teamId}`);

    if (existing?.responded_at) {
      results.skipped++;
      continue;
    }

    if (existing?.last_reminder_at) {
      const hoursSince = (today - new Date(existing.last_reminder_at)) / (1000 * 60 * 60);
      if (hoursSince < 20) {
        results.skipped++;
        continue;
      }
    }

    const captainId = match[`${side}_captain_id`];
    const captainEmail = match[`${side}_captain_email`];
    const captainName = match[`${side}_captain_name`];
    const captainPushToken = match[`${side}_captain_push_token`];
    const teamName = match[`${side}_team_name`];
    const opponentName = match[side === "home" ? "away_team_name" : "home_team_name"];
    const daysUntil = Math.ceil(
      (new Date(match.match_date) - today) / (1000 * 60 * 60 * 24)
    );

    let token;
    if (existing) {
      token = existing.token;
      toUpdate.push({ matchId: match.match_id, teamId });
    } else {
      token = crypto.randomBytes(32).toString("hex");
      toInsert.push({ matchId: match.match_id, teamId, token });
    }

    toSend.push({
      match,
      captainId,
      captainEmail,
      captainName,
      captainPushToken,
      teamName,
      opponentName,
      token,
      daysUntil,
    });
  }

  // Bulk UPDATE existing rows — one query regardless of count.
  if (toUpdate.length > 0) {
    await sql`
      UPDATE availability_responses
      SET reminder_count = reminder_count + 1, last_reminder_at = NOW()
      WHERE (match_id, team_id) IN (
        SELECT * FROM unnest(
          ${toUpdate.map((r) => r.matchId)}::uuid[],
          ${toUpdate.map((r) => r.teamId)}::uuid[]
        )
      )
    `;
  }

  // Bulk INSERT new rows — one query regardless of count.
  if (toInsert.length > 0) {
    await sql`
      INSERT INTO availability_responses (match_id, team_id, token, reminder_count, last_reminder_at)
      SELECT
        unnest(${toInsert.map((r) => r.matchId)}::uuid[]),
        unnest(${toInsert.map((r) => r.teamId)}::uuid[]),
        unnest(${toInsert.map((r) => r.token)}::text[]),
        1,
        NOW()
    `;
  }

  // External I/O must stay per-item; collect notifications for a single bulk insert at the end.
  const pendingNotifications = [];

  for (const {
    match,
    captainId,
    captainEmail,
    captainName,
    captainPushToken,
    teamName,
    opponentName,
    token,
    daysUntil,
  } of toSend) {
    const matchDate = new Date(match.match_date).toLocaleDateString("en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
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

    try {
      await sendEmail({
        to: captainEmail,
        subject: `${urgencyLabel} — ${teamName} vs ${opponentName} — Confirm Availability`,
        html: matchReminderEmail({
          captainName,
          teamName,
          opponentName,
          matchDate,
          timeSlot: match.time_slot,
          fieldNumber: match.field_number,
          urgencyColor,
          urgencyLabel,
          confirmUrl,
          declineUrl,
        }),
        text: `Match reminder: ${teamName} vs ${opponentName} on ${matchDate} at ${match.time_slot}. Confirm: ${confirmUrl} | Decline: ${declineUrl}`,
      });

      if (captainPushToken) {
        await sendPush(
          captainPushToken,
          `${urgencyLabel} — Are you in?`,
          `${teamName} vs ${opponentName} — ${matchDate} at ${match.time_slot}. Open the app to confirm.`,
          { type: "match_reminder", matchId: match.match_id }
        );
      }

      if (captainId) {
        pendingNotifications.push({
          userId: captainId,
          title: `⚽ ${urgencyLabel} — Action Required`,
          message: `Your match against ${opponentName} is on ${matchDate} at ${match.time_slot}. Please confirm your availability.`,
          matchId: match.match_id,
        });
      }

      results.sent++;
    } catch (err) {
      console.error(`Error sending reminder for match ${match.match_id}:`, err);
      results.errors.push({ matchId: match.match_id, team: teamName, error: err.message });
    }
  }

  // Bulk INSERT all in-app notifications — one query regardless of count.
  if (pendingNotifications.length > 0) {
    await sql`
      INSERT INTO notifications (user_id, type, title, message, match_id)
      SELECT
        unnest(${pendingNotifications.map((n) => n.userId)}::uuid[]),
        unnest(${pendingNotifications.map(() => "match_reminder")}::text[]),
        unnest(${pendingNotifications.map((n) => n.title)}::text[]),
        unnest(${pendingNotifications.map((n) => n.message)}::text[]),
        unnest(${pendingNotifications.map((n) => n.matchId)}::uuid[])
    `;
  }

  return Response.json({
    success: true,
    type: "morning_reminders",
    ...results,
    message: `Sent ${results.sent} reminders, skipped ${results.skipped}`,
  });
}

async function handleMiddayCheck(appUrl) {
  const results = { alerted: 0, errors: [] };

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
    JOIN teams home_team ON home_team.id = m.home_team_id
    JOIN teams away_team ON away_team.id = m.away_team_id
    WHERE m.status = 'scheduled'
    AND m.match_date = CURRENT_DATE
  `;

  if (todayMatches.length === 0) {
    return Response.json({
      success: true,
      type: "midday_check",
      ...results,
      message: `Sent 0 admin alerts`,
    });
  }

  // Collect all (match_id, team_id) pairs for today's matches.
  const pairMatchIds = [];
  const pairTeamIds = [];
  for (const match of todayMatches) {
    for (const side of ["home", "away"]) {
      const teamId = match[`${side}_team_id`];
      if (!teamId) continue;
      pairMatchIds.push(match.match_id);
      pairTeamIds.push(teamId);
    }
  }

  // Single bulk read — which teams have already responded?
  const respondedSet = new Set();
  if (pairMatchIds.length > 0) {
    const respondedRows = await sql`
      SELECT match_id, team_id
      FROM availability_responses
      WHERE (match_id, team_id) IN (
        SELECT * FROM unnest(
          ${pairMatchIds}::uuid[],
          ${pairTeamIds}::uuid[]
        )
      )
      AND responded_at IS NOT NULL
    `;
    for (const row of respondedRows) {
      respondedSet.add(`${row.match_id}-${row.team_id}`);
    }
  }

  // Determine which matches have unconfirmed teams (in memory, no more queries).
  const matchesWithUnconfirmed = [];
  for (const match of todayMatches) {
    const unconfirmedTeams = [];
    for (const side of ["home", "away"]) {
      const teamId = match[`${side}_team_id`];
      if (!teamId) continue;
      if (!respondedSet.has(`${match.match_id}-${teamId}`)) {
        unconfirmedTeams.push(match[`${side}_team_name`]);
      }
    }
    if (unconfirmedTeams.length > 0) {
      matchesWithUnconfirmed.push({ match, unconfirmedTeams });
    }
  }

  if (matchesWithUnconfirmed.length === 0) {
    return Response.json({
      success: true,
      type: "midday_check",
      ...results,
      message: `Sent 0 admin alerts`,
    });
  }

  // Single bulk read for all venue admins across affected matches — one query.
  const venueIds = [
    ...new Set(matchesWithUnconfirmed.map(({ match }) => match.venue_id)),
  ];
  const adminRows = await sql`
    SELECT id, email, name, venue_id FROM auth_users
    WHERE venue_id = ANY(${venueIds}::uuid[])
    AND role IN ('venue_admin', 'super_admin')
  `;
  const adminsByVenue = new Map();
  for (const admin of adminRows) {
    if (!adminsByVenue.has(admin.venue_id)) adminsByVenue.set(admin.venue_id, []);
    adminsByVenue.get(admin.venue_id).push(admin);
  }

  // Send emails and collect notifications for a single bulk insert at the end.
  const pendingNotifications = [];

  for (const { match, unconfirmedTeams } of matchesWithUnconfirmed) {
    const matchDate = new Date(match.match_date).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const matchAdmins = adminsByVenue.get(match.venue_id) ?? [];

    for (const admin of matchAdmins) {
      const notifMessage = `${unconfirmedTeams.join(" and ")} have not confirmed availability for their ${match.time_slot} match today (${match.home_team_name} vs ${match.away_team_name}). Please contact them directly.`;

      // Always queue the notification regardless of email outcome — mirrors original behaviour.
      pendingNotifications.push({
        userId: admin.id,
        message: notifMessage,
        matchId: match.match_id,
      });

      if (admin.email) {
        try {
          await sendEmail({
            to: admin.email,
            subject: `⚠️ Unconfirmed Teams — ${match.home_team_name} vs ${match.away_team_name} — TODAY`,
            html: unconfirmedAlertEmail({
              adminName: admin.name,
              unconfirmedTeams,
              homeTeamName: match.home_team_name,
              awayTeamName: match.away_team_name,
              matchDate,
              timeSlot: match.time_slot,
              fieldNumber: match.field_number,
            }),
            text: `URGENT: ${unconfirmedTeams.join(" and ")} have not confirmed for today's match (${match.home_team_name} vs ${match.away_team_name} at ${match.time_slot}). Please contact them immediately.`,
          });
          results.alerted++;
        } catch (err) {
          console.error(`Midday alert error for match ${match.match_id}:`, err);
          results.errors.push({ matchId: match.match_id, error: err.message });
        }
      } else {
        results.alerted++;
      }
    }
  }

  // Bulk INSERT all admin notifications — one query regardless of count.
  if (pendingNotifications.length > 0) {
    await sql`
      INSERT INTO notifications (user_id, type, title, message, match_id)
      SELECT
        unnest(${pendingNotifications.map((n) => n.userId)}::uuid[]),
        unnest(${pendingNotifications.map(() => "unconfirmed_alert")}::text[]),
        unnest(${pendingNotifications.map(() => "⚠️ Unconfirmed Teams — Action Required")}::text[]),
        unnest(${pendingNotifications.map((n) => n.message)}::text[]),
        unnest(${pendingNotifications.map((n) => n.matchId)}::uuid[])
    `;
  }

  return Response.json({
    success: true,
    type: "midday_check",
    ...results,
    message: `Sent ${results.alerted} admin alerts`,
  });
}
