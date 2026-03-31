import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

// Helper — get session role
async function getSession() {
  const session = await auth();
  return session?.user ?? null;
}

const WRITE_ROLES = ["referee", "venue_admin", "super_admin"];
const ADMIN_ROLES = ["venue_admin", "super_admin"];

export async function POST(request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!WRITE_ROLES.includes(user.role)) {
      return Response.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const { action, matchId, ...data } = await request.json();

    if (action === "START_MATCH") {
      await sql`UPDATE matches SET status = 'live', start_time = CURRENT_TIMESTAMP WHERE id = ${matchId}`;
      await sql`INSERT INTO match_events (match_id, type) VALUES (${matchId}, 'start_first_half')`;
      return Response.json({ success: true });
    }

    if (action === "RECORD_GOAL") {
      const { type, playerId } = data;
      await sql`INSERT INTO match_events (match_id, type, player_id) VALUES (${matchId}, ${type}, ${playerId})`;
      if (type === "goal_home") {
        await sql`UPDATE matches SET home_score = home_score + 1 WHERE id = ${matchId}`;
      } else {
        await sql`UPDATE matches SET away_score = away_score + 1 WHERE id = ${matchId}`;
      }
      return Response.json({ success: true });
    }

    if (action === "DELETE_EVENT") {
      const { eventId } = data;
      const [event] =
        await sql`SELECT * FROM match_events WHERE id = ${eventId}`;
      if (event && (event.type === "goal_home" || event.type === "goal_away")) {
        if (event.type === "goal_home") {
          await sql`UPDATE matches SET home_score = GREATEST(0, home_score - 1) WHERE id = ${event.match_id}`;
        } else {
          await sql`UPDATE matches SET away_score = GREATEST(0, away_score - 1) WHERE id = ${event.match_id}`;
        }
      }
      await sql`DELETE FROM match_events WHERE id = ${eventId}`;
      return Response.json({ success: true });
    }

    if (action === "END_MATCH") {
      await sql`UPDATE matches SET status = 'final', end_time = CURRENT_TIMESTAMP WHERE id = ${matchId}`;
      await sql`INSERT INTO match_events (match_id, type) VALUES (${matchId}, 'end_match')`;
      return Response.json({ success: true });
    }

    if (action === "ADMIN_OVERRIDE") {
      // Only admins can override scores
      if (!ADMIN_ROLES.includes(user.role)) {
        return Response.json(
          { error: "Admin access required" },
          { status: 403 },
        );
      }
      const { homeScore, awayScore, status, reason } = data;
      const [oldMatch] = await sql`SELECT * FROM matches WHERE id = ${matchId}`;
      await sql`UPDATE matches SET home_score = ${homeScore}, away_score = ${awayScore}, status = ${status} WHERE id = ${matchId}`;
      await sql`
        INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value, reason)
        VALUES (${user.id}, ${matchId}, 'ADMIN_OVERRIDE', ${JSON.stringify(
          oldMatch,
        )}, ${JSON.stringify({ homeScore, awayScore, status })}, ${reason})
      `;
      return Response.json({ success: true });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  // GET is public — matches are visible to spectators, captains, refs etc.
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
             ta.id as away_team_id
      FROM matches m
      LEFT JOIN league_slots lsh ON m.home_slot_id = lsh.id
      LEFT JOIN teams th ON th.slot_id = lsh.id AND th.status = 'active'
      LEFT JOIN league_slots lsa ON m.away_slot_id = lsa.id
      LEFT JOIN teams ta ON ta.slot_id = lsa.id AND ta.status = 'active'
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
             ta.name as away_team_name
      FROM matches m
      JOIN leagues l ON m.league_id = l.id
      LEFT JOIN league_slots lsh ON m.home_slot_id = lsh.id
      LEFT JOIN teams th ON th.slot_id = lsh.id AND th.status = 'active'
      LEFT JOIN league_slots lsa ON m.away_slot_id = lsa.id
      LEFT JOIN teams ta ON ta.slot_id = lsa.id AND ta.status = 'active'
      WHERE m.match_date = ${date}
      AND (${venueId}::uuid IS NULL OR l.venue_id = ${venueId}::uuid)
      AND (${fieldNumber}::int IS NULL OR m.field_number = ${fieldNumber}::int)
      ORDER BY m.time_slot, m.field_number
    `;
    return Response.json(matches);
  }

  return Response.json({ error: "Missing parameters" }, { status: 400 });
}
