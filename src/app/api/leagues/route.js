import { randomBytes, randomInt } from "crypto";
import sql, { withTransaction } from "@/app/api/utils/sql";
import { requireRole } from "@/app/api/utils/auth";
import { findFixtureConflict, fixtureScheduleKey, lockFixtureSchedule, setCanonicalScheduleTimeZone } from "@/app/api/matches/scheduling";
import { addDaysToLocalDate, addMonthsToLocalDate, localDateString } from "@/utils/scheduling";
import { recomputeLeagueStandings } from "@/app/api/matches/standings";
import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canonicalTimeSlot = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const uniqueTimeSlots = z.array(canonicalTimeSlot).min(1).max(20).superRefine((slots, context) => {
  const seen = new Set();
  slots.forEach((slot, index) => {
    if (seen.has(slot)) context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Duplicate time slots are not allowed",
      path: [index],
    });
    seen.add(slot);
  });
});

const leagueActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CREATE_LEAGUE"),
    venueId: z.string().min(1),
    name: z.string().min(1).max(100),
    dayOfWeek: z.number().int().min(0).max(6),
    seasonStartDate: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
      .refine(
        (s) => {
          const d = new Date(s);
          return !isNaN(d.getTime()) && s >= new Date().toISOString().split("T")[0];
        },
        { message: "seasonStartDate must be a valid present or future date" },
      ),
    seasonEndDate: z.string().optional(),
    matchFormat: z.string().min(1).max(50),
    matchDuration: z.number().int().min(1).max(240),
    fieldsCount: z.number().int().min(1).max(50),
    timeSlots: uniqueTimeSlots,
    maxTeams: z.number().int().min(2).max(100),
  }),
  z.object({
    action: z.literal("CANCEL_LEAGUE"),
    leagueId: z.string().min(1),
  }),
  z.object({
    action: z.literal("COMPLETE_SEASON"),
    leagueId: z.string().min(1),
  }),
  z.object({
    action: z.literal("CREATE_NEW_SEASON"),
    parentLeagueId: z.string().min(1),
    seasonName: z.string().min(1).max(100),
    seasonStartDate: z.string().optional(),
  }),
  z.object({
    action: z.literal("GENERATE_FIXTURES"),
    leagueId: z.string().min(1),
  }),
]);

function canAccessVenue(user, venueId) {
  return user.role === "super_admin" || (user.venue_id != null && user.venue_id === venueId);
}

export async function POST(request) {
  try {
    const user = await requireRole(request, "venue_admin", "super_admin");
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = leagueActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.format() }, { status: 400 });
    }
    const { action, ...data } = parsed.data;

    if (action === "CREATE_LEAGUE") {
      let {
        venueId,
        name,
        dayOfWeek,
        seasonStartDate,
        seasonEndDate,
        matchFormat,
        matchDuration,
        fieldsCount,
        timeSlots,
        maxTeams,
      } = data;

      if (!canAccessVenue(user, venueId)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      if (!seasonEndDate && seasonStartDate) {
        seasonEndDate = addMonthsToLocalDate(seasonStartDate, 3);
      }

      const joinCode = randomBytes(4).toString("hex").toUpperCase();

      const league = await withTransaction(async (txSql) => {
        await setCanonicalScheduleTimeZone(txSql);
        const [newLeague] = await txSql`
          INSERT INTO leagues (venue_id, name, day_of_week, season_start_date, season_end_date, match_format, match_duration_minutes, fields_count, time_slots, max_teams, join_code, status)
          VALUES (${venueId}, ${name}, ${dayOfWeek}, ${seasonStartDate}, ${seasonEndDate}, ${matchFormat}, ${matchDuration}, ${fieldsCount}, ${JSON.stringify(
            timeSlots,
          )}, ${maxTeams}, ${joinCode}, 'registration')
          RETURNING *,
                    to_char(nova_planned_date(season_start_date), 'YYYY-MM-DD') AS season_start_date,
                    to_char(nova_planned_date(season_end_date), 'YYYY-MM-DD') AS season_end_date
        `;
        const slotNumbers = Array.from({ length: maxTeams }, (_, i) => i + 1);
        await txSql`
          INSERT INTO league_slots (league_id, slot_number)
          SELECT ${newLeague.id}, unnest(${slotNumbers}::int[])
        `;
        return newLeague;
      });

      return Response.json(league);
    }

    if (action === "CANCEL_LEAGUE") {
      const { leagueId } = data;
      const [league] = await sql`SELECT venue_id FROM leagues WHERE id = ${leagueId}`;
      if (!league || !canAccessVenue(user, league.venue_id)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      await sql`UPDATE leagues SET status = 'cancelled' WHERE id = ${leagueId}`;
      return Response.json({ success: true });
    }

    if (action === "COMPLETE_SEASON") {
      const { leagueId } = data;
      const knownMatches = await sql`SELECT id FROM matches WHERE league_id = ${leagueId} ORDER BY id`;
      const knownIds = knownMatches.map((match) => match.id);
      return await withTransaction(async (txSql) => {
        if (knownIds.length > 0) {
          await txSql`
            SELECT id FROM matches WHERE id = ANY(${knownIds}::uuid[]) ORDER BY id FOR UPDATE
          `;
        }
        const [league] = await txSql`
          SELECT id, venue_id, status FROM leagues WHERE id = ${leagueId} FOR UPDATE
        `;
        if (!league) return Response.json({ error: "League not found" }, { status: 404 });
        const currentMatches = await txSql`SELECT id, status FROM matches WHERE league_id = ${leagueId} ORDER BY id`;
        if (currentMatches.length !== knownIds.length || currentMatches.some((match, index) => match.id !== knownIds[index])) {
          return Response.json({ error: "League fixtures changed concurrently; retry completion" }, { status: 409 });
        }
        const [actor] = await txSql`
          SELECT id, role, venue_id FROM auth_users WHERE id = ${user.id} FOR SHARE
        `;
        if (!actor || !["venue_admin", "super_admin"].includes(actor.role)) {
          return Response.json({ error: "Insufficient permissions" }, { status: 403 });
        }
        if (!canAccessVenue(actor, league.venue_id)) return Response.json({ error: "Forbidden" }, { status: 403 });
        if (league.status === "completed") return Response.json({ success: true, idempotent: true });
        if (league.status !== "active") {
          return Response.json({ error: `Cannot complete a league with status '${league.status}'` }, { status: 409 });
        }
        const unresolved = currentMatches.filter((match) => ["scheduled", "live", "postponed"].includes(match.status));
        if (unresolved.length > 0) {
          return Response.json({ error: "All scheduled, live, and postponed fixtures must be resolved before completion", unresolvedMatchIds: unresolved.map((match) => match.id) }, { status: 409 });
        }
        await recomputeLeagueStandings(txSql, leagueId);
        await txSql`UPDATE leagues SET status = 'completed' WHERE id = ${leagueId}`;
        await txSql`
          INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value)
          VALUES (${actor.id}, ${leagueId}, 'COMPLETE_SEASON', ${JSON.stringify({ status: league.status })}, ${JSON.stringify({ status: "completed" })})
        `;
        return Response.json({ success: true, idempotent: false });
      });
    }

    if (action === "CREATE_NEW_SEASON") {
      const { parentLeagueId, seasonName, seasonStartDate } = data;

      const newLeague = await withTransaction(async (txSql) => {
        await setCanonicalScheduleTimeZone(txSql);
        const [parentLeague] = await txSql`SELECT * FROM leagues WHERE id = ${parentLeagueId} FOR UPDATE`;
        if (!parentLeague) return { response: Response.json({ error: "Parent league not found" }, { status: 404 }) };
        const [actor] = await txSql`
          SELECT id, role, venue_id FROM auth_users WHERE id = ${user.id} FOR SHARE
        `;
        if (!actor || !["venue_admin", "super_admin"].includes(actor.role)) {
          return { response: Response.json({ error: "Insufficient permissions" }, { status: 403 }) };
        }
        if (!canAccessVenue(actor, parentLeague.venue_id)) {
          return { response: Response.json({ error: "Forbidden" }, { status: 403 }) };
        }
        if (parentLeague.status !== "completed") {
          return { response: Response.json({ error: "The parent season must be completed first" }, { status: 409 }) };
        }
        const seasonEndDate = seasonStartDate ? addMonthsToLocalDate(seasonStartDate, 3) : null;
        const joinCode = randomBytes(4).toString("hex").toUpperCase();
        const [league] = await txSql`
          INSERT INTO leagues (
            venue_id, name, day_of_week, season_start_date, season_end_date,
            match_format, match_duration_minutes, fields_count, time_slots,
            max_teams, join_code, status, season_name, parent_league_id
          )
          VALUES (
            ${parentLeague.venue_id}, ${parentLeague.name}, ${
              parentLeague.day_of_week
            },
            ${seasonStartDate || null}, ${seasonEndDate}, ${parentLeague.match_format}, ${
              parentLeague.match_duration_minutes
            },
            ${parentLeague.fields_count}, ${JSON.stringify(
              parentLeague.time_slots,
            )},
            ${
              parentLeague.max_teams
            }, ${joinCode}, 'registration', ${seasonName}, ${parentLeagueId}
          )
          RETURNING *,
                    to_char(nova_planned_date(season_start_date), 'YYYY-MM-DD') AS season_start_date,
                    to_char(nova_planned_date(season_end_date), 'YYYY-MM-DD') AS season_end_date
        `;
        const slotNumbers = Array.from({ length: parentLeague.max_teams }, (_, i) => i + 1);
        await txSql`
          INSERT INTO league_slots (league_id, slot_number)
          SELECT ${league.id}, unnest(${slotNumbers}::int[])
        `;
        return { league };
      });
      if (newLeague.response) return newLeague.response;
      return Response.json(newLeague.league);
    }

    if (action === "GENERATE_FIXTURES") {
      const { leagueId } = data;
      return await withTransaction(async (txSql) => {
        await setCanonicalScheduleTimeZone(txSql);
        const [league] = await txSql`
          SELECT *, to_char(nova_planned_date(season_start_date), 'YYYY-MM-DD') AS season_start_date
          FROM leagues WHERE id = ${leagueId} FOR UPDATE
        `;
        if (!league) return Response.json({ error: "League not found" }, { status: 404 });
        const [actor] = await txSql`
          SELECT id, role, venue_id
          FROM auth_users
          WHERE id = ${user.id}
          FOR SHARE
        `;
        if (!actor || !["venue_admin", "super_admin"].includes(actor.role)) {
          return Response.json({ error: "Insufficient permissions" }, { status: 403 });
        }
        if (!canAccessVenue(actor, league.venue_id)) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        if (league.status !== "registration") {
          return Response.json({ error: "Fixtures can only be generated for leagues in registration status" }, { status: 409 });
        }
        const configuredTimeSlots = Array.isArray(league.time_slots)
          ? league.time_slots.map((slot) => typeof slot === "string" ? slot.trim() : slot)
          : [];
        const configuredSlotsValid = configuredTimeSlots.length > 0
          && configuredTimeSlots.every((slot) => typeof slot === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(slot))
          && new Set(configuredTimeSlots).size === configuredTimeSlots.length;
        if (!configuredSlotsValid) {
          return Response.json({ error: "League time slots must be valid and unique before generating fixtures" }, { status: 409 });
        }
        const [existingMatch] = await txSql`SELECT id FROM matches WHERE league_id = ${leagueId} LIMIT 1`;
        if (existingMatch) {
          return Response.json({ error: "Fixtures have already been generated for this league" }, { status: 409 });
        }

        const occupiedSlots = await txSql`
          SELECT ls.id, ls.slot_number, t.id AS team_id
          FROM league_slots ls
          INNER JOIN teams t ON t.slot_id = ls.id AND t.status = 'active'
          WHERE ls.league_id = ${leagueId}
          ORDER BY ls.slot_number
          FOR SHARE OF ls, t
        `;
        const numSlots = occupiedSlots.length;
        if (numSlots < 2) {
          return Response.json({ error: "At least two active teams are required" }, { status: 409 });
        }

        const rounds = numSlots % 2 === 0 ? numSlots - 1 : numSlots;
        const participantSlots = occupiedSlots.map((slot) => ({ slotId: slot.id, teamId: slot.team_id }));
        if (numSlots % 2 !== 0) participantSlots.push(null);
        const matchesPerRound = participantSlots.length / 2;
        const fixtures = [];
        const currentParticipants = [...participantSlots];
        for (let round = 0; round < rounds; round += 1) {
          const roundMatches = [];
          for (let matchIndex = 0; matchIndex < matchesPerRound; matchIndex += 1) {
            const home = currentParticipants[matchIndex];
            const away = currentParticipants[currentParticipants.length - 1 - matchIndex];
            if (home && away) roundMatches.push({ home, away });
          }
          fixtures.push(roundMatches);
          const last = currentParticipants.pop();
          currentParticipants.splice(1, 0, last);
        }

        const slotFieldCombos = [];
        for (const timeSlot of configuredTimeSlots) {
          for (let fieldNumber = 1; fieldNumber <= league.fields_count; fieldNumber += 1) {
            slotFieldCombos.push({ timeSlot, fieldNumber });
          }
        }
        if (fixtures.some((round) => round.length > slotFieldCombos.length)) {
          return Response.json({ error: "League configuration does not have enough field/time capacity for a round" }, { status: 409 });
        }

        const startDate = localDateString(league.season_start_date);
        const plannedMatches = [];
        for (let round = 0; round < fixtures.length; round += 1) {
          const roundDate = addDaysToLocalDate(startDate, round * 7);
          const shuffled = [...fixtures[round]];
          for (let index = shuffled.length - 1; index > 0; index -= 1) {
            const swapIndex = randomInt(index + 1);
            [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
          }
          shuffled.forEach((fixture, index) => plannedMatches.push({
            leagueId,
            roundNumber: round + 1,
            matchDate: roundDate,
            timeSlot: slotFieldCombos[index].timeSlot,
            fieldNumber: slotFieldCombos[index].fieldNumber,
            homeSlotId: fixture.home.slotId,
            awaySlotId: fixture.away.slotId,
            homeTeamId: fixture.home.teamId,
            awayTeamId: fixture.away.teamId,
            venueId: league.venue_id,
          }));
        }

        const schedules = [...plannedMatches].sort((left, right) => (
          fixtureScheduleKey(left).localeCompare(fixtureScheduleKey(right))
        ));
        for (const schedule of schedules) {
          await lockFixtureSchedule(txSql, schedule);
          if (await findFixtureConflict(txSql, schedule)) {
            return Response.json({ error: "A generated fixture conflicts with an existing active fixture" }, { status: 409 });
          }
        }

        await txSql`
          DELETE FROM league_slots
          WHERE league_id = ${leagueId}
            AND id NOT IN (
              SELECT slot_id FROM teams WHERE status = 'active' AND slot_id IS NOT NULL
            )
        `;
        for (const fixture of plannedMatches) {
          await txSql`
            INSERT INTO matches (
              league_id, round_number, match_date, time_slot, field_number,
              home_slot_id, away_slot_id, home_team_id, away_team_id
            )
            VALUES (
              ${leagueId}, ${fixture.roundNumber}, ${fixture.matchDate}::date,
              ${fixture.timeSlot}, ${fixture.fieldNumber}, ${fixture.homeSlotId}, ${fixture.awaySlotId},
              ${fixture.homeTeamId}, ${fixture.awayTeamId}
            )
          `;
        }

        const endDate = plannedMatches.length > 0
          ? plannedMatches.at(-1).matchDate
          : startDate;
        await txSql`
          UPDATE leagues
          SET status = 'active', season_end_date = ${endDate}
          WHERE id = ${leagueId}
        `;
        const activeTeams = await txSql`
          SELECT t.id AS team_id
          FROM teams t
          INNER JOIN league_slots ls ON t.slot_id = ls.id
          WHERE ls.league_id = ${leagueId} AND t.status = 'active'
          ORDER BY t.name ASC
        `;
        if (activeTeams.length > 0) {
          await txSql`
            INSERT INTO standings (
              league_id, team_id, played, won, drawn, lost,
              goals_for, goals_against, goal_difference, points
            )
            SELECT ${leagueId}, unnest(${activeTeams.map((team) => team.team_id)}::uuid[]), 0, 0, 0, 0, 0, 0, 0, 0
            ON CONFLICT DO NOTHING
          `;
        }
        await txSql`
          INSERT INTO audit_logs (action_by, target_id, action_type, new_value)
          VALUES (${actor.id}, ${leagueId}, 'GENERATE_FIXTURES', ${JSON.stringify({ fixture_count: plannedMatches.length, season_end_date: endDate })})
        `;
        return Response.json({ success: true, endDate });
      });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function GET(request) {
  const user = await requireRole(request, "venue_admin", "super_admin");
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venueId");
  const leagueId = searchParams.get("leagueId");

  if (leagueId) {
    if (!UUID_RE.test(leagueId))
      return Response.json({ error: "Invalid leagueId" }, { status: 400 });
    if (user) {
      const [league] = await sql`
        SELECT *,
               to_char(nova_planned_date(season_start_date), 'YYYY-MM-DD') AS season_start_date,
               to_char(nova_planned_date(season_end_date), 'YYYY-MM-DD') AS season_end_date
        FROM leagues WHERE id = ${leagueId}
      `;
      if (!league) return Response.json({ error: "League not found" }, { status: 404 });
      if (!canAccessVenue(user, league.venue_id)) return Response.json({ error: "Forbidden" }, { status: 403 });
      return Response.json(league);
    }
    // Explicit public/participant projection. No join code, tenant IDs,
    // internal time-slot configuration or account/administrator data.
    const [league] = await sql`
      SELECT l.id, l.name, l.status, l.day_of_week, l.season_name,
             to_char(nova_planned_date(l.season_start_date), 'YYYY-MM-DD') AS season_start_date,
             to_char(nova_planned_date(l.season_end_date), 'YYYY-MM-DD') AS season_end_date, l.match_format,
             l.match_duration_minutes, l.fields_count, l.max_teams, v.name AS venue_name
      FROM leagues l JOIN venues v ON v.id = l.venue_id WHERE l.id = ${leagueId}
    `;
    if (!league) return Response.json({ error: "League not found" }, { status: 404 });
    return Response.json(league);
  }

  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (venueId) {
    if (!UUID_RE.test(venueId))
      return Response.json({ error: "Invalid venueId" }, { status: 400 });
    if (!canAccessVenue(user, venueId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const leagues = await sql`
      SELECT *,
             to_char(nova_planned_date(season_start_date), 'YYYY-MM-DD') AS season_start_date,
             to_char(nova_planned_date(season_end_date), 'YYYY-MM-DD') AS season_end_date
      FROM leagues WHERE venue_id = ${venueId} ORDER BY leagues.season_start_date DESC
    `;
    return Response.json(leagues);
  }

  if (user.role !== "super_admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const leagues = await sql`
    SELECT *,
           to_char(nova_planned_date(season_start_date), 'YYYY-MM-DD') AS season_start_date,
           to_char(nova_planned_date(season_end_date), 'YYYY-MM-DD') AS season_end_date
    FROM leagues ORDER BY leagues.season_start_date DESC
  `;
  return Response.json(leagues);
}
