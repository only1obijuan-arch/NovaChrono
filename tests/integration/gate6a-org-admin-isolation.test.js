import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";

// Organisation-administrator tenant isolation of the pending-account list (Gate 6A.2
// acceptance cleanup, finding F1). Real PostgreSQL. The service is called directly AND both
// HTTP routes are driven with real mobile-bearer sessions (no auth mocking), so the check
// covers what an administrator actually receives.
//
// The deliberate shape of the fixtures: the pending accounts have NO venue or organisation
// of their own. The only thing that can place them in an administrator's list is a team
// they captain or a fixture they referee inside that administrator's scope - which is
// exactly the predicate that must not widen.
vi.mock("@/app/api/utils/send-email", () => ({ sendEmail: vi.fn(async () => ({ id: "test-mail" })) }));

import { pool, withTransaction } from "@/app/api/utils/db";
import {
  completeAccountDeidentification,
  getLifecycleBlockers,
  listPendingLifecycleRequests,
  resolveTeamResponsibility,
} from "@/app/api/utils/account-lifecycle";
import { GET as adminList, PATCH as adminPatch } from "@/app/api/admin/account-lifecycle/route";
import { GET as orgList } from "@/app/api/org-admin/account-lifecycle/route";

const id = (kind, n) => `${kind}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = {
  orgX: id("d1", 1), orgY: id("d1", 2),
  venX1: id("d2", 1), venX2: id("d2", 2), venY1: id("d2", 3),
  sup: id("d3", 1), oaX: id("d3", 2), oaY: id("d3", 3), oaNull: id("d3", 4), vaX1: id("d3", 5), vaY1: id("d3", 6), vaNull: id("d3", 7),
  capX: id("d3", 8), capY: id("d3", 9), capMulti: id("d3", 10), refX: id("d3", 11), refY: id("d3", 12),
  lgX1: id("d4", 1), lgX2: id("d4", 2), lgY1: id("d4", 3),
  tX1: id("d6", 1), tX2: id("d6", 2), tY1: id("d6", 3), tY1b: id("d6", 4),
  mX1: id("d7", 1), mY1: id("d7", 2),
};
const NAME = {
  capX: "Xavier Pending Captain", capY: "Yvonne Pending Captain", capMulti: "Multi Pending Captain",
  refX: "Xander Pending Referee", refY: "Yusuf Pending Referee",
  tX1: "Xray One Team", tX2: "Xray Two Team", tY1: "Yankee Private Team", tY1b: "Yankee Second Team",
};
// Distinct, easily searched request timestamps.
const REQUESTED_AT = {
  capX: "2031-03-01T10:00:01.000Z", capY: "2031-03-02T11:11:11.111Z", capMulti: "2031-03-03T12:00:03.000Z",
  refX: "2031-03-04T13:00:04.000Z", refY: "2031-03-05T14:14:14.141Z",
};
const REASON = "Organisation isolation regression";
const flags = {
  mutations: process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED,
  completion: process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED,
};

const reset = () => pool.query(`TRUNCATE TABLE
  api_rate_limits, audit_logs, notifications, availability_responses, match_events, matches, standings,
  players, teams, league_slots, leagues, invite_tokens, mobile_sessions, password_reset_tokens,
  auth_accounts, auth_verification_token, auth_users, venues, organizations RESTART IDENTITY CASCADE`);

async function seed() {
  await reset();
  await pool.query("INSERT INTO organizations (id, name) VALUES ($1,'Org X'),($2,'Org Y')", [ID.orgX, ID.orgY]);
  await pool.query(
    "INSERT INTO venues (id, organization_id, name) VALUES ($1,$4,'Venue X1'),($2,$4,'Venue X2'),($3,$5,'Venue Y1')",
    [ID.venX1, ID.venX2, ID.venY1, ID.orgX, ID.orgY],
  );
  let field = 1;
  for (const [key, role, venue, org] of [
    ["sup", "super_admin", null, null],
    ["oaX", "org_admin", null, ID.orgX], ["oaY", "org_admin", null, ID.orgY], ["oaNull", "org_admin", null, null],
    ["vaX1", "venue_admin", ID.venX1, ID.orgX], ["vaY1", "venue_admin", ID.venY1, ID.orgY], ["vaNull", "venue_admin", null, null],
    // Pending accounts with no venue or organisation of their own.
    ["capX", "captain", null, null], ["capY", "captain", null, null], ["capMulti", "captain", null, null],
    ["refX", "referee", null, null], ["refY", "referee", null, null],
  ]) {
    const name = NAME[key] ?? `Person ${key}`;
    await pool.query(
      `INSERT INTO auth_users (id, name, email, role, venue_id, organization_id, field_number, "emailVerified")
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [ID[key], name, `${key}@isolation.example.test`, role, venue, org, role === "referee" ? field++ : null],
    );
  }
  let slot = 1;
  for (const [league, venue, code] of [[ID.lgX1, ID.venX1, "ISO00001"], [ID.lgX2, ID.venX2, "ISO00002"], [ID.lgY1, ID.venY1, "ISO00003"]]) {
    await pool.query(
      `INSERT INTO leagues (id, venue_id, name, day_of_week, match_format, match_duration_minutes,
                            fields_count, time_slots, max_teams, join_code, status)
       VALUES ($1,$2,'League',2,'5v5',40,2,'["18:00"]',4,$3,'active')`,
      [league, venue, code],
    );
    await pool.query(
      "INSERT INTO league_slots (id, league_id, slot_number) VALUES ($1,$3,1),($2,$3,2),($4,$3,3),($5,$3,4)",
      [id("d5", slot++), id("d5", slot++), league, id("d5", slot++), id("d5", slot++)],
    );
  }
  const slotOf = async (league, n) => (await pool.query(
    "SELECT id FROM league_slots WHERE league_id = $1 AND slot_number = $2", [league, n],
  )).rows[0].id;
  const team = async (teamId, league, n, name, captain) => pool.query(
    "INSERT INTO teams (id, league_id, slot_id, name, status, captain_user_id) VALUES ($1,$2,$3,$4,'active',$5)",
    [teamId, league, await slotOf(league, n), name, captain],
  );
  await team(ID.tX1, ID.lgX1, 1, NAME.tX1, ID.capX);
  await team(ID.tX2, ID.lgX2, 1, NAME.tX2, ID.capMulti);
  await team(ID.tY1, ID.lgY1, 1, NAME.tY1, ID.capY);
  await team(ID.tY1b, ID.lgY1, 2, NAME.tY1b, ID.capMulti);
  const fixture = async (matchId, league, home, away, referee, round) => pool.query(
    `INSERT INTO matches (id, league_id, round_number, match_date, time_slot, field_number,
                          home_slot_id, away_slot_id, home_team_id, away_team_id, status, referee_id)
     SELECT $1::uuid, $2::uuid, $3::int, '2031-01-07', '18:00', 1, h.slot_id, a.slot_id, h.id, a.id, 'scheduled', $6::uuid
     FROM teams h, teams a WHERE h.id = $4::uuid AND a.id = $5::uuid`,
    [matchId, league, round, home, away, referee],
  );
  // Fixtures need two teams in the league; a filler opponent is enough.
  await pool.query("INSERT INTO teams (id, league_id, slot_id, name, status) VALUES ($1,$2,$3,'Filler X','active')", [id("d6", 8), ID.lgX1, await slotOf(ID.lgX1, 2)]);
  await pool.query("INSERT INTO teams (id, league_id, slot_id, name, status) VALUES ($1,$2,$3,'Filler Y','active')", [id("d6", 9), ID.lgY1, await slotOf(ID.lgY1, 3)]);
  await fixture(ID.mX1, ID.lgX1, ID.tX1, id("d6", 8), ID.refX, 1);
  await fixture(ID.mY1, ID.lgY1, ID.tY1, id("d6", 9), ID.refY, 1);
  for (const key of ["capX", "capY", "capMulti", "refX", "refY"]) {
    await pool.query(
      `UPDATE auth_users SET account_status = 'pending_deletion', deletion_request_id = gen_random_uuid(),
         deletion_requested_at = $2, sessions_valid_after = NOW() WHERE id = $1`,
      [ID[key], REQUESTED_AT[key]],
    );
  }
}

async function bearer(userId) {
  const jti = randomUUID();
  await pool.query("INSERT INTO mobile_sessions (jti, user_id, expires_at) VALUES ($1,$2,NOW() + interval '1 day')", [jti, userId]);
  return new SignJWT({ id: userId }).setProtectedHeader({ alg: "HS256" }).setJti(jti)
    .setIssuedAt().setExpirationTime("1d").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
}
const httpGet = async (route, actorKey) => {
  const response = await route(new Request("https://isolation.test/api/lifecycle", {
    headers: { Authorization: `Bearer ${await bearer(ID[actorKey])}` },
  }));
  return { status: response.status, text: await response.text() };
};
const httpPatch = async (route, actorKey, body) => {
  const response = await route(new Request("https://isolation.test/api/lifecycle", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${await bearer(ID[actorKey])}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: response.status, text: await response.text() };
};

const service = (actorKey) => listPendingLifecycleRequests({ actorId: ID[actorKey] });
const listed = (requests) => requests.map((request) => request.id).sort();
const want = (...keys) => keys.map((key) => ID[key]).sort();
const byUser = (requests, key) => requests.find((request) => request.id === ID[key]);
const teamNames = (request) => (request?.blockers ?? []).filter((blocker) => blocker.type === "active_teams")
  .flatMap((blocker) => blocker.records.map((record) => record.name)).sort();
const fixtureIds = (request) => (request?.blockers ?? []).filter((blocker) => blocker.type === "future_referee_fixtures")
  .flatMap((blocker) => blocker.records.map((record) => record.id)).sort();

// Everything that identifies the OTHER organisation's accounts, teams, fixtures, venues,
// organisation or request, and that must therefore never appear in a response body.
const foreignTo = {
  orgX: [NAME.capY, NAME.refY, NAME.tY1, NAME.tY1b, ID.capY, ID.refY, ID.tY1, ID.tY1b, ID.mY1, ID.lgY1, ID.venY1, ID.orgY,
    REQUESTED_AT.capY, REQUESTED_AT.refY, "Venue Y1", "Org Y"],
  orgY: [NAME.capX, NAME.refX, NAME.tX1, NAME.tX2, ID.capX, ID.refX, ID.tX1, ID.tX2, ID.mX1, ID.lgX1, ID.lgX2, ID.venX1, ID.venX2, ID.orgX,
    REQUESTED_AT.capX, REQUESTED_AT.refX, "Venue X1", "Venue X2", "Org X"],
};
const expectNoneOf = (text, forbidden, label) => {
  for (const value of forbidden) expect(text, `${label}: leaked ${value}`).not.toContain(value);
  expect(text, `${label}: organization_id`).not.toContain("organization_id");
};

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

describe("organisation administrator: which pending accounts are listed (service)", () => {
  it("lists exactly the pending accounts with a team or fixture in their own organisation", async () => {
    expect(listed(await service("oaX"))).toEqual(want("capX", "capMulti", "refX"));
    expect(listed(await service("oaY"))).toEqual(want("capY", "capMulti", "refY"));
  });

  it("never lists another organisation's pending captain or referee", async () => {
    const orgX = await service("oaX");
    expect(byUser(orgX, "capY")).toBeUndefined();
    expect(byUser(orgX, "refY")).toBeUndefined();
    const orgY = await service("oaY");
    expect(byUser(orgY, "capX")).toBeUndefined();
    expect(byUser(orgY, "refX")).toBeUndefined();
  });

  it("shows a captain of both organisations only the teams of the viewer's own organisation", async () => {
    expect(teamNames(byUser(await service("oaX"), "capMulti"))).toEqual([NAME.tX2]);
    expect(teamNames(byUser(await service("oaY"), "capMulti"))).toEqual([NAME.tY1b]);
    expect(teamNames(byUser(await service("sup"), "capMulti"))).toEqual([NAME.tX2, NAME.tY1b].sort());
  });

  it("shows only the viewer's own organisation's fixtures", async () => {
    expect(fixtureIds(byUser(await service("oaX"), "refX"))).toEqual([ID.mX1]);
    expect(fixtureIds(byUser(await service("oaY"), "refY"))).toEqual([ID.mY1]);
  });

  it("lists nothing for an organisation administrator who has no organisation", async () => {
    expect(await service("oaNull")).toEqual([]);
  });

  it("keeps platform-wide visibility for a super administrator", async () => {
    expect(listed(await service("sup"))).toEqual(want("capX", "capY", "capMulti", "refX", "refY"));
  });
});

describe("venue administrator: the same predicate at venue level (service)", () => {
  it("lists only accounts with a team or fixture in the administrator's own venue", async () => {
    expect(listed(await service("vaX1"))).toEqual(want("capX", "refX"));
    expect(listed(await service("vaY1"))).toEqual(want("capY", "capMulti", "refY"));
    expect(await service("vaNull")).toEqual([]);
  });
});

describe("organisation administrator: what the HTTP API returns", () => {
  it.each([["oaX", "orgX"], ["oaY", "orgY"]])("%s receives no identifier of the other organisation", async (actor, tenant) => {
    const response = await httpGet(orgList, actor);
    expect(response.status).toBe(200);
    expectNoneOf(response.text, foreignTo[tenant], `${actor} org route`);
    const requests = JSON.parse(response.text).requests;
    expect(requests.map((request) => request.id).sort()).toEqual(
      tenant === "orgX" ? want("capX", "capMulti", "refX") : want("capY", "capMulti", "refY"),
    );
    // Positive controls: the viewer's own tenant's names and request timestamps ARE present in this
    // exact format, so the absence of the other tenant's above is a real result and not a formatting accident.
    const own = tenant === "orgX" ? ["capX", "refX", "capMulti"] : ["capY", "refY", "capMulti"];
    for (const key of own) {
      expect(response.text, `${actor}: ${key} name`).toContain(NAME[key]);
      expect(response.text, `${actor}: ${key} request time`).toContain(REQUESTED_AT[key]);
    }
    // Name, role and request timestamp of the listed accounts are the viewer's own tenant's.
    expect(requests.filter((request) => request.role === "referee")).toHaveLength(1);
    expect(requests.filter((request) => request.role === "captain")).toHaveLength(2);
    for (const request of requests) {
      expect(Object.keys(request).sort()).toEqual(["blockers", "id", "name", "requestId", "requestedAt", "role"]);
    }
  });

  it("the venue route serves a venue administrator the same scoped projection and refuses an organisation administrator", async () => {
    const venueResponse = await httpGet(adminList, "vaX1");
    expect(venueResponse.status).toBe(200);
    expectNoneOf(venueResponse.text, [...foreignTo.orgX, NAME.tX2, ID.tX2, ID.lgX2, ID.venX2, ID.capMulti, NAME.capMulti], "vaX1 venue route");
    expect((await httpGet(adminList, "oaX")).status).toBe(403);
  });

  it("returns an empty list, not another tenant's, to an organisation administrator with no organisation", async () => {
    const response = await httpGet(orgList, "oaNull");
    expect(response.status).toBe(200);
    expect(JSON.parse(response.text).requests).toEqual([]);
  });
});

describe("the authoritative blocker set is never filtered", () => {
  it("the raw service result carries every record, including the other organisation's", async () => {
    const row = (await pool.query("SELECT id, role, venue_id, organization_id FROM auth_users WHERE id = $1", [ID.capMulti])).rows[0];
    const blockers = await withTransaction((tx) => getLifecycleBlockers(tx, row));
    const teams = blockers.find((blocker) => blocker.type === "active_teams").records;
    expect(teams.map((record) => record.name).sort()).toEqual([NAME.tX2, NAME.tY1b].sort());
    expect(teams.map((record) => record.organization_id).sort()).toEqual([ID.orgX, ID.orgY].sort());
  });

  it("an organisation administrator resolving what they can see still leaves completion blocked by the rest", async () => {
    await resolveTeamResponsibility({ actorId: ID.oaX, targetUserId: ID.capMulti, teamId: ID.tX2, reason: REASON });
    await expect(resolveTeamResponsibility({ actorId: ID.oaX, targetUserId: ID.capMulti, teamId: ID.tY1b, reason: REASON }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    // Nothing is left in the organisation administrator's scope, so the request drops out of their
    // list entirely - while the platform-wide view still shows what remains.
    expect(byUser(await service("oaX"), "capMulti")).toBeUndefined();
    expect(teamNames(byUser(await service("sup"), "capMulti"))).toEqual([NAME.tY1b]);

    await expect(completeAccountDeidentification({ actorId: ID.oaX, targetUserId: ID.capMulti, reason: REASON }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    const blocked = await completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.capMulti, reason: REASON }).catch((error) => error);
    expect(blocked).toMatchObject({ code: "LIFECYCLE_BLOCKED", status: 409 });
    expect(blocked.details.flatMap((blocker) => blocker.records.map((record) => record.name))).toEqual([NAME.tY1b]);
    expect((await pool.query("SELECT account_status FROM auth_users WHERE id = $1", [ID.capMulti])).rows[0].account_status)
      .toBe("pending_deletion");

    await resolveTeamResponsibility({ actorId: ID.oaY, targetUserId: ID.capMulti, teamId: ID.tY1b, reason: REASON });
    await expect(completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.capMulti, reason: REASON }))
      .resolves.toMatchObject({ status: "deidentified" });
  });

  it("over HTTP, a hidden record keeps completion blocked and an organisation administrator cannot complete", async () => {
    expect((await httpPatch(adminPatch, "oaX", { action: "complete", userId: ID.capY, reason: REASON })).status).toBe(403);
    const blocked = await httpPatch(adminPatch, "sup", { action: "complete", userId: ID.capY, reason: REASON });
    expect(blocked.status).toBe(409);
    const body = JSON.parse(blocked.text);
    expect(body.code).toBe("LIFECYCLE_BLOCKED");
    expect(body.details.flatMap((blocker) => blocker.records.map((record) => record.name))).toEqual([NAME.tY1]);
    expect(blocked.text).not.toContain("organization_id");
  });
});
