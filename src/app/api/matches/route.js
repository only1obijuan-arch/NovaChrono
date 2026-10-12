import sql, { withTransaction } from "@/app/api/utils/sql";
import { rateLimit } from "@/app/api/utils/rate-limit";
import { resolveCurrentUser } from "@/app/api/utils/auth";
import { recomputeLeagueStandings } from "@/app/api/matches/standings";
import {
  findFixtureConflict,
  findRefereeConflict,
  lockFixtureSchedule,
  lockRefereeSchedule,
  scheduleValidationError,
} from "@/app/api/matches/scheduling";
import { z } from "zod";

const RESULT_OVERRIDE_STATUSES = ["scheduled", "final"];
const uuid = () => z.string().uuid();
const correctionReason = z.string().trim().min(1).max(500);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const matchActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("START_MATCH"), matchId: uuid() }),
  z.object({
    action: z.literal("RECORD_GOAL"),
    matchId: uuid(),
    type: z.enum(["goal_home", "goal_away"]),
    opId: uuid().optional(),
    playerId: uuid().nullable().optional(),
  }),
  z.object({
    action: z.literal("DELETE_EVENT"),
    matchId: uuid(),
    eventId: uuid(),
  }),
  z.object({ action: z.literal("END_MATCH"), matchId: uuid() }),
  z.object({ action: z.literal("START_SECOND_HALF"), matchId: uuid() }),
  z.object({
    action: z.literal("CREATE_FIXTURE"),
    leagueId: uuid(),
    roundNumber: z.number().int().min(1).max(999),
    matchDate: localDate,
    timeSlot: localTime,
    fieldNumber: z.number().int().min(1).max(999),
    homeSlotId: uuid(),
    awaySlotId: uuid(),
    refereeId: uuid().nullable().optional(),
  }),
  z.object({
    action: z.literal("EDIT_FIXTURE"),
    matchId: uuid(),
    matchDate: localDate,
    timeSlot: localTime,
    fieldNumber: z.number().int().min(1).max(999),
    refereeId: uuid().nullable().optional(),
  }),
  z.object({ action: z.literal("POSTPONE_FIXTURE"), matchId: uuid() }),
  z.object({ action: z.literal("CANCEL_FIXTURE"), matchId: uuid() }),
  z.object({
    action: z.literal("ADMIN_OVERRIDE"),
    matchId: uuid(),
    homeScore: z.number().int().min(0).max(99),
    awayScore: z.number().int().min(0).max(99),
    status: z.enum(RESULT_OVERRIDE_STATUSES),
    reason: correctionReason,
  }),
  z.object({
    action: z.literal("ASSIGN_REFEREE"),
    matchId: uuid(),
    refereeId: uuid().nullable(),
  }),
  z.object({
    action: z.literal("FORFEIT_MATCH"),
    matchId: uuid(),
    winnerSide: z.enum(["home", "away"]),
    reason: z.string().trim().min(1).max(500).optional(),
  }),
]);

const WRITE_ROLES = ["referee", "venue_admin", "super_admin"];
const ADMIN_ROLES = ["venue_admin", "super_admin"];

function canAccessVenue(user, venueId) {
  return user.role === "super_admin" || (user.venue_id != null && user.venue_id === venueId);
}

async function lockMatch(txSql, matchId) {
  const [match] = await txSql`
    SELECT m.*,
           to_char(nova_planned_date(m.match_date), 'YYYY-MM-DD') AS schedule_date,
           l.venue_id AS league_venue_id,
           l.status AS league_status,
           l.fields_count,
           l.time_slots,
           l.forfeit_score_home,
           l.forfeit_score_away
    FROM matches m
    JOIN leagues l ON l.id = m.league_id
    WHERE m.id = ${matchId}
    FOR UPDATE OF m
  `;
  return match ?? null;
}

async function lockLeague(txSql, leagueId) {
  const [league] = await txSql`
    SELECT id, venue_id, status, fields_count, time_slots
    FROM leagues
    WHERE id = ${leagueId}
    FOR UPDATE
  `;
  return league ?? null;
}

async function authorizeLockedMatch(txSql, identityId, match, roles = WRITE_ROLES) {
  const [actor] = await txSql`
    SELECT id, role, venue_id, organization_id
    FROM auth_users
    WHERE id = ${identityId}
    FOR SHARE
  `;
  if (!actor) return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!roles.includes(actor.role)) {
    return { response: Response.json({ error: "Insufficient permissions" }, { status: 403 }) };
  }
  if (!canAccessVenue(actor, match.league_venue_id)) {
    return { response: Response.json({ error: "Access denied" }, { status: 403 }) };
  }
  if (actor.role === "referee" && match.referee_id !== actor.id) {
    return { response: Response.json({ error: "Not assigned to this match" }, { status: 403 }) };
  }
  return { actor };
}

async function authorizeLockedLeague(txSql, identityId, league) {
  const [actor] = await txSql`
    SELECT id, role, venue_id, organization_id
    FROM auth_users
    WHERE id = ${identityId}
    FOR SHARE
  `;
  if (!actor) return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!ADMIN_ROLES.includes(actor.role)) {
    return { response: Response.json({ error: "Insufficient permissions" }, { status: 403 }) };
  }
  if (!canAccessVenue(actor, league.venue_id)) {
    return { response: Response.json({ error: "Access denied" }, { status: 403 }) };
  }
  return { actor };
}

function matchSnapshot(match) {
  return {
    match_date: match.schedule_date,
    time_slot: match.time_slot,
    field_number: match.field_number,
    referee_id: match.referee_id,
    home_score: match.home_score,
    away_score: match.away_score,
    status: match.status,
    result_type: match.result_type,
  };
}

async function validateParticipantSlots(txSql, leagueId, homeSlotId, awaySlotId) {
  if (homeSlotId === awaySlotId) return "Home and away slots must be different";
  const slots = await txSql`
    SELECT id
    FROM league_slots
    WHERE league_id = ${leagueId}
      AND id IN (${homeSlotId}, ${awaySlotId})
    ORDER BY id
    FOR SHARE
  `;
  return slots.length === 2 ? null : "Both participant slots must belong to this league";
}

async function validateReferee(txSql, refereeId, venueId) {
  if (refereeId == null) return null;
  const [referee] = await txSql`
    SELECT id, venue_id, role
    FROM auth_users
    WHERE id = ${refereeId}
    FOR SHARE
  `;
  if (!referee || referee.role !== "referee") return { error: "Referee not found", status: 404 };
  if (referee.venue_id !== venueId) return { error: "Referee does not belong to this venue", status: 403 };
  return null;
}

async function claimFixtureSchedule(txSql, schedule, excludeMatchId = null) {
  await lockFixtureSchedule(txSql, schedule);
  return findFixtureConflict(txSql, schedule, excludeMatchId);
}

async function claimRefereeSchedule(txSql, schedule, excludeMatchId = null) {
  if (schedule.refereeId == null) return null;
  await lockRefereeSchedule(txSql, schedule);
  return findRefereeConflict(txSql, schedule, excludeMatchId);
}

export async function POST(request) {
  try {
    const user = await resolveCurrentUser(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    // Cheap fail-fast only. Every authoritative role, venue, and referee check
    // is repeated against live data after the match row is locked.
    if (!WRITE_ROLES.includes(user.role)) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const parsed = matchActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.format() }, { status: 400 });
    }
    const { action, matchId, ...data } = parsed.data;

    if (action === "CREATE_FIXTURE") {
      const {
        leagueId, roundNumber, matchDate, timeSlot, fieldNumber,
        homeSlotId, awaySlotId, refereeId = null,
      } = data;
      return await withTransaction(async (txSql) => {
        const league = await lockLeague(txSql, leagueId);
        if (!league) return Response.json({ error: "League not found" }, { status: 404 });
        const authorization = await authorizeLockedLeague(txSql, user.id, league);
        if (authorization.response) return authorization.response;
        if (league.status !== "active") {
          return Response.json({ error: "Fixtures can only be added to an active league" }, { status: 409 });
        }
        const scheduleError = scheduleValidationError({ matchDate, timeSlot, fieldNumber }, league);
        if (scheduleError) return Response.json({ error: scheduleError }, { status: 400 });
        const slotError = await validateParticipantSlots(txSql, leagueId, homeSlotId, awaySlotId);
        if (slotError) return Response.json({ error: slotError }, { status: 409 });
        const refereeError = await validateReferee(txSql, refereeId, league.venue_id);
        if (refereeError) return Response.json({ error: refereeError.error }, { status: refereeError.status });

        const schedule = { venueId: league.venue_id, fieldNumber, matchDate, timeSlot };
        if (await claimFixtureSchedule(txSql, schedule)) {
          return Response.json({ error: "Another active fixture already occupies this field and kickoff" }, { status: 409 });
        }
        if (await claimRefereeSchedule(txSql, { refereeId, matchDate, timeSlot })) {
          return Response.json({ error: "Referee is already assigned to another active fixture at this kickoff" }, { status: 409 });
        }

        const [fixture] = await txSql`
          INSERT INTO matches (
            league_id, round_number, match_date, time_slot, field_number,
            home_slot_id, away_slot_id, referee_id
          )
          VALUES (
            ${leagueId}, ${roundNumber}, ${matchDate}::date, ${timeSlot}, ${fieldNumber},
            ${homeSlotId}, ${awaySlotId}, ${refereeId}
          )
          RETURNING id
        `;
        await txSql`
          INSERT INTO audit_logs (action_by, target_id, action_type, new_value)
          VALUES (
            ${authorization.actor.id},
            ${fixture.id},
            'CREATE_FIXTURE',
            ${JSON.stringify({ league_id: leagueId, round_number: roundNumber, match_date: matchDate, time_slot: timeSlot, field_number: fieldNumber, home_slot_id: homeSlotId, away_slot_id: awaySlotId, referee_id: refereeId, status: "scheduled" })}
          )
        `;
        return Response.json({ success: true, matchId: fixture.id });
      });
    }

    if (action === "EDIT_FIXTURE") {
      const { matchDate, timeSlot, fieldNumber } = data;
      return await withTransaction(async (txSql) => {
        const match = await lockMatch(txSql, matchId);
        if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
        const authorization = await authorizeLockedMatch(txSql, user.id, match, ADMIN_ROLES);
        if (authorization.response) return authorization.response;
        if (!['scheduled', 'postponed'].includes(match.status)) {
          return Response.json({ error: `Cannot edit a fixture with status '${match.status}'` }, { status: 409 });
        }
        if (match.league_status !== "active") {
          return Response.json({ error: "Fixtures can only be edited in an active league" }, { status: 409 });
        }
        const league = { fields_count: match.fields_count, time_slots: match.time_slots };
        const scheduleError = scheduleValidationError({ matchDate, timeSlot, fieldNumber }, league);
        if (scheduleError) return Response.json({ error: scheduleError }, { status: 400 });

        const refereeId = Object.hasOwn(data, "refereeId") ? data.refereeId : match.referee_id;
        const refereeError = await validateReferee(txSql, refereeId, match.league_venue_id);
        if (refereeError) return Response.json({ error: refereeError.error }, { status: refereeError.status });
        const schedule = { venueId: match.league_venue_id, fieldNumber, matchDate, timeSlot };
        if (await claimFixtureSchedule(txSql, schedule, matchId)) {
          return Response.json({ error: "Another active fixture already occupies this field and kickoff" }, { status: 409 });
        }
        if (await claimRefereeSchedule(txSql, { refereeId, matchDate, timeSlot }, matchId)) {
          return Response.json({ error: "Referee is already assigned to another active fixture at this kickoff" }, { status: 409 });
        }

        const before = matchSnapshot(match);
        const after = {
          ...before,
          match_date: matchDate,
          time_slot: timeSlot,
          field_number: fieldNumber,
          referee_id: refereeId,
          status: "scheduled",
        };
        await txSql`
          UPDATE matches
          SET match_date = ${matchDate}::date,
              time_slot = ${timeSlot},
              field_number = ${fieldNumber},
              referee_id = ${refereeId},
              status = 'scheduled'
          WHERE id = ${matchId}
        `;
        await txSql`
          INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value)
          VALUES (${authorization.actor.id}, ${matchId}, 'EDIT_FIXTURE', ${JSON.stringify(before)}, ${JSON.stringify(after)})
        `;
        return Response.json({ success: true });
      });
    }

    if (action === "POSTPONE_FIXTURE") {
      return await withTransaction(async (txSql) => {
        const match = await lockMatch(txSql, matchId);
        if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
        const authorization = await authorizeLockedMatch(txSql, user.id, match, ADMIN_ROLES);
        if (authorization.response) return authorization.response;
        if (match.status === "postponed") return Response.json({ success: true, idempotent: true });
        if (match.status !== "scheduled") {
          return Response.json({ error: `Cannot postpone a fixture with status '${match.status}'` }, { status: 409 });
        }
        const before = matchSnapshot(match);
        const after = { ...before, status: "postponed" };
        await txSql`UPDATE matches SET status = 'postponed' WHERE id = ${matchId}`;
        await txSql`
          INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value)
          VALUES (${authorization.actor.id}, ${matchId}, 'POSTPONE_FIXTURE', ${JSON.stringify(before)}, ${JSON.stringify(after)})
        `;
        return Response.json({ success: true, idempotent: false });
      });
    }

    if (action === "CANCEL_FIXTURE") {
      return await withTransaction(async (txSql) => {
        const match = await lockMatch(txSql, matchId);
        if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
        const authorization = await authorizeLockedMatch(txSql, user.id, match, ADMIN_ROLES);
        if (authorization.response) return authorization.response;
        if (match.status === "cancelled") return Response.json({ success: true, idempotent: true });
        if (!['scheduled', 'postponed'].includes(match.status)) {
          return Response.json({ error: `Cannot cancel a fixture with status '${match.status}'` }, { status: 409 });
        }
        const before = matchSnapshot(match);
        const after = { ...before, status: "cancelled" };
        await txSql`UPDATE matches SET status = 'cancelled' WHERE id = ${matchId}`;
        await txSql`
          INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value)
          VALUES (${authorization.actor.id}, ${matchId}, 'CANCEL_FIXTURE', ${JSON.stringify(before)}, ${JSON.stringify(after)})
        `;
        return Response.json({ success: true, idempotent: false });
      });
    }

    if (action === "START_MATCH") {
      return await withTransaction(async (txSql) => {
        const match = await lockMatch(txSql, matchId);
        if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
        const authorization = await authorizeLockedMatch(txSql, user.id, match);
        if (authorization.response) return authorization.response;
        if (match.status !== "scheduled") {
          return Response.json({ error: `Cannot start a match with status '${match.status}'` }, { status: 409 });
        }

        await txSql`
          UPDATE matches
          SET status = 'live', start_time = CURRENT_TIMESTAMP
          WHERE id = ${matchId}
        `;
        await txSql`
          INSERT INTO match_events (match_id, type)
          VALUES (${matchId}, 'start_first_half')
        `;
        return Response.json({ success: true });
      });
    }

    if (action === "RECORD_GOAL") {
      const { type, playerId, opId } = data;
      return await withTransaction(async (txSql) => {
        const match = await lockMatch(txSql, matchId);
        if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
        const authorization = await authorizeLockedMatch(txSql, user.id, match);
        if (authorization.response) return authorization.response;
        if (match.status !== "live") {
          return Response.json({ error: `Cannot record goals for a match with status '${match.status}'` }, { status: 409 });
        }

        const slotId = type === "goal_home" ? match.home_slot_id : match.away_slot_id;
        const [team] = await txSql`
          SELECT id
          FROM teams
          WHERE league_id = ${match.league_id}
            AND slot_id = ${slotId}
            AND status = 'active'
          LIMIT 1
          FOR SHARE
        `;
        if (!team) {
          return Response.json({ error: "No active scoring team is assigned to this slot" }, { status: 409 });
        }

        if (playerId != null) {
          const [player] = await txSql`SELECT id, team_id FROM players WHERE id = ${playerId} FOR SHARE`;
          if (!player) return Response.json({ error: "Player not found" }, { status: 404 });
          if (player.team_id !== team.id) {
            return Response.json({ error: "Player does not belong to the scoring team" }, { status: 409 });
          }
        }

        if (opId == null) {
          console.warn("[matches] Legacy RECORD_GOAL received without opId; request is atomic but not retry-idempotent.");
          await txSql`
            INSERT INTO match_events (match_id, type, player_id, team_id, operation_id)
            VALUES (${matchId}, ${type}, ${playerId ?? null}, ${team.id}, NULL)
          `;
        } else {
          const [inserted] = await txSql`
            INSERT INTO match_events (match_id, type, player_id, team_id, operation_id)
            VALUES (${matchId}, ${type}, ${playerId ?? null}, ${team.id}, ${opId})
            ON CONFLICT (match_id, operation_id) WHERE operation_id IS NOT NULL
            DO NOTHING
            RETURNING id
          `;

          if (!inserted) {
            const [existing] = await txSql`
              SELECT type, player_id, team_id
              FROM match_events
              WHERE match_id = ${matchId} AND operation_id = ${opId}
            `;
            const sameCommand = existing
              && existing.type === type
              && (existing.player_id ?? null) === (playerId ?? null)
              && existing.team_id === team.id;
            if (!sameCommand) {
              return Response.json({ error: "opId was already used for a different goal command" }, { status: 409 });
            }
            return Response.json({ success: true, idempotent: true });
          }
        }

        if (type === "goal_home") {
          await txSql`UPDATE matches SET home_score = home_score + 1 WHERE id = ${matchId}`;
        } else {
          await txSql`UPDATE matches SET away_score = away_score + 1 WHERE id = ${matchId}`;
        }
        return Response.json({ success: true, idempotent: false, legacy: opId == null });
      });
    }

    if (action === "DELETE_EVENT") {
      const { eventId } = data;
      // Lock the same match as finalisation before checking state or touching its event.
      const result = await withTransaction(async (txSql) => {
        const match = await lockMatch(txSql, matchId);
        if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
        const authorization = await authorizeLockedMatch(txSql, user.id, match);
        if (authorization.response) return authorization.response;
        if (match.status !== "live") return Response.json({ error: "Only live match goals can be corrected here" }, { status: 409 });
        const [event] = await txSql`SELECT * FROM match_events WHERE id = ${eventId} AND match_id = ${matchId} FOR UPDATE`;
        if (!event || event.match_id !== matchId) return Response.json({ error: "Event not found in this match" }, { status: 404 });
        if (!["goal_home", "goal_away"].includes(event.type)) return Response.json({ error: "Only goals can be corrected" }, { status: 409 });
        if (event.type === "goal_home") {
          await txSql`UPDATE matches SET home_score = GREATEST(0, home_score - 1) WHERE id = ${matchId}`;
        } else {
          await txSql`UPDATE matches SET away_score = GREATEST(0, away_score - 1) WHERE id = ${matchId}`;
        }
        await txSql`DELETE FROM match_events WHERE id = ${eventId} AND match_id = ${matchId}`;
        await txSql`
          INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value)
          VALUES (
            ${authorization.actor.id},
            ${event.id},
            'DELETE_MATCH_GOAL',
            ${JSON.stringify(event)},
            NULL
          )
        `;
        return Response.json({ success: true });
      });
      return result;
    }

    if (action === "END_MATCH") {
      return await withTransaction(async (txSql) => {
        const match = await lockMatch(txSql, matchId);
        if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
        const authorization = await authorizeLockedMatch(txSql, user.id, match);
        if (authorization.response) return authorization.response;

        if (match.status === "final") {
          await recomputeLeagueStandings(txSql, match.league_id);
          return Response.json({ success: true, idempotent: true });
        }
        if (match.status !== "live") {
          return Response.json({ error: `Cannot end a match with status '${match.status}'` }, { status: 409 });
        }

        await txSql`UPDATE matches SET status = 'final', end_time = CURRENT_TIMESTAMP WHERE id = ${matchId}`;
        await txSql`INSERT INTO match_events (match_id, type) VALUES (${matchId}, 'end_match')`;
        await recomputeLeagueStandings(txSql, match.league_id);
        return Response.json({ success: true, idempotent: false });
      });
    }

    if (action === "START_SECOND_HALF") {
      return await withTransaction(async (txSql) => {
        const match = await lockMatch(txSql, matchId);
        if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
        const authorization = await authorizeLockedMatch(txSql, user.id, match);
        if (authorization.response) return authorization.response;
        if (match.status !== "live") {
          return Response.json({ error: `Cannot start second half for a match with status '${match.status}'` }, { status: 409 });
        }

        const [phaseState] = await txSql`
          SELECT
            EXISTS (
              SELECT 1 FROM match_events
              WHERE match_id = ${matchId} AND type = 'start_first_half'
            ) AS first_half_event,
            EXISTS (
              SELECT 1 FROM match_events
              WHERE match_id = ${matchId} AND type = 'start_second_half'
            ) AS second_half_event
        `;
        if (!match.start_time || !phaseState.first_half_event) {
          return Response.json({ error: "First half has not been started consistently" }, { status: 409 });
        }
        if (match.half2_start_time || phaseState.second_half_event) {
          if (match.half2_start_time && phaseState.second_half_event) {
            return Response.json({ success: true, idempotent: true });
          }
          return Response.json({ error: "Second-half state is inconsistent" }, { status: 409 });
        }

        await txSql`UPDATE matches SET half2_start_time = CURRENT_TIMESTAMP WHERE id = ${matchId}`;
        await txSql`INSERT INTO match_events (match_id, type) VALUES (${matchId}, 'start_second_half')`;
        return Response.json({ success: true, idempotent: false });
      });
    }

    if (action === "ADMIN_OVERRIDE") {
      const { homeScore, awayScore, status: newStatus, reason } = data;
      return await withTransaction(async (txSql) => {
        const oldMatch = await lockMatch(txSql, matchId);
        if (!oldMatch) return Response.json({ error: "Match not found" }, { status: 404 });
        const authorization = await authorizeLockedMatch(txSql, user.id, oldMatch, ADMIN_ROLES);
        if (authorization.response) return authorization.response;
        if (!RESULT_OVERRIDE_STATUSES.includes(oldMatch.status)) {
          return Response.json({ error: `Cannot correct a match with status '${oldMatch.status}'` }, { status: 409 });
        }

        if (oldMatch.status === "final" && newStatus === "scheduled") {
          const schedule = {
            venueId: oldMatch.league_venue_id,
            fieldNumber: oldMatch.field_number,
            matchDate: oldMatch.schedule_date,
            timeSlot: oldMatch.time_slot,
          };
          if (await claimFixtureSchedule(txSql, schedule, matchId)) {
            return Response.json({ error: "Another active fixture already occupies this field and kickoff" }, { status: 409 });
          }
          if (await claimRefereeSchedule(txSql, {
            refereeId: oldMatch.referee_id,
            matchDate: oldMatch.schedule_date,
            timeSlot: oldMatch.time_slot,
          }, matchId)) {
            return Response.json({ error: "Referee is already assigned to another active fixture at this kickoff" }, { status: 409 });
          }
        }

        const before = matchSnapshot(oldMatch);
        const after = {
          ...before,
          home_score: homeScore,
          away_score: awayScore,
          status: newStatus,
          result_type: "played",
        };
        const unchanged = before.home_score === homeScore
          && before.away_score === awayScore
          && before.status === newStatus
          && before.result_type === "played";
        if (unchanged) return Response.json({ success: true, idempotent: true });

        await txSql`
          UPDATE matches
          SET home_score = ${homeScore},
              away_score = ${awayScore},
              status = ${newStatus},
              result_type = 'played'
          WHERE id = ${matchId}
        `;
        if (oldMatch.status === "final" || newStatus === "final") {
          await recomputeLeagueStandings(txSql, oldMatch.league_id);
        }
        await txSql`
          INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value, reason)
          VALUES (${authorization.actor.id}, ${matchId}, 'ADMIN_OVERRIDE', ${JSON.stringify(before)}, ${JSON.stringify(after)}, ${reason})
        `;
        return Response.json({ success: true, idempotent: false });
      });
    }

    if (action === "ASSIGN_REFEREE") {
      const { refereeId } = data;
      return await withTransaction(async (txSql) => {
        const match = await lockMatch(txSql, matchId);
        if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
        const authorization = await authorizeLockedMatch(txSql, user.id, match, ADMIN_ROLES);
        if (authorization.response) return authorization.response;
        if (!["scheduled", "postponed"].includes(match.status)) {
          return Response.json({ error: `Cannot assign a referee to a fixture with status '${match.status}'` }, { status: 409 });
        }

        const refereeError = await validateReferee(txSql, refereeId, match.league_venue_id);
        if (refereeError) {
          return Response.json({ error: refereeError.error }, { status: refereeError.status });
        }
        if (match.status === "scheduled" && await claimRefereeSchedule(txSql, {
          refereeId,
          matchDate: match.schedule_date,
          timeSlot: match.time_slot,
        }, matchId)) {
          return Response.json({ error: "Referee is already assigned to another active fixture at this kickoff" }, { status: 409 });
        }
        await txSql`UPDATE matches SET referee_id = ${refereeId ?? null} WHERE id = ${matchId}`;
        return Response.json({ success: true });
      });
    }

    if (action === "FORFEIT_MATCH") {
      const { winnerSide, reason = null } = data;
      return await withTransaction(async (txSql) => {
        const match = await lockMatch(txSql, matchId);
        if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
        const authorization = await authorizeLockedMatch(txSql, user.id, match, ADMIN_ROLES);
        if (authorization.response) return authorization.response;

        const resultType = winnerSide === "home" ? "forfeit_home_win" : "forfeit_away_win";
        const winnerScore = Number(match.forfeit_score_home);
        const loserScore = Number(match.forfeit_score_away);
        if (!Number.isInteger(winnerScore) || !Number.isInteger(loserScore)
          || winnerScore < 0 || loserScore < 0 || winnerScore <= loserScore) {
          return Response.json({ error: "League forfeit score configuration is invalid" }, { status: 409 });
        }
        const homeScore = winnerSide === "home" ? winnerScore : loserScore;
        const awayScore = winnerSide === "away" ? winnerScore : loserScore;
        if (match.status === "final" && match.result_type === resultType
          && match.home_score === homeScore && match.away_score === awayScore) {
          return Response.json({ success: true, idempotent: true });
        }
        if (match.status !== "scheduled") {
          return Response.json({ error: `Cannot record a forfeit for a fixture with status '${match.status}'` }, { status: 409 });
        }
        if (!match.home_slot_id || !match.away_slot_id || match.home_slot_id === match.away_slot_id) {
          return Response.json({ error: "Match participants are not valid for a forfeit" }, { status: 409 });
        }
        const slotError = await validateParticipantSlots(
          txSql,
          match.league_id,
          match.home_slot_id,
          match.away_slot_id,
        );
        if (slotError) return Response.json({ error: slotError }, { status: 409 });

        const before = matchSnapshot(match);
        const after = {
          ...before,
          home_score: homeScore,
          away_score: awayScore,
          status: "final",
          result_type: resultType,
          winner_side: winnerSide,
          loser_side: winnerSide === "home" ? "away" : "home",
        };
        await txSql`
          UPDATE matches
          SET home_score = ${homeScore},
              away_score = ${awayScore},
              status = 'final',
              result_type = ${resultType},
              end_time = CURRENT_TIMESTAMP
          WHERE id = ${matchId}
        `;
        await recomputeLeagueStandings(txSql, match.league_id);
        await txSql`
          INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value, reason)
          VALUES (${authorization.actor.id}, ${matchId}, 'FORFEIT_MATCH', ${JSON.stringify(before)}, ${JSON.stringify(after)}, ${reason})
        `;
        return Response.json({ success: true, idempotent: false });
      });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function GET(request) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { allowed } = await rateLimit(`public:${ip}`, { max: 60, windowMinutes: 1 });
  if (!allowed) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");
  const leagueId = searchParams.get("leagueId");
  const date = searchParams.get("date");

  if (matchId) {
    const [match] = await sql`
      SELECT m.*,
             to_char(nova_planned_date(m.match_date), 'YYYY-MM-DD') AS match_date,
             th.name as home_team_name,
             ta.name as away_team_name,
             th.id as home_team_id,
             ta.id as away_team_id,
             l.match_duration_minutes,
             ref.name as referee_name
      FROM matches m
      LEFT JOIN league_slots lsh ON m.home_slot_id = lsh.id
      LEFT JOIN teams th ON th.slot_id = lsh.id AND th.status = 'active'
      LEFT JOIN league_slots lsa ON m.away_slot_id = lsa.id
      LEFT JOIN teams ta ON ta.slot_id = lsa.id AND ta.status = 'active'
      LEFT JOIN auth_users ref ON ref.id = m.referee_id
      JOIN leagues l ON m.league_id = l.id
      WHERE m.id = ${matchId}
    `;
    const events = await sql`
      SELECT me.*, p.name as player_name
      FROM match_events me
      LEFT JOIN players p ON me.player_id = p.id
      WHERE me.match_id = ${matchId}
      ORDER BY me.event_timestamp DESC
    `;
    return Response.json({ match, events });
  }

  if (leagueId) {
    const matches = await sql`
      SELECT m.*,
             to_char(nova_planned_date(m.match_date), 'YYYY-MM-DD') AS match_date,
             th.name as home_team_name,
             ta.name as away_team_name,
             ref.name as referee_name
      FROM matches m
      LEFT JOIN league_slots lsh ON m.home_slot_id = lsh.id
      LEFT JOIN teams th ON th.slot_id = lsh.id AND th.status = 'active'
      LEFT JOIN league_slots lsa ON m.away_slot_id = lsa.id
      LEFT JOIN teams ta ON ta.slot_id = lsa.id AND ta.status = 'active'
      LEFT JOIN auth_users ref ON ref.id = m.referee_id
      WHERE m.league_id = ${leagueId}
      ORDER BY m.round_number, m.match_date, m.time_slot
    `;
    return Response.json(matches);
  }

  if (date) {
    const venueId = searchParams.get("venueId");
    const fieldNumber = searchParams.get("fieldNumber");
    const matches = await sql`
      SELECT m.*, l.name as league_name,
             to_char(nova_planned_date(m.match_date), 'YYYY-MM-DD') AS match_date,
             th.name as home_team_name,
             ta.name as away_team_name,
             ref.name as referee_name
      FROM matches m
      JOIN leagues l ON m.league_id = l.id
      LEFT JOIN league_slots lsh ON m.home_slot_id = lsh.id
      LEFT JOIN teams th ON th.slot_id = lsh.id AND th.status = 'active'
      LEFT JOIN league_slots lsa ON m.away_slot_id = lsa.id
      LEFT JOIN teams ta ON ta.slot_id = lsa.id AND ta.status = 'active'
      LEFT JOIN auth_users ref ON ref.id = m.referee_id
      WHERE nova_planned_date(m.match_date) = ${date}::date
      AND (${venueId}::uuid IS NULL OR l.venue_id = ${venueId}::uuid)
      AND (${fieldNumber}::int IS NULL OR m.field_number = ${fieldNumber}::int)
      ORDER BY m.time_slot, m.field_number
    `;
    return Response.json(matches);
  }

  return Response.json({ error: "Missing parameters" }, { status: 400 });
}
