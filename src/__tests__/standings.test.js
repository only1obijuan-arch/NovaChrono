import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const route = readFileSync(resolve(root, "src/app/api/matches/route.js"), "utf8");
const recompute = readFileSync(resolve(root, "src/app/api/matches/standings.js"), "utf8");

describe("Gate 3 deterministic standings contract", () => {
  it("uses final matches and league scoring configuration as truth", () => {
    expect(recompute).toContain("m.status = 'final'");
    expect(recompute).toContain("win_points");
    expect(recompute).toContain("draw_points");
    expect(recompute).toContain("ON CONFLICT (league_id, team_id) DO UPDATE");
  });

  it("replaces every stored counter instead of applying deltas", () => {
    for (const field of [
      "played", "won", "drawn", "lost", "goals_for",
      "goals_against", "goal_difference", "points",
    ]) {
      expect(recompute).toContain(`${field} = EXCLUDED.${field}`);
    }
    expect(route).not.toMatch(/played\s*=\s*played\s*[+-]/);
    expect(route).not.toMatch(/points\s*=\s*points\s*[+-]/);
  });

  it("recomputes after finalisation and final-result overrides", () => {
    const calls = route.match(/recomputeLeagueStandings\(txSql,/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });
});
