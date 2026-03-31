import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const { leagueId, teamName, captainUserId } = await request.json();

    // Find next available slot
    const [availableSlot] = await sql`
      SELECT ls.id 
      FROM league_slots ls
      LEFT JOIN teams t ON t.slot_id = ls.id AND t.status = 'active'
      WHERE ls.league_id = ${leagueId} AND t.id IS NULL
      ORDER BY ls.slot_number
      LIMIT 1
    `;

    if (!availableSlot)
      return Response.json({ error: "League is full" }, { status: 400 });

    const [team] = await sql`
      INSERT INTO teams (league_id, slot_id, name, captain_user_id)
      VALUES (${leagueId}, ${availableSlot.id}, ${teamName}, ${captainUserId})
      RETURNING *
    `;

    return Response.json(team);
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
