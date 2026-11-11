import { randomUUID } from "crypto";
import { verify } from "argon2";
import { withTransaction } from "@/app/api/utils/sql";
import { invalidateUserSessions } from "@/app/api/utils/session-security";

export const ACCOUNT_STATUS = Object.freeze({
  ACTIVE: "active",
  PENDING: "pending_deletion",
  DEIDENTIFIED: "deidentified",
});

export class LifecycleError extends Error {
  constructor(code, status, message, details) {
    super(message);
    this.name = "LifecycleError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
export function accountLifecycleMutationsEnabled() {
  return process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED === "true";
}

export function requireAccountLifecycleMutationsEnabled() {
  if (!accountLifecycleMutationsEnabled()) {
    throw new LifecycleError(
      "LIFECYCLE_DISABLED",
      503,
      "Account lifecycle requests are not currently available",
    );
  }
}

export function deidentifiedEmailForUserId(userId) {
  const compact = String(userId).toLowerCase().replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/.test(compact)) {
    throw new TypeError("A valid UUID is required");
  }
  return `deidentified+${compact}@account.invalid`;
}

export function historicalAccountLabel(role) {
  switch (role) {
    case "captain": return "Former captain";
    case "referee": return "Former referee";
    case "venue_admin": return "Former venue administrator";
    case "org_admin": return "Former organisation administrator";
    default: return "Former administrator";
  }
}

export function isReservedLifecycleEmail(email) {
  return typeof email === "string" && email.trim().toLowerCase().endsWith("@account.invalid");
}

async function deleteLegacyWebSessions(txSql, userId) {
  const [state] = await txSql`
    SELECT to_regclass('public.auth_sessions') IS NOT NULL AS exists
  `;
  if (state?.exists) {
    await txSql`DELETE FROM auth_sessions WHERE "userId"::text = ${String(userId)}`;
  }
}

async function lockActiveSuperAdmins(txSql) {
  return txSql`
    SELECT id
    FROM auth_users
    WHERE role = 'super_admin' AND account_status = 'active'
    ORDER BY id
    FOR UPDATE
  `;
}

async function lockAllSuperAdministrators(txSql) {
  return txSql`
    SELECT id, email, name, role, venue_id, organization_id, account_status,
           deletion_request_id, deletion_requested_at
    FROM auth_users
    WHERE role = 'super_admin'
    ORDER BY id
    FOR UPDATE
  `;
}

export async function getLifecycleBlockers(txSql, user) {
  const blockers = [];

  const activeTeams = await txSql`
    SELECT t.id, t.name, l.venue_id
    FROM teams t
    JOIN leagues l ON l.id = t.league_id
    WHERE t.captain_user_id = ${user.id}
      AND t.status = 'active'
    ORDER BY t.id
  `;
  if (activeTeams.length) blockers.push({ type: "active_teams", records: activeTeams });

  const futureFixtures = await txSql`
    SELECT m.id, m.status, m.match_date, l.venue_id
    FROM matches m
    JOIN leagues l ON l.id = m.league_id
    WHERE m.referee_id = ${user.id}
      AND m.status IN ('scheduled', 'live', 'postponed')
    ORDER BY m.id
  `;
  if (futureFixtures.length) blockers.push({ type: "future_referee_fixtures", records: futureFixtures });

  if (user.role === "venue_admin" && user.venue_id) {
    const [coverage] = await txSql`
      SELECT EXISTS (
        SELECT 1 FROM auth_users
        WHERE id <> ${user.id}
          AND account_status = 'active'
          AND (
            (role = 'venue_admin' AND venue_id = ${user.venue_id})
            OR (role = 'org_admin' AND organization_id = ${user.organization_id})
            OR role = 'super_admin'
          )
      ) AS covered
    `;
    if (!coverage?.covered) blockers.push({ type: "venue_admin_coverage", records: [] });
  }

  if (user.role === "org_admin" && user.organization_id) {
    const [coverage] = await txSql`
      SELECT EXISTS (
        SELECT 1 FROM auth_users
        WHERE id <> ${user.id}
          AND account_status = 'active'
          AND (
            (role = 'org_admin' AND organization_id = ${user.organization_id})
            OR role = 'super_admin'
          )
      ) AS covered
    `;
    if (!coverage?.covered) blockers.push({ type: "organization_admin_coverage", records: [] });
  }

  return blockers;
}

export async function requestAccountDeletion({ userId, password }) {
  requireAccountLifecycleMutationsEnabled();
  return withTransaction(async (txSql) => {
    // Lock the complete super-admin set first for every request. Besides making
    // the final-admin count atomic, this closes the race where a target's role
    // changes between a preliminary lookup and its row lock.
    const lockedSuperAdmins = await lockAllSuperAdministrators(txSql);
    let user = lockedSuperAdmins.find((row) => String(row.id) === String(userId));
    if (!user) {
      [user] = await txSql`
        SELECT id, email, name, role, venue_id, organization_id, account_status,
               deletion_request_id, deletion_requested_at
        FROM auth_users
        WHERE id = ${userId}
        FOR UPDATE
      `;
    }
    if (!user) throw new LifecycleError("ACCOUNT_NOT_FOUND", 404, "Account not found");
    if (user.account_status === ACCOUNT_STATUS.PENDING) {
      return {
        status: user.account_status,
        requestId: user.deletion_request_id,
        blockers: await getLifecycleBlockers(txSql, user),
      };
    }
    if (user.account_status !== ACCOUNT_STATUS.ACTIVE) {
      throw new LifecycleError("ACCOUNT_DEIDENTIFIED", 409, "Account lifecycle is complete");
    }

    const [account] = await txSql`
      SELECT password
      FROM auth_accounts
      WHERE "userId" = ${user.id}
        AND provider IN ('credentials', 'credentials-signin', 'credentials-signup')
        AND password IS NOT NULL
      ORDER BY CASE WHEN provider = 'credentials' THEN 0 ELSE 1 END
      LIMIT 1
    `;
    if (!account?.password || !(await verify(account.password, password))) {
      throw new LifecycleError("REAUTHENTICATION_FAILED", 403, "Recent reauthentication failed");
    }

    if (user.role === "super_admin") {
      const activeSuperAdmins = lockedSuperAdmins.filter(
        (row) => row.account_status === ACCOUNT_STATUS.ACTIVE,
      );
      if (activeSuperAdmins.length <= 1) {
        throw new LifecycleError(
          "FINAL_SUPER_ADMIN",
          409,
          "Verified succession is required before the final super administrator can leave",
        );
      }
    }

    const requestId = randomUUID();
    await txSql`
      UPDATE auth_users
      SET account_status = 'pending_deletion',
          deletion_request_id = ${requestId},
          deletion_requested_at = NOW(),
          push_token = NULL
      WHERE id = ${user.id}
    `;
    await invalidateUserSessions(txSql, user.id);
    await deleteLegacyWebSessions(txSql, user.id);
    await txSql`DELETE FROM password_reset_tokens WHERE user_id = ${user.id}`;
    await txSql`
      DELETE FROM auth_verification_token
      WHERE lower(identifier) = lower(${user.email})
    `;
    await txSql`
      INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value, reason)
      VALUES (
        ${user.id}, ${user.id}, 'ACCOUNT_DELETION_REQUESTED',
        jsonb_build_object('account_status', 'active'),
        jsonb_build_object('account_status', 'pending_deletion', 'request_id', ${requestId}::text),
        'Verified account-holder request'
      )
    `;

    const pendingUser = { ...user, account_status: ACCOUNT_STATUS.PENDING };
    return {
      status: ACCOUNT_STATUS.PENDING,
      requestId,
      blockers: await getLifecycleBlockers(txSql, pendingUser),
    };
  });
}

export async function completeAccountDeidentification({ actorId, targetUserId, reason }) {
  requireAccountLifecycleMutationsEnabled();
  return withTransaction(async (txSql) => {
    const locked = await txSql`
      SELECT id, email, role, venue_id, organization_id, account_status,
             deletion_request_id, deletion_requested_at
      FROM auth_users
      WHERE id IN (${actorId}, ${targetUserId})
      ORDER BY id
      FOR UPDATE
    `;
    const actor = locked.find((row) => String(row.id) === String(actorId));
    const target = locked.find((row) => String(row.id) === String(targetUserId));
    if (!actor || actor.account_status !== ACCOUNT_STATUS.ACTIVE || actor.role !== "super_admin") {
      throw new LifecycleError("FORBIDDEN", 403, "An active super administrator is required");
    }
    if (!target) throw new LifecycleError("ACCOUNT_NOT_FOUND", 404, "Account not found");
    if (target.account_status === ACCOUNT_STATUS.DEIDENTIFIED) {
      return { status: ACCOUNT_STATUS.DEIDENTIFIED, requestId: target.deletion_request_id };
    }
    if (target.account_status !== ACCOUNT_STATUS.PENDING) {
      throw new LifecycleError("NOT_PENDING", 409, "Account is not pending deletion");
    }

    if (target.role === "super_admin") {
      const activeSuperAdmins = await lockActiveSuperAdmins(txSql);
      if (activeSuperAdmins.length < 1) {
        throw new LifecycleError("FINAL_SUPER_ADMIN", 409, "Verified succession is required");
      }
    }

    const blockers = await getLifecycleBlockers(txSql, target);
    if (blockers.length) {
      throw new LifecycleError("LIFECYCLE_BLOCKED", 409, "Account responsibilities remain unresolved", blockers);
    }

    const replacementEmail = deidentifiedEmailForUserId(target.id);
    const replacementName = historicalAccountLabel(target.role);

    await invalidateUserSessions(txSql, target.id);
    await deleteLegacyWebSessions(txSql, target.id);
    await txSql`DELETE FROM auth_accounts WHERE "userId" = ${target.id}`;
    await txSql`DELETE FROM password_reset_tokens WHERE user_id = ${target.id}`;
    await txSql`
      DELETE FROM auth_verification_token
      WHERE lower(identifier) = lower(${target.email})
    `;
    await txSql`DELETE FROM mobile_sessions WHERE user_id = ${target.id}`;
    await txSql`DELETE FROM notifications WHERE user_id = ${target.id}`;
    await txSql`DELETE FROM invite_tokens WHERE invited_by = ${target.id} AND used = FALSE`;
    await txSql`
      UPDATE auth_users
      SET name = ${replacementName},
          email = ${replacementEmail},
          "emailVerified" = NULL,
          image = NULL,
          push_token = NULL,
          venue_id = NULL,
          organization_id = NULL,
          field_number = NULL,
          account_status = 'deidentified',
          deidentified_at = NOW()
      WHERE id = ${target.id}
    `;
    await txSql`
      INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value, reason)
      VALUES (
        ${actor.id}, ${target.id}, 'ACCOUNT_DEIDENTIFIED',
        jsonb_build_object('account_status', 'pending_deletion'),
        jsonb_build_object('account_status', 'deidentified', 'request_id', ${target.deletion_request_id}::text),
        ${reason}
      )
    `;

    return { status: ACCOUNT_STATUS.DEIDENTIFIED, requestId: target.deletion_request_id };
  });
}

export async function cancelPendingDeletion({ actorId, targetUserId, reason }) {
  requireAccountLifecycleMutationsEnabled();
  return withTransaction(async (txSql) => {
    const locked = await txSql`
      SELECT id, role, account_status, deletion_request_id
      FROM auth_users
      WHERE id IN (${actorId}, ${targetUserId})
      ORDER BY id
      FOR UPDATE
    `;
    const actor = locked.find((row) => String(row.id) === String(actorId));
    const target = locked.find((row) => String(row.id) === String(targetUserId));
    if (!actor || actor.role !== "super_admin" || actor.account_status !== ACCOUNT_STATUS.ACTIVE) {
      throw new LifecycleError("FORBIDDEN", 403, "An active super administrator is required");
    }
    if (!target) throw new LifecycleError("ACCOUNT_NOT_FOUND", 404, "Account not found");
    if (target.account_status !== ACCOUNT_STATUS.PENDING) {
      throw new LifecycleError("NOT_PENDING", 409, "Account is not pending deletion");
    }

    const requestId = target.deletion_request_id;
    await txSql`
      UPDATE auth_users
      SET account_status = 'active',
          deletion_request_id = NULL,
          deletion_requested_at = NULL,
          deidentified_at = NULL,
          sessions_valid_after = NOW()
      WHERE id = ${target.id}
    `;
    await txSql`
      INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value, reason)
      VALUES (
        ${actor.id}, ${target.id}, 'ACCOUNT_DELETION_CANCELLED',
        jsonb_build_object('account_status', 'pending_deletion', 'request_id', ${requestId}::text),
        jsonb_build_object('account_status', 'active'),
        ${reason}
      )
    `;
    return { status: ACCOUNT_STATUS.ACTIVE };
  });
}

function canAdministerScope(actor, venueId, organizationId) {
  return actor.role === "super_admin"
    || (actor.role === "venue_admin" && String(actor.venue_id) === String(venueId))
    || (actor.role === "org_admin" && String(actor.organization_id) === String(organizationId));
}

export async function resolveTeamResponsibility({
  actorId,
  targetUserId,
  teamId,
  successorUserId = null,
  reason,
}) {
  requireAccountLifecycleMutationsEnabled();
  return withTransaction(async (txSql) => {
    const ids = [actorId, targetUserId, successorUserId].filter(Boolean);
    const users = await txSql`
      SELECT id, role, venue_id, organization_id, account_status
      FROM auth_users
      WHERE id = ANY(${ids}::uuid[])
      ORDER BY id
      FOR UPDATE
    `;
    const actor = users.find((row) => String(row.id) === String(actorId));
    const target = users.find((row) => String(row.id) === String(targetUserId));
    const successor = successorUserId
      ? users.find((row) => String(row.id) === String(successorUserId))
      : null;
    if (!actor || actor.account_status !== ACCOUNT_STATUS.ACTIVE) {
      throw new LifecycleError("FORBIDDEN", 403, "An active administrator is required");
    }
    if (!target || target.account_status !== ACCOUNT_STATUS.PENDING) {
      throw new LifecycleError("NOT_PENDING", 409, "Account is not pending deletion");
    }

    const [team] = await txSql`
      SELECT t.id, t.name, t.league_id, t.captain_user_id, t.status,
             l.venue_id, v.organization_id
      FROM teams t
      JOIN leagues l ON l.id = t.league_id
      JOIN venues v ON v.id = l.venue_id
      WHERE t.id = ${teamId}
      FOR UPDATE OF t
    `;
    if (!team || team.status !== "active" || String(team.captain_user_id) !== String(target.id)) {
      throw new LifecycleError("TEAM_NOT_OWNED", 409, "Active team responsibility was not found");
    }
    if (!canAdministerScope(actor, team.venue_id, team.organization_id)) {
      throw new LifecycleError("FORBIDDEN", 403, "Administrator is outside this team scope");
    }
    if (successorUserId) {
      if (!successor || successor.account_status !== ACCOUNT_STATUS.ACTIVE || successor.role !== "captain") {
        throw new LifecycleError("INVALID_SUCCESSOR", 409, "Successor must be an active captain");
      }
      const [existing] = await txSql`
        SELECT id FROM teams
        WHERE league_id = ${team.league_id}
          AND captain_user_id = ${successor.id}
          AND status = 'active'
        FOR SHARE
      `;
      if (existing) {
        throw new LifecycleError("SUCCESSOR_CONFLICT", 409, "Successor already owns an active team in this league");
      }
    }

    await txSql`
      UPDATE teams
      SET captain_user_id = ${successor?.id ?? null}
      WHERE id = ${team.id} AND captain_user_id = ${target.id} AND status = 'active'
    `;
    await txSql`
      INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value, reason)
      VALUES (
        ${actor.id}, ${team.id}, 'ACCOUNT_TEAM_SUCCESSION',
        jsonb_build_object('captain_user_id', ${target.id}::text),
        jsonb_build_object('captain_user_id', ${successor?.id ?? null}::text, 'custody', ${successor ? "successor" : "administrator"}),
        ${reason}
      )
    `;
    return {
      status: ACCOUNT_STATUS.PENDING,
      resolution: successor ? "successor_assigned" : "administrator_custody",
      teamId: team.id,
    };
  });
}

export async function resolveRefereeResponsibility({
  actorId,
  targetUserId,
  matchId,
  successorUserId = null,
  reason,
}) {
  requireAccountLifecycleMutationsEnabled();
  return withTransaction(async (txSql) => {
    const ids = [actorId, targetUserId, successorUserId].filter(Boolean);
    const users = await txSql`
      SELECT id, role, venue_id, organization_id, account_status
      FROM auth_users
      WHERE id = ANY(${ids}::uuid[])
      ORDER BY id
      FOR UPDATE
    `;
    const actor = users.find((row) => String(row.id) === String(actorId));
    const target = users.find((row) => String(row.id) === String(targetUserId));
    const successor = successorUserId
      ? users.find((row) => String(row.id) === String(successorUserId))
      : null;
    if (!actor || actor.account_status !== ACCOUNT_STATUS.ACTIVE) {
      throw new LifecycleError("FORBIDDEN", 403, "An active administrator is required");
    }
    if (!target || target.account_status !== ACCOUNT_STATUS.PENDING) {
      throw new LifecycleError("NOT_PENDING", 409, "Account is not pending deletion");
    }

    const [match] = await txSql`
      SELECT m.id, m.referee_id, m.status, l.venue_id, v.organization_id
      FROM matches m
      JOIN leagues l ON l.id = m.league_id
      JOIN venues v ON v.id = l.venue_id
      WHERE m.id = ${matchId}
      FOR UPDATE OF m
    `;
    if (!match || !["scheduled", "live", "postponed"].includes(match.status)
        || String(match.referee_id) !== String(target.id)) {
      throw new LifecycleError("FIXTURE_NOT_ASSIGNED", 409, "Future referee responsibility was not found");
    }
    if (!canAdministerScope(actor, match.venue_id, match.organization_id)) {
      throw new LifecycleError("FORBIDDEN", 403, "Administrator is outside this fixture scope");
    }
    if (successorUserId && (
      !successor
      || successor.account_status !== ACCOUNT_STATUS.ACTIVE
      || successor.role !== "referee"
      || String(successor.venue_id) !== String(match.venue_id)
    )) {
      throw new LifecycleError("INVALID_SUCCESSOR", 409, "Successor must be an active referee at this venue");
    }

    try {
      await txSql`
        UPDATE matches
        SET referee_id = ${successor?.id ?? null}
        WHERE id = ${match.id} AND referee_id = ${target.id}
      `;
    } catch (error) {
      if (error?.code === "23505") {
        throw new LifecycleError("REFEREE_CONFLICT", 409, "Successor has a conflicting fixture");
      }
      throw error;
    }
    await txSql`
      INSERT INTO audit_logs (action_by, target_id, action_type, old_value, new_value, reason)
      VALUES (
        ${actor.id}, ${match.id}, 'ACCOUNT_REFEREE_SUCCESSION',
        jsonb_build_object('referee_id', ${target.id}::text),
        jsonb_build_object('referee_id', ${successor?.id ?? null}::text),
        ${reason}
      )
    `;
    return {
      status: ACCOUNT_STATUS.PENDING,
      resolution: successor ? "referee_reassigned" : "referee_unassigned",
      matchId: match.id,
    };
  });
}

export async function listPendingLifecycleRequests({ actorId }) {
  return withTransaction(async (txSql) => {
    const [actor] = await txSql`
      SELECT id, role, account_status
      FROM auth_users
      WHERE id = ${actorId}
      FOR SHARE
    `;
    if (!actor || actor.role !== "super_admin" || actor.account_status !== ACCOUNT_STATUS.ACTIVE) {
      throw new LifecycleError("FORBIDDEN", 403, "An active super administrator is required");
    }
    const pending = await txSql`
      SELECT id, name, role, venue_id, organization_id, account_status,
             deletion_request_id, deletion_requested_at
      FROM auth_users
      WHERE account_status = 'pending_deletion'
      ORDER BY deletion_requested_at, id
      FOR SHARE
    `;
    const requests = [];
    for (const user of pending) {
      requests.push({
        id: user.id,
        name: user.name,
        role: user.role,
        requestId: user.deletion_request_id,
        requestedAt: user.deletion_requested_at,
        blockers: await getLifecycleBlockers(txSql, user),
      });
    }
    return requests;
  });
}
