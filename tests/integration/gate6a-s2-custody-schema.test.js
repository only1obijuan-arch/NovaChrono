import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/app/api/utils/db";

// Gate 6A S2a schema acceptance (migration 0012), real PostgreSQL. Items M01, M03-M09, M11, M12 of the S2 acceptance
// matrix (v1.1 plus the final addendum). M02 (precondition failure without 0011) and M10 (zero backfill and inertness on
// the production-shaped database) run in the CI rehearsal, where a database without 0011 recorded and the production-shaped
// fixture exist; this file asserts the migration's own catalogue, constraints and views.
//
// No application code reads any of these objects yet. Routing state is cleared before and after every test so that this
// file can never influence another suite (an absent row means legacy mode, custody operations disabled).

const id = (kind, n) => `${kind}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = {
  orgA: id("c1", 1), orgB: id("c1", 2),
  v1: id("c2", 1), v2: id("c2", 2), v3: id("c2", 3), v4: id("c2", 4), v5: id("c2", 5), v6: id("c2", 6), v7: id("c2", 7), vB: id("c2", 8),
  sa: id("c3", 1), sb: id("c3", 2), sc: id("c3", 3), sd: id("c3", 4), se: id("c3", 5),
  n1: id("c4", 1), n6: id("c4", 2), n7: id("c4", 3),
  oa: id("c5", 1), oa2: id("c5", 2), oa3: id("c5", 3), oa4: id("c5", 4), oaB: id("c5", 5),
  cap: id("c6", 1), cap2: id("c6", 2),
};
const KEY = Object.fromEntries(Object.entries(ID).map(([k, v]) => [v, k]));
const REASON = "Schema test assignment reason";
const RELEASE_REASON = "Schema test release reason";

const reset = async () => {
  await pool.query(`TRUNCATE TABLE api_rate_limits, audit_logs, notifications, availability_responses, match_events, matches,
    standings, players, teams, league_slots, leagues, invite_tokens, mobile_sessions, password_reset_tokens, auth_accounts,
    auth_verification_token, auth_users, venues, organizations, admin_scope_custody RESTART IDENTITY CASCADE`);
  await pool.query("DELETE FROM admin_routing_state");
};
const TRANSITION = {
  pending_deletion: `UPDATE auth_users SET account_status = 'pending_deletion', deletion_request_id = gen_random_uuid(),
    deletion_requested_at = NOW(), sessions_valid_after = NOW() WHERE id = $1`,
  deidentified: `UPDATE auth_users SET account_status = 'deidentified', deletion_request_id = gen_random_uuid(),
    deletion_requested_at = NOW(), deidentified_at = NOW(), "emailVerified" = NULL,
    email = 'deidentified+' || replace(id::text, '-', '') || '@account.invalid' WHERE id = $1`,
};
async function addUser(key, role, { venue = null, org = null, status = "active" } = {}) {
  await pool.query(
    `INSERT INTO auth_users (id, name, email, role, venue_id, organization_id, "emailVerified") VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
    [ID[key], `Person ${key}`, `${key}@s2a.example.test`, role, venue, org],
  );
  if (status !== "active") await pool.query(TRANSITION[status], [ID[key]]);
}
async function seedTenants() {
  await pool.query("INSERT INTO organizations (id, name) VALUES ($1,'Org A'),($2,'Org B')", [ID.orgA, ID.orgB]);
  const venues = [["v1", ID.orgA], ["v2", ID.orgA], ["v3", ID.orgA], ["v4", ID.orgA], ["v5", ID.orgA], ["v6", ID.orgA], ["v7", ID.orgA], ["vB", ID.orgB]];
  for (const [key, org] of venues) await pool.query("INSERT INTO venues (id, organization_id, name) VALUES ($1,$2,$3)", [ID[key], org, `Venue ${key}`]);
}
// A custody row with sensible defaults; every column can be overridden (including with invalid values, to test the constraints).
function custody(over = {}) {
  const row = {
    venue_id: null, organization_id: null, custodian_user_id: ID.oa, assigned_by: ID.sa, assigned_at: null,
    assigned_reason: REASON, review_due_at: null, predecessor_id: null, released_at: null, released_by: null, release_reason: null, id: null,
    ...over,
  };
  return pool.query(
    `INSERT INTO admin_scope_custody (id, venue_id, organization_id, custodian_user_id, assigned_by, assigned_at, assigned_reason, review_due_at,
        predecessor_id, released_at, released_by, release_reason)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, COALESCE($6::timestamptz, now()), $7, COALESCE($8::timestamptz, now() + interval '90 days'),
        $9, $10, $11, $12) RETURNING id`,
    [row.id, row.venue_id, row.organization_id, row.custodian_user_id, row.assigned_by, row.assigned_at, row.assigned_reason, row.review_due_at,
      row.predecessor_id, row.released_at, row.released_by, row.release_reason],
  ).then((r) => r.rows[0].id);
}
const release = (rowId, by = ID.sa) => pool.query(
  "UPDATE admin_scope_custody SET released_at = now(), released_by = $2, release_reason = $3 WHERE id = $1", [rowId, by, RELEASE_REASON]);
async function pgError(promise) { try { await promise; } catch (error) { return error; } return null; }
const expectConstraint = async (promise, code, constraint) => {
  const error = await pgError(promise);
  expect(error, `expected a database error ${code} ${constraint ?? ""}`).not.toBeNull();
  expect(error.code).toBe(code);
  if (constraint) expect(error.constraint).toBe(constraint);
};
const setState = (mode, enabled) => pool.query(
  `INSERT INTO admin_routing_state (singleton, mode, custody_enabled) VALUES (true, $1, $2)
   ON CONFLICT (singleton) DO UPDATE SET mode = EXCLUDED.mode, custody_enabled = EXCLUDED.custody_enabled`, [mode, enabled]);

beforeEach(async () => { await reset(); });
afterAll(async () => { await reset(); await pool.end(); });

describe("M01 - migration 0012 catalogue", () => {
  it("is recorded in schema_migrations after 0011", async () => {
    const { rows } = await pool.query("SELECT name FROM schema_migrations WHERE name IN ('0011_gate6a_account_lifecycle.sql', '0012_gate6a_admin_scope_custody.sql') ORDER BY name");
    expect(rows.map((r) => r.name)).toEqual(["0011_gate6a_account_lifecycle.sql", "0012_gate6a_admin_scope_custody.sql"]);
  });

  it("creates admin_scope_custody and admin_routing_state with exactly the designed columns", async () => {
    const columns = async (table) => (await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [table])).rows
      .map((r) => `${r.column_name}:${r.data_type}:${r.is_nullable}`);
    expect(await columns("admin_scope_custody")).toEqual([
      "id:uuid:NO", "venue_id:uuid:YES", "organization_id:uuid:YES", "custodian_user_id:uuid:NO", "assigned_by:uuid:NO",
      "assigned_at:timestamp with time zone:NO", "assigned_reason:text:NO", "review_due_at:timestamp with time zone:NO",
      "predecessor_id:uuid:YES", "released_at:timestamp with time zone:YES", "released_by:uuid:YES", "release_reason:text:YES",
    ]);
    expect(await columns("admin_routing_state")).toEqual([
      "singleton:boolean:NO", "mode:text:NO", "custody_enabled:boolean:NO", "changed_at:timestamp with time zone:NO", "changed_by:uuid:YES", "change_reason:text:YES",
    ]);
    const defaults = Object.fromEntries((await pool.query(
      `SELECT table_name || '.' || column_name AS c, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name IN ('admin_scope_custody', 'admin_routing_state') AND column_default IS NOT NULL`)).rows.map((r) => [r.c, r.column_default]));
    expect(defaults["admin_scope_custody.id"]).toContain("gen_random_uuid()");
    expect(defaults["admin_scope_custody.assigned_at"]).toContain("now()");
    expect(defaults["admin_routing_state.singleton"]).toBe("true");
    expect(defaults["admin_routing_state.mode"]).toContain("'legacy'");
    expect(defaults["admin_routing_state.custody_enabled"]).toBe("false");
  });

  it("declares exactly the designed constraints, all validated, with RESTRICTIVE foreign keys", async () => {
    const { rows } = await pool.query(
      `SELECT conrelid::regclass::text AS tbl, conname, contype, convalidated, confdeltype, confupdtype, pg_get_constraintdef(oid) AS def
       FROM pg_constraint WHERE conrelid IN ('admin_scope_custody'::regclass, 'admin_routing_state'::regclass) ORDER BY tbl, contype, conname`);
    const names = (tbl, type) => rows.filter((r) => r.tbl === tbl && r.contype === type).map((r) => r.conname);
    expect(names("admin_scope_custody", "c")).toEqual([
      "admin_scope_custody_assign_reason", "admin_scope_custody_one_scope", "admin_scope_custody_release_consistent", "admin_scope_custody_review_after_assign",
    ]);
    expect(names("admin_scope_custody", "p")).toEqual(["admin_scope_custody_pkey"]);
    expect(names("admin_routing_state", "c")).toEqual([
      "admin_routing_state_mode_supported", "admin_routing_state_singleton_only", "admin_routing_state_strict_requires_custody",
    ]);
    expect(names("admin_routing_state", "p")).toEqual(["admin_routing_state_pkey"]);
    const fks = rows.filter((r) => r.contype === "f");
    expect(fks.map((r) => r.conname)).toEqual([
      "admin_scope_custody_assigned_by_fkey", "admin_scope_custody_custodian_user_id_fkey", "admin_scope_custody_organization_id_fkey",
      "admin_scope_custody_predecessor_id_fkey", "admin_scope_custody_released_by_fkey", "admin_scope_custody_venue_id_fkey",
    ]);
    for (const fk of fks) {
      expect(fk.confdeltype, `${fk.conname} must not cascade or null`).toBe("a");    // NO ACTION
      expect(fk.confupdtype).toBe("a");
    }
    expect(fks.some((r) => /ON DELETE/i.test(r.def))).toBe(false);
    expect(rows.every((r) => r.convalidated)).toBe(true);
    // routing state has NO foreign key at all (a TRUNCATE ... auth_users CASCADE must not reach it)
    expect(rows.filter((r) => r.tbl === "admin_routing_state" && r.contype === "f")).toEqual([]);
  });

  it("creates exactly the designed indexes with their partial predicates", async () => {
    const { rows } = await pool.query(
      `SELECT c.relname, i.indisunique, pg_get_expr(i.indpred, i.indrelid) AS pred, pg_get_indexdef(i.indexrelid) AS def
       FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE i.indrelid = 'admin_scope_custody'::regclass ORDER BY c.relname`);
    const by = Object.fromEntries(rows.map((r) => [r.relname, r]));
    expect(Object.keys(by)).toEqual([
      "admin_scope_custody_active_org_unique", "admin_scope_custody_active_venue_unique", "admin_scope_custody_custodian_idx", "admin_scope_custody_org_idx",
      "admin_scope_custody_pkey", "admin_scope_custody_predecessor_unique", "admin_scope_custody_venue_idx",
    ]);
    const expectIndex = (name, unique, columns, predicates) => {
      expect(by[name].indisunique, name).toBe(unique);
      expect(by[name].def, name).toContain(`(${columns})`);
      for (const p of predicates) expect(by[name].pred, name).toContain(p);
    };
    expectIndex("admin_scope_custody_active_venue_unique", true, "custodian_user_id, venue_id", ["released_at IS NULL", "venue_id IS NOT NULL"]);
    expectIndex("admin_scope_custody_active_org_unique", true, "custodian_user_id, organization_id", ["released_at IS NULL", "organization_id IS NOT NULL"]);
    expectIndex("admin_scope_custody_predecessor_unique", true, "predecessor_id", ["predecessor_id IS NOT NULL"]);
    expectIndex("admin_scope_custody_venue_idx", false, "venue_id", ["released_at IS NULL", "venue_id IS NOT NULL"]);
    expectIndex("admin_scope_custody_org_idx", false, "organization_id", ["released_at IS NULL", "organization_id IS NOT NULL"]);
    expectIndex("admin_scope_custody_custodian_idx", false, "custodian_user_id", ["released_at IS NULL"]);
  });

  it("creates the three views (plain, with the designed columns) and no trigger on the new tables", async () => {
    const views = (await pool.query(
      `SELECT viewname, definition FROM pg_views WHERE schemaname = 'public' AND viewname IN ('venue_alert_recipients', 'venue_alert_recipients_effective', 'organization_cover') ORDER BY viewname`)).rows;
    expect(views.map((v) => v.viewname)).toEqual(["organization_cover", "venue_alert_recipients", "venue_alert_recipients_effective"]);
    expect((await pool.query("SELECT count(*)::int AS n FROM pg_matviews WHERE schemaname = 'public'")).rows[0].n).toBe(0);
    const columns = async (view) => (await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [view])).rows.map((r) => `${r.column_name}:${r.data_type}`);
    expect(await columns("venue_alert_recipients")).toEqual(["venue_id:uuid", "user_id:uuid", "source:text", "custody_id:uuid"]);
    expect(await columns("venue_alert_recipients_effective")).toEqual(["venue_id:uuid", "user_id:uuid", "source:text", "custody_id:uuid"]);
    expect(await columns("organization_cover")).toEqual(["organization_id:uuid", "user_id:uuid", "source:text", "custody_id:uuid"]);
    const def = Object.fromEntries(views.map((v) => [v.viewname, v.definition]));
    expect(def.venue_alert_recipients).not.toContain("admin_routing_state");     // strict never depends on the switch
    expect(def.organization_cover).not.toContain("admin_routing_state");
    expect(def.venue_alert_recipients_effective).toContain("admin_routing_state");
    expect(def.venue_alert_recipients_effective).toContain("'legacy'");
    expect((await pool.query(
      `SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('admin_scope_custody'::regclass, 'admin_routing_state'::regclass)`)).rows[0].n).toBe(0);
  });

  it("extends the notification type CHECK with venue_unrouted and keeps every earlier type", async () => {
    const [c] = (await pool.query(
      `SELECT convalidated, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'notifications'::regclass AND conname = 'notifications_type_supported'`)).rows;
    expect(c.convalidated).toBe(true);
    for (const type of ["match_reminder", "availability_confirmed", "availability_declined", "unconfirmed_alert", "admin_message", "weather_warning", "match_postponed", "round_postponed", "venue_unrouted"]) {
      expect(c.def, type).toContain(`'${type}'`);
    }
    await seedTenants(); await addUser("oa", "org_admin", { org: ID.orgA });
    for (const type of ["unconfirmed_alert", "venue_unrouted"]) {
      await pool.query("INSERT INTO notifications (user_id, type, title, message) VALUES ($1,$2,'t','m')", [ID.oa, type]);
    }
    await expectConstraint(pool.query("INSERT INTO notifications (user_id, type, title, message) VALUES ($1,'not_a_type','t','m')", [ID.oa]), "23514", "notifications_type_supported");
  });
});

describe("M03 - exactly one scope", () => {
  it("rejects both scopes and neither scope; accepts a venue or an organisation alone", async () => {
    await seedTenants(); await addUser("sa", "super_admin"); await addUser("oa", "org_admin", { org: ID.orgA });
    await expectConstraint(custody({ venue_id: ID.v1, organization_id: ID.orgA }), "23514", "admin_scope_custody_one_scope");
    await expectConstraint(custody({}), "23514", "admin_scope_custody_one_scope");
    await custody({ venue_id: ID.v1 });
    await custody({ organization_id: ID.orgA, custodian_user_id: ID.sa });
  });
});

describe("M04 - reason bounds", () => {
  it("accepts 10 and 500 characters; rejects 9, 501, blank, padded-short and missing reasons", async () => {
    await seedTenants(); await addUser("sa", "super_admin"); await addUser("oa", "org_admin", { org: ID.orgA });
    const attempt = (reason, custodian = ID.oa, venue = ID.v1) => custody({ venue_id: venue, custodian_user_id: custodian, assigned_reason: reason });
    await expectConstraint(attempt("123456789"), "23514", "admin_scope_custody_assign_reason");
    await expectConstraint(attempt("   123456789   "), "23514", "admin_scope_custody_assign_reason");
    await expectConstraint(attempt("          "), "23514", "admin_scope_custody_assign_reason");
    await expectConstraint(attempt("x".repeat(501)), "23514", "admin_scope_custody_assign_reason");
    await expectConstraint(attempt(null), "23502");
    await attempt("1234567890", ID.oa, ID.v1);
    await attempt("y".repeat(500), ID.sa, ID.v1);
  });
});

describe("M05 - release consistency", () => {
  it("allows only fully unreleased or fully released rows; release reason bounded; never before assignment", async () => {
    await seedTenants(); await addUser("sa", "super_admin"); await addUser("oa", "org_admin", { org: ID.orgA });
    const base = { venue_id: ID.v1 };
    const bad = (extra) => expectConstraint(custody({ ...base, ...extra }), "23514", "admin_scope_custody_release_consistent");
    await bad({ released_at: new Date() });
    await bad({ released_by: ID.sa });
    await bad({ release_reason: RELEASE_REASON });
    await bad({ released_at: new Date(), released_by: ID.sa });
    await bad({ released_at: new Date(), release_reason: RELEASE_REASON });
    await bad({ released_at: new Date(), released_by: ID.sa, release_reason: "too short" });
    await bad({ released_at: new Date(), released_by: ID.sa, release_reason: "z".repeat(501) });
    await bad({ assigned_at: new Date(Date.now() + 3600_000), released_at: new Date(), released_by: ID.sa, release_reason: RELEASE_REASON });
    const ok = await custody({ ...base, released_at: new Date(Date.now() + 1000), released_by: ID.sa, release_reason: RELEASE_REASON });
    expect(ok).toBeTruthy();
    await custody({ ...base, custodian_user_id: ID.sa });                                                   // fully unreleased
    await expectConstraint(custody({ ...base, custodian_user_id: ID.oa, review_due_at: new Date(Date.now() - 1000) }), "23514", "admin_scope_custody_review_after_assign");
    await expectConstraint(pool.query("UPDATE admin_scope_custody SET released_at = now() WHERE custodian_user_id = $1", [ID.sa]), "23514", "admin_scope_custody_release_consistent");
  });
});

describe("M06 / M07 - one active row per custodian and scope", () => {
  it.each([
    ["M06 venue scope", "venue_id", () => ID.v1, () => ID.v2],
    ["M07 organisation scope", "organization_id", () => ID.orgA, () => ID.orgB],
  ])("%s", async (_name, column, scope, otherScope) => {
    await seedTenants(); await addUser("sa", "super_admin"); await addUser("sb", "super_admin");
    const mk = (custodian, target) => custody({ [column]: target, custodian_user_id: custodian });
    const index = column === "venue_id" ? "admin_scope_custody_active_venue_unique" : "admin_scope_custody_active_org_unique";
    const first = await mk(ID.sa, scope());
    await expectConstraint(mk(ID.sa, scope()), "23505", index);                    // duplicate active
    await mk(ID.sa, otherScope());                                                  // same custodian, other scope
    await mk(ID.sb, scope());                                                       // other custodian, same scope
    await release(first);
    await mk(ID.sa, scope());                                                       // released rows do not block a new assignment
    await expectConstraint(mk(ID.sa, scope()), "23505", index);
    const history = (await pool.query(`SELECT count(*)::int AS n FROM admin_scope_custody WHERE custodian_user_id = $1 AND ${column} = $2`, [ID.sa, scope()])).rows[0].n;
    expect(history).toBe(2);                                                        // one released, one active: history is kept
  });
});

describe("M08 - restrictive foreign keys", () => {
  it("blocks deleting any referenced user, venue or organisation (active or released rows); nothing cascades; audit untouched", async () => {
    await seedTenants(); await addUser("sa", "super_admin"); await addUser("sb", "super_admin"); await addUser("oa", "org_admin", { org: ID.orgA });
    const venueRow = await custody({ venue_id: ID.v1, custodian_user_id: ID.oa, assigned_by: ID.sa });
    const orgRow = await custody({ organization_id: ID.orgA, custodian_user_id: ID.sa, assigned_by: ID.sb });
    await release(venueRow, ID.sb);
    await pool.query("INSERT INTO audit_logs (action_by, target_id, action_type, new_value) VALUES ($1,$2,'ADMIN_SCOPE_CUSTODY_ASSIGNED','{}'::jsonb)", [ID.sa, venueRow]);
    const counts = async () => ({
      custody: (await pool.query("SELECT count(*)::int AS n FROM admin_scope_custody")).rows[0].n,
      audit: (await pool.query("SELECT count(*)::int AS n FROM audit_logs")).rows[0].n,
    });
    const before = await counts();
    expect(before).toEqual({ custody: 2, audit: 1 });
    for (const [sql, param, constraint] of [
      ["DELETE FROM auth_users WHERE id = $1", ID.oa, "admin_scope_custody_custodian_user_id_fkey"],       // custodian of a released row
      ["DELETE FROM auth_users WHERE id = $1", ID.sa, null],                                                  // custodian and assigner
      ["DELETE FROM auth_users WHERE id = $1", ID.sb, null],                                                  // released_by / assigned_by
      ["DELETE FROM venues WHERE id = $1", ID.v1, "admin_scope_custody_venue_id_fkey"],                       // scope of a RELEASED row still blocks
      ["DELETE FROM organizations WHERE id = $1", ID.orgA, null],
    ]) {
      const error = await pgError(pool.query(sql, [param]));
      expect(error?.code, sql + " " + param).toBe("23503");
      if (constraint) expect(error.constraint).toBe(constraint);
    }
    expect(await counts()).toEqual(before);
    expect((await pool.query("SELECT venue_id, organization_id FROM admin_scope_custody WHERE id = ANY($1::uuid[]) ORDER BY id", [[venueRow, orgRow]])).rows).toHaveLength(2);
    // positive controls: a scope without custody is still deletable; the failed deletes changed nothing
    await pool.query("DELETE FROM venues WHERE id = $1", [ID.vB]);
    await pool.query("DELETE FROM organizations WHERE id = $1", [ID.orgB]);
    expect((await pool.query("SELECT count(*)::int AS n FROM venues WHERE id = $1", [ID.v1])).rows[0].n).toBe(1);
  });
});

describe("M09 - transfer provenance", () => {
  it("lets a row be the predecessor of at most one other row and requires an existing predecessor", async () => {
    await seedTenants(); await addUser("sa", "super_admin"); await addUser("sb", "super_admin"); await addUser("oa", "org_admin", { org: ID.orgA });
    const first = await custody({ venue_id: ID.v1, custodian_user_id: ID.sa });
    await release(first);
    await custody({ venue_id: ID.v1, custodian_user_id: ID.sb, predecessor_id: first });
    await expectConstraint(custody({ venue_id: ID.v1, custodian_user_id: ID.oa, predecessor_id: first }), "23505", "admin_scope_custody_predecessor_unique");
    await expectConstraint(custody({ venue_id: ID.v2, custodian_user_id: ID.oa, predecessor_id: id("ff", 1) }), "23503", "admin_scope_custody_predecessor_id_fkey");
    await custody({ venue_id: ID.v2, custodian_user_id: ID.oa });                  // a row without a predecessor is unaffected
  });
});

describe("M11 - routing state constraints and absent-row defaults", () => {
  it("enforces mode, singleton and the strict-requires-custody invariant at the database", async () => {
    await expectConstraint(pool.query("INSERT INTO admin_routing_state (mode, custody_enabled) VALUES ('strict', false)"), "23514", "admin_routing_state_strict_requires_custody");
    await expectConstraint(pool.query("INSERT INTO admin_routing_state (mode, custody_enabled) VALUES ('other', true)"), "23514", "admin_routing_state_mode_supported");
    await expectConstraint(pool.query("INSERT INTO admin_routing_state (singleton) VALUES (false)"), "23514", "admin_routing_state_singleton_only");
    await pool.query("INSERT INTO admin_routing_state DEFAULT VALUES");
    const [row] = (await pool.query("SELECT singleton, mode, custody_enabled, changed_by FROM admin_routing_state")).rows;
    expect(row).toEqual({ singleton: true, mode: "legacy", custody_enabled: false, changed_by: null });
    await expectConstraint(pool.query("INSERT INTO admin_routing_state (mode, custody_enabled) VALUES ('legacy', true)"), "23505", "admin_routing_state_pkey");
    await setState("legacy", true);                                                  // the upsert pattern the service will use
    await setState("strict", true);
    await expectConstraint(pool.query("UPDATE admin_routing_state SET custody_enabled = false"), "23514", "admin_routing_state_strict_requires_custody");
    await setState("legacy", true); await setState("legacy", false);                 // disabling is legal only after switching back
    expect((await pool.query("SELECT count(*)::int AS n FROM admin_routing_state")).rows[0].n).toBe(1);
  });

  it("has no foreign key: the state row survives TRUNCATE auth_users CASCADE and accepts any changed_by", async () => {
    await pool.query("INSERT INTO admin_routing_state (mode, custody_enabled, changed_by, change_reason) VALUES ('legacy', true, $1, 'schema test')", [id("ee", 9)]);
    await pool.query("TRUNCATE TABLE auth_users CASCADE");
    expect((await pool.query("SELECT count(*)::int AS n FROM admin_routing_state")).rows[0].n).toBe(1);
  });

  it("an ABSENT row means legacy routing: the legacy leg is present; once strict it is gone", async () => {
    await seedTenants(); await addUser("sb", "super_admin", { venue: ID.v3, org: ID.orgA });
    const effective = async () => (await pool.query("SELECT user_id, source FROM venue_alert_recipients_effective WHERE venue_id = $1", [ID.v3])).rows;
    expect((await pool.query("SELECT count(*)::int AS n FROM admin_routing_state")).rows[0].n).toBe(0);
    expect(await effective()).toEqual([{ user_id: ID.sb, source: "legacy" }]);
    await setState("legacy", false);
    expect(await effective()).toEqual([{ user_id: ID.sb, source: "legacy" }]);
    await setState("strict", true);
    expect(await effective()).toEqual([]);
    expect((await pool.query("SELECT count(*)::int AS n FROM venue_alert_recipients WHERE venue_id = $1", [ID.v3])).rows[0].n).toBe(0);   // strict never had it
  });
});

describe("M12 - strict and effective recipient views", () => {
  async function fixture() {
    await seedTenants();
    await addUser("sa", "super_admin");
    await addUser("sb", "super_admin", { venue: ID.v3, org: ID.orgA });                    // legacy only
    await addUser("sc", "super_admin", { venue: ID.v5, org: ID.orgA });                    // legacy AND venue custodian
    await addUser("sd", "super_admin");                                                    // organisation-scope custodian only
    await addUser("se", "super_admin", { venue: ID.v4, org: ID.orgA, status: "pending_deletion" });   // pending: never a legacy recipient
    await addUser("n1", "venue_admin", { venue: ID.v1, org: ID.orgA });
    await addUser("n6", "venue_admin", { venue: ID.v6, org: ID.orgA, status: "pending_deletion" });
    await addUser("n7", "venue_admin", { venue: ID.v7, org: ID.orgA, status: "deidentified" });
    await addUser("oa", "org_admin", { org: ID.orgA });                                   // active venue custodian of v2
    await addUser("oa2", "org_admin", { org: ID.orgA });                                  // no custody
    await addUser("oa3", "org_admin", { org: ID.orgA });                                  // custody released
    await addUser("oa4", "org_admin", { org: ID.orgA, status: "pending_deletion" });       // custody but pending
    await addUser("oaB", "org_admin", { org: ID.orgB });                                  // custody forced onto another organisation's venue
    await addUser("cap", "captain", { venue: ID.v1, org: ID.orgA });                      // role not eligible, custody forced
    await custody({ venue_id: ID.v2, custodian_user_id: ID.oa });
    const released = await custody({ venue_id: ID.v2, custodian_user_id: ID.oa3 }); await release(released);
    await custody({ venue_id: ID.v2, custodian_user_id: ID.oa4 });
    await custody({ venue_id: ID.v2, custodian_user_id: ID.oaB });                         // eligibility is re-checked by the view, not only by the service
    await custody({ venue_id: ID.v1, custodian_user_id: ID.cap });
    await custody({ venue_id: ID.v5, custodian_user_id: ID.sc });
    await custody({ organization_id: ID.orgA, custodian_user_id: ID.sd });                 // organisation custody: never a venue route
    await custody({ organization_id: ID.orgA, custodian_user_id: ID.oa2 });                // organisation custody by a non-super: not cover
  }
  const sets = async (view, column) => {
    const out = {};
    for (const r of (await pool.query(`SELECT ${column} AS scope, user_id, source FROM ${view} ORDER BY ${column}, user_id`)).rows) {
      (out[KEY[r.scope]] ??= []).push(`${KEY[r.user_id]}:${r.source}`);
    }
    for (const k of Object.keys(out)) out[k].sort();
    return out;
  };
  const venueSets = (view) => sets(view, "venue_id");

  it("strict view: native active venue administrators and eligible active custodians only, in every routing mode", async () => {
    await fixture();
    const expected = { v1: ["n1:native"], v2: ["oa:custody"], v5: ["sc:custody"] };
    for (const [mode, enabled] of [[null, null], ["legacy", false], ["legacy", true], ["strict", true]]) {
      if (mode) await setState(mode, enabled);
      expect(await venueSets("venue_alert_recipients"), `mode ${mode}`).toEqual(expected);
    }
  });

  it("effective view equals the strict view plus the legacy leg in legacy mode (absent row included) and equals it in strict mode", async () => {
    await fixture();
    const legacy = { v1: ["n1:native"], v2: ["oa:custody"], v3: ["sb:legacy"], v5: ["sc:custody"] };    // sc appears once; pending se never; v4/v6/v7 nobody
    expect(await venueSets("venue_alert_recipients_effective")).toEqual(legacy);                           // no routing-state row
    await setState("legacy", false);
    expect(await venueSets("venue_alert_recipients_effective")).toEqual(legacy);
    await setState("legacy", true);
    expect(await venueSets("venue_alert_recipients_effective")).toEqual(legacy);
    await setState("strict", true);
    expect(await venueSets("venue_alert_recipients_effective")).toEqual(await venueSets("venue_alert_recipients"));
    expect(await venueSets("venue_alert_recipients_effective")).toEqual({ v1: ["n1:native"], v2: ["oa:custody"], v5: ["sc:custody"] });
    await setState("legacy", true);                                                                         // switching back restores the legacy leg
    expect(await venueSets("venue_alert_recipients_effective")).toEqual(legacy);
  });

  it("parity invariants hold in every mode: covered is a subset of delivering, no duplicate (scope, user), the difference is the legacy leg only", async () => {
    await fixture();
    for (const [mode, enabled] of [[null, null], ["legacy", false], ["strict", true], ["legacy", true]]) {
      if (mode) await setState(mode, enabled);
      const missing = (await pool.query(
        `SELECT count(*)::int AS n FROM venue_alert_recipients s WHERE NOT EXISTS
           (SELECT 1 FROM venue_alert_recipients_effective e WHERE e.venue_id = s.venue_id AND e.user_id = s.user_id)`)).rows[0].n;
      expect(missing, `covered ⊆ delivering in mode ${mode}`).toBe(0);
      for (const view of ["venue_alert_recipients", "venue_alert_recipients_effective"]) {
        expect((await pool.query(`SELECT count(*)::int AS n FROM (SELECT venue_id, user_id FROM ${view} GROUP BY 1, 2 HAVING count(*) > 1) d`)).rows[0].n, `${view} duplicates`).toBe(0);
      }
      const extra = (await pool.query(
        `SELECT DISTINCT e.source FROM venue_alert_recipients_effective e WHERE NOT EXISTS
           (SELECT 1 FROM venue_alert_recipients s WHERE s.venue_id = e.venue_id AND s.user_id = e.user_id)`)).rows.map((r) => r.source);
      expect(extra, `difference in mode ${mode}`).toEqual(mode === "strict" ? [] : ["legacy"]);
    }
  });

  it("organisation cover: active native organisation administrators plus active super-administrator organisation custodians", async () => {
    await fixture();
    expect(await sets("organization_cover", "organization_id")).toEqual({
      orgA: ["oa2:native", "oa3:native", "oa:native", "sd:custody"],      // pending oa4 excluded; non-super custodian oa2 gives no custody row; venue administrators never
      orgB: ["oaB:native"],
    });
  });
});
