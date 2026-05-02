import { randomBytes } from "crypto";
import sql, { withTransaction } from "@/app/api/utils/sql";
import { requireRole } from "@/app/api/utils/auth";
import { z } from "zod";

const leagueActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CREATE_LEAGUE"),
    venueId: z.string().min(1),
    name: z.string().min(1).max(100),
    dayOfWeek: z.number().int().min(0).max(6),
    seasonStartDate: z.string().min(1),
    seasonEndDate: z.string().optional(),
    matchFormat: z.string().min(1).max(50),
    matchDuration: z.number().int().min(1).max(240),
    fieldsCount: z.number().int().min(1).max(50),
    timeSlots: z.array(z.string().min(1).max(10)).min(1).max(20),
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
  return user.role === "super_admin" || String(user.venue_id) === String(venueId);
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
        const start = new Date(seasonStartDate);
        start.setMonth(start.getMonth() + 3);
        seasonEndDate = start.toISOString().split("T")[0];
      }

      const joinCode = randomBytes(4).toString("hex").toUpperCase();

      const league = await withTransaction(async (txSql) => {
        const [newLeague] = await txSql`
          INSERT INTO leagues (venue_id, name, day_of_week, season_start_date, season_end_date, match_format, match_duration_minutes, fields_count, time_slots, max_teams, join_code, status)
          VALUES (${venueId}, ${name}, ${dayOfWeek}, ${seasonStartDate}, ${seasonEndDate}, ${matchFormat}, ${matchDuration}, ${fieldsCount}, ${JSON.stringify(
            timeSlots,
          )}, ${maxTeams}, ${joinCode}, 'registration')
          RETURNING *
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
      const [league] = await sql`SELECT venue_id FROM leagues WHERE id = ${leagueId}`;
      if (!league || !canAccessVenue(user, league.venue_id)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      await sql`UPDATE leagues SET status = 'completed' WHERE id = ${leagueId}`;
      return Response.json({ success: true });
    }

    if (action === "CREATE_NEW_SEASON") {
      const { parentLeagueId, seasonName, seasonStartDate } = data;

      const [parentLeague] =
        await sql`SELECT * FROM leagues WHERE id = ${parentLeagueId}`;
      if (!parentLeague) {
        throw new Error("Parent league not found");
      }
      if (!canAccessVenue(user, parentLeague.venue_id)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      let seasonEndDate = null;
      if (seasonStartDate) {
        const start = new Date(seasonStartDate);
        start.setMonth(start.getMonth() + 3);
        seasonEndDate = start.toISOString().split("T")[0];
      }

      const joinCode = randomBytes(4).toString("hex").toUpperCase();

      const newLeague = await withTransaction(async (txSql) => {
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
          RETURNING *
        `;
        const slotNumbers = Array.from({ length: parentLeague.max_teams }, (_, i) => i + 1);
        await txSql`
          INSERT INTO league_slots (league_id, slot_number)
          SELECT ${league.id}, unnest(${slotNumbers}::int[])
        `;
        return league;
      });

      return Response.json(newLeague);
    }

    if (action === "GENERATE_FIXTURES") {
      const { leagueId } = data;
      const [league] = await sql`SELECT * FROM leagues WHERE id = ${leagueId}`;
      if (!league || !canAccessVenue(user, league.venue_id)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const [existingMatch] = await sql`
        SELECT id FROM matches WHERE league_id = ${leagueId} LIMIT 1
      `;
      if (existingMatch) {
        return Response.json({ error: "Fixtures have already been generated for this league" }, { status: 400 });
      }

      const occupiedSlots = await sql`
        SELECT DISTINCT ls.id, ls.slot_number
        FROM league_slots ls
        INNER JOIN teams t ON t.slot_id = ls.id AND t.status = 'active'
        WHERE ls.league_id = ${leagueId}
        ORDER BY ls.slot_number
      `;

      const numSlots = occupiedSlots.length;
      if (numSlots < 2) {
        throw new Error("Need at least 2 teams to generate fixtures");
      }

      const rounds = numSlots % 2 === 0 ? numSlots - 1 : numSlots;

      const slotIds = occupiedSlots.map((s) => s.id);
      if (numSlots % 2 !== 0) slotIds.push(null);
      // Must use slotIds.length (after null is appended) so odd team counts
      // iterate over all pairs — using numSlots here leaves the middle pair unscheduled.
      const matchesPerRound = slotIds.length / 2;

      const fixtures = [];
      const currentSlotIds = [...slotIds];

      for (let r = 0; r < rounds; r++) {
        const roundMatches = [];
        for (let m = 0; m < matchesPerRound; m++) {
          const home = currentSlotIds[m];
          const away = currentSlotIds[currentSlotIds.length - 1 - m];
          if (home && away) {
            roundMatches.push({ home, away });
          }
        }
        fixtures.push(roundMatches);

        const last = currentSlotIds.pop();
        currentSlotIds.splice(1, 0, last);
      }

      const timeSlots = league.time_slots;
      const fieldsCount = league.fields_count;
      const startDate = new Date(league.season_start_date);

      const endDateStr = await withTransaction(async (txSql) => {
        await txSql`
          DELETE FROM league_slots
          WHERE league_id = ${leagueId}
          AND id NOT IN (
            SELECT slot_id FROM teams WHERE status = 'active' AND slot_id IS NOT NULL
          )
        `;

        let lastMatchDate = startDate;

        for (let r = 0; r < fixtures.length; r++) {
          const roundDate = new Date(startDate);
          roundDate.setDate(startDate.getDate() + r * 7);
          lastMatchDate = roundDate;

          const roundFixtures = fixtures[r];

          const slotFieldCombos = [];
          for (const tSlot of timeSlots) {
            for (let f = 1; f <= fieldsCount; f++) {
              slotFieldCombos.push({ tSlot, f });
            }
          }

          const shuffledFixtures = [...roundFixtures];
          for (let i = shuffledFixtures.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledFixtures[i], shuffledFixtures[j]] = [
              shuffledFixtures[j],
              shuffledFixtures[i],
            ];
          }

          if (shuffledFixtures.length > 0) {
            const dateStr = roundDate.toISOString().split("T")[0];
            const matchRows = shuffledFixtures.map((match, i) => {
              const { tSlot, f } = slotFieldCombos[i % slotFieldCombos.length];
              return { tSlot, f, home: match.home, away: match.away };
            });
            await txSql`
              INSERT INTO matches (league_id, round_number, match_date, time_slot, field_number, home_slot_id, away_slot_id)
              SELECT
                ${leagueId},
                ${r + 1},
                ${dateStr}::date,
                unnest(${matchRows.map((m) => m.tSlot)}::text[]),
                unnest(${matchRows.map((m) => m.f)}::int[]),
                unnest(${matchRows.map((m) => m.home)}::uuid[]),
                unnest(${matchRows.map((m) => m.away)}::uuid[])
            `;
          }
        }

        const endDate = lastMatchDate.toISOString().split("T")[0];
        await txSql`
          UPDATE leagues
          SET status = 'active', season_end_date = ${endDate}
          WHERE id = ${leagueId}
        `;

        // Seed standings rows for every active team, ordered alphabetically
        const activeTeams = await txSql`
          SELECT t.id as team_id
          FROM teams t
          INNER JOIN league_slots ls ON t.slot_id = ls.id
          WHERE ls.league_id = ${leagueId} AND t.status = 'active'
          ORDER BY t.name ASC
        `;
        if (activeTeams.length > 0) {
          await txSql`
            INSERT INTO standings (league_id, team_id, played, won, drawn, lost, goals_for, goals_against, goal_difference, points)
            SELECT ${leagueId}, unnest(${activeTeams.map((t) => t.team_id)}::uuid[]), 0, 0, 0, 0, 0, 0, 0, 0
            ON CONFLICT DO NOTHING
          `;
        }

        return endDate;
      });

      return Response.json({ success: true, endDate: endDateStr });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function GET(request) {
  const user = await requireRole(request, "venue_admin", "super_admin");
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venueId");
  const leagueId = searchParams.get("leagueId");

  if (leagueId) {
    const [league] = await sql`SELECT * FROM leagues WHERE id = ${leagueId}`;
    if (!league || !canAccessVenue(user, league.venue_id)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return Response.json(league);
  }

  if (venueId) {
    if (!canAccessVenue(user, venueId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const leagues =
      await sql`SELECT * FROM leagues WHERE venue_id = ${venueId} ORDER BY season_start_date DESC`;
    return Response.json(leagues);
  }

  if (user.role !== "super_admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const leagues =
    await sql`SELECT * FROM leagues ORDER BY season_start_date DESC`;
  return Response.json(leagues);
}
