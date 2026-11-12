import { describe, expect, it, vi } from "vitest";

vi.mock("argon2", () => ({ verify: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ withTransaction: vi.fn() }));

import { scopeBlockersForActor, toPublicBlockers } from "@/app/api/utils/account-lifecycle";

// Pure projection tests. The database-backed behaviour (what the pending list and
// completion really return) is in tests/integration/gate6a-tenant-isolation.test.js.
const team = (id, venue, organization) => ({ id, name: `Team ${id}`, venue_id: venue, organization_id: organization, secret: "internal" });
const fixture = (id, venue, organization) => ({ id, status: "scheduled", match_date: "2031-01-07", venue_id: venue, organization_id: organization, secret: "internal" });
const BLOCKERS = [
  { type: "active_teams", records: [team("tA", "vA", "oA"), team("tB", "vB", "oB")] },
  { type: "future_referee_fixtures", records: [fixture("mB", "vB", "oB")] },
  { type: "venue_admin_coverage", records: [] },
  { type: "organization_admin_coverage", records: [] },
];
const targetIn = (venue, organization) => ({ venue_id: venue, organization_id: organization });
const visible = (actor, target) => scopeBlockersForActor(BLOCKERS, actor, target);
const ids = (blockers) => blockers.flatMap((blocker) => blocker.records.map((record) => record.id));
const types = (blockers) => blockers.map((blocker) => blocker.type);

describe("scopeBlockersForActor", () => {
  it("shows a venue administrator only records and coverage inside their venue", () => {
    const own = visible({ role: "venue_admin", venue_id: "vA", organization_id: "oA" }, targetIn("vA", "oA"));
    expect(ids(own)).toEqual(["tA"]);
    expect(types(own)).toEqual(["active_teams", "venue_admin_coverage"]);

    const other = visible({ role: "venue_admin", venue_id: "vB", organization_id: "oB" }, targetIn("vA", "oA"));
    expect(ids(other)).toEqual(["tB", "mB"]);
    expect(types(other)).not.toContain("venue_admin_coverage");
    expect(types(other)).not.toContain("organization_admin_coverage");
  });

  it("shows an organisation administrator only their organisation, including organisation coverage", () => {
    const own = visible({ role: "org_admin", venue_id: null, organization_id: "oA" }, targetIn("vA", "oA"));
    expect(ids(own)).toEqual(["tA"]);
    expect(types(own)).toEqual(["active_teams", "venue_admin_coverage", "organization_admin_coverage"]);

    const other = visible({ role: "org_admin", venue_id: null, organization_id: "oB" }, targetIn("vA", "oA"));
    expect(ids(other)).toEqual(["tB", "mB"]);
    expect(types(other)).toEqual(["active_teams", "future_referee_fixtures"]);
  });

  it("shows a super administrator everything", () => {
    const all = visible({ role: "super_admin", venue_id: null, organization_id: null }, targetIn("vA", "oA"));
    expect(ids(all)).toEqual(["tA", "tB", "mB"]);
    expect(types(all)).toEqual(["active_teams", "future_referee_fixtures", "venue_admin_coverage", "organization_admin_coverage"]);
  });

  it("never lets an unscoped administrator or an unrelated role match a record with a missing scope", () => {
    const orphanBlockers = [
      { type: "active_teams", records: [team("orphan", null, null)] },
      { type: "venue_admin_coverage", records: [] },
      { type: "organization_admin_coverage", records: [] },
    ];
    for (const actor of [
      { role: "venue_admin", venue_id: null, organization_id: null },
      { role: "org_admin", venue_id: null, organization_id: null },
      { role: "captain", venue_id: "vA", organization_id: "oA" },
      { role: "referee", venue_id: "vA", organization_id: "oA" },
      { role: "unknown", venue_id: "vA", organization_id: "oA" },
    ]) {
      expect(scopeBlockersForActor(orphanBlockers, actor, targetIn(null, null)), actor.role).toEqual([]);
    }
    // Only a super administrator can see a record that belongs to no venue.
    expect(ids(scopeBlockersForActor(orphanBlockers, { role: "super_admin" }, targetIn(null, null)))).toEqual(["orphan"]);
  });

  it("never emits internal columns", () => {
    for (const actor of [
      { role: "super_admin" },
      { role: "org_admin", organization_id: "oB" },
      { role: "venue_admin", venue_id: "vB" },
    ]) {
      expect(JSON.stringify(visible(actor, targetIn("vB", "oB")))).not.toMatch(/organization_id|internal|secret/);
    }
  });

  it("does not mutate the complete blocker set it is given", () => {
    const before = JSON.stringify(BLOCKERS);
    visible({ role: "venue_admin", venue_id: "vA" }, targetIn("vA", "oA"));
    expect(JSON.stringify(BLOCKERS)).toBe(before);
  });
});

describe("toPublicBlockers", () => {
  it("keeps every record but only the whitelisted columns", () => {
    const publicSet = toPublicBlockers(BLOCKERS);
    expect(ids(publicSet)).toEqual(["tA", "tB", "mB"]);
    expect(Object.keys(publicSet[0].records[0]).sort()).toEqual(["id", "name", "venue_id"]);
    expect(Object.keys(publicSet[1].records[0]).sort()).toEqual(["id", "match_date", "status", "venue_id"]);
    expect(JSON.stringify(publicSet)).not.toMatch(/organization_id|internal|secret/);
  });
});
