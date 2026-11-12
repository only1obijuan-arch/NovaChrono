import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Succession must never be performed by an administrator whose account is no longer
// active (Gate 6A.2 acceptance cleanup, finding F2). The services are called directly,
// against real PostgreSQL, so the control has to hold at the service boundary and on the
// CURRENT database row, never on a role or scope claim resolved earlier. Every status
// change alters ONLY account_status: the actor keeps its role, venue and organisation,
// so the status check is the one thing that can refuse it.
vi.mock("@/app/api/utils/send-email", () => ({ sendEmail: vi.fn(async () => ({ id: "test-mail" })) }));

import { hash } from "argon2";
import { pool } from "@/app/api/utils/db";
import {
  requestAccountDeletion,
  resolveRefereeResponsibility,
  resolveTeamResponsibility,
} from "@/app/api/utils/account-lifecycle";

const id = (kind, n) => `${kind}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = {
  org: id("c1", 1), venue: id("c2", 1),
  sup: id("c3", 1), va: id("c3", 2), oa: id("c3", 3),
  cap: id("c3", 4), cap2: id("c3", 5), ref: id("c3", 6), ref2: id("c3", 7),
  league: id("c4", 1), s1: id("c5", 1), s2: id("c5", 2), t1: id("c6", 1), t2: id("c6", 2), m1: id("c7", 1),
};
const PASSWORD = "ResolveActorPass!1";
const REASON = "Actor status regression check";
const flags = {
  mutations: process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED,
  completion: process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED,
};
let passwordHash;

const reset = () => pool.query(`TRUNCATE TABLE
  api_rate_limits, audit_logs, notifications, availability_responses, match_events, matches, standings,
  players, teams, league_slots, leagues, invite_tokens, mobile_sessions, password_reset_tokens,
  auth_accounts, auth_verification_token, auth_users, venues, organizations RESTART IDENTITY CASCADE`);

async function seed() {
  await reset();
  await pool.query("INSERT INTO organizations (id, name) VALUES ($1,'Actor Org')", [ID.org]);
  await pool.query("INSERT INTO venues (id, organization_id, name) VALUES ($1,$2,'Actor Venue')", [ID.venue, ID.org]);
  let field = 1;
  for (const [key, role, venue, org] of [
    ["sup", "super_admin", null, null], ["va", "venue_admin", ID.venue, ID.org], ["oa", "org_admin", null, ID.org],
    ["cap", "captain", ID.venue, ID.org], ["cap2", "captain", ID.venue, ID.org],
    ["ref", "referee", ID.venue, ID.org], ["ref2", "referee", ID.venue, ID.org],
  ]) {
    await pool.query(
      `INSERT INTO auth_users (id, name, email, role, venue_id, organization_id, field_number, "emailVerified")
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [ID[key], `Person ${key}`, `${key}@actor.example.test`, role, venue, org, role === "referee" ? field++ : null],
    );
  }
  for (const key of ["va", "oa"]) {
    await pool.query(
      `INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
       VALUES ($1::uuid,'credentials','credentials',$1::text,$2)`,
      [ID[key], passwordHash],
    );
  }
  await pool.query(
    `INSERT INTO leagues (id, venue_id, name, day_of_week, match_format, match_duration_minutes,
                          fields_count, time_slots, max_teams, join_code, status)
     VALUES ($1,$2,'Actor League',2,'5v5',40,2,'["18:00"]',2,'ACT00001','active')`,
    [ID.league, ID.venue],
  );
  await pool.query("INSERT INTO league_slots (id, league_id, slot_number) VALUES ($1,$3,1),($2,$3,2)", [ID.s1, ID.s2, ID.league]);
  await pool.query(
    `INSERT INTO teams (id, league_id, slot_id, name, status, captain_user_id)
     VALUES ($1,$3,$4,'Actor Team','active',$6),($2,$3,$5,'Filler','active',NULL)`,
    [ID.t1, ID.t2, ID.league, ID.s1, ID.s2, ID.cap],
  );
  await pool.query(
    `INSERT INTO matches (id, league_id, round_number, match_date, time_slot, field_number,
                          home_slot_id, away_slot_id, home_team_id, away_team_id, status, referee_id)
     VALUES ($1,$2,1,'2031-01-07','18:00',1,$3,$4,$5,$6,'scheduled',$7)`,
    [ID.m1, ID.league, ID.s1, ID.s2, ID.t1, ID.t2, ID.ref],
  );
  for (const key of ["cap", "ref"]) await transition("pending_deletion", ID[key]);
}

const TRANSITION = {
  pending_deletion: `UPDATE auth_users SET account_status = 'pending_deletion', deletion_request_id = gen_random_uuid(),
    deletion_requested_at = NOW(), sessions_valid_after = NOW() WHERE id = $1`,
  deidentified: `UPDATE auth_users SET account_status = 'deidentified', deletion_request_id = gen_random_uuid(),
    deletion_requested_at = NOW(), deidentified_at = NOW(), "emailVerified" = NULL, name = 'Former administrator',
    email = 'deidentified+' || replace(id::text, '-', '') || '@account.invalid' WHERE id = $1`,
};
const transition = (status, userId) => pool.query(TRANSITION[status], [userId]);

const resolveTeam = (actorKey, successorKey = null) => resolveTeamResponsibility({
  actorId: ID[actorKey], targetUserId: ID.cap, teamId: ID.t1, successorUserId: successorKey ? ID[successorKey] : null, reason: REASON,
});
const resolveFixture = (actorKey, successorKey = null) => resolveRefereeResponsibility({
  actorId: ID[actorKey], targetUserId: ID.ref, matchId: ID.m1, successorUserId: successorKey ? ID[successorKey] : null, reason: REASON,
});
const OPERATIONS = { team: resolveTeam, fixture: resolveFixture };
const SUCCESSOR = { team: "cap2", fixture: "ref2" };

const teamCaptain = async () => (await pool.query("SELECT captain_user_id FROM teams WHERE id = $1", [ID.t1])).rows[0].captain_user_id;
const fixtureReferee = async () => (await pool.query("SELECT referee_id FROM matches WHERE id = $1", [ID.m1])).rows[0].referee_id;
const holder = { team: teamCaptain, fixture: fixtureReferee };
const ORIGINAL = { team: ID.cap, fixture: ID.ref };
const auditCount = async () => (await pool.query("SELECT count(*)::int AS n FROM audit_logs")).rows[0].n;

async function expectUntouched(kind) {
  expect(await holder[kind]()).toBe(ORIGINAL[kind]);
  expect(await auditCount()).toBe(0);
}

async function waitForLockWait(timeoutMs = 5000) {
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

beforeAll(async () => { passwordHash = await hash(PASSWORD); });
beforeEach(async () => {
  process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED = "true";
  process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED = "true";
  await seed();
});
afterAll(async () => {
  await reset();
  await pool.end();
  for (const [name, value] of [["ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED", flags.mutations], ["ACCOUNT_LIFECYCLE_COMPLETION_ENABLED", flags.completion]]) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

describe("positive control: the same fixture works for an active administrator", () => {
  it.each(["team", "fixture"])("an active venue administrator completes %s succession", async (kind) => {
    const custody = await OPERATIONS[kind]("va");
    expect(custody.status).toBe("pending_deletion");
    expect(await holder[kind]()).toBeNull();
    expect(await auditCount()).toBe(1);
  });

  it.each(["team", "fixture"])("an active venue administrator completes %s succession to a successor", async (kind) => {
    await OPERATIONS[kind]("va", SUCCESSOR[kind]);
    expect(await holder[kind]()).toBe(ID[SUCCESSOR[kind]]);
  });
});

describe("an administrator who is no longer active is refused by both succession services", () => {
  const roles = ["va", "oa", "sup"];
  const statuses = ["pending_deletion", "deidentified"];
  const cases = ["team", "fixture"].flatMap((kind) => roles.flatMap((who) => statuses.map((status) => [kind, who, status])));

  it.each(cases)("%s succession by %s (%s) is refused and changes nothing", async (kind, who, status) => {
    await transition(status, ID[who]);
    await expect(OPERATIONS[kind](who)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expectUntouched(kind);
  });

  it.each(["team", "fixture"].flatMap((kind) => statuses.map((status) => [kind, status])))(
    "%s succession to a valid successor by a %s venue administrator is refused and changes nothing",
    async (kind, status) => {
      await transition(status, ID.va);
      await expect(OPERATIONS[kind]("va", SUCCESSOR[kind])).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      await expectUntouched(kind);
    },
  );

  it("is judged on the current row: reactivating the administrator restores the ability", async () => {
    await transition("pending_deletion", ID.va);
    await expect(resolveTeam("va")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await pool.query(`UPDATE auth_users SET account_status = 'active', deletion_request_id = NULL,
      deletion_requested_at = NULL WHERE id = $1`, [ID.va]);
    await expect(resolveTeam("va")).resolves.toMatchObject({ resolution: "administrator_custody" });
  });
});

describe("a status change that races a succession cannot be overtaken", () => {
  // The succession is queued behind a lock it needs first (the league for teams, the
  // fixture for referees). While it waits, the administrator's account changes state;
  // only a check made under the user-row lock, after the wait, can notice.
  const lockSql = {
    team: "SELECT id FROM leagues WHERE id = $1 FOR UPDATE",
    fixture: "SELECT id FROM matches WHERE id = $1 FOR UPDATE",
  };
  const lockId = { team: ID.league, fixture: ID.m1 };

  it.each(["team", "fixture"])("a real deletion request that commits while %s succession is queued is honoured", async (kind) => {
    const side = await pool.connect();
    let outcome;
    try {
      await side.query("BEGIN");
      await side.query(lockSql[kind], [lockId[kind]]);
      let settled = false;
      outcome = OPERATIONS[kind]("va").then(
        (value) => { settled = true; return { value }; },
        (error) => { settled = true; return { error }; },
      );
      expect(await waitForLockWait(), `${kind} succession never queued behind the held lock`).toBe(true);
      expect(settled).toBe(false);

      const requested = await requestAccountDeletion({ userId: ID.va, password: PASSWORD });
      expect(requested.status).toBe("pending_deletion");
      await side.query("COMMIT");
    } finally {
      await side.query("ROLLBACK").catch(() => {});
      side.release();
    }
    const { value, error } = await outcome;
    expect(value).toBeUndefined();
    expect(error).toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(await holder[kind]()).toBe(ORIGINAL[kind]);
    // Only the deletion request's own audit entry exists.
    expect((await pool.query("SELECT action_type FROM audit_logs")).rows.map((row) => row.action_type)).toEqual(["ACCOUNT_DELETION_REQUESTED"]);
  }, 30_000);

  it.each(["team", "fixture"].flatMap((kind) => ["pending_deletion", "deidentified"].map((status) => [kind, status])))(
    "%s succession waiting on the administrator's own row honours an uncommitted transition to %s",
    async (kind, status) => {
      const side = await pool.connect();
      let outcome;
      try {
        await side.query("BEGIN");
        await side.query(TRANSITION[status], [ID.va]);
        let settled = false;
        outcome = OPERATIONS[kind]("va").then(
          (value) => { settled = true; return { value }; },
          (error) => { settled = true; return { error }; },
        );
        expect(await waitForLockWait(), `${kind} succession never waited on the administrator row`).toBe(true);
        expect(settled).toBe(false);
        await side.query("COMMIT");
      } finally {
        await side.query("ROLLBACK").catch(() => {});
        side.release();
      }
      const { value, error } = await outcome;
      expect(value).toBeUndefined();
      expect(error).toMatchObject({ code: "FORBIDDEN", status: 403 });
      await expectUntouched(kind);
    },
    20_000,
  );
});
