import sql, { withTransaction } from "@/app/api/utils/sql";
import { rateLimit } from "@/app/api/utils/rate-limit";
import { resolveCurrentUser } from "@/app/api/utils/auth";
import { recomputeLeagueStandings } from "@/app/api/matches/standings";
import { z } from "zod";

const MATCH_STATUSES = ["scheduled", "live", "final", "postponed", "cancelled"];

const matchActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("START_MATCH"), matchId: z.string().min(1) }),
  z.object({
    action: z.literal("RECORD_GOAL"),
    matchId: z.string().min(1),
    type: z.enum(["goal_home", "goal_away"]),
    opId: z.string().uuid(),
    playerId: z.string().min(1).nullable().optional(),
  }),
  z.object({
    action: z.literal("DELETE_EVENT"),
    matchId: z.string().min(1),
    eventId: z.string().min(1),
  }),
  z.object({ action: z.literal("END_MATCH"), matchId: z.string().min(1) }),
  z.object({ action: z.literal("START_SECOND_HALF"), matchId: z.string().min(1) }),
  z.object({
    action: z.literal("ADMIN_OVERRIDE"),
    matchId: z.string().min(1),
    homeScore: z.number().int().min(0).max(99),
    awayScore: z.number().int().min(0).max(99),
    status: z.enum(MATCH_STATUSES),
    reason: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("ASSIGN_REFEREE"),
    matchId: z.string().min(1),
    refereeId: z.string().min(1).nullable(),
  }),
]);

const WRITE_ROLES = ["referee", "venue_admin", "super_admin"];
const ADMIN_ROLES = ["venue_admin", "super_admin"];

function canAccessVenue(user, venueId) {
  return user.role === "super_admin" || (user.venue_id != null && user.venue_id === venueId);
}

async function lockMatch(txSql, matchId) {
  const [match] = await txSql`
    SELECT m.*, l.venue_id AS league_venue_id
    FROM matches m
    JOIN leagues l ON l.id = m.league_id
    WHERE m.id = ${matchId}
    FOR UPDATE OF m
  `;
  return match ?? null;
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

export async function POST(request) {
  try {
    const user = await resolveCurrentUser(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = matchActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.format() }, { status: 400 });
    }
    const { action, matchId, ...data } = parsed.data;

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

        if (type === "goal_home") {
          await txSql`UPDATE matches SET home_score = home_score + 1 WHERE id = ${matchId}`;
        } else {
          await txSql`UPDATE matches SET away_score = away_score + 1 WHERE id = ${matchId}`;
        }
        return Response.json({ success: true, idempotent: false });
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

        await txSql`
          UPDATE matches
          SET home_score = ${homeScore}, away_score = ${awayScore}, status = ${newStatus}
          WHERE id = ${matchId}
        `;
        if (oldMatch.status === "final" || newStatus === "final") {
          await recomputeLeagueStandings(txSql, oldMatch.league_id);
        }
        await txSql`
          INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value, reason)
          VALUES (${authorization.actor.id}, ${matchId}, 'ADMIN_OVERRIDE', ${JSON.stringify(oldMatch)}, ${JSON.stringify({ homeScore, awayScore, status: newStatus })}, ${reason})
        `;
        return Response.json({ success: true });
      });
    }

    if (action === "ASSIGN_REFEREE") {
      const { refereeId } = data;
      return await withTransaction(async (txSql) => {
        const match = await lockMatch(txSql, matchId);
        if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
        const authorization = await authorizeLockedMatch(txSql, user.id, match, ADMIN_ROLES);
        if (authorization.response) return authorization.response;

        if (refereeId != null) {
          const [referee] = await txSql`SELECT venue_id, role FROM auth_users WHERE id = ${refereeId} FOR SHARE`;
          if (!referee || referee.role !== "referee") {
            return Response.json({ error: "Referee not found" }, { status: 404 });
          }
          if (authorization.actor.role !== "super_admin" && referee.venue_id !== match.league_venue_id) {
            return Response.json({ error: "Referee does not belong to this venue" }, { status: 403 });
          }
        }
        await txSql`UPDATE matches SET referee_id = ${refereeId ?? null} WHERE id = ${matchId}`;
        return Response.json({ success: true });
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
             th.name as home_team_name,
             ta.name as away_team_name
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
      WHERE m.match_date = ${date}
      AND (${venueId}::uuid IS NULL OR l.venue_id = ${venueId}::uuid)
      AND (${fieldNumber}::int IS NULL OR m.field_number = ${fieldNumber}::int)
      ORDER BY m.time_slot, m.field_number
    `;
    return Response.json(matches);
  }

  return Response.json({ error: "Missing parameters" }, { status: 400 });
}
