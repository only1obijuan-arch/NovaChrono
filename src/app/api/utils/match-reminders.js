import { randomBytes, randomUUID } from "crypto";
import { withTransaction, sql } from "@/app/api/utils/db";
import { sendEmail } from "@/app/api/utils/send-email";
import { sendPush } from "@/app/api/utils/send-push";
import { canAdministerVenue } from "@/app/api/utils/ownership";
import { matchReminderEmail } from "@/emails/matchReminderEmail";
import { unconfirmedAlertEmail } from "@/emails/unconfirmedAlertEmail";
import { NOTIFICATION_TYPES } from "@/constants/notification-types";

const CLAIM_STALE_MINUTES = 15;
const AUTOMATIC_CADENCE_HOURS = 20;
const MAX_AUTOMATIC_CANDIDATES = 100;
const TIME_SLOT_RE = /^([01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$/;

function dateValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameInstant(left, right) {
  const a = dateValue(left);
  const b = dateValue(right);
  return a && b && a.getTime() === b.getTime();
}

function urgency(daysUntil, automatic) {
  if (!automatic) return { color: "#00F5D4", label: "MATCH REMINDER" };
  if (daysUntil === 1) return { color: "#FF00CC", label: "⚠️ TOMORROW" };
  if (daysUntil === 2) return { color: "#FFD700", label: "📅 IN 2 DAYS" };
  return { color: "#00F5D4", label: "📅 IN 3 DAYS" };
}

function skipped(reason) {
  return { status: "skipped", reason };
}

export async function findAutomaticReminderCandidates() {
  return sql`
    SELECT m.id AS match_id, participant.team_id, participant.side
    FROM matches m
    JOIN leagues l ON l.id = m.league_id
    JOIN teams home_team ON home_team.id = m.home_team_id
    JOIN teams away_team ON away_team.id = m.away_team_id
    CROSS JOIN LATERAL (
      VALUES (m.home_team_id, 'home'), (m.away_team_id, 'away')
    ) AS participant(team_id, side)
    JOIN teams target_team ON target_team.id = participant.team_id
    JOIN auth_users captain ON captain.id = target_team.captain_user_id
    LEFT JOIN availability_responses ar
      ON ar.match_id = m.id AND ar.team_id = participant.team_id
    WHERE m.status = 'scheduled'
      AND l.status = 'active'
      AND home_team.status = 'active'
      AND away_team.status = 'active'
      AND target_team.status = 'active'
      AND captain.email IS NOT NULL
      AND btrim(captain.email) <> ''
      AND ar.responded_at IS NULL
      AND nova_planned_date(m.match_date) BETWEEN
        (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Johannesburg')::date + 1
        AND (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Johannesburg')::date + 3
    ORDER BY nova_planned_date(m.match_date), m.time_slot, m.id, participant.team_id
    LIMIT ${MAX_AUTOMATIC_CANDIDATES}
  `;
}

export async function findCurrentMatchTeams(matchId) {
  const [match] = await sql`
    SELECT home_team_id, away_team_id
    FROM matches
    WHERE id = ${matchId}
  `;
  return match ? [
    { teamId: match.home_team_id, side: "home" },
    { teamId: match.away_team_id, side: "away" },
  ] : null;
}

async function claimReminder({
  matchId,
  teamId,
  side,
  automatic,
  actorId,
  attemptStartedAt,
}) {
  return withTransaction(async (txSql) => {
    const [match] = await txSql`
      SELECT
        m.id,
        m.status,
        m.home_team_id,
        m.away_team_id,
        m.time_slot,
        m.field_number,
        l.id AS league_id,
        l.status AS league_status,
        l.venue_id,
        v.organization_id,
        CASE
          WHEN m.time_slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
          THEN (nova_planned_date(m.match_date) + m.time_slot::time)
            AT TIME ZONE 'Africa/Johannesburg'
          ELSE NULL
        END AS match_starts_at,
        to_char(nova_planned_date(m.match_date), 'FMDay, DD FMMonth YYYY') AS match_date_label,
        nova_planned_date(m.match_date)
          - (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Johannesburg')::date AS days_until
      FROM matches m
      JOIN leagues l ON l.id = m.league_id
      JOIN venues v ON v.id = l.venue_id
      WHERE m.id = ${matchId}
      FOR UPDATE OF m
    `;

    if (!match) return skipped("match_not_found");
    if (actorId) {
      const [actor] = await txSql`
        SELECT id, role, venue_id, organization_id
        FROM auth_users
        WHERE id = ${actorId}
        FOR SHARE
      `;
      if (!actor) return skipped("unauthorized");
      if (!canAdministerVenue(actor, match.venue_id, match.organization_id)) {
        return skipped("forbidden");
      }
    }
    if (match.league_status !== "active") return skipped("league_not_active");
    if (match.status !== "scheduled") return skipped("match_not_scheduled");
    if (!TIME_SLOT_RE.test(match.time_slot) || !match.match_starts_at) {
      return skipped("invalid_schedule");
    }
    if (dateValue(match.match_starts_at) <= new Date()) return skipped("match_started");
    const currentTeamId = side === "home"
      ? match.home_team_id
      : side === "away"
        ? match.away_team_id
        : teamId;
    if (![match.home_team_id, match.away_team_id].includes(currentTeamId)) {
      return skipped("team_not_current_participant");
    }

    const teams = await txSql`
      SELECT
        t.id,
        t.name,
        t.status,
        t.captain_user_id,
        captain.name AS captain_name,
        captain.email AS captain_email,
        captain.push_token AS captain_push_token
      FROM teams t
      LEFT JOIN auth_users captain ON captain.id = t.captain_user_id
      WHERE t.id IN (${match.home_team_id}, ${match.away_team_id})
      ORDER BY t.id
      FOR SHARE OF t
    `;
    if (teams.length !== 2 || teams.some((team) => team.status !== "active")) {
      return skipped("inactive_participant");
    }
    const team = teams.find((row) => row.id === currentTeamId);
    const opponent = teams.find((row) => row.id !== currentTeamId);
    if (!team?.captain_user_id) return skipped("captain_missing");
    if (!team.captain_email?.trim()) return skipped("captain_email_missing");

    const [existing] = await txSql`
      SELECT id, token, response, responded_at, expires_at,
             reminder_count, last_reminder_at,
             delivery_claim_id, delivery_claimed_at
      FROM availability_responses
      WHERE match_id = ${matchId} AND team_id = ${currentTeamId}
      FOR UPDATE
    `;
    if (existing?.responded_at || existing?.response) return skipped("already_responded");
    if (!automatic && existing?.last_reminder_at) {
      const [overlap] = await txSql`
        SELECT ${existing.last_reminder_at}::timestamptz
          >= ${attemptStartedAt}::timestamptz AS completed_during_attempt
      `;
      if (overlap.completed_during_attempt) {
        return skipped("delivery_completed_during_attempt");
      }
    }
    if (automatic && existing?.last_reminder_at) {
      const [cadence] = await txSql`
        SELECT ${existing.last_reminder_at}::timestamptz
          > CURRENT_TIMESTAMP - (${AUTOMATIC_CADENCE_HOURS} * INTERVAL '1 hour') AS too_soon
      `;
      if (cadence.too_soon) return skipped("automatic_cadence");
    }
    if (existing?.delivery_claimed_at) {
      const [claimState] = await txSql`
        SELECT ${existing.delivery_claimed_at}::timestamptz
          > CURRENT_TIMESTAMP - (${CLAIM_STALE_MINUTES} * INTERVAL '1 minute') AS live
      `;
      if (claimState.live) return skipped("delivery_claimed");
    }

    const scheduleUnchanged = existing?.token
      && sameInstant(existing.expires_at, match.match_starts_at);
    const token = scheduleUnchanged
      ? existing.token
      : randomBytes(32).toString("hex");
    const claimId = scheduleUnchanged && existing?.delivery_claim_id
      ? existing.delivery_claim_id
      : randomUUID();

    let availabilityId;
    if (existing) {
      const [updated] = await txSql`
        UPDATE availability_responses
        SET token = ${token},
            expires_at = ${match.match_starts_at},
            delivery_claim_id = ${claimId},
            delivery_claimed_at = CURRENT_TIMESTAMP
        WHERE id = ${existing.id}
        RETURNING id
      `;
      availabilityId = updated.id;
    } else {
      const [inserted] = await txSql`
        INSERT INTO availability_responses (
          match_id, team_id, token, expires_at,
          reminder_count, delivery_claim_id, delivery_claimed_at
        )
        VALUES (
          ${matchId}, ${currentTeamId}, ${token}, ${match.match_starts_at},
          0, ${claimId}, CURRENT_TIMESTAMP
        )
        RETURNING id
      `;
      availabilityId = inserted.id;
    }

    return {
      status: "claimed",
      claimId,
      availabilityId,
      token,
      matchId,
      teamId: currentTeamId,
      teamName: team.name,
      opponentName: opponent.name,
      captainId: team.captain_user_id,
      captainName: team.captain_name,
      captainEmail: team.captain_email,
      captainPushToken: team.captain_push_token,
      matchDate: match.match_date_label,
      timeSlot: match.time_slot,
      fieldNumber: match.field_number,
      daysUntil: Number(match.days_until),
      automatic,
    };
  });
}

async function releaseClaim(availabilityId, claimId) {
  await sql`
    UPDATE availability_responses
    SET delivery_claimed_at = NULL
    WHERE id = ${availabilityId}
      AND delivery_claim_id = ${claimId}
      AND responded_at IS NULL
  `;
}

async function finalizeClaim(claim) {
  return withTransaction(async (txSql) => {
    const [match] = await txSql`
      SELECT id
      FROM matches
      WHERE id = ${claim.matchId}
      FOR UPDATE
    `;
    if (!match) return false;

    const [availability] = await txSql`
      SELECT id, responded_at, delivery_claim_id
      FROM availability_responses
      WHERE id = ${claim.availabilityId}
      FOR UPDATE
    `;
    if (!availability
        || availability.responded_at
        || availability.delivery_claim_id !== claim.claimId) {
      return false;
    }

    const dedupeKey = `match-reminder/${claim.claimId}`;
    await txSql`
      INSERT INTO notifications (
        user_id, type, title, message, match_id, dedupe_key
      )
      VALUES (
        ${claim.captainId},
        ${NOTIFICATION_TYPES.MATCH_REMINDER},
        '⚽ Upcoming Match — Action Required',
        ${`Your match against ${claim.opponentName} is on ${claim.matchDate} at ${claim.timeSlot}. Please confirm your availability.`},
        ${claim.matchId},
        ${dedupeKey}
      )
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    `;
    const [updated] = await txSql`
      UPDATE availability_responses
      SET reminder_count = reminder_count + 1,
          last_reminder_at = clock_timestamp(),
          delivery_claim_id = NULL,
          delivery_claimed_at = NULL
      WHERE id = ${claim.availabilityId}
        AND delivery_claim_id = ${claim.claimId}
        AND responded_at IS NULL
      RETURNING id
    `;
    return Boolean(updated);
  });
}

export async function sendReminderForTeam({
  matchId,
  teamId,
  side = null,
  automatic = false,
  actorId = null,
  appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
}) {
  const attemptStartedAt = new Date();
  const claim = await claimReminder({
    matchId,
    teamId,
    side,
    automatic,
    actorId,
    attemptStartedAt,
  });
  if (claim.status !== "claimed") return claim;

  const baseUrl = appUrl.replace(/\/$/, "");
  const token = encodeURIComponent(claim.token);
  const confirmUrl = `${baseUrl}/api/auth/confirm-availability?token=${token}&response=yes`;
  const declineUrl = `${baseUrl}/api/auth/confirm-availability?token=${token}&response=no`;
  const { color, label } = urgency(claim.daysUntil, claim.automatic);

  try {
    await sendEmail({
      to: claim.captainEmail,
      subject: `${label} — ${claim.teamName} vs ${claim.opponentName} — Confirm Availability`,
      html: matchReminderEmail({
        captainName: claim.captainName,
        teamName: claim.teamName,
        opponentName: claim.opponentName,
        matchDate: claim.matchDate,
        timeSlot: claim.timeSlot,
        fieldNumber: claim.fieldNumber,
        urgencyColor: color,
        urgencyLabel: label,
        confirmUrl,
        declineUrl,
      }),
      text: `Match reminder: ${claim.teamName} vs ${claim.opponentName} on ${claim.matchDate} at ${claim.timeSlot}. Confirm: ${confirmUrl} | Decline: ${declineUrl}`,
      idempotencyKey: `match-reminder/${claim.claimId}`,
    });
  } catch (error) {
    await releaseClaim(claim.availabilityId, claim.claimId);
    return {
      status: "email_failed",
      reason: error?.code || "EMAIL_DELIVERY_FAILED",
      retryable: Boolean(error?.retryable),
    };
  }

  let push = null;
  if (claim.captainPushToken) {
    try {
      push = await sendPush(
        claim.captainPushToken,
        `${label} — Are you in?`,
        `${claim.teamName} vs ${claim.opponentName} — ${claim.matchDate} at ${claim.timeSlot}.`,
        { type: NOTIFICATION_TYPES.MATCH_REMINDER, matchId: claim.matchId },
      );
    } catch {
      push = {
        status: "provider_error",
        accepted: false,
        retryable: true,
        message: "The optional push attempt failed",
      };
    }
  }

  const finalized = await finalizeClaim(claim);
  return { status: "sent", finalized, push };
}

async function claimMiddayAlert(candidate) {
  return withTransaction(async (txSql) => {
    const [match] = await txSql`
      SELECT m.id, m.status, m.home_team_id, m.away_team_id,
             m.time_slot, m.field_number,
             l.status AS league_status, l.venue_id,
             to_char(nova_planned_date(m.match_date), 'FMDay, DD FMMonth YYYY') AS match_date_label,
             nova_planned_date(m.match_date) AS match_local_date
      FROM matches m
      JOIN leagues l ON l.id = m.league_id
      WHERE m.id = ${candidate.match_id}
      FOR UPDATE OF m
    `;
    if (!match || match.status !== "scheduled" || match.league_status !== "active") return null;

    const teams = await txSql`
      SELECT t.id, t.name, t.status
      FROM teams t
      WHERE t.id IN (${match.home_team_id}, ${match.away_team_id})
      ORDER BY t.id
      FOR SHARE
    `;
    if (teams.length !== 2 || teams.some((team) => team.status !== "active")) return null;

    const responses = await txSql`
      SELECT team_id
      FROM availability_responses
      WHERE match_id = ${match.id} AND responded_at IS NOT NULL
    `;
    const responded = new Set(responses.map((row) => row.team_id));
    const unconfirmedTeams = teams.filter((team) => !responded.has(team.id)).map((team) => team.name);
    if (unconfirmedTeams.length === 0) return null;
    const homeTeamName = teams.find((team) => team.id === match.home_team_id)?.name;
    const awayTeamName = teams.find((team) => team.id === match.away_team_id)?.name;
    if (!homeTeamName || !awayTeamName) return null;

    const [admin] = await txSql`
      SELECT id, email, name
      FROM auth_users
      WHERE id = ${candidate.admin_id}
        AND venue_id = ${match.venue_id}
        AND role IN ('venue_admin', 'super_admin')
      FOR SHARE
    `;
    if (!admin) return null;

    const dedupeKey = `unconfirmed/${match.id}/${match.match_local_date}/${admin.id}`;
    const message = `${unconfirmedTeams.join(" and ")} have not confirmed availability for their ${match.time_slot} match today (${homeTeamName} vs ${awayTeamName}). Please contact them directly.`;
    const [inserted] = await txSql`
      INSERT INTO notifications (user_id, type, title, message, match_id, dedupe_key)
      VALUES (
        ${admin.id}, ${NOTIFICATION_TYPES.UNCONFIRMED_ALERT},
        '⚠️ Unconfirmed Teams — Action Required', ${message}, ${match.id}, ${dedupeKey}
      )
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      RETURNING id
    `;
    if (!inserted) return null;
    return {
      ...candidate,
      adminEmail: admin.email,
      adminName: admin.name,
      unconfirmedTeams,
      homeTeamName,
      awayTeamName,
      matchDate: match.match_date_label,
      timeSlot: match.time_slot,
      fieldNumber: match.field_number,
      dedupeKey,
    };
  });
}

export async function sendMiddayUnconfirmedAlerts() {
  const candidates = await sql`
    SELECT m.id AS match_id, m.time_slot, m.field_number,
           home_team.name AS home_team_name,
           away_team.name AS away_team_name,
           admin.id AS admin_id
    FROM matches m
    JOIN leagues l ON l.id = m.league_id
    JOIN teams home_team ON home_team.id = m.home_team_id
    JOIN teams away_team ON away_team.id = m.away_team_id
    JOIN auth_users admin
      ON admin.venue_id = l.venue_id
     AND admin.role IN ('venue_admin', 'super_admin')
    WHERE m.status = 'scheduled'
      AND l.status = 'active'
      AND home_team.status = 'active'
      AND away_team.status = 'active'
      AND nova_planned_date(m.match_date)
        = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Johannesburg')::date
    ORDER BY m.id, admin.id
    LIMIT ${MAX_AUTOMATIC_CANDIDATES}
  `;
  const result = { alerted: 0, skipped: 0, errors: [] };
  for (const candidate of candidates) {
    const alert = await claimMiddayAlert(candidate);
    if (!alert) {
      result.skipped += 1;
      continue;
    }
    if (!alert.adminEmail?.trim()) {
      result.alerted += 1;
      continue;
    }
    try {
      await sendEmail({
        to: alert.adminEmail,
        subject: `⚠️ Unconfirmed Teams — ${alert.homeTeamName} vs ${alert.awayTeamName} — TODAY`,
        html: unconfirmedAlertEmail({
          adminName: alert.adminName,
          unconfirmedTeams: alert.unconfirmedTeams,
          homeTeamName: alert.homeTeamName,
          awayTeamName: alert.awayTeamName,
          matchDate: alert.matchDate,
          timeSlot: alert.timeSlot,
          fieldNumber: alert.fieldNumber,
        }),
        text: `URGENT: ${alert.unconfirmedTeams.join(" and ")} have not confirmed for today's match (${alert.homeTeamName} vs ${alert.awayTeamName} at ${alert.timeSlot}).`,
        idempotencyKey: alert.dedupeKey,
      });
      result.alerted += 1;
    } catch (error) {
      result.errors.push({ matchId: alert.match_id, code: error?.code || "EMAIL_DELIVERY_FAILED" });
    }
  }
  return result;
}
