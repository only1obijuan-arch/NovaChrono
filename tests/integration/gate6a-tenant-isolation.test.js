import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Tenant isolation of the pending-account list (Gate 6A.2 hardening). Real
// PostgreSQL, real routes and services; only the Auth.js session lookup is
// replaced so a test can choose who is calling.
const authState = vi.hoisted(() => ({ actorId: null }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => authState.actorId ? { user: { id: authState.actorId } } : null),
}));
vi.mock("@/app/api/utils/send-email", () => ({ sendEmail: vi.fn(async () => ({ id: "test-mail" })) }));

import { hash } from "argon2";
import { pool } from "@/app/api/utils/db";
import {
  completeAccountDeidentification,
  listPendingLifecycleRequests,
  requestAccountDeletion,
  resolveTeamResponsibility,
} from "@/app/api/utils/account-lifecycle";
import { GET as adminList } from "@/app/api/admin/account-lifecycle/route";
import { GET as orgList } from "@/app/api/org-admin/account-lifecycle/route";

const id = (kind, n) => `${kind}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = {
  orgA: id("a1", 1), orgB: id("a1", 2),
  venA1: id("a2", 1), venA2: id("a2", 2), venB1: id("a2", 3),
  sup: id("a3", 1), va1: id("a3", 2), va2: id("a3", 3), vb1: id("a3", 4), oa: id("a3", 5), ob: id("a3", 6),
  cap: id("a3", 7), ref: id("a3", 8), ref2: id("a3", 9),
  lgA1: id("a4", 1), lgA2: id("a4", 2), lgB1: id("a4", 3),
  tA1: id("a6", 1), tA1f: id("a6", 2), tA2: id("a6", 3), tA2f: id("a6", 4), tB1: id("a6", 5), tB1f: id("a6", 6),
  mA1: id("a7", 1), mB1: id("a7", 2), mB1b: id("a7", 3),
};
const NAMES = { tA1: "Alpha One Team", tA2: "Alpha Two Team", tB1: "Bravo Secret Team" };
const PASSWORD = "TenantIsolationPass!1";
const flags = {
  mutations: process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED,
  completion: process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED,
};
let passwordHash;

const reset = () => pool.query(`TRUNCATE TABLE
  auth_rate_limits, api_rate_limits, audit_logs, notifications, availability_responses, match_events,
  matches, standings, players, teams, league_slots, leagues, invite_tokens,
  mobile_sessions, password_reset_tokens, auth_accounts,
  auth_verification_token, auth_users, venues, organizations RESTART IDENTITY CASCADE`);

async function seed() {
  await reset();
  await pool.query("INSERT INTO organizations (id, name) VALUES ($1,'Org A'),($2,'Org B')", [ID.orgA, ID.orgB]);
  await pool.query(
    "INSERT INTO venues (id, organization_id, name) VALUES ($1,$4,'Venue A1'),($2,$4,'Venue A2'),($3,$5,'Venue B1')",
    [ID.venA1, ID.venA2, ID.venB1, ID.orgA, ID.orgB],
  );
  const users = [
    ["sup", "super_admin", null, null], ["va1", "venue_admin", ID.venA1, ID.orgA], ["va2", "venue_admin", ID.venA2, ID.orgA],
    ["vb1", "venue_admin", ID.venB1, ID.orgB], ["oa", "org_admin", null, ID.orgA], ["ob", "org_admin", null, ID.orgB],
    ["cap", "captain", ID.venA1, ID.orgA], ["ref", "referee", ID.venA1, ID.orgA], ["ref2", "referee", ID.venA1, ID.orgA],
  ];
  let field = 1;
  for (const [key, role, venue, org] of users) {
    await pool.query(
      `INSERT INTO auth_users (id, name, email, role, venue_id, organization_id, field_number, "emailVerified")
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [ID[key], `Person ${key}`, `${key}@tenant.example.test`, role, venue, org, role === "referee" ? field++ : null],
    );
  }
  await pool.query(
    `INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
     VALUES ($1,'credentials','credentials',($1::uuid)::text,$2)`,
    [ID.cap, passwordHash],
  );
  const leagues = [
    [ID.lgA1, ID.venA1, "AAAA0001", ID.tA1, ID.tA1f, NAMES.tA1], [ID.lgA2, ID.venA2, "AAAA0002", ID.tA2, ID.tA2f, NAMES.tA2],
    [ID.lgB1, ID.venB1, "BBBB0001", ID.tB1, ID.tB1f, NAMES.tB1],
  ];
  let slot = 1;
  for (const [league, venue, code, team, filler, teamName] of leagues) {
    await pool.query(
      `INSERT INTO leagues (id, venue_id, name, day_of_week, match_format, match_duration_minutes,
                            fields_count, time_slots, max_teams, join_code, status)
       VALUES ($1,$2,'League',2,'5v5',40,2,'["18:00"]',2,$3,'active')`,
      [league, venue, code],
    );
    const s1 = id("a5", slot++); const s2 = id("a5", slot++);
    await pool.query("INSERT INTO league_slots (id, league_id, slot_number) VALUES ($1,$3,1),($2,$3,2)", [s1, s2, league]);
    await pool.query(
      `INSERT INTO teams (id, league_id, slot_id, name, status, captain_user_id)
       VALUES ($1,$3,$4,$5,'active',$6),($2,$3,$7,'Filler','active',NULL)`,
      [team, filler, league, s1, teamName, ID.cap, s2],
    );
  }
  const match = (matchId, leagueId, teamA, teamB, referee, round, field) => pool.query(
    `INSERT INTO matches (id, league_id, round_number, match_date, time_slot, field_number,
                          home_slot_id, away_slot_id, home_team_id, away_team_id, status, referee_id)
     SELECT $1::uuid, $2::uuid, $3::int, '2031-01-07', '18:00', $4::int, h.slot_id, a.slot_id, h.id, a.id, 'scheduled', $7::uuid
     FROM teams h, teams a WHERE h.id = $5::uuid AND a.id = $6::uuid`,
    [matchId, leagueId, round, field, teamA, teamB, referee],
  );
  await match(ID.mA1, ID.lgA1, ID.tA1, ID.tA1f, ID.ref, 2, 1);
  await match(ID.mB1, ID.lgB1, ID.tB1, ID.tB1f, ID.ref, 2, 1);
  await match(ID.mB1b, ID.lgB1, ID.tB1, ID.tB1f, ID.ref2, 3, 2);
}

const markPending = (userId) => pool.query(
  `UPDATE auth_users
   SET account_status = 'pending_deletion', deletion_request_id = gen_random_uuid(),
       deletion_requested_at = NOW(), sessions_valid_after = NOW()
   WHERE id = $1`,
  [userId],
);
const as = (actorKey) => { authState.actorId = ID[actorKey]; };
const list = (actorKey) => listPendingLifecycleRequests({ actorId: ID[actorKey] });
const byUser = (requests, key) => requests.find((request) => request.id === ID[key]);
const recordIds = (request) => (request?.blockers ?? []).flatMap((blocker) => blocker.records.map((record) => record.id)).sort();
const teamNames = (request) => (request?.blockers ?? [])
  .filter((blocker) => blocker.type === "active_teams")
  .flatMap((blocker) => blocker.records.map((record) => record.name)).sort();

beforeAll(async () => { passwordHash = await hash(PASSWORD); });
beforeEach(async () => {
  process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED = "true";
  process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED = "true";
  authState.actorId = null;
  await seed();
  for (const key of ["cap", "ref", "ref2"]) await markPending(ID[key]);
});
afterAll(async () => {
  await reset();
  await pool.end();
  for (const [name, value] of [["ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED", flags.mutations], ["ACCOUNT_LIFECYCLE_COMPLETION_ENABLED", flags.completion]]) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

describe("pending-list tenant isolation", () => {
  it("shows a venue administrator only blockers inside their own venue", async () => {
    const venueA1 = await list("va1");
    expect(teamNames(byUser(venueA1, "cap"))).toEqual([NAMES.tA1]);
    expect(recordIds(byUser(venueA1, "ref"))).toEqual([ID.mA1]);
    // Listed because the referee belongs to the venue, but every fixture is elsewhere.
    expect(byUser(venueA1, "ref2")).toBeDefined();
    expect(byUser(venueA1, "ref2").blockers).toEqual([]);

    const venueB1 = await list("vb1");
    expect(teamNames(byUser(venueB1, "cap"))).toEqual([NAMES.tB1]);
    expect(recordIds(byUser(venueB1, "ref"))).toEqual([ID.mB1]);
    expect(recordIds(byUser(venueB1, "ref2"))).toEqual([ID.mB1b]);

    const venueA2 = await list("va2");
    expect(teamNames(byUser(venueA2, "cap"))).toEqual([NAMES.tA2]);
    expect(byUser(venueA2, "ref")).toBeUndefined();
    expect(byUser(venueA2, "ref2")).toBeUndefined();
  });

  it("never leaks another tenant's team, fixture, venue or organisation identifiers", async () => {
    const serialised = JSON.stringify(await list("va1"));
    for (const forbidden of [
      NAMES.tA2, NAMES.tB1, ID.tA2, ID.tB1, ID.mB1, ID.mB1b, ID.venA2, ID.venB1, ID.orgA, ID.orgB, ID.lgA2, ID.lgB1,
    ]) expect(serialised).not.toContain(forbidden);
    expect(serialised).not.toContain("organization_id");
    expect(serialised).toContain(NAMES.tA1);
    expect(serialised).toContain(ID.venA1);
  });

  it("limits an organisation administrator to venues of their own organisation", async () => {
    const orgA = await list("oa");
    expect(teamNames(byUser(orgA, "cap"))).toEqual([NAMES.tA1, NAMES.tA2].sort());
    expect(recordIds(byUser(orgA, "ref"))).toEqual([ID.mA1]);
    expect(byUser(orgA, "ref2").blockers).toEqual([]);
    const orgASerialised = JSON.stringify(orgA);
    for (const forbidden of [NAMES.tB1, ID.tB1, ID.mB1, ID.mB1b, ID.venB1, ID.orgB]) {
      expect(orgASerialised).not.toContain(forbidden);
    }

    const orgB = await list("ob");
    expect(teamNames(byUser(orgB, "cap"))).toEqual([NAMES.tB1]);
    expect(recordIds(byUser(orgB, "ref")).concat(recordIds(byUser(orgB, "ref2"))).sort())
      .toEqual([ID.mB1, ID.mB1b].sort());
    const orgBSerialised = JSON.stringify(orgB);
    for (const forbidden of [NAMES.tA1, NAMES.tA2, ID.tA1, ID.tA2, ID.mA1, ID.venA1, ID.venA2, ID.orgA]) {
      expect(orgBSerialised).not.toContain(forbidden);
    }
  });

  it("keeps platform-wide visibility for a super administrator", async () => {
    const platform = await list("sup");
    expect(teamNames(byUser(platform, "cap"))).toEqual(Object.values(NAMES).sort());
    expect(recordIds(byUser(platform, "ref"))).toEqual([ID.mA1, ID.mB1].sort());
    expect(recordIds(byUser(platform, "ref2"))).toEqual([ID.mB1b]);
  });

  it("does not list a pending account to an administrator with no responsibility in their scope", async () => {
    await pool.query("UPDATE auth_users SET venue_id = $1, organization_id = $2 WHERE id = $3", [ID.venB1, ID.orgB, ID.ref2]);
    const venueA2 = await list("va2");
    expect(byUser(venueA2, "ref2")).toBeUndefined();
    expect(byUser(venueA2, "cap")).toBeDefined();

    // The same holds for organisations: ref2 now belongs to, and works only in, organisation B.
    expect(byUser(await list("oa"), "ref2")).toBeUndefined();
    expect(byUser(await list("va1"), "ref2")).toBeUndefined();
    expect(recordIds(byUser(await list("ob"), "ref2"))).toEqual([ID.mB1b]);
    expect(recordIds(byUser(await list("vb1"), "ref2"))).toEqual([ID.mB1b]);
  });

  it("serves the same scoped projection through both HTTP routes", async () => {
    as("va1");
    const venueResponse = await adminList(new Request("https://example.test/api/admin/account-lifecycle"));
    expect(venueResponse.status).toBe(200);
    const venueBody = await venueResponse.text();
    for (const forbidden of [NAMES.tA2, NAMES.tB1, ID.mB1, ID.venB1, ID.orgB, "organization_id"]) {
      expect(venueBody).not.toContain(forbidden);
    }
    expect(venueBody).toContain(NAMES.tA1);

    as("oa");
    const orgResponse = await orgList(new Request("https://example.test/api/org-admin/account-lifecycle"));
    expect(orgResponse.status).toBe(200);
    const orgBody = await orgResponse.text();
    for (const forbidden of [NAMES.tB1, ID.mB1, ID.venB1, ID.orgB, "organization_id"]) {
      expect(orgBody).not.toContain(forbidden);
    }
    expect(orgBody).toContain(NAMES.tA2);

    // The venue route is not an organisation administrator's door.
    as("ob");
    const wrongRoute = await adminList(new Request("https://example.test/api/admin/account-lifecycle"));
    expect(wrongRoute.status).toBe(403);
  });
});

describe("filtering the display never relaxes completion", () => {
  it("keeps completion blocked by responsibilities no scoped administrator can see", async () => {
    const act = (actorKey, teamKey) => resolveTeamResponsibility({
      actorId: ID[actorKey], targetUserId: ID.cap, teamId: ID[teamKey], successorUserId: null,
      reason: "Custody while succession is arranged",
    });
    await act("va1", "tA1");
    // The venue administrator cannot act on, or even see, the other venues.
    await expect(act("va1", "tB1")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(act("va1", "tA2")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await act("oa", "tA2");
    // Both administrators still see the request (the captain belongs to their scope) but
    // nothing left for them to act on.
    expect(byUser(await list("va1"), "cap").blockers).toEqual([]);
    expect(byUser(await list("oa"), "cap").blockers).toEqual([]);

    // Everything either administrator could see is resolved, yet the request is not complete.
    for (const actorKey of ["va1", "oa"]) {
      await expect(completeAccountDeidentification({
        actorId: ID[actorKey], targetUserId: ID.cap, reason: "Scoped administrators cannot complete",
      })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    }
    const blocked = await completeAccountDeidentification({
      actorId: ID.sup, targetUserId: ID.cap, reason: "Hidden responsibility must still block",
    }).catch((error) => error);
    expect(blocked).toMatchObject({ code: "LIFECYCLE_BLOCKED", status: 409 });
    expect(blocked.details.flatMap((blocker) => blocker.records.map((record) => record.name))).toEqual([NAMES.tB1]);
    expect((await pool.query("SELECT account_status FROM auth_users WHERE id = $1", [ID.cap])).rows[0].account_status)
      .toBe("pending_deletion");

    await act("vb1", "tB1");
    await expect(completeAccountDeidentification({
      actorId: ID.sup, targetUserId: ID.cap, reason: "Every responsibility is now resolved",
    })).resolves.toMatchObject({ status: "deidentified" });
  });

  it("does not read an empty displayed blocker list as 'nothing outstanding'", async () => {
    const shown = byUser(await list("va1"), "ref2");
    expect(shown.blockers).toEqual([]);
    const blocked = await completeAccountDeidentification({
      actorId: ID.sup, targetUserId: ID.ref2, reason: "Fixture at another venue still blocks",
    }).catch((error) => error);
    expect(blocked).toMatchObject({ code: "LIFECYCLE_BLOCKED", status: 409 });
    expect(blocked.details.flatMap((blocker) => blocker.records.map((record) => record.id))).toEqual([ID.mB1b]);
  });
});

describe("the account holder's own response", () => {
  it("returns the holder's complete whitelisted blocker set and nothing internal", async () => {
    await pool.query(`UPDATE auth_users SET account_status = 'active', deletion_request_id = NULL,
      deletion_requested_at = NULL WHERE id = $1`, [ID.cap]);
    const result = await requestAccountDeletion({ userId: ID.cap, password: PASSWORD });
    expect(result.status).toBe("pending_deletion");
    const teams = result.blockers.find((blocker) => blocker.type === "active_teams");
    expect(teams.records.map((record) => record.name).sort()).toEqual(Object.values(NAMES).sort());
    for (const record of teams.records) expect(Object.keys(record).sort()).toEqual(["id", "name", "venue_id"]);
    expect(JSON.stringify(result)).not.toContain("organization_id");

    const repeated = await requestAccountDeletion({ userId: ID.cap, password: PASSWORD });
    expect(repeated.requestId).toBe(result.requestId);
    expect(JSON.stringify(repeated)).not.toContain("organization_id");
  });
});
