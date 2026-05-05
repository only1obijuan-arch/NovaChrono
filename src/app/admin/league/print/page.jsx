import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

export default async function PrintFixtures({ params }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id || !["venue_admin", "super_admin"].includes(session.user.role)) return <div>Unauthorized</div>;
  const [league] = await sql`SELECT * FROM leagues WHERE id = ${id}`;
  if (!league) return <div>League not found</div>;
  if (session.user.role !== "super_admin" && String(session.user.venue_id) !== String(league.venue_id)) return <div>Access denied</div>;
  const matches = await sql`SELECT m.match_date, m.field_number, m.time_slot, m.round_number, th.name as home_team_name, ta.name as away_team_name, ref.name as referee_name FROM matches m LEFT JOIN league_slots lsh ON m.home_slot_id=lsh.id LEFT JOIN teams th ON th.slot_id=lsh.id AND th.status='active' LEFT JOIN league_slots lsa ON m.away_slot_id=lsa.id LEFT JOIN teams ta ON ta.slot_id=lsa.id AND ta.status='active' LEFT JOIN auth_users ref ON ref.id = m.referee_id WHERE m.league_id = ${id} ORDER BY m.match_date, m.field_number, m.time_slot`;
  return <html><body style={{ fontFamily:'Arial, sans-serif', padding:24, color:'#111' }}><h1 style={{ marginBottom:4 }}>{league.name} — Fixture Sheet</h1><p style={{ marginTop:0, color:'#555' }}>Printed {new Date().toLocaleDateString()}</p><table style={{ width:'100%', borderCollapse:'collapse' }}><thead><tr>{['Date','Round','Field','Time','Home','Away','Referee'].map(h => <th key={h} style={{ border:'1px solid #ccc', padding:8, textAlign:'left', background:'#f5f5f5' }}>{h}</th>)}</tr></thead><tbody>{matches.map((m, i) => <tr key={i}><td style={{ border:'1px solid #ddd', padding:8 }}>{new Date(m.match_date).toLocaleDateString()}</td><td style={{ border:'1px solid #ddd', padding:8 }}>{m.round_number}</td><td style={{ border:'1px solid #ddd', padding:8 }}>{m.field_number}</td><td style={{ border:'1px solid #ddd', padding:8 }}>{m.time_slot}</td><td style={{ border:'1px solid #ddd', padding:8 }}>{m.home_team_name || 'TBD'}</td><td style={{ border:'1px solid #ddd', padding:8 }}>{m.away_team_name || 'TBD'}</td><td style={{ border:'1px solid #ddd', padding:8 }}>{m.referee_name || 'Unassigned'}</td></tr>)}</tbody></table><script dangerouslySetInnerHTML={{ __html: 'window.onload=()=>window.print()' }} /></body></html>;
}