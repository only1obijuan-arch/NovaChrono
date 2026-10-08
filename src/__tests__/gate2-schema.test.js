import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { splitStatements } from "../../scripts/migrate.js";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const authMigration = read("migrations/0003_auth_identity_integrity.sql");
const appMigration = read("migrations/0004_application_schema_integrity.sql");
const holdMigration = read("migrations/0005_enforce_user_role_not_null.sql");

describe("Gate 2 forward migration contracts", () => {
  it.each([
    "migrations/0003_auth_identity_integrity.sql",
    "migrations/0004_application_schema_integrity.sql",
    "migrations/0005_enforce_user_role_not_null.sql",
    "migrations/0006_remove_redundant_match_index.sql",
  ])("is parseable by the production migration splitter: %s", (file) => {
    expect(splitStatements(read(file)).length).toBeGreaterThan(0);
  });

  it("fails closed for canonical email and account anomalies", () => {
    expect(authMigration).toContain("canonical auth_users email duplicates exist");
    expect(authMigration).toContain("duplicate auth_accounts owner/provider rows exist");
    expect(authMigration).toContain("orphan auth_accounts rows exist");
    expect(authMigration).toContain("auth_users_email_lower_unique");
  });

  it("fails closed for UUID and relation duplicate anomalies", () => {
    for (const marker of [
      "malformed teams.captain_user_id UUID text exists",
      "malformed matches.referee_id UUID text exists",
      "malformed notifications.user_id UUID text exists",
      "duplicate standings league/team rows exist",
      "duplicate availability match/team rows exist",
    ]) expect(appMigration).toContain(marker);
  });

  it("preserves historical invitation venue nullability and notification vocabulary", () => {
    expect(appMigration).toContain("ADD COLUMN IF NOT EXISTS venue_id UUID");
    expect(appMigration).not.toMatch(/ALTER COLUMN venue_id SET NOT NULL/);
    expect(appMigration).not.toMatch(/notifications_type_(check|supported)/);
  });

  it("adds runtime compatibility fields and canonical scoring names", () => {
    expect(authMigration).toContain("ADD COLUMN IF NOT EXISTS push_token TEXT");
    expect(appMigration).toContain("ADD COLUMN IF NOT EXISTS reminder_count");
    expect(appMigration).toContain("ALTER COLUMN token DROP NOT NULL");
    for (const column of ["win_points", "draw_points", "forfeit_score_home", "forfeit_score_away"]) {
      expect(appMigration).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
  });

  it("makes unresolved role enforcement an explicit fail-closed hold point", () => {
    expect(holdMigration).toContain("PRODUCTION ROLE ASSIGNMENT REQUIRED");
    expect(authMigration).not.toContain("ALTER COLUMN role SET DEFAULT 'captain'");
    expect(holdMigration).toContain("ALTER COLUMN role SET DEFAULT 'captain'");
    expect(holdMigration).toContain("ALTER COLUMN role SET NOT NULL");
  });

  it("bounds DDL lock acquisition inside each migration transaction", () => {
    for (const migration of [authMigration, appMigration, holdMigration]) {
      expect(migration).toContain("SET LOCAL lock_timeout = '5s'");
    }
  });
});
