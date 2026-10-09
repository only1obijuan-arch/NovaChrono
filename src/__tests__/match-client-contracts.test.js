import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const web = readFileSync(resolve(root, "src/app/referee/match/[id]/page.jsx"), "utf8");
const mobile = readFileSync(resolve(root, "mobile/src/app/referee/match/[id].jsx"), "utf8");

describe.each([
  ["web", web],
  ["mobile", mobile],
])("Gate 3 %s referee command contract", (_client, source) => {
  it("rejects non-success HTTP responses before onSuccess", () => {
    expect(source).toContain("if (!response.ok)");
    expect(source).toContain("throw error");
    for (const command of ["START_MATCH", "START_SECOND_HALF", "RECORD_GOAL", "DELETE_EVENT", "END_MATCH"]) {
      expect(source).toContain(`action: \"${command}\"`);
    }
    expect(source.match(/onError:/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("sends a stable UUID operation ID with goal commands", () => {
    expect(source).toContain("pendingGoalOpId");
    expect(source).toContain("opId,");
    expect(source).toMatch(/randomUUID\(\)/);
  });

  it("disables repeat actions while mutations are pending", () => {
    expect(source).toContain("startMatchMutation.isPending");
    expect(source).toContain("startSecondHalfMutation.isPending");
    expect(source).toContain("recordGoalMutation.isPending");
    expect(source).toContain("deleteEventMutation.isPending");
    expect(source).toContain("endMatchMutation.isPending");
  });
});

it("preserves the mobile operation ID when retrying the same failed goal side", () => {
  expect(mobile).toContain("pendingGoalSide === side && pendingGoalOpId");
  expect(mobile).toContain("setPendingGoalSide(null)");
});
