import { describe, expect, it } from "vitest";
import { leagueDayLabel, weekdayLabel } from "@/utils/weekday";

describe("weekday display contracts", () => {
  it.each([
    [0, "Sunday"],
    [1, "Monday"],
    [6, "Saturday"],
    ["2", "Tuesday"],
    ["wednesday", "Wednesday"],
  ])("formats %j as %s", (value, expected) => {
    expect(weekdayLabel(value)).toBe(expected);
  });

  it("formats the numeric league day without calling string methods on it", () => {
    expect(leagueDayLabel(3)).toBe("WEDNESDAY LEAGUE");
  });

  it.each([null, undefined, -1, 7, "noday"])(
    "falls back safely for %j",
    (value) => {
      expect(weekdayLabel(value)).toBe("");
      expect(leagueDayLabel(value)).toBe("LEAGUE");
    }
  );
});
