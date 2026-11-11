import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Service-boundary controls of the account lifecycle (Gate 6A.2 hardening), real
// PostgreSQL. These call the services directly (no HTTP route in front), so each
// control must hold on its own. Only the identity lookup used by the routes in the
// final describe block is replaced, to model an identity resolved *before* the
// account changed state.
const stale = vi.hoisted(() => ({ user: null }));
vi.mock("@/app/api/utils/auth", () => ({
  requireRole: vi.fn(async () => stale.user),
  resolveCurrentUser: vi.fn(async () => stale.user),
}));
vi.mock("@/app/api/utils/send-email", () => ({ sendEmail: vi.fn(async () => ({ id: "test-mail" })) }));

import { hash } from "argon2";
import { pool, withTransaction } from "@/app/api/utils/db";
import {
  cancelPendingDeletion,
  completeAccountDeidentification,
  getLifecycleBlockers,
  requestAccountDeletion,
  resolveRefereeResponsibility,
  resolveTeamResponsibility,
} from "@/app/api/utils/account-lifecycle";
import { POST as leagueCommand } from "@/app/api/leagues/route";
import { POST as joinLeague } from "@/app/api/captain/join-league/route";

const id = (kind, n) => `${kind}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = {
  org: id("e1", 1), org2: id("e1", 2), venue: id("e2", 1), venue2: id("e2", 2),
  sup: id("e3", 1), sup2: id("e3", 2), va: id("e3", 3), oa: id("e3", 4),
  cap: id("e3", 5), cap2: id("e3", 6), ref: id("e3", 7), ref2: id("e3", 8), plain: id("e3", 9), va2: id("e3", 10),
  league: id("e4", 1), leagueActive: id("e4", 2), leagueDone: id("e4", 3), leagueReg: id("e4", 4),
  s1: id("e5", 1), s2: id("e5", 2), t1: id("e6", 1), t2: id("e6", 2),
};
const m = (n) => id("e7", n);
const REASON = "Service boundary check reason";
const flags = {
  mutations: process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED,
  completion: process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED,
};
const setFlags = (mutations, completion) => {
  for (const [name, value] of [["ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED", mutations], ["ACCOUNT_LIFECYCLE_COMPLETION_ENABLED", completion]]) {
    if (value) process.env[name] = "true"; else delete process.env[name];
  }
};

const reset = () => pool.query(`TRUNCATE TABLE
  auth_rate_limits, api_rate_limits, audit_logs, notifications, availability_responses, match_events,
  matches, standings, players, teams, league_slots, leagues, invite_tokens,
  mobile_sessions, password_reset_tokens, auth_accounts,
  auth_verification_token, auth_users, venues, organizations RESTART IDENTITY CASCADE`);

async function seed() {
  await reset();
  await pool.query("INSERT INTO organizations (id, name) VALUES ($1,'Org'),($2,'Other Org')", [ID.org, ID.org2]);
  await pool.query(
    "INSERT INTO venues (id, organization_id, name) VALUES ($1,$3,'Venue'),($2,$4,'Other Venue')",
    [ID.venue, ID.venue2, ID.org, ID.org2],
  );
  const users = [
    ["sup", "super_admin", null, null], ["sup2", "super_admin", null, null],
    ["va", "venue_admin", ID.venue, ID.org], ["oa", "org_admin", null, ID.org],
    ["cap", "captain", ID.venue, ID.org], ["cap2", "captain", ID.venue, ID.org], ["plain", "captain", ID.venue, ID.org],
    ["ref", "referee", ID.venue, ID.org], ["ref2", "referee", ID.venue, ID.org],
  ];
  let field = 1;
  for (const [key, role, venue, org] of users) {
    await pool.query(
      `INSERT INTO auth_users (id, name, email, role, venue_id, organization_id, field_number, "emailVerified")
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [ID[key], `Person ${key}`, `${key}@gates.example.test`, role, venue, org, role === "referee" ? field++ : null],
    );
  }
  await pool.query(
    `INSERT INTO leagues (id, venue_id, name, day_of_week, match_format, match_duration_minutes,
                          fields_count, time_slots, max_teams, join_code, status) VALUES
       ($1,$5,'Main',2,'5v5',40,2,'["18:00"]',2,'GATES001','active'),
       ($2,$5,'Active',2,'5v5',40,2,'["18:00"]',2,'GATES002','active'),
       ($3,$5,'Done',2,'5v5',40,2,'["18:00"]',2,'GATES003','completed'),
       ($4,$5,'Reg',2,'5v5',40,2,'["18:00"]',2,'GATES004','registration')`,
    [ID.league, ID.leagueActive, ID.leagueDone, ID.leagueReg, ID.venue],
  );
  await pool.query("INSERT INTO league_slots (id, league_id, slot_number) VALUES ($1,$3,1),($2,$3,2)", [ID.s1, ID.s2, ID.league]);
  await pool.query("INSERT INTO league_slots (id, league_id, slot_number) VALUES ($1,$3,1),($2,$3,2)", [id("e5", 3), id("e5", 4), ID.leagueReg]);
  await pool.query(
    `INSERT INTO teams (id, league_id, slot_id, name, status, captain_user_id)
     VALUES ($1,$3,$4,'Gate Team','active',$5),($2,$3,$6,'Other Gate Team','active',NULL)`,
    [ID.t1, ID.t2, ID.league, ID.s1, ID.cap, ID.s2],
  );
}

const addMatch = (matchId, status, referee, date = "2031-01-07") => pool.query(
  `INSERT INTO matches (id, league_id, round_number, match_date, time_slot, field_number,
                        home_slot_id, away_slot_id, home_team_id, away_team_id, status, referee_id)
   VALUES ($1,$2,$3,$4,'18:00',1,$5,$6,$7,$8,$9,$10)`,
  [matchId, ID.league, Number(matchId.slice(-2)), date, ID.s1, ID.s2, ID.t1, ID.t2, status, referee],
);
const pend = (userId) => pool.query(
  `UPDATE auth_users SET account_status = 'pending_deletion', deletion_request_id = gen_random_uuid(),
     deletion_requested_at = NOW(), sessions_valid_after = NOW() WHERE id = $1`,
  [userId],
);
const status = async (userId) => (await pool.query("SELECT account_status FROM auth_users WHERE id = $1", [userId])).rows[0].account_status;
const auditCount = async () => (await pool.query("SELECT count(*)::int AS n FROM audit_logs")).rows[0].n;
const code = (promise) => promise.then(() => "RESOLVED", (error) => error.code ?? error.message);

beforeEach(async () => {
  setFlags(true, true);
  stale.user = null;
  await seed();
});
afterAll(async () => {
  await reset();
  await pool.end();
  for (const [name, value] of [["ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED", flags.mutations], ["ACCOUNT_LIFECYCLE_COMPLETION_ENABLED", flags.completion]]) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

describe("lifecycle feature flags are enforced by every service function", () => {
  async function pendingFixtures() {
    await addMatch(m(1), "scheduled", ID.ref);
    await pend(ID.cap); await pend(ID.ref); await pend(ID.plain);
  }
  const calls = {
    request: () => requestAccountDeletion({ userId: ID.cap2, password: "irrelevant" }),
    complete: () => completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.plain, reason: REASON }),
    cancel: () => cancelPendingDeletion({ actorId: ID.sup, targetUserId: ID.plain, reason: REASON, identityVerified: true }),
    resolveTeam: () => resolveTeamResponsibility({ actorId: ID.va, targetUserId: ID.cap, teamId: ID.t1, reason: REASON }),
    resolveFixture: () => resolveRefereeResponsibility({ actorId: ID.va, targetUserId: ID.ref, matchId: m(1), reason: REASON }),
  };

  it.each(Object.keys(calls))("%s is refused with both flags unset and changes nothing", async (name) => {
    await pendingFixtures();
    setFlags(false, false);
    expect(await code(calls[name]())).toBe("LIFECYCLE_DISABLED");
    expect(await auditCount()).toBe(0);
    expect(await status(ID.plain)).toBe("pending_deletion");
    expect((await pool.query("SELECT captain_user_id FROM teams WHERE id = $1", [ID.t1])).rows[0].captain_user_id).toBe(ID.cap);
    expect((await pool.query("SELECT referee_id FROM matches WHERE id = $1", [m(1)])).rows[0].referee_id).toBe(ID.ref);
  });

  it("with only the primary switch on, new requests and completion are refused but recovery works", async () => {
    await pendingFixtures();
    setFlags(true, false);
    expect(await code(calls.request())).toBe("LIFECYCLE_COMPLETION_DISABLED");
    expect(await code(calls.complete())).toBe("LIFECYCLE_COMPLETION_DISABLED");
    expect(await status(ID.cap2)).toBe("active");
    expect(await status(ID.plain)).toBe("pending_deletion");

    expect(await code(calls.resolveTeam())).toBe("RESOLVED");
    expect(await code(calls.resolveFixture())).toBe("RESOLVED");
    expect(await code(calls.cancel())).toBe("RESOLVED");
    expect(await status(ID.plain)).toBe("active");
  });
});

describe("authorisation at the service boundary", () => {
  it("lets only an active super administrator complete or cancel", async () => {
    await pend(ID.plain);
    for (const actor of ["va", "oa", "cap", "ref"]) {
      expect(await code(completeAccountDeidentification({ actorId: ID[actor], targetUserId: ID.plain, reason: REASON })), actor)
        .toBe("FORBIDDEN");
      expect(await code(cancelPendingDeletion({ actorId: ID[actor], targetUserId: ID.plain, reason: REASON, identityVerified: true })), actor)
        .toBe("FORBIDDEN");
    }
    expect(await status(ID.plain)).toBe("pending_deletion");
    expect(await auditCount()).toBe(0);

    // A pending or de-identified super administrator is not an active one.
    await pend(ID.sup2);
    expect(await code(completeAccountDeidentification({ actorId: ID.sup2, targetUserId: ID.plain, reason: REASON }))).toBe("FORBIDDEN");
    expect(await code(cancelPendingDeletion({ actorId: ID.sup2, targetUserId: ID.plain, reason: REASON, identityVerified: true }))).toBe("FORBIDDEN");
    expect(await status(ID.plain)).toBe("pending_deletion");

    expect(await code(completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.plain, reason: REASON }))).toBe("RESOLVED");
    expect(await status(ID.plain)).toBe("deidentified");
  });

  it("refuses every action against an account that is not pending deletion", async () => {
    await addMatch(m(1), "scheduled", ID.ref);
    const before = await auditCount();
    expect(await code(resolveTeamResponsibility({ actorId: ID.va, targetUserId: ID.cap, teamId: ID.t1, reason: REASON }))).toBe("NOT_PENDING");
    expect(await code(resolveTeamResponsibility({ actorId: ID.sup, targetUserId: ID.cap, teamId: ID.t1, successorUserId: ID.cap2, reason: REASON }))).toBe("NOT_PENDING");
    expect(await code(resolveRefereeResponsibility({ actorId: ID.va, targetUserId: ID.ref, matchId: m(1), successorUserId: ID.ref2, reason: REASON }))).toBe("NOT_PENDING");
    expect(await code(completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.plain, reason: REASON }))).toBe("NOT_PENDING");
    expect(await code(cancelPendingDeletion({ actorId: ID.sup, targetUserId: ID.plain, reason: REASON, identityVerified: true }))).toBe("NOT_PENDING");

    // Nothing moved: an active captain keeps the team, an active referee keeps the fixture.
    expect((await pool.query("SELECT captain_user_id FROM teams WHERE id = $1", [ID.t1])).rows[0].captain_user_id).toBe(ID.cap);
    expect((await pool.query("SELECT referee_id FROM matches WHERE id = $1", [m(1)])).rows[0].referee_id).toBe(ID.ref);
    expect(await auditCount()).toBe(before);
  });
});

describe("final super administrator protection at completion", () => {
  it("completes a pending super administrator only through another active one, which then remains", async () => {
    await pend(ID.sup2);
    expect(await code(completeAccountDeidentification({ actorId: ID.sup2, targetUserId: ID.sup2, reason: REASON }))).toBe("FORBIDDEN");
    expect(await code(completeAccountDeidentification({ actorId: ID.va, targetUserId: ID.sup2, reason: REASON }))).toBe("FORBIDDEN");
    expect(await status(ID.sup2)).toBe("pending_deletion");

    expect(await code(completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.sup2, reason: REASON }))).toBe("RESOLVED");
    const supers = (await pool.query(
      "SELECT account_status, count(*)::int AS n FROM auth_users WHERE role = 'super_admin' GROUP BY 1 ORDER BY 1",
    )).rows;
    expect(supers).toEqual([{ account_status: "active", n: 1 }, { account_status: "deidentified", n: 1 }]);
  });

  it("never lets the platform reach zero active super administrators, even after a completion", async () => {
    await pool.query(
      `INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
       VALUES ($1,'credentials','credentials','sup-credentials',$2)`,
      [ID.sup, await hash("FinalSuperPass!1")],
    );
    await pend(ID.sup2);
    await completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.sup2, reason: REASON });
    // The tombstone keeps role = super_admin but must not count as an active administrator,
    // so the remaining one is the final one: refused even with the correct password.
    expect(await code(requestAccountDeletion({ userId: ID.sup, password: "FinalSuperPass!1" }))).toBe("FINAL_SUPER_ADMIN");
    expect(await status(ID.sup)).toBe("active");
  });

  it("cannot be completed by anyone when every super administrator is pending", async () => {
    await pend(ID.sup); await pend(ID.sup2); await pend(ID.plain);
    for (const actor of ["sup", "sup2", "va", "oa"]) {
      expect(await code(completeAccountDeidentification({ actorId: ID[actor], targetUserId: ID.plain, reason: REASON })), actor)
        .toBe("FORBIDDEN");
    }
    expect(await status(ID.plain)).toBe("pending_deletion");
  });
});

describe("blockers", () => {
  const types = async (userKey) => {
    const row = (await pool.query(
      "SELECT id, role, venue_id, organization_id FROM auth_users WHERE id = $1", [ID[userKey]],
    )).rows[0];
    return (await withTransaction((tx) => getLifecycleBlockers(tx, row))).map((blocker) => blocker.type);
  };
  const clearAdmins = () => pool.query("DELETE FROM auth_users WHERE id = ANY($1::uuid[])", [[ID.sup, ID.sup2, ID.oa]]);

  it("blocks the last venue administrator unless another active administrator covers the venue", async () => {
    await clearAdmins();
    expect(await types("va")).toContain("venue_admin_coverage");

    await pool.query(`INSERT INTO auth_users (id, name, email, role, venue_id, organization_id) VALUES ($1,'Other','va2@gates.example.test','venue_admin',$2,$3)`, [ID.va2, ID.venue2, ID.org2]);
    expect(await types("va"), "an administrator of another venue does not cover").toContain("venue_admin_coverage");
    await pool.query("UPDATE auth_users SET venue_id = $1, organization_id = $2 WHERE id = $3", [ID.venue, ID.org, ID.va2]);
    await pend(ID.va2);
    expect(await types("va"), "a pending administrator does not cover").toContain("venue_admin_coverage");
    await pool.query(`UPDATE auth_users SET account_status = 'active', deletion_request_id = NULL, deletion_requested_at = NULL WHERE id = $1`, [ID.va2]);
    expect(await types("va"), "an active co-administrator covers").not.toContain("venue_admin_coverage");

    await pool.query("UPDATE auth_users SET role = 'captain' WHERE id = $1", [ID.va2]);
    await pool.query(`INSERT INTO auth_users (id, name, email, role, organization_id) VALUES ($1,'Org','oa@gates.example.test','org_admin',$2)`, [ID.oa, ID.org]);
    expect(await types("va"), "an organisation administrator covers").not.toContain("venue_admin_coverage");
    await pool.query("DELETE FROM auth_users WHERE id = $1", [ID.oa]);
    await pool.query(`INSERT INTO auth_users (id, name, email, role) VALUES ($1,'Sup','sup@gates.example.test','super_admin')`, [ID.sup]);
    expect(await types("va"), "a super administrator covers").not.toContain("venue_admin_coverage");
  });

  it("blocks the last organisation administrator unless another active administrator covers the organisation", async () => {
    await pool.query("DELETE FROM auth_users WHERE id = ANY($1::uuid[])", [[ID.sup, ID.sup2]]);
    expect(await types("oa")).toContain("organization_admin_coverage");
    expect(await types("va"), "a venue administrator is covered by the organisation administrator").not.toContain("venue_admin_coverage");

    await pool.query("UPDATE auth_users SET role = 'org_admin', venue_id = NULL, organization_id = $1 WHERE id = $2", [ID.org, ID.va]);
    expect(await types("oa"), "an active co-administrator covers").not.toContain("organization_admin_coverage");
    await pool.query("UPDATE auth_users SET role = 'venue_admin', venue_id = $1 WHERE id = $2", [ID.venue, ID.va]);
    expect(await types("oa"), "a venue administrator does not cover the organisation").toContain("organization_admin_coverage");
    await pend(ID.va);
    await pool.query(`INSERT INTO auth_users (id, name, email, role) VALUES ($1,'Sup','sup@gates.example.test','super_admin')`, [ID.sup]);
    expect(await types("oa"), "a super administrator covers").not.toContain("organization_admin_coverage");
  });

  it("counts scheduled, live and postponed fixtures but not final or cancelled ones", async () => {
    await addMatch(m(1), "scheduled", ID.ref);
    await addMatch(m(2), "live", ID.ref, "2031-01-08");
    await addMatch(m(3), "postponed", ID.ref, "2031-01-09");
    await addMatch(m(4), "final", ID.ref, "2030-01-01");
    await addMatch(m(5), "cancelled", ID.ref, "2030-01-02");
    await pend(ID.ref);

    const row = (await pool.query("SELECT id, role, venue_id, organization_id FROM auth_users WHERE id = $1", [ID.ref])).rows[0];
    const blockers = await withTransaction((tx) => getLifecycleBlockers(tx, row));
    const fixtures = blockers.find((blocker) => blocker.type === "future_referee_fixtures");
    expect(fixtures.records.map((record) => record.id).sort()).toEqual([m(1), m(2), m(3)]);

    const refused = await completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.ref, reason: REASON }).catch((error) => error);
    expect(refused).toMatchObject({ code: "LIFECYCLE_BLOCKED", status: 409 });
    expect(refused.details[0].records.map((record) => record.id).sort()).toEqual([m(1), m(2), m(3)]);
    expect(await status(ID.ref)).toBe("pending_deletion");
  });
});

describe("completion and withdrawal side effects", () => {
  it("scrubs any residual access artefacts even if an earlier step missed them", async () => {
    await pool.query(
      `INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
       VALUES ($1,'credentials','credentials',$2,'stored-hash')`,
      [ID.plain, "plain@gates.example.test"],
    );
    await pend(ID.plain);
    // Simulate residue a previous step failed to remove.
    await pool.query("UPDATE auth_users SET push_token = 'ExpoPushToken[residual]' WHERE id = $1", [ID.plain]);
    await pool.query("INSERT INTO mobile_sessions (jti, user_id, expires_at) VALUES ('residual-jti',$1,NOW() + interval '1 day')", [ID.plain]);

    await completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.plain, reason: REASON });
    const user = (await pool.query("SELECT push_token, account_status FROM auth_users WHERE id = $1", [ID.plain])).rows[0];
    expect(user).toEqual({ push_token: null, account_status: "deidentified" });
    expect((await pool.query("SELECT count(*)::int AS n FROM mobile_sessions WHERE user_id = $1", [ID.plain])).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT count(*)::int AS n FROM auth_accounts WHERE "userId" = $1`, [ID.plain])).rows[0].n).toBe(0);
  });

  it("requires and records the operator's identity attestation for assisted withdrawal", async () => {
    await pend(ID.plain);
    for (const identityVerified of [undefined, false, "true", 1, null]) {
      expect(await code(cancelPendingDeletion({ actorId: ID.sup, targetUserId: ID.plain, reason: REASON, identityVerified })), String(identityVerified))
        .toBe("IDENTITY_ATTESTATION_REQUIRED");
    }
    expect(await status(ID.plain)).toBe("pending_deletion");
    expect(await auditCount()).toBe(0);

    await cancelPendingDeletion({ actorId: ID.sup, targetUserId: ID.plain, reason: REASON, identityVerified: true });
    const audit = (await pool.query(
      "SELECT action_by, target_id, new_value, reason FROM audit_logs WHERE action_type = 'ACCOUNT_DELETION_CANCELLED'",
    )).rows;
    expect(audit).toEqual([{
      action_by: ID.sup,
      target_id: ID.plain,
      new_value: { account_status: "active", identity_verified: true },
      reason: REASON,
    }]);
  });
});

describe("lock strength on shared sporting rows", () => {
  async function waitForLockWait(timeoutMs = 4000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`,
      );
      if (rows[0].n > 0) return true;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
  }

  // A concurrent holder takes a FOR KEY SHARE lock, which conflicts with nothing
  // except FOR UPDATE. An operation that needs the row exclusively (FOR UPDATE) must
  // queue behind it; one that weakens to FOR SHARE, or whose later UPDATE only takes
  // FOR NO KEY UPDATE, would sail through - so the first lock itself is what is tested.
  async function mustQueueBehind(shareLockSql, params, operation) {
    const holder = await pool.connect();
    let outcome;
    try {
      await holder.query("BEGIN");
      await holder.query(shareLockSql, params);
      let settled = false;
      outcome = operation().then((value) => { settled = true; return value; }, (error) => { settled = true; throw error; });
      const waited = await waitForLockWait();
      expect(waited, "the operation did not wait for the KEY SHARE lock").toBe(true);
      expect(settled).toBe(false);
    } finally {
      await holder.query("ROLLBACK").catch(() => {});
      holder.release();
    }
    return outcome;
  }

  it("team succession takes the league row exclusively before any team or user row", async () => {
    await pend(ID.cap);
    const result = await mustQueueBehind(
      "SELECT id FROM leagues WHERE id = $1 FOR KEY SHARE", [ID.league],
      () => resolveTeamResponsibility({ actorId: ID.va, targetUserId: ID.cap, teamId: ID.t1, reason: REASON }),
    );
    expect(result.resolution).toBe("administrator_custody");
  });

  it("referee succession takes the fixture row exclusively before any user row", async () => {
    await addMatch(m(1), "scheduled", ID.ref);
    await pend(ID.ref);
    const result = await mustQueueBehind(
      "SELECT id FROM matches WHERE id = $1 FOR KEY SHARE", [m(1)],
      () => resolveRefereeResponsibility({ actorId: ID.va, targetUserId: ID.ref, matchId: m(1), reason: REASON }),
    );
    expect(result.resolution).toBe("referee_unassigned");
  });
});

describe("an identity resolved before the account changed state is re-checked inside the transaction", () => {
  const post = (path, body) => new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://example.test" },
    body: JSON.stringify(body),
  });
  const venueAdminIdentity = { id: undefined, role: "venue_admin", venue_id: undefined, organization_id: undefined };
  const leagueRequests = {
    COMPLETE_SEASON: () => leagueCommand(post("/api/leagues", { action: "COMPLETE_SEASON", leagueId: ID.leagueActive })),
    CREATE_NEW_SEASON: () => leagueCommand(post("/api/leagues", { action: "CREATE_NEW_SEASON", parentLeagueId: ID.leagueDone, seasonName: "Next Season" })),
    GENERATE_FIXTURES: () => leagueCommand(post("/api/leagues", { action: "GENERATE_FIXTURES", leagueId: ID.leagueReg })),
  };

  it.each(Object.keys(leagueRequests))("%s refuses an administrator who is no longer active", async (action) => {
    stale.user = { ...venueAdminIdentity, id: ID.va, venue_id: ID.venue, organization_id: ID.org };
    await pend(ID.va);
    const leaguesBefore = (await pool.query("SELECT count(*)::int AS n FROM leagues")).rows[0].n;
    const response = await leagueRequests[action]();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Insufficient permissions");
    expect((await pool.query("SELECT count(*)::int AS n FROM leagues")).rows[0].n).toBe(leaguesBefore);
    expect((await pool.query("SELECT status FROM leagues WHERE id = $1", [ID.leagueActive])).rows[0].status).toBe("active");
    expect((await pool.query("SELECT count(*)::int AS n FROM audit_logs")).rows[0].n).toBe(0);
  });

  it.each(Object.keys(leagueRequests))("%s still serves the same administrator while active", async (action) => {
    stale.user = { ...venueAdminIdentity, id: ID.va, venue_id: ID.venue, organization_id: ID.org };
    const response = await leagueRequests[action]();
    const body = await response.json();
    expect(body.error).not.toBe("Insufficient permissions");
  });

  it("join-league refuses a captain who is no longer active, and accepts the active one", async () => {
    stale.user = { id: ID.plain, role: "captain", venue_id: ID.venue, organization_id: ID.org };
    await pend(ID.plain);
    const refused = await joinLeague(post("/api/captain/join-league", { joinCode: "GATES004", teamName: "Late Team" }));
    expect(refused.status).toBe(403);
    expect((await pool.query("SELECT count(*)::int AS n FROM teams WHERE name = 'Late Team'")).rows[0].n).toBe(0);

    stale.user = { id: ID.cap2, role: "captain", venue_id: ID.venue, organization_id: ID.org };
    const accepted = await joinLeague(post("/api/captain/join-league", { joinCode: "GATES004", teamName: "Late Team" }));
    expect(accepted.status).toBe(200);
  });
});
