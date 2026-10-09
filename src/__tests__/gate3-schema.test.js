import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { splitStatements } from "../../scripts/migrate.js";

const root = resolve(import.meta.dirname, "../..");
const migration = readFileSync(
  resolve(root, "migrations/0007_match_goal_idempotency.sql"),
  "utf8",
);

describe("Gate 3 goal idempotency migration", () => {
  it("is parseable by the production migration splitter", () => {
    expect(splitStatements(migration).length).toBeGreaterThan(0);
  });

  it("keeps historical events nullable while constraining goal operation IDs", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS operation_id UUID");
    expect(migration).not.toMatch(/operation_id UUID\s+NOT NULL/);
    expect(migration).toMatch(/operation_id IS NULL\s+OR \(type IS NOT NULL AND type IN \('goal_home', 'goal_away'\)\)/);
    expect(migration).toContain("ON match_events (match_id, operation_id)");
    expect(migration).toContain("WHERE operation_id IS NOT NULL");
  });

  it("bounds DDL lock acquisition", () => {
    expect(migration).toContain("SET LOCAL lock_timeout = '5s'");
  });
});
