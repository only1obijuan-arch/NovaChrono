import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const { action, ...data } = await request.json();

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

      if (!seasonEndDate && seasonStartDate) {
        const start = new Date(seasonStartDate);
        start.setMonth(start.getMonth() + 3);
        seasonEndDate = start.toISOString().split("T")[0];
      }

      const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      const [league] = await sql`
        INSERT INTO leagues (venue_id, name, day_of_week, season_start_date, season_end_date, match_format, match_duration_minutes, fields_count, time_slots, max_teams, join_code)
        VALUES (${venueId}, ${name}, ${dayOfWeek}, ${seasonStartDate}, ${seasonEndDate}, ${matchFormat}, ${matchDuration}, ${fieldsCount}, ${JSON.stringify(
          timeSlots,
        )}, ${maxTeams}, ${joinCode})
        RETURNING *
      `;

      for (let i = 1; i <= maxTeams; i++) {
        await sql`INSERT INTO league_slots (league_id, slot_number) VALUES (${league.id}, ${i})`;
      }

      return Response.json(league);
    }

    if (action === "CANCEL_LEAGUE") {
      const { leagueId } = data;
      await sql`UPDATE leagues SET status = 'cancelled' WHERE id = ${leagueId}`;
      return Response.json({ success: true });
    }

    if (action === "COMPLETE_SEASON") {
      const { leagueId } = data;
      await sql`UPDATE leagues SET status = 'completed' WHERE id = ${leagueId}`;
      return Response.json({ success: true });
    }

    if (action === "CREATE_NEW_SEASON") {
      const { parentLeagueId, seasonName } = data;

      const [parentLeague] =
        await sql`SELECT * FROM leagues WHERE id = ${parentLeagueId}`;
      if (!parentLeague) {
        throw new Error("Parent league not found");
      }

      const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      const [newLeague] = await sql`
        INSERT INTO leagues (
          venue_id, name, day_of_week, season_start_date, season_end_date,
          match_format, match_duration_minutes, fields_count, time_slots,
          max_teams, join_code, status, season_name, parent_league_id
        )
        VALUES (
          ${parentLeague.venue_id}, ${parentLeague.name}, ${
            parentLeague.day_of_week
          },
          NULL, NULL, ${parentLeague.match_format}, ${
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

      for (let i = 1; i <= parentLeague.max_teams; i++) {
        await sql`INSERT INTO league_slots (league_id, slot_number) VALUES (${newLeague.id}, ${i})`;
      }

      return Response.json(newLeague);
    }

    if (action === "GENERATE_FIXTURES") {
      const { leagueId } = data;
      const [league] = await sql`SELECT * FROM leagues WHERE id = ${leagueId}`;

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

      await sql`
        DELETE FROM league_slots
        WHERE league_id = ${leagueId}
        AND id NOT IN (
          SELECT slot_id FROM teams WHERE status = 'active' AND slot_id IS NOT NULL
        )
      `;

      const numSlots = occupiedSlots.length;
      if (numSlots < 2) {
        throw new Error("Need at least 2 teams to generate fixtures");
      }

      const rounds = numSlots % 2 === 0 ? numSlots - 1 : numSlots;
      const matchesPerRound = Math.floor(numSlots / 2);

      const slotIds = occupiedSlots.map((s) => s.id);
      if (numSlots % 2 !== 0) slotIds.push(null);

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

        for (let i = 0; i < shuffledFixtures.length; i++) {
          const match = shuffledFixtures[i];
          const { tSlot, f } = slotFieldCombos[i % slotFieldCombos.length];
          await sql`
            INSERT INTO matches (league_id, round_number, match_date, time_slot, field_number, home_slot_id, away_slot_id)
            VALUES (${leagueId}, ${r + 1}, ${
              roundDate.toISOString().split("T")[0]
            }, ${tSlot}, ${f}, ${match.home}, ${match.away})
          `;
        }
      }

      const endDateStr = lastMatchDate.toISOString().split("T")[0];
      await sql`
        UPDATE leagues
        SET status = 'active', season_end_date = ${endDateStr}
        WHERE id = ${leagueId}
      `;

      // Seed standings rows for every active team, ordered alphabetically
      const activeTeams = await sql`
        SELECT t.id as team_id
        FROM teams t
        INNER JOIN league_slots ls ON t.slot_id = ls.id
        WHERE ls.league_id = ${leagueId} AND t.status = 'active'
        ORDER BY t.name ASC
      `;
      for (const team of activeTeams) {
        await sql`
          INSERT INTO standings (league_id, team_id, played, won, drawn, lost, goals_for, goals_against, goal_difference, points)
          VALUES (${leagueId}, ${team.team_id}, 0, 0, 0, 0, 0, 0, 0, 0)
          ON CONFLICT DO NOTHING
        `;
      }

      return Response.json({ success: true, endDate: endDateStr });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venueId");
  const leagueId = searchParams.get("leagueId");

  if (leagueId) {
    const [league] = await sql`SELECT * FROM leagues WHERE id = ${leagueId}`;
    return Response.json(league);
  }

  if (venueId) {
    const leagues =
      await sql`SELECT * FROM leagues WHERE venue_id = ${venueId} ORDER BY season_start_date DESC`;
    return Response.json(leagues);
  }

  const leagues =
    await sql`SELECT * FROM leagues ORDER BY season_start_date DESC`;
  return Response.json(leagues);
}
