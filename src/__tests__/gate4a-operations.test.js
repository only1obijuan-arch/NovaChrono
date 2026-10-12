import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEAGUE_TIME_ZONE,
  addDaysToLocalDate,
  addMonthsToLocalDate,
  formatLocalFixtureDate,
  isValidLocalDate,
  isValidLocalTime,
  localDateString,
  localWeekdayNumber,
} from "@/utils/scheduling";

const root = resolve(import.meta.dirname, "../..");
const migration = readFileSync(resolve(root, "migrations/0008_gate4a_league_operations.sql"), "utf8");
const matchRoute = readFileSync(resolve(root, "src/app/api/matches/route.js"), "utf8");
const schedulingRoute = readFileSync(resolve(root, "src/app/api/matches/scheduling.js"), "utf8");
const fixtureUi = readFileSync(resolve(root, "src/components/LeagueDetail/FixtureOperationModal.jsx"), "utf8");

describe("Gate 4A local scheduling semantics", () => {
  it("uses the explicit South African league timezone", () => {
    expect(LEAGUE_TIME_ZONE).toBe("Africa/Johannesburg");
    expect(formatLocalFixtureDate("2030-01-01")).toContain("2030");
  });

  it("keeps date-only values stable across ISO round trips", () => {
    expect(localDateString("2030-01-01T00:00:00.000Z")).toBe("2030-01-01");
    expect(addDaysToLocalDate("2030-01-01", 7)).toBe("2030-01-08");
    expect(addMonthsToLocalDate("2030-01-31", 1)).toBe("2030-02-28");
  });

  it("derives the weekday from the authoritative local date", () => {
    expect(localWeekdayNumber("2030-01-01")).toBe(2);
    expect(formatLocalFixtureDate("2030-01-01", "en-ZA").toLowerCase()).toContain("tue");
  });

  it("rejects impossible dates and invalid kickoff values", () => {
    expect(isValidLocalDate("2030-02-29")).toBe(false);
    expect(isValidLocalDate("2032-02-29")).toBe(true);
    expect(isValidLocalTime("23:59")).toBe(true);
    expect(isValidLocalTime("24:00")).toBe(false);
  });
});

describe("Gate 4A schema and command contracts", () => {
  it("adds only forward result metadata and conflict lookup indexes", () => {
    expect(migration).toContain("SET LOCAL lock_timeout = '5s'");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS result_type");
    expect(migration).toContain("matches_result_type_check");
    expect(migration).toContain("matches_active_schedule_lookup");
    expect(migration).toContain("matches_active_referee_schedule_lookup");
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });

  it("exposes the complete operation vocabulary and mandatory correction reason", () => {
    for (const action of [
      "CREATE_FIXTURE",
      "EDIT_FIXTURE",
      "ASSIGN_REFEREE",
      "POSTPONE_FIXTURE",
      "CANCEL_FIXTURE",
      "ADMIN_OVERRIDE",
      "FORFEIT_MATCH",
    ]) expect(matchRoute).toContain(`z.literal("${action}")`);
    expect(matchRoute).toContain("reason: correctionReason");
    expect(schedulingRoute).toContain("pg_advisory_xact_lock");
  });

  it("keeps admin controls server-authoritative and pending-safe", () => {
    expect(fixtureUi).toContain("disabled={pending");
    expect(fixtureUi).toContain("CORRECTION REASON");
    expect(fixtureUi).toContain("required");
    expect(fixtureUi).toContain("FORFEIT_MATCH");
  });
});
