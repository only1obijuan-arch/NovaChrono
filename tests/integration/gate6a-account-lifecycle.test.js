import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ actorId: null }));
const hashControl = vi.hoisted(() => ({ waiter: null }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => authState.actorId ? { user: { id: authState.actorId } } : null),
}));
vi.mock("@/app/api/utils/send-email", () => ({ sendEmail: vi.fn(async () => ({ id: "test-mail" })) }));
vi.mock("argon2", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    hash: vi.fn(async (...args) => {
      const waiter = hashControl.waiter;
      if (waiter) {
        hashControl.waiter = null;
        waiter.started();
        await waiter.release;
      }
      return actual.hash(...args);
    }),
  };
});

import { hash } from "argon2";
import { pool } from "@/app/api/utils/db";
import {
  cancelPendingDeletion,
  completeAccountDeidentification,
  requestAccountDeletion,
  resolveRefereeResponsibility,
  resolveTeamResponsibility,
} from "@/app/api/utils/account-lifecycle";
import { POST as mobileSignin } from "@/app/api/auth/mobile-signin/route";
import { POST as mobileRefresh } from "@/app/api/auth/mobile-refresh/route";
import { POST as matchCommand } from "@/app/api/matches/route";
import { refereeScheduleKey } from "@/app/api/matches/scheduling";
import { POST as teamCommand } from "@/app/api/teams/route";
import { POST as provisionReferee } from "@/app/api/admin/referees/route";
import { POST as acceptInvite } from "@/app/api/admin/accept-invite/route";

const IDS = {
  org: "11000000-0000-4000-8000-000000000001",
  venue: "22000000-0000-4000-8000-000000000001",
  super: "33000000-0000-4000-8000-000000000001",
  super2: "33000000-0000-4000-8000-000000000004",
  venueAdmin: "33000000-0000-4000-8000-000000000005",
  captainSuccessor: "33000000-0000-4000-8000-000000000006",
  refereeSuccessor: "33000000-0000-4000-8000-000000000007",
  inactiveCaptain: "33000000-0000-4000-8000-000000000008",
  inactiveReferee: "33000000-0000-4000-8000-000000000009",
  referee: "33000000-0000-4000-8000-000000000002",
  mobile: "33000000-0000-4000-8000-000000000003",
  league: "44000000-0000-4000-8000-000000000001",
  slotA: "55000000-0000-4000-8000-000000000001",
  slotB: "55000000-0000-4000-8000-000000000002",
  teamA: "66000000-0000-4000-8000-000000000001",
  teamB: "66000000-0000-4000-8000-000000000002",
  match: "77000000-0000-4000-8000-000000000001",
  match2: "77000000-0000-4000-8000-000000000002",
  match3: "77000000-0000-4000-8000-000000000003",
  match4: "77000000-0000-4000-8000-000000000004",
};

const PASSWORD = "Gate6aIntegrationPass!";
const originalLifecycleFlag = process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED;
const originalCompletionFlag = process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED;

const resetDatabase = () => pool.query(`TRUNCATE TABLE
  auth_rate_limits, api_rate_limits, audit_logs, notifications, availability_responses, match_events,
  matches, standings, players, teams, league_slots, leagues, invite_tokens,
  mobile_sessions, password_reset_tokens, auth_accounts,
  auth_verification_token, auth_users, venues, organizations RESTART IDENTITY CASCADE`);

async function seed() {
  await resetDatabase();
  const passwordHash = await hash(PASSWORD);
  await pool.query("INSERT INTO organizations (id, name) VALUES ($1, 'Gate 6 Org')", [IDS.org]);
  await pool.query(
    "INSERT INTO venues (id, organization_id, name) VALUES ($1, $2, 'Gate 6 Venue')",
    [IDS.venue, IDS.org],
  );
  await pool.query(`
    INSERT INTO auth_users
      (id, name, email, role, venue_id, organization_id, field_number, "emailVerified")
    VALUES
      ($1, 'Platform', 'gate6-super@example.test', 'super_admin', NULL, NULL, NULL, NOW()),
      ($2, 'Historical Referee', 'gate6-referee@example.test', 'referee', $4, $5, 1, NOW()),
      ($3, 'Mobile Account', 'gate6-mobile@example.test', 'captain', $4, $5, NULL, NOW())
  `, [IDS.super, IDS.referee, IDS.mobile, IDS.venue, IDS.org]);
  await pool.query(`
    INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
    VALUES
      ($1, 'credentials', 'credentials', ($1::uuid)::text, $4),
      ($2, 'credentials', 'credentials', ($2::uuid)::text, $4),
      ($3, 'credentials', 'credentials', ($3::uuid)::text, $4)
  `, [IDS.super, IDS.referee, IDS.mobile, passwordHash]);
  await pool.query(`
    INSERT INTO leagues
      (id, venue_id, name, day_of_week, match_format, match_duration_minutes,
       fields_count, time_slots, max_teams, join_code, status)
    VALUES ($1, $2, 'Gate 6 League', 2, '5v5', 40, 1, '["18:00"]', 2, 'GATE6A01', 'completed')
  `, [IDS.league, IDS.venue]);
  await pool.query(
    "INSERT INTO league_slots (id, league_id, slot_number) VALUES ($1,$3,1),($2,$3,2)",
    [IDS.slotA, IDS.slotB, IDS.league],
  );
  await pool.query(`
    INSERT INTO teams (id, league_id, slot_id, name, status)
    VALUES ($1,$3,$4,'History A','inactive'),($2,$3,$5,'History B','inactive')
  `, [IDS.teamA, IDS.teamB, IDS.league, IDS.slotA, IDS.slotB]);
  await pool.query(`
    INSERT INTO matches
      (id, league_id, round_number, match_date, time_slot, field_number,
       home_slot_id, away_slot_id, home_team_id, away_team_id,
       home_score, away_score, status, referee_id, result_type)
    VALUES ($1,$2,1,'2030-01-01','18:00',1,$3,$4,$5,$6,2,1,'final',$7,'played')
  `, [IDS.match, IDS.league, IDS.slotA, IDS.slotB, IDS.teamA, IDS.teamB, IDS.referee]);
}

function mobileRequest(path, body, token) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function routeRequest(path, body) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.test",
    },
    body: JSON.stringify(body),
  });
}

async function addLifecycleActors() {
  await pool.query(`
    INSERT INTO auth_users
      (id, name, email, role, venue_id, organization_id, field_number, "emailVerified")
    VALUES
      ($1, 'Venue Administrator', 'gate6-venue-admin@example.test', 'venue_admin', $6, $7, NULL, NOW()),
      ($2, 'Captain Successor', 'gate6-captain-successor@example.test', 'captain', $6, $7, NULL, NOW()),
      ($3, 'Referee Successor', 'gate6-referee-successor@example.test', 'referee', $6, $7, 2, NOW()),
      ($4, 'Pending Captain', 'gate6-pending-captain@example.test', 'captain', $6, $7, NULL, NOW()),
      ($5, 'Pending Referee', 'gate6-pending-referee@example.test', 'referee', $6, $7, 3, NOW())
  `, [
    IDS.venueAdmin,
    IDS.captainSuccessor,
    IDS.refereeSuccessor,
    IDS.inactiveCaptain,
    IDS.inactiveReferee,
    IDS.venue,
    IDS.org,
  ]);
}

async function insertFutureMatch({
  id,
  status = "scheduled",
  refereeId = IDS.referee,
  date = "2031-01-07",
  time = "18:00",
  round = 2,
}) {
  await pool.query(`
    INSERT INTO matches
      (id, league_id, round_number, match_date, time_slot, field_number,
       home_slot_id, away_slot_id, home_team_id, away_team_id, status, referee_id)
    VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8,$9,$10,$11)
  `, [
    id,
    IDS.league,
    round,
    date,
    time,
    IDS.slotA,
    IDS.slotB,
    IDS.teamA,
    IDS.teamB,
    status,
    refereeId,
  ]);
}

beforeEach(async () => {
  process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED = "true";
  process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED = "true";
  authState.actorId = null;
  hashControl.waiter = null;
  await seed();
});
afterAll(async () => {
  await resetDatabase();
  await pool.end();
  if (originalLifecycleFlag === undefined) {
    delete process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED;
  } else {
    process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED = originalLifecycleFlag;
  }
  if (originalCompletionFlag === undefined) {
    delete process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED;
  } else {
    process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED = originalCompletionFlag;
  }
});

describe("Gate 6A.2 account lifecycle integration", () => {
  it("installs validated lifecycle constraints without changing sporting FKs", async () => {
    const constraints = (await pool.query(`
      SELECT conname, convalidated
      FROM pg_constraint
      WHERE conrelid = 'auth_users'::regclass
        AND conname LIKE 'auth_users_%lifecycle%'
      ORDER BY conname
    `)).rows;
    expect(constraints).toEqual([
      { conname: "auth_users_lifecycle_email_consistent", convalidated: true },
      { conname: "auth_users_lifecycle_state_consistent", convalidated: true },
    ]);
    const refereeFk = (await pool.query(`
      SELECT confdeltype FROM pg_constraint
      WHERE conrelid = 'matches'::regclass AND conname = 'matches_referee_id_fkey'
    `)).rows[0];
    expect(refereeFk.confdeltype).toBe("a");
  });

  it("de-identifies a referee while preserving completed-match attribution and team history", async () => {
    const pending = await requestAccountDeletion({ userId: IDS.referee, password: PASSWORD });
    expect(pending).toMatchObject({ status: "pending_deletion", blockers: [] });

    const completed = await completeAccountDeidentification({
      actorId: IDS.super,
      targetUserId: IDS.referee,
      reason: "Verified Gate 6A integration completion",
    });
    expect(completed.status).toBe("deidentified");

    const user = (await pool.query(
      "SELECT id, name, email, role, account_status, venue_id, field_number FROM auth_users WHERE id = $1",
      [IDS.referee],
    )).rows[0];
    expect(user).toMatchObject({
      id: IDS.referee,
      name: "Former referee",
      email: "deidentified+33000000000040008000000000000002@account.invalid",
      role: "referee",
      account_status: "deidentified",
      venue_id: null,
      field_number: null,
    });
    expect((await pool.query("SELECT referee_id FROM matches WHERE id = $1", [IDS.match])).rows[0].referee_id)
      .toBe(IDS.referee);
    expect(Number((await pool.query("SELECT count(*) FROM auth_accounts WHERE \"userId\" = $1", [IDS.referee])).rows[0].count)).toBe(0);
  });

  it("serializes mobile sign-in against deletion so no session survives", async () => {
    const deletion = requestAccountDeletion({ userId: IDS.mobile, password: PASSWORD });
    const signin = mobileSignin(mobileRequest("/api/auth/mobile-signin", {
      email: "gate6-mobile@example.test",
      password: PASSWORD,
    }));
    const [deletionResult, signinResponse] = await Promise.all([deletion, signin]);
    expect(deletionResult.status).toBe("pending_deletion");
    expect([200, 401]).toContain(signinResponse.status);
    expect(Number((await pool.query("SELECT count(*) FROM mobile_sessions WHERE user_id = $1", [IDS.mobile])).rows[0].count)).toBe(0);
    expect((await pool.query("SELECT account_status FROM auth_users WHERE id = $1", [IDS.mobile])).rows[0].account_status)
      .toBe("pending_deletion");
  }, 20_000);

  it("serializes atomic refresh rotation against deletion", async () => {
    const signedIn = await mobileSignin(mobileRequest("/api/auth/mobile-signin", {
      email: "gate6-mobile@example.test",
      password: PASSWORD,
    }));
    expect(signedIn.status).toBe(200);
    const { token } = await signedIn.json();

    const deletion = requestAccountDeletion({ userId: IDS.mobile, password: PASSWORD });
    const refresh = mobileRefresh(mobileRequest("/api/auth/mobile-refresh", null, token));
    const [deletionResult, refreshResponse] = await Promise.all([deletion, refresh]);
    expect(deletionResult.status).toBe("pending_deletion");
    expect([200, 401]).toContain(refreshResponse.status);
    expect(Number((await pool.query("SELECT count(*) FROM mobile_sessions WHERE user_id = $1", [IDS.mobile])).rows[0].count)).toBe(0);
  }, 20_000);

  it("blocks the final active super administrator before access is revoked", async () => {
    await expect(requestAccountDeletion({ userId: IDS.super, password: PASSWORD }))
      .rejects.toMatchObject({ code: "FINAL_SUPER_ADMIN", status: 409 });
    const superAdmin = (await pool.query(
      "SELECT account_status, sessions_valid_after FROM auth_users WHERE id = $1",
      [IDS.super],
    )).rows[0];
    expect(superAdmin.account_status).toBe("active");
    expect(new Date(superAdmin.sessions_valid_after).getTime()).toBe(0);
  });

  it("serializes concurrent super-admin deletion requests and preserves one active successor", async () => {
    await pool.query(`
      INSERT INTO auth_users (id, name, email, role, "emailVerified")
      VALUES ($1, 'Platform Successor', 'gate6-super2@example.test', 'super_admin', NOW())
    `, [IDS.super2]);
    await pool.query(`
      INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
      SELECT $1, 'credentials', 'credentials', ($1::uuid)::text, password
      FROM auth_accounts
      WHERE "userId" = $2 AND provider = 'credentials'
    `, [IDS.super2, IDS.super]);

    const results = await Promise.allSettled([
      requestAccountDeletion({ userId: IDS.super, password: PASSWORD }),
      requestAccountDeletion({ userId: IDS.super2, password: PASSWORD }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected").reason)
      .toMatchObject({ code: "FINAL_SUPER_ADMIN", status: 409 });

    const states = (await pool.query(`
      SELECT account_status, count(*)::int AS count
      FROM auth_users
      WHERE role = 'super_admin'
      GROUP BY account_status
      ORDER BY account_status
    `)).rows;
    expect(states).toEqual([
      { account_status: "active", count: 1 },
      { account_status: "pending_deletion", count: 1 },
    ]);
  }, 20_000);

  it("transfers an active team to an approved successor and preserves historical records", async () => {
    await addLifecycleActors();
    await pool.query(
      "UPDATE teams SET status = 'active', captain_user_id = $1 WHERE id = $2",
      [IDS.mobile, IDS.teamA],
    );
    await requestAccountDeletion({ userId: IDS.mobile, password: PASSWORD });

    const result = await resolveTeamResponsibility({
      actorId: IDS.venueAdmin,
      targetUserId: IDS.mobile,
      teamId: IDS.teamA,
      successorUserId: IDS.captainSuccessor,
      reason: "Verified captain succession",
    });

    expect(result.resolution).toBe("successor_assigned");
    expect((await pool.query("SELECT captain_user_id FROM teams WHERE id = $1", [IDS.teamA])).rows[0])
      .toEqual({ captain_user_id: IDS.captainSuccessor });
    const audit = (await pool.query(`
      SELECT old_value, new_value FROM audit_logs
      WHERE target_id = $1 AND action_type = 'ACCOUNT_TEAM_SUCCESSION'
    `, [IDS.teamA])).rows;
    expect(audit).toEqual([{
      old_value: { captain_user_id: IDS.mobile },
      new_value: { captain_user_id: IDS.captainSuccessor, custody: "successor" },
    }]);
    expect((await pool.query(
      "SELECT home_team_id, away_team_id, referee_id, home_score, away_score FROM matches WHERE id = $1",
      [IDS.match],
    )).rows[0]).toEqual({
      home_team_id: IDS.teamA,
      away_team_id: IDS.teamB,
      referee_id: IDS.referee,
      home_score: 2,
      away_score: 1,
    });
  });

  it("places an active team in administrator custody and serializes repeat resolution", async () => {
    await addLifecycleActors();
    await pool.query(
      "UPDATE teams SET status = 'active', captain_user_id = $1 WHERE id = $2",
      [IDS.mobile, IDS.teamA],
    );
    await requestAccountDeletion({ userId: IDS.mobile, password: PASSWORD });
    const args = {
      actorId: IDS.venueAdmin,
      targetUserId: IDS.mobile,
      teamId: IDS.teamA,
      reason: "Administrator custody pending approved succession",
    };

    const results = await Promise.allSettled([
      resolveTeamResponsibility(args),
      resolveTeamResponsibility(args),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect(results.find((item) => item.status === "rejected").reason)
      .toMatchObject({ code: "TEAM_NOT_OWNED", status: 409 });
    expect((await pool.query("SELECT captain_user_id FROM teams WHERE id = $1", [IDS.teamA])).rows[0])
      .toEqual({ captain_user_id: null });
    const audit = (await pool.query(`
      SELECT new_value FROM audit_logs
      WHERE target_id = $1 AND action_type = 'ACCOUNT_TEAM_SUCCESSION'
    `, [IDS.teamA])).rows;
    expect(audit).toEqual([{ new_value: { captain_user_id: null, custody: "administrator" } }]);
  }, 20_000);

  it("reassigns a scheduled fixture only to a conflict-free active referee", async () => {
    await addLifecycleActors();
    await insertFutureMatch({ id: IDS.match2 });
    await requestAccountDeletion({ userId: IDS.referee, password: PASSWORD });

    const result = await resolveRefereeResponsibility({
      actorId: IDS.venueAdmin,
      targetUserId: IDS.referee,
      matchId: IDS.match2,
      successorUserId: IDS.refereeSuccessor,
      reason: "Verified referee succession",
    });
    expect(result.resolution).toBe("referee_reassigned");
    expect((await pool.query("SELECT referee_id FROM matches WHERE id = $1", [IDS.match2])).rows[0].referee_id)
      .toBe(IDS.refereeSuccessor);
    expect((await pool.query("SELECT referee_id FROM matches WHERE id = $1", [IDS.match])).rows[0].referee_id)
      .toBe(IDS.referee);
  });

  it("rejects conflicting or live referee succession but permits postponed fixture recovery", async () => {
    await addLifecycleActors();
    await insertFutureMatch({ id: IDS.match2, refereeId: IDS.refereeSuccessor });
    await insertFutureMatch({ id: IDS.match3, refereeId: IDS.referee, round: 3 });
    await insertFutureMatch({ id: IDS.match4, refereeId: IDS.referee, status: "live", date: "2031-01-14", round: 4 });
    await requestAccountDeletion({ userId: IDS.referee, password: PASSWORD });

    await expect(resolveRefereeResponsibility({
      actorId: IDS.venueAdmin,
      targetUserId: IDS.referee,
      matchId: IDS.match3,
      successorUserId: IDS.refereeSuccessor,
      reason: "Must reject a conflicting successor",
    })).rejects.toMatchObject({ code: "REFEREE_CONFLICT", status: 409 });
    await expect(resolveRefereeResponsibility({
      actorId: IDS.venueAdmin,
      targetUserId: IDS.referee,
      matchId: IDS.match4,
      successorUserId: IDS.refereeSuccessor,
      reason: "Must reject a live fixture reassignment",
    })).rejects.toMatchObject({ code: "LIVE_FIXTURE", status: 409 });

    await pool.query("UPDATE matches SET status = 'postponed' WHERE id = $1", [IDS.match3]);
    const postponed = await resolveRefereeResponsibility({
      actorId: IDS.venueAdmin,
      targetUserId: IDS.referee,
      matchId: IDS.match3,
      successorUserId: IDS.refereeSuccessor,
      reason: "Postponed fixture no longer claims an active schedule slot",
    });
    expect(postponed.resolution).toBe("referee_reassigned");
    expect((await pool.query("SELECT referee_id FROM matches WHERE id = $1", [IDS.match4])).rows[0].referee_id)
      .toBe(IDS.referee);
  });

  it("serializes lifecycle reassignment with ASSIGN_REFEREE without double-booking", async () => {
    await addLifecycleActors();
    await insertFutureMatch({ id: IDS.match2, refereeId: IDS.referee });
    await insertFutureMatch({ id: IDS.match3, refereeId: null, round: 3 });
    await requestAccountDeletion({ userId: IDS.referee, password: PASSWORD });
    authState.actorId = IDS.super;

    const [lifecycle, assignment] = await Promise.allSettled([
      resolveRefereeResponsibility({
        actorId: IDS.venueAdmin,
        targetUserId: IDS.referee,
        matchId: IDS.match2,
        successorUserId: IDS.refereeSuccessor,
        reason: "Concurrent lifecycle reassignment",
      }),
      matchCommand(routeRequest("/api/matches", {
        action: "ASSIGN_REFEREE",
        matchId: IDS.match3,
        refereeId: IDS.refereeSuccessor,
      })),
    ]);

    expect(lifecycle.status).toBe("fulfilled");
    expect(assignment.status).toBe("fulfilled");
    const assignmentResponse = assignment.value;
    expect([200, 409]).toContain(assignmentResponse.status);
    const assigned = (await pool.query(`
      SELECT id FROM matches
      WHERE id = ANY($1::uuid[]) AND referee_id = $2
      ORDER BY id
    `, [[IDS.match2, IDS.match3], IDS.refereeSuccessor])).rows;
    expect(assigned).toHaveLength(1);
  }, 20_000);

  it("cannot recreate credentials after lifecycle completion wins a reset race", async () => {
    await pool.query(
      "UPDATE auth_users SET email = 'ref-field1@gate6venue.novachrono.com' WHERE id = $1",
      [IDS.referee],
    );
    authState.actorId = IDS.super;
    let signalStarted;
    let releaseHash;
    const started = new Promise((resolve) => { signalStarted = resolve; });
    const release = new Promise((resolve) => { releaseHash = resolve; });
    hashControl.waiter = { started: signalStarted, release };

    const reset = provisionReferee(routeRequest("/api/admin/referees", {
      venueId: IDS.venue,
      fieldNumber: 1,
    }));
    await started;
    await requestAccountDeletion({ userId: IDS.referee, password: PASSWORD });
    await completeAccountDeidentification({
      actorId: IDS.super,
      targetUserId: IDS.referee,
      reason: "Complete while credential hash is in flight",
    });
    releaseHash();

    const response = await reset;
    expect(response.status).toBe(409);
    expect(Number((await pool.query(
      "SELECT count(*) FROM auth_accounts WHERE \"userId\" = $1",
      [IDS.referee],
    )).rows[0].count)).toBe(0);
    expect((await pool.query("SELECT account_status FROM auth_users WHERE id = $1", [IDS.referee])).rows[0])
      .toEqual({ account_status: "deidentified" });
  }, 20_000);

  it("revokes pending invitations permanently when the issuer requests deletion", async () => {
    const rawToken = "gate6-unused-invitation-token";
    const tokenHash = (await import("crypto")).createHash("sha256").update(rawToken).digest("hex");
    await pool.query(`
      INSERT INTO invite_tokens
        (token, email, role, organization_id, venue_id, invited_by, expires_at)
      VALUES ($1, 'new-admin@example.test', 'venue_admin', $2, $3, $4, NOW() + interval '1 day')
    `, [tokenHash, IDS.org, IDS.venue, IDS.mobile]);

    await requestAccountDeletion({ userId: IDS.mobile, password: PASSWORD });
    await cancelPendingDeletion({
      actorId: IDS.super,
      targetUserId: IDS.mobile,
      reason: "Verified request cancellation",
    });
    expect(Number((await pool.query("SELECT count(*) FROM invite_tokens WHERE token = $1", [tokenHash])).rows[0].count))
      .toBe(0);

    const response = await acceptInvite(routeRequest("/api/admin/accept-invite", {
      token: rawToken,
      name: "Should Not Be Created",
      password: PASSWORD,
    }));
    expect(response.status).toBe(400);
  });

  it("removes directly attributable rate-limit residue and de-identifies retained invitation history", async () => {
    await pool.query(`
      INSERT INTO invite_tokens
        (token, email, role, organization_id, venue_id, invited_by, used, expires_at)
      VALUES
        ('used-history-token', 'gate6-mobile@example.test', 'venue_admin', $1, $2, $3, TRUE, NOW() + interval '1 day'),
        ('unrelated-history-token', 'other@example.test', 'venue_admin', $1, $2, $3, TRUE, NOW() + interval '1 day')
    `, [IDS.org, IDS.venue, IDS.super]);
    await pool.query(`
      INSERT INTO auth_rate_limits (identifier, attempts) VALUES
        ('gate6-mobile@example.test', 3), ('other@example.test', 1)
    `);
    await pool.query(`
      INSERT INTO api_rate_limits (identifier, window_start, count) VALUES
        ('mobile-signin:email:gate6-mobile@example.test', date_trunc('minute', NOW()), 3),
        ('reset:gate6-mobile@example.test', date_trunc('minute', NOW()), 2),
        ('mobile-signin:email:other@example.test', date_trunc('minute', NOW()), 1)
    `);

    await requestAccountDeletion({ userId: IDS.mobile, password: PASSWORD });
    await completeAccountDeidentification({
      actorId: IDS.super,
      targetUserId: IDS.mobile,
      reason: "Verified personal-data cleanup",
    });

    expect((await pool.query("SELECT email FROM invite_tokens WHERE token = 'used-history-token'")).rows[0].email)
      .toBe("deidentified+33000000000040008000000000000003@account.invalid");
    expect((await pool.query("SELECT email FROM invite_tokens WHERE token = 'unrelated-history-token'")).rows[0].email)
      .toBe("other@example.test");
    expect(Number((await pool.query(
      "SELECT count(*) FROM auth_rate_limits WHERE identifier = 'gate6-mobile@example.test'",
    )).rows[0].count)).toBe(0);
    expect(Number((await pool.query(
      "SELECT count(*) FROM api_rate_limits WHERE identifier IN ('mobile-signin:email:gate6-mobile@example.test','reset:gate6-mobile@example.test')",
    )).rows[0].count)).toBe(0);
    expect(Number((await pool.query(
      "SELECT count(*) FROM api_rate_limits WHERE identifier = 'mobile-signin:email:other@example.test'",
    )).rows[0].count)).toBe(1);
  });

  it("rejects pending and de-identified captains and referees as assignment targets", async () => {
    await addLifecycleActors();
    await pool.query("UPDATE leagues SET status = 'registration' WHERE id = $1", [IDS.league]);
    await pool.query(`
      UPDATE auth_users
      SET account_status = 'pending_deletion',
          deletion_request_id = CASE id
            WHEN $1 THEN '88000000-0000-4000-8000-000000000008'::uuid
            ELSE '88000000-0000-4000-8000-000000000009'::uuid
          END,
          deletion_requested_at = NOW()
      WHERE id IN ($1, $2)
    `, [IDS.inactiveCaptain, IDS.inactiveReferee]);
    authState.actorId = IDS.super;

    const pendingCaptain = await teamCommand(routeRequest("/api/teams", {
      action: "ADD_TEAM",
      leagueId: IDS.league,
      teamName: "Rejected Pending Captain",
      captainUserId: IDS.inactiveCaptain,
    }));
    expect(pendingCaptain.status).toBe(404);

    await insertFutureMatch({ id: IDS.match2, refereeId: null });
    const pendingReferee = await matchCommand(routeRequest("/api/matches", {
      action: "ASSIGN_REFEREE",
      matchId: IDS.match2,
      refereeId: IDS.inactiveReferee,
    }));
    expect(pendingReferee.status).toBe(409);

    await pool.query(`
      UPDATE auth_users
      SET account_status = 'deidentified',
          deidentified_at = NOW(),
          email = CASE id
            WHEN $1 THEN 'deidentified+33000000000040008000000000000008@account.invalid'
            ELSE 'deidentified+33000000000040008000000000000009@account.invalid'
          END,
          name = CASE role WHEN 'captain' THEN 'Former captain' ELSE 'Former referee' END,
          "emailVerified" = NULL
      WHERE id IN ($1, $2)
    `, [IDS.inactiveCaptain, IDS.inactiveReferee]);
    const deidentifiedCaptain = await teamCommand(routeRequest("/api/teams", {
      action: "ADD_TEAM",
      leagueId: IDS.league,
      teamName: "Rejected Former Captain",
      captainUserId: IDS.inactiveCaptain,
    }));
    expect(deidentifiedCaptain.status).toBe(404);
    const deidentifiedReferee = await matchCommand(routeRequest("/api/matches", {
      action: "ASSIGN_REFEREE",
      matchId: IDS.match2,
      refereeId: IDS.inactiveReferee,
    }));
    expect(deidentifiedReferee.status).toBe(409);
  });

  it("rejects ineligible successors without changing any responsibility", async () => {
    await addLifecycleActors();
    const outsider = "33000000-0000-4000-8000-00000000000a";
    const otherVenue = "22000000-0000-4000-8000-000000000002";
    await pool.query(
      "INSERT INTO venues (id, organization_id, name) VALUES ($1, $2, 'Other Venue')",
      [otherVenue, IDS.org],
    );
    await pool.query(`
      INSERT INTO auth_users
        (id, name, email, role, venue_id, organization_id, field_number, "emailVerified")
      VALUES ($1, 'Other Venue Referee', 'gate6-outsider@example.test', 'referee', $2, $3, 4, NOW())
    `, [outsider, otherVenue, IDS.org]);
    await pool.query(
      "UPDATE teams SET status = 'active', captain_user_id = $1 WHERE id = $2",
      [IDS.mobile, IDS.teamA],
    );
    await pool.query(
      "UPDATE teams SET status = 'active', captain_user_id = $1 WHERE id = $2",
      [IDS.captainSuccessor, IDS.teamB],
    );
    await insertFutureMatch({ id: IDS.match2 });
    await requestAccountDeletion({ userId: IDS.mobile, password: PASSWORD });
    await requestAccountDeletion({ userId: IDS.referee, password: PASSWORD });

    const team = (successorUserId) => resolveTeamResponsibility({
      actorId: IDS.venueAdmin,
      targetUserId: IDS.mobile,
      teamId: IDS.teamA,
      successorUserId,
      reason: "Successor eligibility check",
    });
    const fixture = (successorUserId) => resolveRefereeResponsibility({
      actorId: IDS.venueAdmin,
      targetUserId: IDS.referee,
      matchId: IDS.match2,
      successorUserId,
      reason: "Successor eligibility check",
    });
    const rejected = (promise, code) => expect(promise).rejects.toMatchObject({ code, status: 409 });
    const unknown = "99000000-0000-4000-8000-000000000001";

    // Wrong role, wrong venue, unknown account.
    await rejected(team(IDS.refereeSuccessor), "INVALID_SUCCESSOR");
    await rejected(team(IDS.venueAdmin), "INVALID_SUCCESSOR");
    await rejected(team(unknown), "INVALID_SUCCESSOR");
    await rejected(fixture(IDS.captainSuccessor), "INVALID_SUCCESSOR");
    await rejected(fixture(outsider), "INVALID_SUCCESSOR");
    await rejected(fixture(unknown), "INVALID_SUCCESSOR");
    // A successor who already captains an active team in the same league.
    await rejected(team(IDS.captainSuccessor), "SUCCESSOR_CONFLICT");

    // Pending deletion, then de-identified.
    await pool.query(`
      UPDATE auth_users
      SET account_status = 'pending_deletion',
          deletion_request_id = gen_random_uuid(),
          deletion_requested_at = NOW()
      WHERE id IN ($1, $2)
    `, [IDS.inactiveCaptain, IDS.inactiveReferee]);
    await rejected(team(IDS.inactiveCaptain), "INVALID_SUCCESSOR");
    await rejected(fixture(IDS.inactiveReferee), "INVALID_SUCCESSOR");
    await pool.query(`
      UPDATE auth_users
      SET account_status = 'deidentified',
          deidentified_at = NOW(),
          email = CASE id
            WHEN $1 THEN 'deidentified+33000000000040008000000000000008@account.invalid'
            ELSE 'deidentified+33000000000040008000000000000009@account.invalid'
          END,
          name = CASE role WHEN 'captain' THEN 'Former captain' ELSE 'Former referee' END,
          "emailVerified" = NULL
      WHERE id IN ($1, $2)
    `, [IDS.inactiveCaptain, IDS.inactiveReferee]);
    await rejected(team(IDS.inactiveCaptain), "INVALID_SUCCESSOR");
    await rejected(fixture(IDS.inactiveReferee), "INVALID_SUCCESSOR");

    expect((await pool.query("SELECT captain_user_id FROM teams WHERE id = $1", [IDS.teamA])).rows[0])
      .toEqual({ captain_user_id: IDS.mobile });
    expect((await pool.query("SELECT referee_id FROM matches WHERE id = $1", [IDS.match2])).rows[0])
      .toEqual({ referee_id: IDS.referee });
    expect(Number((await pool.query(
      "SELECT count(*) FROM audit_logs WHERE action_type IN ('ACCOUNT_TEAM_SUCCESSION','ACCOUNT_REFEREE_SUCCESSION')",
    )).rows[0].count)).toBe(0);
  }, 30_000);

  it("keeps succession inside the administrator's own venue or organisation", async () => {
    await addLifecycleActors();
    const ids = {
      otherOrg: "11000000-0000-4000-8000-000000000002",
      otherVenue: "22000000-0000-4000-8000-000000000002",
      otherVenueAdmin: "33000000-0000-4000-8000-00000000000b",
      otherOrgAdmin: "33000000-0000-4000-8000-00000000000c",
      ownOrgAdmin: "33000000-0000-4000-8000-00000000000d",
    };
    await pool.query("INSERT INTO organizations (id, name) VALUES ($1, 'Other Org')", [ids.otherOrg]);
    await pool.query(
      "INSERT INTO venues (id, organization_id, name) VALUES ($1, $2, 'Other Venue')",
      [ids.otherVenue, ids.otherOrg],
    );
    await pool.query(`
      INSERT INTO auth_users
        (id, name, email, role, venue_id, organization_id, field_number, "emailVerified")
      VALUES
        ($1, 'Other Venue Admin', 'gate6-other-venue@example.test', 'venue_admin', $4, $5, NULL, NOW()),
        ($2, 'Other Org Admin', 'gate6-other-org@example.test', 'org_admin', NULL, $5, NULL, NOW()),
        ($3, 'Own Org Admin', 'gate6-own-org@example.test', 'org_admin', NULL, $6, NULL, NOW())
    `, [ids.otherVenueAdmin, ids.otherOrgAdmin, ids.ownOrgAdmin, ids.otherVenue, ids.otherOrg, IDS.org]);
    await pool.query(
      "UPDATE teams SET status = 'active', captain_user_id = $1 WHERE id = $2",
      [IDS.mobile, IDS.teamA],
    );
    await insertFutureMatch({ id: IDS.match2 });
    await requestAccountDeletion({ userId: IDS.mobile, password: PASSWORD });
    await requestAccountDeletion({ userId: IDS.referee, password: PASSWORD });

    // A venue administrator or organisation administrator elsewhere, and users
    // who are not administrators at all, can resolve neither kind of responsibility.
    for (const actorId of [
      ids.otherVenueAdmin,
      ids.otherOrgAdmin,
      IDS.captainSuccessor,
      IDS.refereeSuccessor,
    ]) {
      await expect(resolveTeamResponsibility({
        actorId, targetUserId: IDS.mobile, teamId: IDS.teamA, reason: "Out-of-scope team attempt",
      })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      await expect(resolveRefereeResponsibility({
        actorId, targetUserId: IDS.referee, matchId: IDS.match2, reason: "Out-of-scope fixture attempt",
      })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    }
    expect((await pool.query("SELECT captain_user_id FROM teams WHERE id = $1", [IDS.teamA])).rows[0])
      .toEqual({ captain_user_id: IDS.mobile });
    expect((await pool.query("SELECT referee_id FROM matches WHERE id = $1", [IDS.match2])).rows[0])
      .toEqual({ referee_id: IDS.referee });

    // The owning organisation's administrator is in scope for both.
    await expect(resolveTeamResponsibility({
      actorId: ids.ownOrgAdmin, targetUserId: IDS.mobile, teamId: IDS.teamA, reason: "Own organisation custody",
    })).resolves.toMatchObject({ resolution: "administrator_custody" });
    await expect(resolveRefereeResponsibility({
      actorId: ids.ownOrgAdmin, targetUserId: IDS.referee, matchId: IDS.match2, reason: "Own organisation unassign",
    })).resolves.toMatchObject({ resolution: "referee_unassigned" });
  }, 30_000);

  it("takes the referee schedule lock that reschedules use before checking a successor", async () => {
    await addLifecycleActors();
    await insertFutureMatch({ id: IDS.match2 });
    await insertFutureMatch({ id: IDS.match3, refereeId: IDS.refereeSuccessor, date: "2031-01-08", round: 3 });
    await requestAccountDeletion({ userId: IDS.referee, password: PASSWORD });

    // A reschedule keeps its referee and so never locks that referee's user row;
    // the per-referee kickoff advisory lock is the only thing serialising it.
    const holder = await pool.connect();
    let settled = false;
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        refereeScheduleKey({ refereeId: IDS.refereeSuccessor, matchDate: "2031-01-07", timeSlot: "18:00" }),
      ]);
      const pending = resolveRefereeResponsibility({
        actorId: IDS.venueAdmin,
        targetUserId: IDS.referee,
        matchId: IDS.match2,
        successorUserId: IDS.refereeSuccessor,
        reason: "Wait for the concurrent reschedule",
      }).finally(() => { settled = true; });
      pending.catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 750));
      expect(settled).toBe(false);

      // The successor's other fixture moves into this kickoff and commits; the
      // check must run after the lock and therefore see it.
      await holder.query("UPDATE matches SET match_date = '2031-01-07' WHERE id = $1", [IDS.match3]);
      await holder.query("COMMIT");
      await expect(pending).rejects.toMatchObject({ code: "REFEREE_CONFLICT", status: 409 });
    } finally {
      await holder.query("ROLLBACK").catch(() => {});
      holder.release();
    }
    expect((await pool.query("SELECT referee_id FROM matches WHERE id = $1", [IDS.match2])).rows[0])
      .toEqual({ referee_id: IDS.referee });
  }, 30_000);
});
