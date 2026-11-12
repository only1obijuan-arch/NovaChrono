import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// What counts as an unresolved responsibility, and what does not (Gate 6A.2 acceptance
// cleanup, finding F4). Real PostgreSQL; the lifecycle SERVICES are called directly, so
// every rule has to hold at the service boundary and not merely in route validation.
// The coverage rules are pinned exactly as they behave today. Whether a super
// administrator should count as venue/organisation cover is an unresolved owner decision;
// the characterisation test below is there so that a change to it is deliberate.
vi.mock("@/app/api/utils/send-email", () => ({ sendEmail: vi.fn(async () => ({ id: "test-mail" })) }));

import { pool, withTransaction } from "@/app/api/utils/db";
import {
  completeAccountDeidentification,
  getLifecycleBlockers,
  resolveRefereeResponsibility,
  resolveTeamResponsibility,
} from "@/app/api/utils/account-lifecycle";

const id = (kind, n) => `${kind}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = {
  orgA: id("b1", 1), orgB: id("b1", 2), venA: id("b2", 1), venA2: id("b2", 2), venB: id("b2", 3),
  oaA1: id("b3", 1), oaA2: id("b3", 2), oaB: id("b3", 3), vaA: id("b3", 4), vaA2: id("b3", 5), sup: id("b3", 6),
  cap: id("b3", 7), capOld: id("b3", 8), ref: id("b3", 9),
  league: id("b4", 1), s1: id("b5", 1), s2: id("b5", 2), s3: id("b5", 3), s4: id("b5", 4),
  tLive: id("b6", 1), tOld: id("b6", 2), tFill: id("b6", 3), tOld2: id("b6", 4),
};
const m = (n) => id("b7", n);
const REASON = "Blocker rule regression check";
const flags = {
  mutations: process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED,
  completion: process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED,
};

const reset = () => pool.query(`TRUNCATE TABLE
  api_rate_limits, audit_logs, notifications, availability_responses, match_events, matches, standings,
  players, teams, league_slots, leagues, invite_tokens, mobile_sessions, password_reset_tokens,
  auth_accounts, auth_verification_token, auth_users, venues, organizations RESTART IDENTITY CASCADE`);

const TRANSITION = {
  pending_deletion: `UPDATE auth_users SET account_status = 'pending_deletion', deletion_request_id = gen_random_uuid(),
    deletion_requested_at = NOW(), sessions_valid_after = NOW() WHERE id = $1`,
  deidentified: `UPDATE auth_users SET account_status = 'deidentified', deletion_request_id = gen_random_uuid(),
    deletion_requested_at = NOW(), deidentified_at = NOW(), "emailVerified" = NULL,
    email = 'deidentified+' || replace(id::text, '-', '') || '@account.invalid' WHERE id = $1`,
};
let fieldNumber = 1;
async function add(key, role, { venue = null, org = null, status = "active" } = {}) {
  await pool.query(
    `INSERT INTO auth_users (id, name, email, role, venue_id, organization_id, field_number, "emailVerified")
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
    [ID[key], `Person ${key}`, `${key}@rules.example.test`, role, venue, org, role === "referee" ? fieldNumber++ : null],
  );
  if (status !== "active") await pool.query(TRANSITION[status], [ID[key]]);
}
const types = async (key) => {
  const row = (await pool.query("SELECT id, role, venue_id, organization_id FROM auth_users WHERE id = $1", [ID[key]])).rows[0];
  return (await withTransaction((tx) => getLifecycleBlockers(tx, row))).map((blocker) => blocker.type);
};

beforeEach(async () => {
  process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED = "true";
  process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED = "true";
  fieldNumber = 1;
  await reset();
  await pool.query("INSERT INTO organizations (id, name) VALUES ($1,'Org A'),($2,'Org B')", [ID.orgA, ID.orgB]);
  await pool.query(
    "INSERT INTO venues (id, organization_id, name) VALUES ($1,$4,'Venue A'),($2,$4,'Venue A2'),($3,$5,'Venue B')",
    [ID.venA, ID.venA2, ID.venB, ID.orgA, ID.orgB],
  );
});
afterAll(async () => {
  await reset();
  await pool.end();
  for (const [name, value] of [["ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED", flags.mutations], ["ACCOUNT_LIFECYCLE_COMPLETION_ENABLED", flags.completion]]) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

describe("organisation administrator coverage", () => {
  const target = async () => add("oaA1", "org_admin", { org: ID.orgA });

  it("blocks the last organisation administrator", async () => {
    await target();
    expect(await types("oaA1")).toEqual(["organization_admin_coverage"]);
  });

  it("is not covered by an administrator of a DIFFERENT organisation", async () => {
    await target();
    await add("oaB", "org_admin", { org: ID.orgB });
    expect(await types("oaA1")).toContain("organization_admin_coverage");
  });

  it.each(["pending_deletion", "deidentified"])("is not covered by a %s organisation administrator of the same organisation", async (status) => {
    await target();
    await add("oaA2", "org_admin", { org: ID.orgA, status });
    expect(await types("oaA1")).toContain("organization_admin_coverage");
  });

  it("is not covered by a venue administrator, however well scoped", async () => {
    await target();
    await add("vaA", "venue_admin", { venue: ID.venA, org: ID.orgA });
    expect(await types("oaA1")).toContain("organization_admin_coverage");
  });

  it("is covered by an active organisation administrator of the same organisation", async () => {
    await target();
    await add("oaA2", "org_admin", { org: ID.orgA });
    expect(await types("oaA1")).toEqual([]);
  });
});

describe("venue administrator coverage", () => {
  const target = async () => add("vaA", "venue_admin", { venue: ID.venA, org: ID.orgA });

  it("blocks the last venue administrator", async () => {
    await target();
    expect(await types("vaA")).toEqual(["venue_admin_coverage"]);
  });

  it("is not covered by a venue administrator of another venue, even in the same organisation", async () => {
    await target();
    await add("vaA2", "venue_admin", { venue: ID.venA2, org: ID.orgA });
    expect(await types("vaA")).toContain("venue_admin_coverage");
  });

  it("is not covered by an organisation administrator of a DIFFERENT organisation", async () => {
    await target();
    await add("oaB", "org_admin", { org: ID.orgB });
    expect(await types("vaA")).toContain("venue_admin_coverage");
  });

  it.each(["pending_deletion", "deidentified"])("is not covered by a %s administrator", async (status) => {
    await target();
    await add("oaA2", "org_admin", { org: ID.orgA, status });
    await add("vaA2", "venue_admin", { venue: ID.venA, org: ID.orgA, status });
    expect(await types("vaA")).toContain("venue_admin_coverage");
  });

  it("is covered by an active co-administrator of the venue or an active organisation administrator of the organisation", async () => {
    await target();
    await add("vaA2", "venue_admin", { venue: ID.venA, org: ID.orgA });
    expect(await types("vaA")).toEqual([]);
    await pool.query("DELETE FROM auth_users WHERE id = $1", [ID.vaA2]);
    await add("oaA2", "org_admin", { org: ID.orgA });
    expect(await types("vaA")).toEqual([]);
  });
});

describe("OWNER DECISION PENDING - how a super administrator counts as cover (characterisation of current behaviour)", () => {
  // Today any ACTIVE super administrator satisfies both coverage rules, so a venue or
  // organisation can lose its last scoped administrator without any blocker. This pins
  // that behaviour so that changing it is a visible decision, not an accident. It does not
  // endorse the rule; see the release runbook (retained findings).
  // Each rule is exercised on its own target: an organisation administrator would itself cover a
  // venue administrator, so the two targets must not coexist in one scenario.
  const rules = [
    ["venue_admin_coverage", "vaA", "venue_admin", { venue: ID.venA, org: ID.orgA }],
    ["organization_admin_coverage", "oaA1", "org_admin", { org: ID.orgA }],
  ];

  it.each(rules)("an active super administrator counts as cover for %s", async (blocker, key, role, scope) => {
    await add(key, role, scope);
    expect(await types(key)).toContain(blocker);
    await add("sup", "super_admin");
    expect(await types(key)).toEqual([]);
  });

  it.each(rules.flatMap((rule) => ["pending_deletion", "deidentified"].map((status) => [...rule, status])))(
    "%s: a %s super administrator does not count",
    async (blocker, key, role, scope, status) => {
      await add(key, role, scope);
      await add("sup", "super_admin", { status });
      expect(await types(key)).toContain(blocker);
    },
  );

  it("completion therefore lets the last venue administrator leave while a super administrator exists", async () => {
    await add("sup", "super_admin");
    await add("vaA", "venue_admin", { venue: ID.venA, org: ID.orgA, status: "pending_deletion" });
    await expect(completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.vaA, reason: REASON }))
      .resolves.toMatchObject({ status: "deidentified" });
  });
});

describe("teams: only an ACTIVE team is a responsibility", () => {
  async function leagueWithTeams({ captain, teams }) {
    await pool.query(
      `INSERT INTO leagues (id, venue_id, name, day_of_week, match_format, match_duration_minutes,
                            fields_count, time_slots, max_teams, join_code, status)
       VALUES ($1,$2,'Rules League',2,'5v5',40,2,'["18:00"]',4,'RUL00001','active')`,
      [ID.league, ID.venA],
    );
    const slots = [ID.s1, ID.s2, ID.s3, ID.s4];
    for (const [index, slot] of slots.entries()) {
      await pool.query("INSERT INTO league_slots (id, league_id, slot_number) VALUES ($1,$2,$3)", [slot, ID.league, index + 1]);
    }
    for (const [index, [teamId, name, status]] of teams.entries()) {
      await pool.query(
        "INSERT INTO teams (id, league_id, slot_id, name, status, captain_user_id) VALUES ($1,$2,$3,$4,$5,$6)",
        [teamId, ID.league, slots[index], name, status, captain],
      );
    }
  }
  const captainOf = async (teamId) => (await pool.query("SELECT captain_user_id, status FROM teams WHERE id = $1", [teamId])).rows[0];

  it("a captain whose only teams are inactive has no blockers and can be completed", async () => {
    await add("sup", "super_admin");
    await add("capOld", "captain", { venue: ID.venA, org: ID.orgA, status: "pending_deletion" });
    await leagueWithTeams({ captain: ID.capOld, teams: [[ID.tOld, "Withdrawn One", "inactive"], [ID.tOld2, "Withdrawn Two", "inactive"]] });

    expect(await types("capOld")).toEqual([]);
    await expect(completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.capOld, reason: REASON }))
      .resolves.toMatchObject({ status: "deidentified" });
    // The historical rows survive, still attributed to the (now de-identified) account.
    expect(await captainOf(ID.tOld)).toEqual({ captain_user_id: ID.capOld, status: "inactive" });
    expect(await captainOf(ID.tOld2)).toEqual({ captain_user_id: ID.capOld, status: "inactive" });
  });

  it("an inactive team is not eligible for custody or succession", async () => {
    await add("vaA", "venue_admin", { venue: ID.venA, org: ID.orgA });
    await add("capOld", "captain", { venue: ID.venA, org: ID.orgA, status: "pending_deletion" });
    await leagueWithTeams({ captain: ID.capOld, teams: [[ID.tOld, "Withdrawn One", "inactive"]] });
    await expect(resolveTeamResponsibility({ actorId: ID.vaA, targetUserId: ID.capOld, teamId: ID.tOld, reason: REASON }))
      .rejects.toMatchObject({ code: "TEAM_NOT_OWNED", status: 409 });
    expect((await captainOf(ID.tOld)).captain_user_id).toBe(ID.capOld);
  });

  it("with an active and an inactive team, only the active one blocks - and completion stays blocked until it is resolved", async () => {
    await add("sup", "super_admin");
    await add("vaA", "venue_admin", { venue: ID.venA, org: ID.orgA });
    await add("cap", "captain", { venue: ID.venA, org: ID.orgA, status: "pending_deletion" });
    await leagueWithTeams({ captain: ID.cap, teams: [[ID.tLive, "Live Team", "active"], [ID.tOld, "Withdrawn One", "inactive"]] });

    const row = (await pool.query("SELECT id, role, venue_id, organization_id FROM auth_users WHERE id = $1", [ID.cap])).rows[0];
    const blockers = await withTransaction((tx) => getLifecycleBlockers(tx, row));
    expect(blockers).toHaveLength(1);
    expect(blockers[0].type).toBe("active_teams");
    expect(blockers[0].records.map((record) => record.id)).toEqual([ID.tLive]);

    const refused = await completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.cap, reason: REASON }).catch((error) => error);
    expect(refused).toMatchObject({ code: "LIFECYCLE_BLOCKED", status: 409 });
    expect(refused.details.flatMap((blocker) => blocker.records.map((record) => record.name))).toEqual(["Live Team"]);
    expect((await pool.query("SELECT account_status FROM auth_users WHERE id = $1", [ID.cap])).rows[0].account_status).toBe("pending_deletion");

    await resolveTeamResponsibility({ actorId: ID.vaA, targetUserId: ID.cap, teamId: ID.tLive, reason: REASON });
    await expect(completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.cap, reason: REASON }))
      .resolves.toMatchObject({ status: "deidentified" });
    expect(await captainOf(ID.tLive)).toEqual({ captain_user_id: null, status: "active" });
    expect((await captainOf(ID.tOld)).captain_user_id).toBe(ID.cap);
  });
});

describe("completion cannot bypass an unresolved responsibility", () => {
  async function refereeFixtures(statuses) {
    await pool.query(
      `INSERT INTO leagues (id, venue_id, name, day_of_week, match_format, match_duration_minutes,
                            fields_count, time_slots, max_teams, join_code, status)
       VALUES ($1,$2,'Rules League',2,'5v5',40,3,'["18:00","19:00","20:00"]',2,'RUL00002','active')`,
      [ID.league, ID.venA],
    );
    await pool.query("INSERT INTO league_slots (id, league_id, slot_number) VALUES ($1,$3,1),($2,$3,2)", [ID.s1, ID.s2, ID.league]);
    await pool.query(
      `INSERT INTO teams (id, league_id, slot_id, name, status) VALUES ($1,$3,$4,'Home','active'),($2,$3,$5,'Away','active')`,
      [ID.tLive, ID.tFill, ID.league, ID.s1, ID.s2],
    );
    for (const [index, status] of statuses.entries()) {
      await pool.query(
        `INSERT INTO matches (id, league_id, round_number, match_date, time_slot, field_number,
                              home_slot_id, away_slot_id, home_team_id, away_team_id, status, referee_id)
         VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8,$9,$10,$11)`,
        [m(index + 1), ID.league, index + 1, `2031-01-0${index + 1}`, ["18:00", "19:00", "20:00"][index % 3], ID.s1, ID.s2, ID.tLive, ID.tFill, status, ID.ref],
      );
    }
  }
  const outstanding = (error) => error.details.flatMap((blocker) => blocker.records.map((record) => record.id)).sort();

  it("every remaining scheduled, postponed or live fixture keeps completion blocked until each is resolved", async () => {
    await add("sup", "super_admin");
    await add("vaA", "venue_admin", { venue: ID.venA, org: ID.orgA });
    await add("ref", "referee", { venue: ID.venA, org: ID.orgA, status: "pending_deletion" });
    await refereeFixtures(["scheduled", "postponed", "live", "final", "cancelled"]);

    let refused = await completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.ref, reason: REASON }).catch((error) => error);
    expect(refused).toMatchObject({ code: "LIFECYCLE_BLOCKED", status: 409 });
    expect(outstanding(refused)).toEqual([m(1), m(2), m(3)]);

    await resolveRefereeResponsibility({ actorId: ID.vaA, targetUserId: ID.ref, matchId: m(1), reason: REASON });
    refused = await completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.ref, reason: REASON }).catch((error) => error);
    expect(outstanding(refused)).toEqual([m(2), m(3)]);

    await resolveRefereeResponsibility({ actorId: ID.vaA, targetUserId: ID.ref, matchId: m(2), reason: REASON });
    // The live fixture cannot be handed over; it must finish or be postponed first.
    await expect(resolveRefereeResponsibility({ actorId: ID.vaA, targetUserId: ID.ref, matchId: m(3), reason: REASON }))
      .rejects.toMatchObject({ code: "LIVE_FIXTURE", status: 409 });
    refused = await completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.ref, reason: REASON }).catch((error) => error);
    expect(outstanding(refused)).toEqual([m(3)]);
    expect((await pool.query("SELECT account_status FROM auth_users WHERE id = $1", [ID.ref])).rows[0].account_status).toBe("pending_deletion");

    await pool.query("UPDATE matches SET status = 'final' WHERE id = $1", [m(3)]);
    await expect(completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.ref, reason: REASON }))
      .resolves.toMatchObject({ status: "deidentified" });
  });

  it("only a super administrator can complete, whatever is outstanding", async () => {
    await add("sup", "super_admin");
    await add("vaA", "venue_admin", { venue: ID.venA, org: ID.orgA });
    await add("oaA1", "org_admin", { org: ID.orgA });
    await add("ref", "referee", { venue: ID.venA, org: ID.orgA, status: "pending_deletion" });
    for (const actor of ["vaA", "oaA1"]) {
      await expect(completeAccountDeidentification({ actorId: ID[actor], targetUserId: ID.ref, reason: REASON }))
        .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    }
    await expect(completeAccountDeidentification({ actorId: ID.sup, targetUserId: ID.ref, reason: REASON }))
      .resolves.toMatchObject({ status: "deidentified" });
  });
});
