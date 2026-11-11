import { randomUUID } from "crypto";
import { verify } from "argon2";
import { withTransaction } from "@/app/api/utils/sql";
import { invalidateUserSessions } from "@/app/api/utils/session-security";
import {
  findRefereeConflict,
  lockRefereeSchedule,
} from "@/app/api/matches/scheduling";

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

export function accountLifecycleCompletionEnabled() {
  return process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED === "true";
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

export function requireAccountLifecycleCompletionEnabled() {
  if (!accountLifecycleCompletionEnabled()) {
    throw new LifecycleError(
      "LIFECYCLE_COMPLETION_DISABLED",
      503,
      "Account deletion completion is not currently authorised",
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

// The COMPLETE blocker set. This is the only input to completion decisions, so
// it is never filtered by who is looking. Records carry organization_id for
// scope filtering; use toPublicBlockers / scopeBlockersForActor for anything
// that leaves the service.
export async function getLifecycleBlockers(txSql, user) {
  const blockers = [];

  const activeTeams = await txSql`
    SELECT t.id, t.name, l.venue_id, v.organization_id
    FROM teams t
    JOIN leagues l ON l.id = t.league_id
    LEFT JOIN venues v ON v.id = l.venue_id
    WHERE t.captain_user_id = ${user.id}
      AND t.status = 'active'
    ORDER BY t.id
  `;
  if (activeTeams.length) blockers.push({ type: "active_teams", records: activeTeams });

  const futureFixtures = await txSql`
    SELECT m.id, m.status, m.match_date, l.venue_id, v.organization_id
    FROM matches m
    JOIN leagues l ON l.id = m.league_id
    LEFT JOIN venues v ON v.id = l.venue_id
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

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// One scope rule for the pending-list projection and the succession actions.
// Null never matches null: an unscoped administrator administers nothing.
function isWithinAdminScope(actor, venueId, organizationId) {
  if (actor.role === "super_admin") return true;
  if (actor.role === "venue_admin") return sameId(actor.venue_id, venueId);
  if (actor.role === "org_admin") return sameId(actor.organization_id, organizationId);
  return false;
}

// Whitelist projection of a blocker record. organization_id and any other
// internal column never leave the service.
function publicRecord(type, record) {
  return type === "active_teams"
    ? { id: record.id, name: record.name, venue_id: record.venue_id }
    : { id: record.id, status: record.status, match_date: record.match_date, venue_id: record.venue_id };
}

// Unfiltered but whitelisted: for the account holder's own request and for the
// super-administrator completion check, which are entitled to the full set.
export function toPublicBlockers(blockers) {
  return blockers.map((blocker) => ({
    type: blocker.type,
    records: blocker.records.map((record) => publicRecord(blocker.type, record)),
  }));
}

// DISPLAY projection for the pending list: only what the viewing administrator
// is authorised to act on. It is derived from, and never replaces, the complete
// set returned by getLifecycleBlockers; completion never reads this output.
export function scopeBlockersForActor(blockers, actor, target) {
  const visible = [];
  for (const blocker of blockers) {
    if (blocker.type === "venue_admin_coverage") {
      if (isWithinAdminScope(actor, target.venue_id, target.organization_id)) {
        visible.push({ type: blocker.type, records: [] });
      }
      continue;
    }
    if (blocker.type === "organization_admin_coverage") {
      if (actor.role === "super_admin"
          || (actor.role === "org_admin" && sameId(actor.organization_id, target.organization_id))) {
        visible.push({ type: blocker.type, records: [] });
      }
      continue;
    }
    const records = blocker.records.filter((record) => (
      isWithinAdminScope(actor, record.venue_id, record.organization_id)
    ));
    if (records.length) {
      visible.push({ type: blocker.type, records: records.map((record) => publicRecord(blocker.type, record)) });
    }
  }
  return visible;
}

export async function requestAccountDeletion({ userId, password }) {
  requireAccountLifecycleMutationsEnabled();
  // New requests are accepted only when the separately authorised completion
  // path is available. If completion is later paused, administrators can keep
  // the primary switch enabled solely to assist withdrawal of pending requests.
  requireAccountLifecycleCompletionEnabled();
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
        blockers: toPublicBlockers(await getLifecycleBlockers(txSql, user)),
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
    // Revocation is permanent. Cancelling a deletion request does not recreate
    // invitations that were issued by, or addressed to, the departing account.
    await txSql`
      DELETE FROM invite_tokens
      WHERE used = FALSE
        AND (invited_by = ${user.id} OR lower(email) = lower(${user.email}))
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
      blockers: toPublicBlockers(await getLifecycleBlockers(txSql, pendingUser)),
    };
  });
}

export async function completeAccountDeidentification({ actorId, targetUserId, reason }) {
  requireAccountLifecycleMutationsEnabled();
  requireAccountLifecycleCompletionEnabled();
  return withTransaction(async (txSql) => {
    // Match requestAccountDeletion's global super-admin-first lock hierarchy.
    // This avoids actor/target inversions when a non-super account completes
    // while another super administrator starts a deletion request.
    const lockedSuperAdmins = await lockAllSuperAdministrators(txSql);
    const actor = lockedSuperAdmins.find((row) => String(row.id) === String(actorId));
    let target = lockedSuperAdmins.find((row) => String(row.id) === String(targetUserId));
    if (!target) {
      [target] = await txSql`
      SELECT id, email, role, venue_id, organization_id, account_status,
             deletion_request_id, deletion_requested_at
      FROM auth_users
      WHERE id = ${targetUserId}
      FOR UPDATE
    `;
    }
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
      const activeSuperAdmins = lockedSuperAdmins.filter(
        (row) => row.account_status === ACCOUNT_STATUS.ACTIVE,
      );
      if (activeSuperAdmins.length < 1) {
        throw new LifecycleError("FINAL_SUPER_ADMIN", 409, "Verified succession is required");
      }
    }

    const blockers = await getLifecycleBlockers(txSql, target);
    if (blockers.length) {
      // Only an active super administrator reaches this point, so the complete
      // (whitelisted) set is returned.
      throw new LifecycleError(
        "LIFECYCLE_BLOCKED",
        409,
        "Account responsibilities remain unresolved",
        toPublicBlockers(blockers),
      );
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
    await txSql`DELETE FROM invite_tokens WHERE lower(email) = lower(${target.email}) AND used = FALSE`;
    await txSql`
      UPDATE invite_tokens
      SET email = ${replacementEmail}
      WHERE lower(email) = lower(${target.email})
    `;
    await txSql`
      DELETE FROM auth_rate_limits
      WHERE lower(identifier) = lower(${target.email})
    `;
    await txSql`
      DELETE FROM api_rate_limits
      WHERE identifier IN (
        ${`mobile-signin:email:${String(target.email).trim().toLowerCase()}`},
        ${`reset:${String(target.email).trim().toLowerCase()}`}
      )
    `;
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

// Assisted withdrawal follows an external identity check. The route validates
// the operator's attestation and the service refuses to run without it, so no
// other caller can skip the control; the attestation is recorded in the audit event.
export async function cancelPendingDeletion({ actorId, targetUserId, reason, identityVerified }) {
  requireAccountLifecycleMutationsEnabled();
  if (identityVerified !== true) {
    throw new LifecycleError(
      "IDENTITY_ATTESTATION_REQUIRED",
      400,
      "Assisted withdrawal requires the operator's identity-verification attestation",
    );
  }
  return withTransaction(async (txSql) => {
    const lockedSuperAdmins = await lockAllSuperAdministrators(txSql);
    const actor = lockedSuperAdmins.find((row) => String(row.id) === String(actorId));
    let target = lockedSuperAdmins.find((row) => String(row.id) === String(targetUserId));
    if (!target) {
      [target] = await txSql`
      SELECT id, role, account_status, deletion_request_id
      FROM auth_users
      WHERE id = ${targetUserId}
      FOR UPDATE
    `;
    }
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
        jsonb_build_object('account_status', 'active', 'identity_verified', TRUE),
        ${reason}
      )
    `;
    return { status: ACCOUNT_STATUS.ACTIVE };
  });
}

const canAdministerScope = isWithinAdminScope;

export async function resolveTeamResponsibility({
  actorId,
  targetUserId,
  teamId,
  successorUserId = null,
  reason,
}) {
  requireAccountLifecycleMutationsEnabled();
  return withTransaction(async (txSql) => {
    // League -> team -> users matches the accepted team-operation hierarchy.
    const [scope] = await txSql`
      SELECT l.id AS league_id, l.venue_id, v.organization_id
      FROM leagues l
      JOIN teams t ON t.league_id = l.id
      JOIN venues v ON v.id = l.venue_id
      WHERE t.id = ${teamId}
      FOR UPDATE OF l
    `;
    if (!scope) {
      throw new LifecycleError("TEAM_NOT_OWNED", 409, "Active team responsibility was not found");
    }
    const [team] = await txSql`
      SELECT id, name, league_id, captain_user_id, status
      FROM teams
      WHERE id = ${teamId}
      FOR UPDATE
    `;

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

    if (!team || team.status !== "active" || String(team.captain_user_id) !== String(target.id)) {
      throw new LifecycleError("TEAM_NOT_OWNED", 409, "Active team responsibility was not found");
    }
    if (!canAdministerScope(actor, scope.venue_id, scope.organization_id)) {
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
        jsonb_build_object('captain_user_id', ${successor?.id ?? null}::text, 'custody', ${successor ? "successor" : "administrator"}::text),
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
    // Fixture-first ordering is shared with ASSIGN_REFEREE. Holding this row
    // before any user lock prevents the former user->fixture inversion.
    const [match] = await txSql`
      SELECT m.id, m.referee_id, m.status,
             to_char(nova_planned_date(m.match_date), 'YYYY-MM-DD') AS schedule_date,
             m.time_slot, l.venue_id, v.organization_id
      FROM matches m
      JOIN leagues l ON l.id = m.league_id
      JOIN venues v ON v.id = l.venue_id
      WHERE m.id = ${matchId}
      FOR UPDATE OF m
    `;

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

    if (match.status === "live") {
      throw new LifecycleError(
        "LIVE_FIXTURE",
        409,
        "A live fixture must finish or be formally postponed before referee responsibility changes",
      );
    }

    if (successor && match.status === "scheduled") {
      const schedule = {
        refereeId: successor.id,
        matchDate: match.schedule_date,
        timeSlot: match.time_slot,
      };
      await lockRefereeSchedule(txSql, schedule);
      if (await findRefereeConflict(txSql, schedule, match.id)) {
        throw new LifecycleError("REFEREE_CONFLICT", 409, "Successor has a conflicting fixture");
      }
    }

    await txSql`
      UPDATE matches
      SET referee_id = ${successor?.id ?? null}
      WHERE id = ${match.id} AND referee_id = ${target.id}
    `;
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
      SELECT id, role, venue_id, organization_id, account_status
      FROM auth_users
      WHERE id = ${actorId}
      FOR SHARE
    `;
    if (!actor || !["venue_admin", "org_admin", "super_admin"].includes(actor.role)
        || actor.account_status !== ACCOUNT_STATUS.ACTIVE) {
      throw new LifecycleError("FORBIDDEN", 403, "An active administrator is required");
    }
    const pending = await txSql`
      SELECT id, name, role, venue_id, organization_id, account_status,
             deletion_request_id, deletion_requested_at
      FROM auth_users
      WHERE account_status = 'pending_deletion'
        AND (
          ${actor.role === "super_admin"}
          OR (
            ${actor.role === "venue_admin"}
            AND (
              venue_id = ${actor.venue_id}
              OR EXISTS (
                SELECT 1 FROM teams t JOIN leagues l ON l.id = t.league_id
                WHERE t.captain_user_id = auth_users.id AND t.status = 'active'
                  AND l.venue_id = ${actor.venue_id}
              )
              OR EXISTS (
                SELECT 1 FROM matches m JOIN leagues l ON l.id = m.league_id
                WHERE m.referee_id = auth_users.id
                  AND m.status IN ('scheduled', 'live', 'postponed')
                  AND l.venue_id = ${actor.venue_id}
              )
            )
          )
          OR (
            ${actor.role === "org_admin"}
            AND (
              organization_id = ${actor.organization_id}
              OR EXISTS (
                SELECT 1 FROM teams t
                JOIN leagues l ON l.id = t.league_id
                JOIN venues v ON v.id = l.venue_id
                WHERE t.captain_user_id = auth_users.id AND t.status = 'active'
                  AND v.organization_id = ${actor.organization_id}
              )
              OR EXISTS (
                SELECT 1 FROM matches m
                JOIN leagues l ON l.id = m.league_id
                JOIN venues v ON v.id = l.venue_id
                WHERE m.referee_id = auth_users.id
                  AND m.status IN ('scheduled', 'live', 'postponed')
                  AND v.organization_id = ${actor.organization_id}
              )
            )
          )
        )
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
        // Display projection only: out-of-scope records are removed here and
        // nowhere else, so completion still sees every unresolved responsibility.
        blockers: scopeBlockersForActor(await getLifecycleBlockers(txSql, user), actor, user),
      });
    }
    return requests;
  });
}
