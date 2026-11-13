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
import { NOTIFICATION_TYPES } from "@/constants/notification-types";

const id = (kind, n) => `${kind}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = {
  org: id("f1", 1), venue: id("f2", 1),
  // A second venue (same organisation) and a second organisation, with three active administrators who are NOT
  // entitled to this league. They are seeded only by the scope-refusal tests (seedScopeFixtures).
  orgB: id("f1", 2), venueB: id("f2", 2), vb: id("f3", 6), ob: id("f3", 7), vn: id("f3", 8),
  sup: id("f3", 1), va: id("f3", 2), oa: id("f3", 3), cap: id("f3", 4), cap2: id("f3", 5),
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
// The league's two team captains are the notification recipients. Both have an email address; only the first
// has a push token, so the email-only and email-plus-push paths are both exercised.
const CAPTAINS = {
  cap: { email: "cap@postpone.example.test", pushToken: "ExpoPushToken[postpone-captain-one]" },
  cap2: { email: "cap2@postpone.example.test", pushToken: null },
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
    ["oa", "org_admin", null, ID.org], ["cap", "captain", ID.venue, ID.org], ["cap2", "captain", ID.venue, ID.org],
  ]) {
    await pool.query(
      `INSERT INTO auth_users (id, name, email, role, venue_id, organization_id, "emailVerified")
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [ID[key], `Person ${key}`, `${key}@postpone.example.test`, role, venue, org],
    );
  }
  await pool.query("UPDATE auth_users SET push_token = $2 WHERE id = $1", [ID.cap, CAPTAINS.cap.pushToken]);
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
    `INSERT INTO teams (id, league_id, slot_id, name, status, captain_user_id)
     VALUES ($1,$3,$4,'Alpha','active',$6),($2,$3,$5,'Bravo','active',$7)`,
    [ID.t1, ID.t2, ID.league, ID.s1, ID.s2, ID.cap, ID.cap2],
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

// Active, authenticated administrators who exist but are not entitled to postpone THIS league: a venue administrator
// of another venue in the same organisation, an organisation administrator of a different organisation, and a venue
// administrator with no venue assigned. Added only by the scope-refusal tests, so the main fixture is unchanged.
async function seedScopeFixtures() {
  await pool.query("INSERT INTO organizations (id, name) VALUES ($1,'Other Org')", [ID.orgB]);
  await pool.query("INSERT INTO venues (id, organization_id, name) VALUES ($1,$2,'Other Venue')", [ID.venueB, ID.org]);
  for (const [key, role, venue, org] of [
    ["vb", "venue_admin", ID.venueB, ID.org],
    ["ob", "org_admin", null, ID.orgB],
    ["vn", "venue_admin", null, ID.org],
  ]) {
    await pool.query(
      `INSERT INTO auth_users (id, name, email, role, venue_id, organization_id, "emailVerified")
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [ID[key], `Person ${key}`, `${key}@postpone.example.test`, role, venue, org],
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

// The captains the route itself would notify, selected with the route's own recipient rule (active team, active
// captain account). It is the fixture's proof that there IS someone to notify: without it, "no notification was
// sent" cannot distinguish a correctly suppressed notification from a fixture that never had a recipient.
const eligibleRecipients = async () => (await pool.query(
  `SELECT DISTINCT au.id
   FROM teams t
   JOIN league_slots ls ON t.slot_id = ls.id
   JOIN auth_users au ON t.captain_user_id = au.id
   WHERE ls.league_id = $1 AND t.status = 'active' AND au.account_status = 'active'
   ORDER BY au.id`,
  [ID.league],
)).rows.map((row) => row.id);
const notificationRows = async () => (await pool.query(
  "SELECT user_id, type, title FROM notifications ORDER BY user_id",
)).rows;

// A rejected request must have NO notification effect of any kind - and the assertion is only meaningful because
// the reachable recipients are asserted to exist first.
async function expectNoNotificationEffects() {
  expect(await eligibleRecipients(), "fixture precondition: both captains must be reachable, otherwise 'no notification' proves nothing")
    .toEqual([ID.cap, ID.cap2].sort());
  expect(await notificationRows(), "no inbox notification may be written").toEqual([]);
  expect(mail.sendEmail, "no email may be sent").not.toHaveBeenCalled();
  expect(mail.sendPush, "no push may be sent").not.toHaveBeenCalled();
}

// Exactly one inbox notification, one email, and (only for the captain who has a token) one push per recipient.
async function expectNotificationEffects(recipientKeys) {
  const expectedIds = recipientKeys.map((key) => ID[key]).sort();
  const rows = await notificationRows();
  expect(rows.map((row) => row.user_id)).toEqual(expectedIds);
  for (const row of rows) {
    expect(row.type).toBe(NOTIFICATION_TYPES.ROUND_POSTPONED);
    expect(row.title).toContain("Postpone League");
  }
  const emails = mail.sendEmail.mock.calls.map(([message]) => message);
  expect(emails.map((message) => message.to).sort()).toEqual(recipientKeys.map((key) => CAPTAINS[key].email).sort());
  for (const message of emails) expect(message.subject).toContain("Postpone League");
  const expectedPushTokens = recipientKeys.map((key) => CAPTAINS[key].pushToken).filter(Boolean).sort();
  const pushes = mail.sendPush.mock.calls;
  expect(pushes.map(([token]) => token).sort()).toEqual(expectedPushTokens);
  for (const [, , , data] of pushes) expect(data).toMatchObject({ type: NOTIFICATION_TYPES.ROUND_POSTPONED });
}

async function expectNothingChanged(otherAudit = []) {
  expect(await matchDates()).toEqual(ORIGINAL_DATES);
  // Only the unrelated lifecycle entry (when the test itself ran a deletion request) may exist.
  expect(await auditActions(), "no POSTPONE_ROUND audit entry may be written on rejection").toEqual(otherAudit);
  await expectNoNotificationEffects();
}

// Positive control for a refusal test, run against the SAME database state: after the refusal has been shown to leave
// every effect untouched, an authorised and active super administrator (never the account under test) postpones the
// round, and both reachable captains ARE notified by inbox, email and (for the captain with a token) push. Without this
// a "nothing was sent" assertion could pass merely because this fixture is unable to send anything.
async function expectControlDelivery() {
  mail.sendEmail.mockClear();
  mail.sendPush.mockClear();
  stale.user = IDENTITY.sup();
  const response = await postponeRound(request());
  expect(response.status, "positive control: an authorised administrator must be able to postpone this league").toBe(200);
  expect(await response.json()).toMatchObject({ success: true, matchesUpdated: 2, sent: 2, total: 2, errors: [] });
  expect(await matchDates()).toEqual(POSTPONED_DATES);
  await expectNotificationEffects(["cap", "cap2"]);
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
    // Positive control for the notification assertions below: a successful postponement DOES reach both captains,
    // so the "nothing was sent" checks on rejected requests are measured against a fixture that can notify.
    expect(await response.json()).toMatchObject({ success: true, matchesUpdated: 2, sent: 2, total: 2, errors: [] });
    await expectNotificationEffects(["cap", "cap2"]);
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
    await expectNotificationEffects(["cap", "cap2"]);
  });
});

describe("notification effects separate a missing recipient from a suppressed notification", () => {
  const deactivate = (key) => pool.query(
    `UPDATE auth_users SET account_status = 'pending_deletion', deletion_request_id = gen_random_uuid(),
       deletion_requested_at = NOW(), sessions_valid_after = NOW() WHERE id = $1`,
    [ID[key]],
  );

  it("a captain whose account is no longer active is skipped while the other captain is still notified", async () => {
    await deactivate("cap2");
    expect(await eligibleRecipients()).toEqual([ID.cap]);
    stale.user = IDENTITY.va();
    const response = await postponeRound(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, sent: 1, total: 1, errors: [] });
    await expectNotificationEffects(["cap"]);
  });

  it("with no reachable captain the postponement still succeeds and notifies nobody - a missing recipient, not a refusal", async () => {
    await deactivate("cap");
    await deactivate("cap2");
    expect(await eligibleRecipients()).toEqual([]);
    stale.user = IDENTITY.va();
    const response = await postponeRound(request());
    // Unlike a refusal, the dates DID move and the action IS audited; only the delivery is empty.
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, matchesUpdated: 2, sent: 0, total: 0, errors: [] });
    expect(await matchDates()).toEqual(POSTPONED_DATES);
    expect(await auditActions()).toEqual(["POSTPONE_ROUND"]);
    expect(await notificationRows()).toEqual([]);
    expect(mail.sendEmail).not.toHaveBeenCalled();
    expect(mail.sendPush).not.toHaveBeenCalled();
  });

  it("a refused postponement leaves reachable captains un-notified, which the same fixture proves it could have reached", async () => {
    stale.user = IDENTITY.va();
    await pool.query(TRANSITION.pending_deletion, [ID.va]);
    const response = await postponeRound(request());
    expect(response.status).toBe(403);
    await expectNothingChanged();
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

// A refusal is only worth asserting if the fixture could have delivered. Every test below first proves (inside
// expectNothingChanged) that both captains are reachable, then shows the refusal left dates, audit, inbox, email and push
// untouched, and finally runs a positive control on the same database state (expectControlDelivery).
describe("an active administrator who is not entitled to this league cannot cause any notification", () => {
  beforeEach(seedScopeFixtures);

  const OUT_OF_SCOPE = [
    ["a venue administrator of another venue in the same organisation", { id: ID.vb, role: "venue_admin", venue_id: ID.venueB, organization_id: ID.org }],
    ["an organisation administrator of a different organisation", { id: ID.ob, role: "org_admin", venue_id: null, organization_id: ID.orgB }],
    ["a venue administrator with no venue assigned", { id: ID.vn, role: "venue_admin", venue_id: null, organization_id: ID.org }],
  ];

  it.each(OUT_OF_SCOPE)("%s is refused (403): dates, audit, inbox, email and push are all untouched", async (_who, identity) => {
    stale.user = identity;
    const response = await postponeRound(request());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Forbidden");
    await expectNothingChanged();
    await expectControlDelivery();
  });

  it("an account whose database role is not an administrator role is refused even though the resolved identity claimed one", async () => {
    // The identity carries an administrator role, but the account row says captain (a stale or forged claim).
    stale.user = { id: ID.cap, role: "venue_admin", venue_id: ID.venue, organization_id: ID.org };
    const response = await postponeRound(request());
    expect(response.status).toBe(403);
    await expectNothingChanged();
    await expectControlDelivery();
  });

  it("an administrator demoted to captain after the identity was resolved is refused", async () => {
    stale.user = IDENTITY.va();
    await pool.query("UPDATE auth_users SET role = 'captain' WHERE id = $1", [ID.va]);
    const response = await postponeRound(request());
    expect(response.status).toBe(403);
    await expectNothingChanged();
    await expectControlDelivery();
  });

  it("a captain is refused at identity resolution (401) through the real bearer-session path", async () => {
    const token = await mintBearer(ID.cap);
    const response = await postponeRound(new Request("https://postpone.test/api/leagues/postpone-round", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ league_id: ID.league, round_number: 1 }),
    }));
    expect(response.status).toBe(401);
    await expectNothingChanged();
    await expectControlDelivery();
  });

  it("an administrator whose venue is changed while the postponement is queued behind a fixture lock is refused by the in-transaction check", async () => {
    // The identity is resolved and the early check passes while the administrator still belongs to this venue. The
    // postponement then waits for a fixture lock; the administrator is moved to another venue (status and role are
    // unchanged) and the lock is released. Only the in-transaction re-check can refuse the request.
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
      await pool.query("UPDATE auth_users SET venue_id = $2 WHERE id = $1", [ID.va, ID.venueB]);
      await holder.query("COMMIT");
    } finally {
      await holder.query("ROLLBACK").catch(() => {});
      holder.release();
    }
    const response = await outcome;
    expect(response.status).toBe(403);
    await expectNothingChanged();
    await expectControlDelivery();
  }, 20_000);
});

// Completion de-identifies the account row (reserved e-mail, no credentials) and clears the push token. The fixtures
// below are deliberately STRICTER than production: the captain keeps a push token and an e-mail address, so a recipient
// query that wrongly included the account would reach it by inbox, email and push alike. pending_deletion and
// deidentified are separate cases because a recipient filter can exclude one status and still include the other.
describe("a captain who is no longer active is never notified, whichever way the account left the active state", () => {
  const TOKEN = "ExpoPushToken[inactive-captain]";

  it.each(["pending_deletion", "deidentified"])("a %s captain with a push token is skipped; the other captain is notified", async (status) => {
    await pool.query("UPDATE auth_users SET push_token = $2 WHERE id = $1", [ID.cap2, TOKEN]);
    await pool.query(TRANSITION[status], [ID.cap2]);
    expect((await pool.query("SELECT account_status FROM auth_users WHERE id = $1", [ID.cap2])).rows[0].account_status).toBe(status);
    expect(await eligibleRecipients()).toEqual([ID.cap]);
    stale.user = IDENTITY.va();
    const response = await postponeRound(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, matchesUpdated: 2, sent: 1, total: 1, errors: [] });
    await expectNotificationEffects(["cap"]);
    // Named negative checks for the inactive captain, independent of the exact-effects assertion above.
    expect((await notificationRows()).some((row) => row.user_id === ID.cap2)).toBe(false);
    expect(mail.sendEmail.mock.calls.some(([message]) => /@account\.invalid$/i.test(message.to) || message.to === CAPTAINS.cap2.email)).toBe(false);
    expect(mail.sendPush.mock.calls.some(([token]) => token === TOKEN)).toBe(false);
  });

  it("with every captain de-identified the postponement still succeeds and nobody is notified", async () => {
    await pool.query("UPDATE auth_users SET push_token = $2 WHERE id = $1", [ID.cap, TOKEN]);
    await pool.query(TRANSITION.deidentified, [ID.cap]);
    await pool.query(TRANSITION.deidentified, [ID.cap2]);
    expect(await eligibleRecipients()).toEqual([]);
    stale.user = IDENTITY.va();
    const response = await postponeRound(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, matchesUpdated: 2, sent: 0, total: 0, errors: [] });
    expect(await matchDates()).toEqual(POSTPONED_DATES);
    expect(await auditActions()).toEqual(["POSTPONE_ROUND"]);
    expect(await notificationRows()).toEqual([]);
    expect(mail.sendEmail).not.toHaveBeenCalled();
    expect(mail.sendPush).not.toHaveBeenCalled();
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
    // The legitimate postponement completed in full, notifications included.
    await expectNotificationEffects(["cap", "cap2"]);
  });
});
