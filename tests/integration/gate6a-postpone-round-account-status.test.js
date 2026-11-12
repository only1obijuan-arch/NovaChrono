import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";

// POSTPONE_ROUND must never act for an administrator whose account is no longer
// active (Gate 6A.2 acceptance cleanup, finding F3). Real PostgreSQL; the route and
// the lifecycle service are real. Only the Auth.js cookie lookup is replaced, and
// `requireRole` can be told to return an identity that was resolved BEFORE the account
// changed state (the situation the in-transaction guard exists for). Every status
// change below alters ONLY account_status: role, venue, organisation and any session
// stay valid, so the status check is the one control that can reject the caller.
const stale = vi.hoisted(() => ({ user: null }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/app/api/utils/auth", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    requireRole: vi.fn(async (...args) => stale.user ?? actual.requireRole(...args)),
  };
});
const mail = vi.hoisted(() => ({ sendEmail: null, sendPush: null }));
vi.mock("@/app/api/utils/send-email", () => {
  mail.sendEmail = vi.fn(async () => ({ id: "test-mail" }));
  return { sendEmail: mail.sendEmail };
});
vi.mock("@/app/api/utils/send-push", () => {
  mail.sendPush = vi.fn(async () => ({}));
  return { sendPush: mail.sendPush };
});

import { hash } from "argon2";
import { pool } from "@/app/api/utils/db";
import { requestAccountDeletion } from "@/app/api/utils/account-lifecycle";
import { POST as postponeRound } from "@/app/api/leagues/postpone-round/route";

const id = (kind, n) => `${kind}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = {
  org: id("f1", 1), venue: id("f2", 1),
  sup: id("f3", 1), va: id("f3", 2), oa: id("f3", 3), cap: id("f3", 4),
  league: id("f4", 1), s1: id("f5", 1), s2: id("f5", 2), t1: id("f6", 1), t2: id("f6", 2),
  m1: id("f7", 1), m2: id("f7", 2),
};
const PASSWORD = "PostponeRoundPass!1";
const ORIGINAL_DATES = { [ID.m1]: "2031-01-07", [ID.m2]: "2031-01-14" };
const POSTPONED_DATES = { [ID.m1]: "2031-01-14", [ID.m2]: "2031-01-21" };
const flags = {
  mutations: process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED,
  completion: process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED,
};
let passwordHash;

const reset = () => pool.query(`TRUNCATE TABLE
  api_rate_limits, audit_logs, notifications, availability_responses, match_events, matches, standings,
  players, teams, league_slots, leagues, mobile_sessions, password_reset_tokens, auth_accounts,
  auth_verification_token, auth_users, venues, organizations RESTART IDENTITY CASCADE`);

async function seed() {
  await reset();
  await pool.query("INSERT INTO organizations (id, name) VALUES ($1,'Postpone Org')", [ID.org]);
  await pool.query("INSERT INTO venues (id, organization_id, name) VALUES ($1,$2,'Postpone Venue')", [ID.venue, ID.org]);
  for (const [key, role, venue, org] of [
    ["sup", "super_admin", null, null], ["va", "venue_admin", ID.venue, ID.org],
    ["oa", "org_admin", null, ID.org], ["cap", "captain", ID.venue, ID.org],
  ]) {
    await pool.query(
      `INSERT INTO auth_users (id, name, email, role, venue_id, organization_id, "emailVerified")
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [ID[key], `Person ${key}`, `${key}@postpone.example.test`, role, venue, org],
    );
  }
  await pool.query(
    `INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
     VALUES ($1::uuid,'credentials','credentials',$1::text,$2)`,
    [ID.va, passwordHash],
  );
  await pool.query(
    `INSERT INTO leagues (id, venue_id, name, day_of_week, match_format, match_duration_minutes,
                          fields_count, time_slots, max_teams, join_code, status)
     VALUES ($1,$2,'Postpone League',2,'5v5',40,2,'["18:00"]',2,'PPN00001','active')`,
    [ID.league, ID.venue],
  );
  await pool.query("INSERT INTO league_slots (id, league_id, slot_number) VALUES ($1,$3,1),($2,$3,2)", [ID.s1, ID.s2, ID.league]);
  await pool.query(
    `INSERT INTO teams (id, league_id, slot_id, name, status) VALUES ($1,$3,$4,'Alpha','active'),($2,$3,$5,'Bravo','active')`,
    [ID.t1, ID.t2, ID.league, ID.s1, ID.s2],
  );
  for (const [matchId, round, date] of [[ID.m1, 1, ORIGINAL_DATES[ID.m1]], [ID.m2, 2, ORIGINAL_DATES[ID.m2]]]) {
    await pool.query(
      `INSERT INTO matches (id, league_id, round_number, match_date, time_slot, field_number,
                            home_slot_id, away_slot_id, home_team_id, away_team_id, status)
       VALUES ($1,$2,$3,$4,'18:00',1,$5,$6,$7,$8,'scheduled')`,
      [matchId, ID.league, round, date, ID.s1, ID.s2, ID.t1, ID.t2],
    );
  }
}

// Status-only transitions: role, venue and organisation are deliberately untouched.
const TRANSITION = {
  pending_deletion: `UPDATE auth_users SET account_status = 'pending_deletion', deletion_request_id = gen_random_uuid(),
    deletion_requested_at = NOW(), sessions_valid_after = NOW() WHERE id = $1`,
  deidentified: `UPDATE auth_users SET account_status = 'deidentified', deletion_request_id = gen_random_uuid(),
    deletion_requested_at = NOW(), deidentified_at = NOW(), "emailVerified" = NULL, name = 'Former administrator',
    email = 'deidentified+' || replace(id::text, '-', '') || '@account.invalid' WHERE id = $1`,
};
const IDENTITY = {
  va: () => ({ id: ID.va, role: "venue_admin", venue_id: ID.venue, organization_id: ID.org }),
  oa: () => ({ id: ID.oa, role: "org_admin", venue_id: null, organization_id: ID.org }),
  sup: () => ({ id: ID.sup, role: "super_admin", venue_id: null, organization_id: null }),
};

const request = () => new Request("https://postpone.test/api/leagues/postpone-round", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ league_id: ID.league, round_number: 1 }),
});
const matchDates = async () => Object.fromEntries((await pool.query(
  "SELECT id, to_char(nova_planned_date(match_date), 'YYYY-MM-DD') AS d FROM matches ORDER BY id",
)).rows.map((row) => [row.id, row.d]));
const auditActions = async () => (await pool.query("SELECT action_type FROM audit_logs")).rows.map((row) => row.action_type).sort();

async function expectNothingChanged(otherAudit = []) {
  expect(await matchDates()).toEqual(ORIGINAL_DATES);
  // Only the unrelated lifecycle entry (when the test itself ran a deletion request) may exist.
  expect(await auditActions(), "no POSTPONE_ROUND audit entry may be written on rejection").toEqual(otherAudit);
  expect(mail.sendEmail).not.toHaveBeenCalled();
  expect(mail.sendPush).not.toHaveBeenCalled();
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

async function mintBearer(userId) {
  const jti = randomUUID();
  await pool.query("INSERT INTO mobile_sessions (jti, user_id, expires_at) VALUES ($1,$2,NOW() + interval '1 day')", [jti, userId]);
  return new SignJWT({ id: userId }).setProtectedHeader({ alg: "HS256" }).setJti(jti)
    .setIssuedAt().setExpirationTime("1d").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
}

beforeAll(async () => { passwordHash = await hash(PASSWORD); });
beforeEach(async () => {
  process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED = "true";
  process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED = "true";
  stale.user = null;
  mail.sendEmail.mockClear();
  mail.sendPush.mockClear();
  await seed();
});
afterAll(async () => {
  await reset();
  await pool.end();
  for (const [name, value] of [["ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED", flags.mutations], ["ACCOUNT_LIFECYCLE_COMPLETION_ENABLED", flags.completion]]) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

describe("an active, authorised administrator", () => {
  it.each(["va", "oa", "sup"])("%s postpones the round: dates move a week and exactly one audit entry is written", async (who) => {
    stale.user = IDENTITY[who]();
    const response = await postponeRound(request());
    expect(response.status).toBe(200);
    expect(await matchDates()).toEqual(POSTPONED_DATES);
    const audit = (await pool.query("SELECT action_by, target_id, action_type FROM audit_logs")).rows;
    expect(audit).toEqual([{ action_by: ID[who], target_id: ID.league, action_type: "POSTPONE_ROUND" }]);
  });

  it("is also served through the real bearer-session identity resolution", async () => {
    const token = await mintBearer(ID.va);
    const response = await postponeRound(new Request("https://postpone.test/api/leagues/postpone-round", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ league_id: ID.league, round_number: 1 }),
    }));
    expect(response.status).toBe(200);
    expect(await matchDates()).toEqual(POSTPONED_DATES);
  });
});

describe("an administrator whose account is no longer active", () => {
  const cases = ["va", "oa", "sup"].flatMap((who) => ["pending_deletion", "deidentified"].map((status) => [who, status]));

  it.each(cases)("%s (%s) is refused even though the identity, role and scope were valid when resolved", async (who, status) => {
    stale.user = IDENTITY[who]();
    await pool.query(TRANSITION[status], [ID[who]]);
    const response = await postponeRound(request());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Forbidden");
    await expectNothingChanged();
  });

  it.each(["pending_deletion", "deidentified"])("a surviving bearer session of a %s administrator is refused by identity resolution", async (status) => {
    const token = await mintBearer(ID.va);
    await pool.query(TRANSITION[status], [ID.va]);
    expect((await pool.query("SELECT count(*)::int AS n FROM mobile_sessions WHERE user_id = $1", [ID.va])).rows[0].n).toBe(1);
    const response = await postponeRound(new Request("https://postpone.test/api/leagues/postpone-round", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ league_id: ID.league, round_number: 1 }),
    }));
    expect(response.status).toBe(401);
    await expectNothingChanged();
  });
});

describe("a refusal is made before any fixture lock is taken", () => {
  it.each(["pending_deletion", "deidentified"])("a %s administrator is refused immediately even while a fixture of the round is locked elsewhere", async (status) => {
    stale.user = IDENTITY.va();
    await pool.query(TRANSITION[status], [ID.va]);
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [ID.m1]);
      const outcome = postponeRound(request());
      const verdict = await Promise.race([
        outcome.then((response) => response.status),
        new Promise((resolve) => setTimeout(() => resolve("still waiting"), 2000)),
      ]);
      expect(verdict, "the refusal queued behind the held fixture lock instead of being decided up front").toBe(403);
    } finally {
      await holder.query("ROLLBACK").catch(() => {});
      holder.release();
    }
    await expectNothingChanged();
  }, 15_000);
});

describe("a status change that races the postponement cannot be overtaken", () => {
  it.each(["pending_deletion", "deidentified"])(
    "an uncommitted transition to %s that commits while the postponement waits on the administrator row is honoured",
    async (status) => {
      // The identity is resolved and the early check passes while the account is still
      // active. The postponement then waits for the administrator row; only the
      // in-transaction guard can notice the change that commits meanwhile.
      stale.user = IDENTITY.va();
      const holder = await pool.connect();
      let outcome;
      try {
        await holder.query("BEGIN");
        await holder.query(TRANSITION[status], [ID.va]);
        let settled = false;
        outcome = postponeRound(request()).then((value) => { settled = true; return value; });
        expect(await waitForLockWait(), "the postponement never reached the administrator row lock").toBe(true);
        expect(settled).toBe(false);
        await holder.query("COMMIT");
      } finally {
        await holder.query("ROLLBACK").catch(() => {});
        holder.release();
      }
      const response = await outcome;
      expect(response.status).toBe(403);
      await expectNothingChanged();
    },
    20_000,
  );

  it("a real deletion request that completes while the postponement waits on a fixture lock is honoured", async () => {
    stale.user = IDENTITY.va();
    const holder = await pool.connect();
    let outcome;
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [ID.m1]);
      let settled = false;
      outcome = postponeRound(request()).then((value) => { settled = true; return value; });
      expect(await waitForLockWait(), "the postponement never waited on the fixture lock").toBe(true);
      expect(settled).toBe(false);

      // The administrator withdraws while the request is queued; the real service commits.
      const requested = await requestAccountDeletion({ userId: ID.va, password: PASSWORD });
      expect(requested.status).toBe("pending_deletion");
      await holder.query("COMMIT");
    } finally {
      await holder.query("ROLLBACK").catch(() => {});
      holder.release();
    }
    const response = await outcome;
    expect(response.status).toBe(403);
    await expectNothingChanged(["ACCOUNT_DELETION_REQUESTED"]);
    expect((await pool.query("SELECT account_status FROM auth_users WHERE id = $1", [ID.va])).rows[0].account_status)
      .toBe("pending_deletion");
  }, 30_000);

  it("a postponement that already holds the administrator row serialises ahead of a later deletion request", async () => {
    // The mirror image: when the postponement wins the lock the account was still active,
    // so the action is legitimate and the deletion request simply follows it.
    stale.user = IDENTITY.va();
    const response = await postponeRound(request());
    expect(response.status).toBe(200);
    const requested = await requestAccountDeletion({ userId: ID.va, password: PASSWORD });
    expect(requested.status).toBe("pending_deletion");
    expect(await matchDates()).toEqual(POSTPONED_DATES);
    expect(await auditActions()).toEqual(["ACCOUNT_DELETION_REQUESTED", "POSTPONE_ROUND"]);
  });
});
