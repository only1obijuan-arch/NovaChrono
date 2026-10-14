import sql, { withTransaction } from "@/app/api/utils/sql";
import { requireRole, resolveCurrentUser } from "@/app/api/utils/auth";
import { canAdministerVenue, canManageTeam, UUID_RE } from "@/app/api/utils/ownership";
import { recomputeLeagueStandings } from "@/app/api/matches/standings";
import { z } from "zod";

const uuid = () => z.string().uuid();
const teamName = z.string().trim().min(1).max(100);
const reason = z.string().trim().min(1).max(500);
const VACATE_POLICY = "VACATE_FOR_REPLACEMENT";

const teamActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("JOIN_LEAGUE"), joinCode: z.string().trim().min(1).max(32), teamName }),
  z.object({ action: z.literal("ADD_TEAM"), leagueId: uuid(), teamName, captainUserId: uuid().nullable().optional() }),
  z.object({ action: z.literal("UPDATE_TEAM"), teamId: uuid(), teamName }),
  z.object({ action: z.literal("WITHDRAW_TEAM"), teamId: uuid(), reason, policy: z.literal(VACATE_POLICY) }),
  // Older clients get the same auditable withdrawal, never a deletion.
  z.object({ action: z.literal("DELETE_TEAM"), teamId: uuid(), reason, policy: z.literal(VACATE_POLICY) }),
  z.object({
    action: z.literal("REPLACE_TEAM"),
    priorTeamId: uuid(),
    teamName,
    captainUserId: uuid().nullable().optional(),
    transferFutureFixtures: z.boolean(),
    reason,
  }),
]);

function errorResponse(error, status) {
  return Response.json({ error }, { status });
}

async function lockActor(txSql, identityId) {
  const [actor] = await txSql`
    SELECT id, role, venue_id, organization_id
    FROM auth_users
    WHERE id = ${identityId}
    FOR SHARE
  `;
  return actor ?? null;
}

async function claimRegistrationSlot(txSql, leagueId) {
  const [slot] = await txSql`
    SELECT ls.id, ls.slot_number
    FROM league_slots ls
    LEFT JOIN teams active_team
      ON active_team.slot_id = ls.id AND active_team.status = 'active'
    WHERE ls.league_id = ${leagueId} AND active_team.id IS NULL
    ORDER BY ls.slot_number, ls.id
    LIMIT 1
    FOR UPDATE OF ls SKIP LOCKED
  `;
  return slot ?? null;
}

async function discoverTeamScope(teamId) {
  const [team] = await sql`SELECT id, league_id FROM teams WHERE id = ${teamId}`;
  if (!team) return null;
  const matches = await sql`
    SELECT id
    FROM matches
    WHERE home_team_id = ${teamId} OR away_team_id = ${teamId}
    ORDER BY id
  `;
  return { team, matchIds: matches.map((match) => match.id) };
}

async function lockKnownTeamMatches(txSql, teamId, knownIds) {
  if (knownIds.length > 0) {
    await txSql`
      SELECT id
      FROM matches
      WHERE id = ANY(${knownIds}::uuid[])
      ORDER BY id
      FOR UPDATE
    `;
  }
  const current = await txSql`
    SELECT id, status, home_team_id, away_team_id
    FROM matches
    WHERE home_team_id = ${teamId} OR away_team_id = ${teamId}
    ORDER BY id
  `;
  const currentIds = current.map((match) => match.id);
  if (currentIds.length !== knownIds.length || currentIds.some((id, index) => id !== knownIds[index])) {
    return { response: errorResponse("Team fixtures changed concurrently; retry the operation", 409) };
  }
  return { matches: current };
}

async function verifyKnownTeamMatchScope(txSql, teamId, knownIds) {
  const current = await txSql`
    SELECT id
    FROM matches
    WHERE home_team_id = ${teamId} OR away_team_id = ${teamId}
    ORDER BY id
  `;
  return current.length === knownIds.length && current.every((match, index) => match.id === knownIds[index]);
}

export async function POST(request) {
  try {
    const user = await requireRole(request, "captain", "venue_admin", "org_admin", "super_admin");
    if (!user) return errorResponse("Unauthorized", 401);
    const parsed = teamActionSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(parsed.error.format(), 400);
    const { action } = parsed.data;

    if (action === "JOIN_LEAGUE") {
      const { joinCode, teamName: requestedName } = parsed.data;
      return await withTransaction(async (txSql) => {
        const [league] = await txSql`
          SELECT l.id, l.name, l.venue_id, l.status, v.organization_id
          FROM leagues l JOIN venues v ON v.id = l.venue_id
          WHERE UPPER(l.join_code) = UPPER(${joinCode})
          FOR UPDATE OF l
        `;
        if (!league) return errorResponse("Invalid join code", 404);
        const actor = await lockActor(txSql, user.id);
        if (!actor) return errorResponse("Unauthorized", 401);
        if (actor.role !== "captain") return errorResponse("Captain access required", 403);
        if (league.status !== "registration") return errorResponse("League registration is closed", 409);
        const [existing] = await txSql`
          SELECT id FROM teams
          WHERE league_id = ${league.id} AND captain_user_id = ${actor.id} AND status = 'active'
          FOR SHARE
        `;
        if (existing) return errorResponse("You already have a team in this league", 409);
        const slot = await claimRegistrationSlot(txSql, league.id);
        if (!slot) return errorResponse("League is full", 409);
        const [team] = await txSql`
          INSERT INTO teams (league_id, slot_id, name, captain_user_id)
          VALUES (${league.id}, ${slot.id}, ${requestedName}, ${actor.id})
          RETURNING *
        `;
        return Response.json(team);
      });
    }

    if (action === "ADD_TEAM") {
      const { leagueId, teamName: requestedName, captainUserId = null } = parsed.data;
      return await withTransaction(async (txSql) => {
        const [league] = await txSql`
          SELECT l.id, l.venue_id, l.status, v.organization_id
          FROM leagues l JOIN venues v ON v.id = l.venue_id
          WHERE l.id = ${leagueId}
          FOR UPDATE OF l
        `;
        if (!league) return errorResponse("League not found", 404);
        const actor = await lockActor(txSql, user.id);
        if (!actor) return errorResponse("Unauthorized", 401);
        if (!canAdministerVenue(actor, league.venue_id, league.organization_id)) return errorResponse("Forbidden", 403);
        if (league.status !== "registration") return errorResponse("Teams can only be added during registration", 409);
        if (captainUserId) {
          const [captain] = await txSql`SELECT id FROM auth_users WHERE id = ${captainUserId} AND role = 'captain' FOR SHARE`;
          if (!captain) return errorResponse("Captain not found", 404);
          const [existing] = await txSql`
            SELECT id FROM teams
            WHERE league_id = ${leagueId} AND captain_user_id = ${captainUserId} AND status = 'active'
            FOR SHARE
          `;
          if (existing) return errorResponse("Captain already has a team in this league", 409);
        }
        const slot = await claimRegistrationSlot(txSql, leagueId);
        if (!slot) return errorResponse("League is full", 409);
        const [team] = await txSql`
          INSERT INTO teams (league_id, slot_id, name, captain_user_id)
          VALUES (${leagueId}, ${slot.id}, ${requestedName}, ${captainUserId})
          RETURNING *
        `;
        return Response.json(team);
      });
    }

    if (action === "UPDATE_TEAM") {
      const { teamId, teamName: requestedName } = parsed.data;
      return await withTransaction(async (txSql) => {
        const [team] = await txSql`
          SELECT t.*, l.venue_id, v.organization_id
          FROM teams t JOIN leagues l ON l.id = t.league_id JOIN venues v ON v.id = l.venue_id
          WHERE t.id = ${teamId}
          FOR UPDATE OF t
        `;
        if (!team) return errorResponse("Team not found", 404);
        const actor = await lockActor(txSql, user.id);
        if (!actor) return errorResponse("Unauthorized", 401);
        if (!canManageTeam(actor, team)) return errorResponse("Forbidden", 403);
        const [updated] = await txSql`UPDATE teams SET name = ${requestedName} WHERE id = ${teamId} RETURNING *`;
        return Response.json(updated);
      });
    }

    if (action === "WITHDRAW_TEAM" || action === "DELETE_TEAM") {
      const { teamId, reason: withdrawalReason, policy } = parsed.data;
      const scope = await discoverTeamScope(teamId);
      if (!scope) return errorResponse("Team not found", 404);
      return await withTransaction(async (txSql) => {
        const lockedMatches = await lockKnownTeamMatches(txSql, teamId, scope.matchIds);
        if (lockedMatches.response) return lockedMatches.response;
        const [league] = await txSql`
          SELECT l.id, l.venue_id, l.status, v.organization_id
          FROM leagues l JOIN venues v ON v.id = l.venue_id
          WHERE l.id = ${scope.team.league_id}
          FOR UPDATE OF l
        `;
        if (!league) return errorResponse("League not found", 404);
        if (!(await verifyKnownTeamMatchScope(txSql, teamId, scope.matchIds))) {
          return errorResponse("Team fixtures changed concurrently; retry the operation", 409);
        }
        const [team] = await txSql`
          SELECT t.* FROM teams t JOIN league_slots ls ON ls.id = t.slot_id
          WHERE t.id = ${teamId}
          FOR UPDATE OF ls, t
        `;
        if (!team) return errorResponse("Team not found", 404);
        const actor = await lockActor(txSql, user.id);
        if (!actor) return errorResponse("Unauthorized", 401);
        if (!canAdministerVenue(actor, league.venue_id, league.organization_id)) return errorResponse("Forbidden", 403);
        if (league.status !== "active") return errorResponse("Teams can only be withdrawn from an active league", 409);
        if (lockedMatches.matches.some((match) => match.status === "live")) return errorResponse("A team with a live match cannot be withdrawn", 409);
        if (team.status === "inactive") return Response.json({ success: true, idempotent: true, policy });
        await txSql`UPDATE teams SET status = 'inactive' WHERE id = ${teamId}`;
        await recomputeLeagueStandings(txSql, league.id);
        await txSql`
          INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value, reason)
          VALUES (
            ${actor.id}, ${teamId}, 'WITHDRAW_TEAM',
            ${JSON.stringify({ status: team.status, slot_id: team.slot_id, name: team.name })},
            ${JSON.stringify({ status: "inactive", slot_id: team.slot_id, policy, legacy_action: action === "DELETE_TEAM", fixture_ids: scope.matchIds })},
            ${withdrawalReason}
          )
        `;
        return Response.json({ success: true, idempotent: false, policy });
      });
    }

    if (action === "REPLACE_TEAM") {
      const { priorTeamId, teamName: requestedName, captainUserId = null, transferFutureFixtures, reason: replacementReason } = parsed.data;
      const scope = await discoverTeamScope(priorTeamId);
      if (!scope) return errorResponse("Prior team not found", 404);
      return await withTransaction(async (txSql) => {
        const lockedMatches = await lockKnownTeamMatches(txSql, priorTeamId, scope.matchIds);
        if (lockedMatches.response) return lockedMatches.response;
        const [league] = await txSql`
          SELECT l.id, l.venue_id, l.status, v.organization_id
          FROM leagues l JOIN venues v ON v.id = l.venue_id
          WHERE l.id = ${scope.team.league_id}
          FOR UPDATE OF l
        `;
        if (!league) return errorResponse("League not found", 404);
        if (!(await verifyKnownTeamMatchScope(txSql, priorTeamId, scope.matchIds))) {
          return errorResponse("Team fixtures changed concurrently; retry the operation", 409);
        }
        const [priorTeam] = await txSql`
          SELECT t.* FROM teams t JOIN league_slots ls ON ls.id = t.slot_id
          WHERE t.id = ${priorTeamId}
          FOR UPDATE OF ls, t
        `;
        if (!priorTeam) return errorResponse("Prior team not found", 404);
        const actor = await lockActor(txSql, user.id);
        if (!actor) return errorResponse("Unauthorized", 401);
        if (!canAdministerVenue(actor, league.venue_id, league.organization_id)) return errorResponse("Forbidden", 403);
        if (league.status !== "active") return errorResponse("Teams can only be replaced in an active league", 409);
        if (priorTeam.status !== "inactive") return errorResponse("Withdraw the prior team before replacing it", 409);
        const [activeOccupant] = await txSql`SELECT id FROM teams WHERE slot_id = ${priorTeam.slot_id} AND status = 'active' FOR SHARE`;
        if (activeOccupant) return errorResponse("This slot already has an active team", 409);
        if (captainUserId) {
          const [captain] = await txSql`SELECT id FROM auth_users WHERE id = ${captainUserId} AND role = 'captain' FOR SHARE`;
          if (!captain) return errorResponse("Captain not found", 404);
        }
        const [newTeam] = await txSql`
          INSERT INTO teams (league_id, slot_id, name, captain_user_id)
          VALUES (${priorTeam.league_id}, ${priorTeam.slot_id}, ${requestedName}, ${captainUserId})
          RETURNING *
        `;
        let transferred = [];
        if (transferFutureFixtures) {
          transferred = await txSql`
            UPDATE matches
            SET home_team_id = CASE WHEN home_team_id = ${priorTeamId} THEN ${newTeam.id} ELSE home_team_id END,
                away_team_id = CASE WHEN away_team_id = ${priorTeamId} THEN ${newTeam.id} ELSE away_team_id END
            WHERE (home_team_id = ${priorTeamId} OR away_team_id = ${priorTeamId})
              AND status IN ('scheduled', 'postponed')
            RETURNING id
          `;
        }
        await recomputeLeagueStandings(txSql, league.id);
        await txSql`
          INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value, reason)
          VALUES (
            ${actor.id}, ${newTeam.id}, 'REPLACE_TEAM',
            ${JSON.stringify({ prior_team_id: priorTeam.id, slot_id: priorTeam.slot_id, status: priorTeam.status })},
            ${JSON.stringify({ new_team_id: newTeam.id, slot_id: newTeam.slot_id, transfer_future_fixtures: transferFutureFixtures, transferred_fixture_ids: transferred.map((match) => match.id) })},
            ${replacementReason}
          )
        `;
        return Response.json({ team: newTeam, transferredFixtureIds: transferred.map((match) => match.id) });
      });
    }
    return errorResponse("Invalid action", 400);
  } catch (error) {
    if (error?.code === "23505") return errorResponse("That slot or captain is already assigned", 409);
    console.error(error);
    return errorResponse("An unexpected error occurred.", 500);
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get("leagueId");
  const teamId = searchParams.get("teamId");
  const joinCode = searchParams.get("joinCode");
  const captainUserId = searchParams.get("captainUserId");
  if (teamId) {
    if (!UUID_RE.test(teamId)) return errorResponse("Invalid team ID", 400);
    const user = await resolveCurrentUser(request);
    if (!user) return errorResponse("Unauthorized", 401);
    const [team] = await sql`
      SELECT t.*, au.name AS captain_name, l.venue_id, v.organization_id
      FROM teams t JOIN leagues l ON l.id = t.league_id JOIN venues v ON v.id = l.venue_id
      LEFT JOIN auth_users au ON au.id = t.captain_user_id
      WHERE t.id = ${teamId}
    `;
    if (!team) return errorResponse("Team not found", 404);
    if (!canManageTeam(user, team)) return errorResponse("Forbidden", 403);
    return Response.json(team);
  }
  if (captainUserId) {
    if (!UUID_RE.test(captainUserId)) return errorResponse("Invalid captain ID", 400);
    const user = await resolveCurrentUser(request);
    if (!user) return errorResponse("Unauthorized", 401);
    const [team] = await sql`
      SELECT t.*, au.name as captain_name, l.venue_id, v.organization_id
      FROM teams t JOIN leagues l ON l.id = t.league_id JOIN venues v ON v.id = l.venue_id
      LEFT JOIN auth_users au ON t.captain_user_id = au.id
      WHERE t.captain_user_id = ${captainUserId} AND t.status = 'active'
      ORDER BY t.created_at DESC LIMIT 1
    `;
    if (team && !canManageTeam(user, team)) return errorResponse("Forbidden", 403);
    return Response.json(team || null);
  }
  if (joinCode) {
    const [league] = await sql`SELECT id FROM leagues WHERE join_code = ${joinCode}`;
    if (!league) return Response.json([]);
    const teams = await sql`SELECT id, league_id, slot_id, name, status FROM teams WHERE league_id = ${league.id} AND status = 'active'`;
    return Response.json(teams);
  }
  if (leagueId) {
    const [league] = await sql`
      SELECT l.venue_id, v.organization_id FROM leagues l JOIN venues v ON v.id = l.venue_id WHERE l.id = ${leagueId}
    `;
    if (!league) return Response.json([]);
    const user = await resolveCurrentUser(request);
    const canSeeAdminProjection = Boolean(user && ["venue_admin", "org_admin", "super_admin"].includes(user.role)
      && canAdministerVenue(user, league.venue_id, league.organization_id));
    const teams = canSeeAdminProjection
      ? await sql`
          SELECT t.id, t.league_id, t.slot_id, t.name, t.status,
                 t.captain_user_id, t.created_at, au.name AS captain_name, ls.slot_number
          FROM teams t
          LEFT JOIN auth_users au ON au.id = t.captain_user_id
          LEFT JOIN league_slots ls ON ls.id = t.slot_id
          WHERE t.league_id = ${leagueId}
          ORDER BY ls.slot_number ASC, t.created_at ASC
        `
      : await sql`
          SELECT t.id, t.league_id, t.slot_id, t.name, t.status
          FROM teams t WHERE t.league_id = ${leagueId} AND t.status = 'active'
        `;
    return Response.json(teams);
  }
  return errorResponse("Missing parameters", 400);
}
