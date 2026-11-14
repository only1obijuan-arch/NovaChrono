import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Static guards for migration 0012 (Gate 6A S2a). They read the file only; the database-backed acceptance items M01-M12
// are in tests/integration/gate6a-s2-custody-schema.test.js and in the CI rehearsal. These checks pin the properties that
// are about what the migration must NOT contain, which no database test can show.
const root = resolve(import.meta.dirname, "../..");
const FILE = "0012_gate6a_admin_scope_custody.sql";
const raw = readFileSync(resolve(root, "migrations", FILE), "utf8");
// Comments are removed the way scripts/migrate.js removes them (whole line comments), so wording in comments cannot hide or fake a statement.
const sql = raw.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);

describe("migration 0012 - static guards", () => {
  it("is the next migration in the chain and uses the designed name", () => {
    const files = readdirSync(resolve(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
    expect(files.at(-1)).toBe(FILE);
    expect(files.at(-2)).toBe("0011_gate6a_account_lifecycle.sql");
    expect(files).toHaveLength(12);
  });

  it("writes no data and runs no destructive or procedural statement", () => {
    for (const forbidden of [/\bINSERT\s+INTO\b/i, /\bUPDATE\s+\w/i, /\bDELETE\s+FROM\b/i, /\bTRUNCATE\b/i, /\bCOPY\b/i, /\bDROP\s+(TABLE|VIEW|INDEX|COLUMN|SCHEMA)\b/i,
      /\bCREATE\s+(OR\s+REPLACE\s+)?(TRIGGER|FUNCTION|PROCEDURE|EXTENSION|RULE|MATERIALIZED)\b/i, /\bCONCURRENTLY\b/i, /\bDISABLE\s+TRIGGER\b/i, /\bSECURITY\s+DEFINER\b/i]) {
      expect(sql, String(forbidden)).not.toMatch(forbidden);
    }
    const alter = statements.filter((s) => /^ALTER\s+TABLE\b/i.test(s));
    expect(alter.length).toBeGreaterThan(0);
    for (const statement of alter) expect(statement).toMatch(/^ALTER\s+TABLE\s+notifications\b/i);          // the only existing table it touches
    const drops = statements.filter((s) => /\bDROP\b/i.test(s));
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatch(/DROP\s+CONSTRAINT\s+notifications_type_supported\b/i);
  });

  it("declares exactly two tables and three views, with no cascading or nulling foreign key", () => {
    expect(statements.filter((s) => /^CREATE\s+TABLE\b/i.test(s))).toHaveLength(2);
    expect(statements.filter((s) => /^CREATE\s+VIEW\b/i.test(s))).toHaveLength(3);
    expect(sql).not.toMatch(/\bON\s+(DELETE|UPDATE)\b/i);
    expect(sql).not.toMatch(/\b(CASCADE|SET\s+NULL|SET\s+DEFAULT)\b/i);
    const fkCount = (sql.match(/\bREFERENCES\b/gi) || []).length;
    expect(fkCount).toBe(6);                                                                                 // custody table only; admin_routing_state has none
    const routing = statements.find((s) => /^CREATE\s+TABLE\s+admin_routing_state\b/i.test(s));
    expect(routing).not.toMatch(/\bREFERENCES\b/i);
  });

  it("fails closed on its preconditions and bounds its own locking", () => {
    expect(raw).toMatch(/SET LOCAL lock_timeout = '5s';/);
    expect(raw).toMatch(/SET LOCAL statement_timeout = '60s';/);
    expect(raw.indexOf("SET LOCAL lock_timeout")).toBeLessThan(raw.indexOf("DO $$"));
    expect(raw.indexOf("DO $$")).toBeLessThan(raw.indexOf("CREATE TABLE admin_scope_custody"));
    expect(sql).toMatch(/migration 0011 is not recorded/);
    expect(sql).toMatch(/notifications_type_supported is missing or not validated/);
    expect(sql).toMatch(/NOT VALID;[\s\S]*VALIDATE CONSTRAINT notifications_type_supported/);
  });

  it("creates the routing state without a row and keeps the strict views independent of it", () => {
    expect(sql).not.toMatch(/admin_routing_state\s*\([^)]*\)\s*VALUES/i);
    const strict = statements.find((s) => /^CREATE\s+VIEW\s+venue_alert_recipients\s+AS\b/i.test(s));
    const cover = statements.find((s) => /^CREATE\s+VIEW\s+organization_cover\b/i.test(s));
    const effective = statements.find((s) => /^CREATE\s+VIEW\s+venue_alert_recipients_effective\b/i.test(s));
    expect(strict).not.toMatch(/admin_routing_state/);
    expect(cover).not.toMatch(/admin_routing_state/);
    expect(effective).toMatch(/COALESCE\(\(SELECT s\.mode FROM admin_routing_state s LIMIT 1\), 'legacy'\) = 'legacy'/);
    expect(effective).toMatch(/NOT EXISTS/);
  });

  it("does not touch the application: the migration is the only production-path file of this slice", () => {
    expect(readdirSync(resolve(root, "migrations")).filter((f) => f.startsWith("0012_"))).toEqual([FILE]);
  });
});
