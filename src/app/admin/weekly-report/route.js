import sql from "@/app/api/utils/sql";
import { requireRole } from "@/app/api/utils/auth";

export async function GET(request) {
  const user = await requireRole(request, "venue_admin", "super_admin");
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const venueId = user.role === "super_admin" ? searchParams.get("venueId") : user.venue_id;
  if (!venueId) return Response.json({ error: "venueId required" }, { status: 400 });
  const matchesPlayed = await sql`SELECT COUNT(*)::int as count FROM matches m JOIN leagues l ON l.id = m.league_id WHERE l.venue_id = ${venueId} AND m.status = 'final' AND m.match_date >= CURRENT_DATE - INTERVAL '7 days'`;
  const goalsScored = await sql`SELECT COUNT(*)::int as count FROM match_events me JOIN matches m ON m.id = me.match_id JOIN leagues l ON l.id = m.league_id WHERE l.venue_id = ${venueId} AND me.type IN ('goal_home','goal_away') AND me.event_timestamp >= NOW() - INTERVAL '7 days'`;
  const upcoming = await sql`SELECT m.id, m.match_date, m.time_slot, m.field_number, th.name as home_team_name, ta.name as away_team_name FROM matches m JOIN leagues l ON l.id = m.league_id LEFT JOIN league_slots lsh ON m.home_slot_id=lsh.id LEFT JOIN teams th ON th.slot_id=lsh.id AND th.status='active' LEFT JOIN league_slots lsa ON m.away_slot_id=lsa.id LEFT JOIN teams ta ON ta.slot_id=lsa.id AND ta.status='active' WHERE l.venue_id = ${venueId} AND m.status='scheduled' AND m.match_date >= CURRENT_DATE ORDER BY m.match_date, m.time_slot LIMIT 10`;
  const topScorers = await sql`SELECT p.name as player_name, COUNT(*)::int as goals FROM match_events me JOIN players p ON p.id=me.player_id JOIN teams t ON t.id = p.team_id JOIN league_slots ls ON ls.id=t.slot_id JOIN leagues l ON l.id=ls.league_id WHERE l.venue_id=${venueId} AND me.type IN ('goal_home','goal_away') GROUP BY p.id, p.name ORDER BY goals DESC LIMIT 5`;
  return Response.json({ matchesPlayed: matchesPlayed[0]?.count || 0, goalsScored: goalsScored[0]?.count || 0, upcoming, topScorers });
}
