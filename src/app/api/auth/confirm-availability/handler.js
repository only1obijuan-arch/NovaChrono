import { withTransaction, sql } from "@/app/api/utils/db";
import { sendEmail } from "@/app/api/utils/send-email";
import { NOTIFICATION_TYPES } from "@/constants/notification-types";
import { escapeHtml } from "@/utils/escape-html";

const TOKEN_RE = /^[0-9a-f]{64}$/i;
const RESPONSES = new Set(["yes", "no"]);
const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

function pageResponse(html, status = 200) {
  return new Response(html, { status, headers: PAGE_HEADERS });
}

function isActionable(record) {
  return record
    && !record.responded_at
    && record.response == null
    && record.match_status === "scheduled"
    && record.league_status === "active"
    && record.team_status === "active"
    && record.is_current_participant
    && record.expiry_matches_schedule
    && record.before_expiry
    && record.before_match_start;
}

async function readPayload(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return request.json();
  const form = await request.formData();
  return { token: form.get("token"), response: form.get("response") };
}

async function findPreview(token) {
  const [record] = await sql`
    SELECT
      ar.id,
      ar.response,
      ar.responded_at,
      ar.expires_at,
      m.id AS match_id,
      m.status AS match_status,
      m.time_slot,
      m.home_team_id,
      m.away_team_id,
      l.status AS league_status,
      t.id AS team_id,
      t.name AS team_name,
      t.status AS team_status,
      CASE WHEN t.id = m.home_team_id THEN away_team.name ELSE home_team.name END AS opponent_name,
      to_char(nova_planned_date(m.match_date), 'FMDay, DD FMMonth YYYY') AS match_date_label,
      t.id IN (m.home_team_id, m.away_team_id) AS is_current_participant,
      ar.expires_at IS NOT DISTINCT FROM (
        CASE WHEN m.time_slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
          THEN (nova_planned_date(m.match_date) + m.time_slot::time)
            AT TIME ZONE 'Africa/Johannesburg'
          ELSE NULL
        END
      ) AS expiry_matches_schedule,
      ar.expires_at > CURRENT_TIMESTAMP AS before_expiry,
      CASE WHEN m.time_slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
        THEN ((nova_planned_date(m.match_date) + m.time_slot::time)
          AT TIME ZONE 'Africa/Johannesburg') > CURRENT_TIMESTAMP
        ELSE FALSE
      END AS before_match_start
    FROM availability_responses ar
    JOIN matches m ON m.id = ar.match_id
    JOIN leagues l ON l.id = m.league_id
    JOIN teams t ON t.id = ar.team_id
    JOIN teams home_team ON home_team.id = m.home_team_id
    JOIN teams away_team ON away_team.id = m.away_team_id
    WHERE ar.token = ${token}
  `;
  return record ?? null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const response = searchParams.get("response");
    if (!TOKEN_RE.test(token || "") || !RESPONSES.has(response)) {
      return pageResponse(buildResultPage(
        "Invalid link",
        "This availability link is malformed or incomplete.",
        false,
      ), 400);
    }

    const record = await findPreview(token);
    if (!isActionable(record)) {
      return pageResponse(buildResultPage(
        "Link unavailable",
        "This link is expired, already used, or no longer matches an active scheduled fixture.",
        false,
      ), 410);
    }

    return pageResponse(buildPreviewPage(record, token, response));
  } catch (error) {
    console.error("Availability preview failed", { code: error?.code || "UNKNOWN" });
    return pageResponse(buildResultPage(
      "Unable to load confirmation",
      "Please contact your league administrator directly.",
      false,
    ), 500);
  }
}

async function consumeAvailability(token, response) {
  const [scope] = await sql`
    SELECT match_id
    FROM availability_responses
    WHERE token = ${token}
  `;
  if (!scope) return null;

  return withTransaction(async (txSql) => {
    const [match] = await txSql`
      SELECT
        m.id,
        m.status AS match_status,
        m.home_team_id,
        m.away_team_id,
        m.time_slot,
        l.status AS league_status,
        l.venue_id,
        home_team.name AS home_team_name,
        away_team.name AS away_team_name,
        to_char(nova_planned_date(m.match_date), 'FMDay, DD FMMonth YYYY') AS match_date_label,
        CASE WHEN m.time_slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
          THEN (nova_planned_date(m.match_date) + m.time_slot::time)
            AT TIME ZONE 'Africa/Johannesburg'
          ELSE NULL
        END AS match_starts_at
      FROM matches m
      JOIN leagues l ON l.id = m.league_id
      JOIN teams home_team ON home_team.id = m.home_team_id
      JOIN teams away_team ON away_team.id = m.away_team_id
      WHERE m.id = ${scope.match_id}
      FOR UPDATE OF m
    `;
    if (!match) return null;

    const [availability] = await txSql`
      SELECT id, match_id, team_id, token, response, responded_at, expires_at
      FROM availability_responses
      WHERE token = ${token} AND match_id = ${match.id}
      FOR UPDATE
    `;
    if (!availability || availability.responded_at || availability.response != null) return null;

    const [team] = await txSql`
      SELECT id, name, status
      FROM teams
      WHERE id = ${availability.team_id}
      FOR SHARE
    `;
    const matchStartsAt = match.match_starts_at ? new Date(match.match_starts_at) : null;
    const expiresAt = availability.expires_at ? new Date(availability.expires_at) : null;
    if (match.match_status !== "scheduled"
        || match.league_status !== "active"
        || !team
        || team.status !== "active"
        || ![match.home_team_id, match.away_team_id].includes(team.id)
        || !matchStartsAt
        || !expiresAt
        || Number.isNaN(matchStartsAt.getTime())
        || Number.isNaN(expiresAt.getTime())
        || expiresAt.getTime() !== matchStartsAt.getTime()
        || expiresAt <= new Date()
        || matchStartsAt <= new Date()) {
      return null;
    }

    const [consumed] = await txSql`
      UPDATE availability_responses
      SET response = ${response},
          responded_at = CURRENT_TIMESTAMP,
          token = NULL,
          delivery_claim_id = NULL,
          delivery_claimed_at = NULL
      WHERE id = ${availability.id}
        AND token = ${token}
        AND responded_at IS NULL
        AND response IS NULL
      RETURNING id
    `;
    if (!consumed) return null;

    const admins = await txSql`
      SELECT id, name, email
      FROM auth_users
      WHERE venue_id = ${match.venue_id}
        AND role IN ('venue_admin', 'super_admin')
      ORDER BY id
      FOR SHARE
    `;
    const type = response === "yes"
      ? NOTIFICATION_TYPES.AVAILABILITY_CONFIRMED
      : NOTIFICATION_TYPES.AVAILABILITY_DECLINED;
    const title = response === "yes" ? "✅ Team Confirmed" : "❌ Team Unavailable";
    const message = `${team.name} has ${response === "yes" ? "confirmed" : "declined"} availability for their match on ${match.match_date_label} at ${match.time_slot}.`;
    for (const admin of admins) {
      await txSql`
        INSERT INTO notifications (user_id, type, title, message, match_id, dedupe_key)
        VALUES (
          ${admin.id}, ${type}, ${title}, ${message}, ${match.id},
          ${`availability-response/${availability.id}/${admin.id}`}
        )
        ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      `;
    }

    return {
      availabilityId: availability.id,
      response,
      teamName: team.name,
      homeTeamName: match.home_team_name,
      awayTeamName: match.away_team_name,
      matchDate: match.match_date_label,
      timeSlot: match.time_slot,
      admins: admins.filter((admin) => admin.email?.trim()),
    };
  });
}

export async function POST(request) {
  try {
    const payload = await readPayload(request);
    const token = typeof payload?.token === "string" ? payload.token : "";
    const response = typeof payload?.response === "string" ? payload.response : "";
    if (!TOKEN_RE.test(token) || !RESPONSES.has(response)) {
      return pageResponse(buildResultPage(
        "Invalid response",
        "This availability response is malformed.",
        false,
      ), 400);
    }

    const consumed = await consumeAvailability(token, response);
    if (!consumed) {
      return pageResponse(buildResultPage(
        "Link unavailable",
        "This link is expired, already used, or no longer matches an active scheduled fixture.",
        false,
      ), 410);
    }

    let emailFailures = 0;
    for (const admin of consumed.admins) {
      try {
        await sendEmail({
          to: admin.email,
          subject: `${response === "yes" ? "✅" : "❌"} ${consumed.teamName} — Availability ${response === "yes" ? "Confirmed" : "Declined"}`,
          html: buildAdminEmail(consumed, admin.name),
          text: `${consumed.teamName} has ${response === "yes" ? "confirmed" : "declined"} availability for ${consumed.homeTeamName} vs ${consumed.awayTeamName} on ${consumed.matchDate} at ${consumed.timeSlot}.`,
          idempotencyKey: `availability-response/${consumed.availabilityId}/${admin.id}`,
        });
      } catch (error) {
        emailFailures += 1;
        console.error("Availability admin email failed", { code: error?.code || "UNKNOWN" });
      }
    }

    const action = response === "yes" ? "confirmed" : "declined";
    const deliveryNote = emailFailures > 0
      ? " Your response is safely recorded and the in-app notice was saved, but one or more administrator emails could not be delivered."
      : " Your league administrator has been notified.";
    return pageResponse(buildResultPage(
      response === "yes" ? "Availability confirmed" : "Availability declined",
      `${consumed.teamName} has ${action} availability for ${consumed.matchDate} at ${consumed.timeSlot}.${deliveryNote}`,
      true,
    ));
  } catch (error) {
    console.error("Availability response failed", { code: error?.code || "UNKNOWN" });
    return pageResponse(buildResultPage(
      "Unable to save response",
      "Please contact your league administrator directly.",
      false,
    ), 500);
  }
}

function buildPreviewPage(record, token, response) {
  const accepting = response === "yes";
  const action = accepting ? "YES — WE'RE IN" : "NO — WE CAN'T MAKE IT";
  const color = accepting ? "#00F5D4" : "#FF00CC";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Confirm availability — NovaChrono</title>${baseStyles(color)}</head>
<body><main class="card"><div class="bar"></div><p class="eyebrow">MATCH AVAILABILITY</p>
<h1>Confirm your response</h1>
<dl><dt>Team</dt><dd>${escapeHtml(record.team_name)}</dd><dt>Opponent</dt><dd>${escapeHtml(record.opponent_name)}</dd>
<dt>Date</dt><dd>${escapeHtml(record.match_date_label)}</dd><dt>Time</dt><dd>${escapeHtml(record.time_slot)}</dd></dl>
<p class="choice">Selected response: <strong>${escapeHtml(action)}</strong></p>
<form method="post" action="/api/auth/confirm-availability">
<input type="hidden" name="token" value="${escapeHtml(token)}"><input type="hidden" name="response" value="${escapeHtml(response)}">
<button type="submit">CONFIRM ${accepting ? "YES" : "NO"}</button></form>
<p class="note">Nothing changes until you press the confirmation button.</p><p class="brand">NOVACHRONO</p></main></body></html>`;
}

function buildResultPage(title, message, success) {
  const color = success ? "#00F5D4" : "#FF00CC";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — NovaChrono</title>${baseStyles(color)}</head><body><main class="card"><div class="bar"></div>
<h1>${escapeHtml(title)}</h1><p class="message">${escapeHtml(message)}</p><p class="brand">NOVACHRONO</p></main></body></html>`;
}

function baseStyles(color) {
  return `<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#091833;color:#f4f4f9;display:grid;place-items:center;padding:24px;font-family:Arial,sans-serif}.card{width:min(500px,100%);background:#0d1b2e;border:1px solid ${color}55;border-radius:12px;padding:40px;box-shadow:0 30px 80px #0008}.bar{height:3px;background:${color};margin:-40px -40px 32px}.eyebrow,.brand{font:700 11px monospace;letter-spacing:3px;color:${color}}h1{font:900 25px monospace;letter-spacing:1px;margin:0 0 24px}dl{display:grid;grid-template-columns:110px 1fr;gap:10px;background:#ffffff08;padding:18px;border-radius:8px}dt{color:#9bb0c5;font-size:13px}dd{margin:0;font-weight:700}.choice,.message{color:#bfd0df;line-height:1.6;margin:24px 0}button{width:100%;border:0;border-radius:6px;padding:17px;background:${color};color:#091833;font:900 14px monospace;letter-spacing:2px;cursor:pointer}.note{font-size:12px;color:#8297aa;text-align:center}.brand{text-align:center;margin:28px 0 0}</style>`;
}

function buildAdminEmail(record, adminName) {
  const confirmed = record.response === "yes";
  const status = confirmed ? "CONFIRMED" : "DECLINED";
  const color = confirmed ? "#00FF9C" : "#FF00CC";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#091833;font-family:Arial,sans-serif">
<div style="max-width:520px;margin:40px auto;padding:24px;background:#0D1B2E;border-top:3px solid ${color};color:#F4F4F9">
<p style="color:${color};font-family:monospace;letter-spacing:3px">AVAILABILITY ${status}</p>
<p>Hi ${escapeHtml(adminName || "Admin")},</p><p><strong>${escapeHtml(record.teamName)}</strong> has ${confirmed ? "confirmed" : "declined"} availability.</p>
<p>${escapeHtml(record.homeTeamName)} vs ${escapeHtml(record.awayTeamName)}<br>${escapeHtml(record.matchDate)} at ${escapeHtml(record.timeSlot)}</p>
</div></body></html>`;
}
