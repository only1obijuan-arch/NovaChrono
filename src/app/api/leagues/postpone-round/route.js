import { escapeHtml } from "@/utils/escape-html";
import sql, { withTransaction } from "@/app/api/utils/sql";
import { requireRole } from "@/app/api/utils/auth";
import { canAdministerVenue } from "@/app/api/utils/ownership";
import {
  fixtureScheduleKey,
  lockFixtureSchedule,
  lockRefereeSchedule,
  refereeScheduleKey,
} from "@/app/api/matches/scheduling";
import { addDaysToLocalDate, formatLocalFixtureDate } from "@/utils/scheduling";
import { sendEmail } from "@/app/api/utils/send-email";
import { sendPush } from "@/app/api/utils/send-push";
import { rateLimit } from "@/app/api/utils/rate-limit";

export async function POST(request) {
  try {
    const user = await requireRole(request, "venue_admin", "org_admin", "super_admin");
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await rateLimit(`alert:${user.id}`, { max: 10, windowMinutes: 60 });
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

    const operation = await withTransaction(async (txSql) => {
      const candidateIds = await txSql`
        SELECT id
        FROM matches
        WHERE league_id = ${league_id}
          AND round_number >= ${round_number}
          AND status = 'scheduled'
        ORDER BY id
      `;
      const matches = [];
      for (const candidate of candidateIds) {
        const [match] = await txSql`
          SELECT id,
                 to_char(nova_planned_date(match_date), 'YYYY-MM-DD') AS match_date,
                 time_slot, field_number, referee_id
          FROM matches
          WHERE id = ${candidate.id}
            AND league_id = ${league_id}
            AND round_number >= ${round_number}
            AND status = 'scheduled'
          FOR UPDATE
        `;
        if (match) matches.push(match);
      }
      if (matches.length === 0) {
        return { response: Response.json({ error: "No scheduled matches found for this round" }, { status: 404 }) };
      }

      const [league] = await txSql`
        SELECT l.*, v.organization_id
        FROM leagues l
        JOIN venues v ON v.id = l.venue_id
        WHERE l.id = ${league_id}
        FOR SHARE OF l
      `;
      const [actor] = await txSql`
        SELECT id, role, venue_id, organization_id
        FROM auth_users
        WHERE id = ${user.id}
        FOR SHARE
      `;
      if (!league || !actor || !["venue_admin", "org_admin", "super_admin"].includes(actor.role)
        || !canAdministerVenue(actor, league.venue_id, league.organization_id)) {
        return { response: Response.json({ error: "Forbidden" }, { status: 403 }) };
      }

      const currentScope = await txSql`
        SELECT id
        FROM matches
        WHERE league_id = ${league_id}
          AND round_number >= ${round_number}
          AND status = 'scheduled'
        ORDER BY id
      `;
      if (currentScope.length !== matches.length
        || currentScope.some((match, index) => match.id !== matches[index].id)) {
        return { response: Response.json({ error: "Round schedule changed during rescheduling; retry the operation" }, { status: 409 }) };
      }

      const movingIds = matches.map((match) => match.id);
      const planned = matches.map((match) => ({
        ...match,
        venueId: league.venue_id,
        fieldNumber: match.field_number,
        matchDate: addDaysToLocalDate(match.match_date, 7),
        timeSlot: match.time_slot,
      }));
      const fixtureClaims = planned.map((schedule) => ({
        key: fixtureScheduleKey(schedule),
        schedule,
      }));
      const refereeClaims = planned.filter((schedule) => schedule.referee_id).map((schedule) => ({
        key: refereeScheduleKey({ refereeId: schedule.referee_id, matchDate: schedule.matchDate, timeSlot: schedule.timeSlot }),
        schedule: { refereeId: schedule.referee_id, matchDate: schedule.matchDate, timeSlot: schedule.timeSlot },
      }));
      if (new Set(fixtureClaims.map((claim) => claim.key)).size !== fixtureClaims.length
        || new Set(refereeClaims.map((claim) => claim.key)).size !== refereeClaims.length) {
        return { response: Response.json({ error: "The postponed round contains duplicate active schedule claims" }, { status: 409 }) };
      }

      const allClaims = [
        ...fixtureClaims.map((claim) => ({ ...claim, kind: "fixture" })),
        ...refereeClaims.map((claim) => ({ ...claim, kind: "referee" })),
      ].sort((left, right) => left.key.localeCompare(right.key));
      for (const claim of allClaims) {
        if (claim.kind === "fixture") await lockFixtureSchedule(txSql, claim.schedule);
        else await lockRefereeSchedule(txSql, claim.schedule);
      }

      for (const { schedule } of fixtureClaims) {
        const [conflict] = await txSql`
          SELECT m.id
          FROM matches m
          JOIN leagues l ON l.id = m.league_id
          WHERE l.venue_id = ${league.venue_id}
            AND m.field_number = ${schedule.fieldNumber}
            AND nova_planned_date(m.match_date) = ${schedule.matchDate}::date
            AND m.time_slot = ${schedule.timeSlot}
            AND m.status IN ('scheduled', 'live')
            AND m.id <> ALL(${movingIds}::uuid[])
          LIMIT 1
        `;
        if (conflict) {
          return { response: Response.json({ error: "A postponed round would collide with an existing active fixture" }, { status: 409 }) };
        }
      }
      for (const { schedule } of refereeClaims) {
        const [conflict] = await txSql`
          SELECT id
          FROM matches
          WHERE referee_id = ${schedule.refereeId}
            AND nova_planned_date(match_date) = ${schedule.matchDate}::date
            AND time_slot = ${schedule.timeSlot}
            AND status IN ('scheduled', 'live')
            AND id <> ALL(${movingIds}::uuid[])
          LIMIT 1
        `;
        if (conflict) {
          return { response: Response.json({ error: "A postponed round would double-book a retained referee" }, { status: 409 }) };
        }
      }

      const updatedMatches = await txSql`
        UPDATE matches
        SET match_date = match_date + INTERVAL '7 days'
        WHERE id = ANY(${movingIds}::uuid[])
        RETURNING id,
                  to_char(nova_planned_date(match_date), 'YYYY-MM-DD') AS match_date,
                  time_slot, field_number
      `;
      await txSql`
        INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value)
        VALUES (
          ${actor.id},
          ${league_id},
          'POSTPONE_ROUND',
          ${JSON.stringify({ round_number, matches })},
          ${JSON.stringify({ round_number, matches: planned.map(({ id, matchDate, timeSlot, fieldNumber }) => ({ id, match_date: matchDate, time_slot: timeSlot, field_number: fieldNumber })) })}
        )
      `;
      return { league, updatedMatches };
    });

    if (operation.response) return operation.response;
    const { league, updatedMatches } = operation;

    const captains = await sql`
      SELECT DISTINCT au.id, au.email, au.name, au.push_token
      FROM teams t
      JOIN league_slots ls ON t.slot_id = ls.id
      JOIN auth_users au ON t.captain_user_id = au.id
      WHERE ls.league_id = ${league_id} AND t.status = 'active'
    `;

    const newDate = formatLocalFixtureDate(updatedMatches[0].match_date, "en-GB");

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
