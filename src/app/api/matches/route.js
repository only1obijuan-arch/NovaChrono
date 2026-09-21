import sql, { withTransaction } from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { rateLimit } from "@/app/api/utils/rate-limit";
import { verifyMobileToken } from "@/app/api/utils/mobile-auth";
import { z } from "zod";

const MATCH_STATUSES = ["scheduled", "live", "final", "postponed", "cancelled"];

const matchActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("START_MATCH"), matchId: z.string().min(1) }),
  z.object({
    action: z.literal("RECORD_GOAL"),
    matchId: z.string().min(1),
    type: z.enum(["goal_home", "goal_away"]),
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

async function getSession(request) {
  const mobileUser = await verifyMobileToken(request);
  if (mobileUser) return mobileUser;
  const session = await auth();
  return session?.user ?? null;
}

const WRITE_ROLES = ["referee", "venue_admin", "super_admin"];
const ADMIN_ROLES = ["venue_admin", "super_admin"];

function canAccessVenue(user, venueId) {
  return user.role === "super_admin" || (user.venue_id != null && user.venue_id === venueId);
}

export async function POST(request) {
  try {
    const user = await getSession(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!WRITE_ROLES.includes(user.role)) {
      return Response.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const parsed = matchActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.format() }, { status: 400 });
    }
    const { action, matchId, ...data } = parsed.data;

    if (
      user.role === "referee" &&
      ["START_MATCH", "RECORD_GOAL", "END_MATCH", "START_SECOND_HALF"].includes(action)
    ) {
      const [match] = await sql`SELECT referee_id FROM matches WHERE id = ${matchId}`;
      if (!match || match.referee_id !== user.id) {
        return Response.json({ error: "Not assigned to this match" }, { status: 403 });
      }
    }

    if (action === "START_MATCH") {
      const [match] = await sql`
        SELECT m.status, l.venue_id
        FROM matches m
        JOIN leagues l ON m.league_id = l.id
        WHERE m.id = ${matchId}
      `;
      if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
      if (!canAccessVenue(user, match.venue_id)) return Response.json({ error: "Access denied" }, { status: 403 });
      if (match.status !== "scheduled") {
        return Response.json({ error: `Cannot start a match with status '${match.status}'` }, { status: 409 });
      }
      await sql`UPDATE matches SET status = 'live', start_time = CURRENT_TIMESTAMP WHERE id = ${matchId}`;
      await sql`INSERT INTO match_events (match_id, type) VALUES (${matchId}, 'start_first_half')`;
      return Response.json({ success: true });
    }

    if (action === "RECORD_GOAL") {
      const { type, playerId } = data;
      const [matchRow] = await sql`
        SELECT m.status, m.home_slot_id, m.away_slot_id, l.venue_id
        FROM matches m
        JOIN leagues l ON m.league_id = l.id
        WHERE m.id = ${matchId}
      `;
      if (!matchRow) return Response.json({ error: "Match not found" }, { status: 404 });
      if (!canAccessVenue(user, matchRow.venue_id)) return Response.json({ error: "Access denied" }, { status: 403 });
      if (matchRow.status !== "live") {
        return Response.json({ error: `Cannot record goals for a match with status '${matchRow.status}'` }, { status: 409 });
      }
      const slotId = type === "goal_home" ? matchRow.home_slot_id : matchRow.away_slot_id;
      const [team] = await sql`SELECT id FROM teams WHERE slot_id = ${slotId} AND status = 'active' LIMIT 1`;
      await sql`INSERT INTO match_events (match_id, type, player_id, team_id) VALUES (${matchId}, ${type}, ${playerId ?? null}, ${team?.id ?? null})`;
      if (type === "goal_home") {
        await sql`UPDATE matches SET home_score = home_score + 1 WHERE id = ${matchId}`;
      } else {
        await sql`UPDATE matches SET away_score = away_score + 1 WHERE id = ${matchId}`;
      }
      return Response.json({ success: true });
    }

    if (action === "DELETE_EVENT") {
      const { eventId } = data;
      // Lock the same match as finalisation before checking state or touching its event.
      const result = await withTransaction(async (txSql) => {
        const [match] = await txSql`
          SELECT m.status, m.referee_id, l.venue_id
          FROM matches m JOIN leagues l ON m.league_id = l.id
          WHERE m.id = ${matchId} FOR UPDATE OF m
        `;
        if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
        if (!canAccessVenue(user, match.venue_id) || (user.role === "referee" && match.referee_id !== user.id)) {
          return Response.json({ error: "Access denied" }, { status: 403 });
        }
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
        return Response.json({ success: true });
      });
      return result;
    }

    if (action === "END_MATCH") {
      let invalidEndState = null;
      let matchNotFound = false;
      let accessDenied = false;
      await withTransaction(async (txSql) => {
        const [matchRow] = await txSql`
          SELECT m.status, m.league_id, m.home_slot_id, m.away_slot_id, m.home_score, m.away_score, l.venue_id
          FROM matches m
          JOIN leagues l ON m.league_id = l.id
          WHERE m.id = ${matchId}
          FOR UPDATE OF m
        `;

        if (!matchRow) { matchNotFound = true; return; }
        if (!canAccessVenue(user, matchRow.venue_id)) { accessDenied = true; return; }
        // Idempotency guard: if a previous call already finalised the match, do nothing.
        if (matchRow.status === "final") return;
        if (matchRow.status !== "live") { invalidEndState = matchRow.status; return; }

        await txSql`UPDATE matches SET status = 'final', end_time = CURRENT_TIMESTAMP WHERE id = ${matchId}`;
        await txSql`INSERT INTO match_events (match_id, type) VALUES (${matchId}, 'end_match')`;

        const [homeTeam] = await txSql`SELECT id FROM teams WHERE slot_id = ${matchRow.home_slot_id} AND status = 'active' LIMIT 1`;
        const [awayTeam] = await txSql`SELECT id FROM teams WHERE slot_id = ${matchRow.away_slot_id} AND status = 'active' LIMIT 1`;

        const h = matchRow.home_score;
        const a = matchRow.away_score;
        const homeWon = h > a ? 1 : 0;
        const awayWon = a > h ? 1 : 0;
        const drawn = h === a ? 1 : 0;

        if (homeTeam) {
          await txSql`
            UPDATE standings SET
              played = played + 1,
              won = won + ${homeWon},
              drawn = drawn + ${drawn},
              lost = lost + ${awayWon},
              goals_for = goals_for + ${h},
              goals_against = goals_against + ${a},
              goal_difference = goal_difference + ${h - a},
              points = points + ${homeWon * 3 + drawn}
            WHERE league_id = ${matchRow.league_id} AND team_id = ${homeTeam.id}
          `;
        }

        if (awayTeam) {
          await txSql`
            UPDATE standings SET
              played = played + 1,
              won = won + ${awayWon},
              drawn = drawn + ${drawn},
              lost = lost + ${homeWon},
              goals_for = goals_for + ${a},
              goals_against = goals_against + ${h},
              goal_difference = goal_difference + ${a - h},
              points = points + ${awayWon * 3 + drawn}
            WHERE league_id = ${matchRow.league_id} AND team_id = ${awayTeam.id}
          `;
        }
      });

      if (matchNotFound) return Response.json({ error: "Match not found" }, { status: 404 });
      if (accessDenied) return Response.json({ error: "Access denied" }, { status: 403 });
      if (invalidEndState !== null) {
        return Response.json({ error: `Cannot end a match with status '${invalidEndState}'` }, { status: 409 });
      }
      return Response.json({ success: true });
    }

    if (action === "START_SECOND_HALF") {
      const [match] = await sql`
        SELECT m.status, l.venue_id
        FROM matches m
        JOIN leagues l ON m.league_id = l.id
        WHERE m.id = ${matchId}
      `;
      if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
      if (!canAccessVenue(user, match.venue_id)) return Response.json({ error: "Access denied" }, { status: 403 });
      if (match.status !== "live") {
        return Response.json({ error: `Cannot start second half for a match with status '${match.status}'` }, { status: 409 });
      }
      await sql`UPDATE matches SET half2_start_time = CURRENT_TIMESTAMP WHERE id = ${matchId}`;
      await sql`INSERT INTO match_events (match_id, type) VALUES (${matchId}, 'start_second_half')`;
      return Response.json({ success: true });
    }

    if (action === "ADMIN_OVERRIDE") {
      if (!ADMIN_ROLES.includes(user.role)) {
        return Response.json(
          { error: "Admin access required" },
          { status: 403 },
        );
      }
      const { homeScore, awayScore, status: newStatus, reason } = data;

      let notFound = false;
      let accessDenied = false;

      await withTransaction(async (txSql) => {
        const [oldMatch] = await txSql`
          SELECT m.*, l.venue_id AS league_venue_id
          FROM matches m
          JOIN leagues l ON m.league_id = l.id
          WHERE m.id = ${matchId}
          FOR UPDATE OF m
        `;
        if (!oldMatch) { notFound = true; return; }
        if (!canAccessVenue(user, oldMatch.league_venue_id)) { accessDenied = true; return; }

        await txSql`UPDATE matches SET home_score = ${homeScore}, away_score = ${awayScore}, status = ${newStatus} WHERE id = ${matchId}`;

        const [homeTeam] = await txSql`SELECT id FROM teams WHERE slot_id = ${oldMatch.home_slot_id} AND status = 'active' LIMIT 1`;
        const [awayTeam] = await txSql`SELECT id FROM teams WHERE slot_id = ${oldMatch.away_slot_id} AND status = 'active' LIMIT 1`;

        if (oldMatch.status === "final") {
          const h = oldMatch.home_score;
          const a = oldMatch.away_score;
          const homeWon = h > a ? 1 : 0;
          const awayWon = a > h ? 1 : 0;
          const drawn = h === a ? 1 : 0;
          if (homeTeam) {
            await txSql`
              UPDATE standings SET
                played = played - 1,
                won = won - ${homeWon},
                drawn = drawn - ${drawn},
                lost = lost - ${awayWon},
                goals_for = goals_for - ${h},
                goals_against = goals_against - ${a},
                goal_difference = goal_difference - ${h - a},
                points = points - ${homeWon * 3 + drawn}
              WHERE league_id = ${oldMatch.league_id} AND team_id = ${homeTeam.id}
            `;
          }
          if (awayTeam) {
            await txSql`
              UPDATE standings SET
                played = played - 1,
                won = won - ${awayWon},
                drawn = drawn - ${drawn},
                lost = lost - ${homeWon},
                goals_for = goals_for - ${a},
                goals_against = goals_against - ${h},
                goal_difference = goal_difference - ${a - h},
                points = points - ${awayWon * 3 + drawn}
              WHERE league_id = ${oldMatch.league_id} AND team_id = ${awayTeam.id}
            `;
          }
        }

        if (newStatus === "final") {
          const h = homeScore;
          const a = awayScore;
          const homeWon = h > a ? 1 : 0;
          const awayWon = a > h ? 1 : 0;
          const drawn = h === a ? 1 : 0;
          if (homeTeam) {
            await txSql`
              UPDATE standings SET
                played = played + 1,
                won = won + ${homeWon},
                drawn = drawn + ${drawn},
                lost = lost + ${awayWon},
                goals_for = goals_for + ${h},
                goals_against = goals_against + ${a},
                goal_difference = goal_difference + ${h - a},
                points = points + ${homeWon * 3 + drawn}
              WHERE league_id = ${oldMatch.league_id} AND team_id = ${homeTeam.id}
            `;
          }
          if (awayTeam) {
            await txSql`
              UPDATE standings SET
                played = played + 1,
                won = won + ${awayWon},
                drawn = drawn + ${drawn},
                lost = lost + ${homeWon},
                goals_for = goals_for + ${a},
                goals_against = goals_against + ${h},
                goal_difference = goal_difference + ${a - h},
                points = points + ${awayWon * 3 + drawn}
              WHERE league_id = ${oldMatch.league_id} AND team_id = ${awayTeam.id}
            `;
          }
        }

        await txSql`
          INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value, reason)
          VALUES (${user.id}, ${matchId}, 'ADMIN_OVERRIDE', ${JSON.stringify(oldMatch)}, ${JSON.stringify({ homeScore, awayScore, status: newStatus })}, ${reason})
        `;
      });

      if (notFound) return Response.json({ error: "Match not found" }, { status: 404 });
      if (accessDenied) return Response.json({ error: "Access denied" }, { status: 403 });
      return Response.json({ success: true });
    }

    if (action === "ASSIGN_REFEREE") {
      if (!ADMIN_ROLES.includes(user.role)) {
        return Response.json({ error: "Admin access required" }, { status: 403 });
      }
      const { refereeId } = data;
      const [matchRow] = await sql`
        SELECT l.venue_id AS league_venue_id
        FROM matches m
        JOIN leagues l ON m.league_id = l.id
        WHERE m.id = ${matchId}
      `;
      if (!matchRow || !canAccessVenue(user, matchRow.league_venue_id)) {
        return Response.json({ error: "Access denied" }, { status: 403 });
      }
      if (refereeId != null) {
        const [referee] = await sql`SELECT venue_id, role FROM auth_users WHERE id = ${refereeId}`;
        if (!referee || referee.role !== "referee") {
          return Response.json({ error: "Referee not found" }, { status: 404 });
        }
        if (user.role !== "super_admin" && String(referee.venue_id) !== String(matchRow.league_venue_id)) {
          return Response.json({ error: "Referee does not belong to this venue" }, { status: 403 });
        }
      }
      await sql`UPDATE matches SET referee_id = ${refereeId ?? null} WHERE id = ${matchId}`;
      return Response.json({ success: true });
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