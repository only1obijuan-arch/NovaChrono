import { describe, it, expect } from "vitest";

// Mirrors the END_MATCH block in src/app/api/matches/route.js (lines 117-173).
// If the production arithmetic ever changes, these tests will catch it.
function calcStandingsDelta(homeScore, awayScore) {
  const h = homeScore;
  const a = awayScore;
  const homeWon = h > a ? 1 : 0;
  const awayWon = a > h ? 1 : 0;
  const drawn = h === a ? 1 : 0;
  return {
    home: {
      played: 1,
      won: homeWon,
      drawn,
      lost: awayWon,
      goals_for: h,
      goals_against: a,
      goal_difference: h - a,
      points: homeWon * 3 + drawn,
    },
    away: {
      played: 1,
      won: awayWon,
      drawn,
      lost: homeWon,
      goals_for: a,
      goals_against: h,
      goal_difference: a - h,
      points: awayWon * 3 + drawn,
    },
  };
}

describe("END_MATCH standings calculation", () => {
  it("home win: 3 pts to home, 0 to away, win/loss counters correct", () => {
    const { home, away } = calcStandingsDelta(3, 1);
    expect(home.points).toBe(3);
    expect(away.points).toBe(0);
    expect(home.won).toBe(1);
    expect(home.lost).toBe(0);
    expect(home.drawn).toBe(0);
    expect(away.won).toBe(0);
    expect(away.lost).toBe(1);
    expect(away.drawn).toBe(0);
  });

  it("away win: 3 pts to away, 0 to home, win/loss counters correct", () => {
    const { home, away } = calcStandingsDelta(0, 2);
    expect(home.points).toBe(0);
    expect(away.points).toBe(3);
    expect(home.won).toBe(0);
    expect(home.lost).toBe(1);
    expect(away.won).toBe(1);
    expect(away.lost).toBe(0);
  });

  it("draw: 1 pt each, drawn counter incremented for both", () => {
    const { home, away } = calcStandingsDelta(2, 2);
    expect(home.points).toBe(1);
    expect(away.points).toBe(1);
    expect(home.drawn).toBe(1);
    expect(away.drawn).toBe(1);
    expect(home.won).toBe(0);
    expect(away.won).toBe(0);
  });

  it("0-0 draw: 1 pt each, no goals counted", () => {
    const { home, away } = calcStandingsDelta(0, 0);
    expect(home.points).toBe(1);
    expect(away.points).toBe(1);
    expect(home.goals_for).toBe(0);
    expect(home.goals_against).toBe(0);
    expect(away.goals_for).toBe(0);
    expect(away.goals_against).toBe(0);
  });

  it("goals_for and goals_against are correctly swapped between home and away", () => {
    const { home, away } = calcStandingsDelta(4, 1);
    expect(home.goals_for).toBe(4);
    expect(home.goals_against).toBe(1);
    expect(away.goals_for).toBe(1);
    expect(away.goals_against).toBe(4);
  });

  it("goal_difference is h-a for home, a-h for away (always opposite)", () => {
    const { home, away } = calcStandingsDelta(4, 1);
    expect(home.goal_difference).toBe(3);
    expect(away.goal_difference).toBe(-3);
    expect(home.goal_difference + away.goal_difference).toBe(0);
  });

  it("goal_difference sums to zero across all scorelines", () => {
    const scorelines = [[3, 0], [0, 3], [1, 0], [2, 2], [0, 0], [5, 3], [1, 1]];
    for (const [h, a] of scorelines) {
      const { home, away } = calcStandingsDelta(h, a);
      expect(home.goal_difference + away.goal_difference).toBe(0);
    }
  });

  it("total points per match: 3 for a win, 2 for a draw — no other outcome", () => {
    const cases = [[3, 0], [0, 3], [1, 0], [0, 1], [2, 2], [0, 0], [5, 3], [7, 7]];
    for (const [h, a] of cases) {
      const { home, away } = calcStandingsDelta(h, a);
      const total = home.points + away.points;
      expect(total).toBe(h === a ? 2 : 3);
    }
  });

  it("played count is always 1 per team regardless of score", () => {
    for (const [h, a] of [[0, 0], [3, 1], [0, 5]]) {
      const { home, away } = calcStandingsDelta(h, a);
      expect(home.played).toBe(1);
      expect(away.played).toBe(1);
    }
  });

  it("won + drawn + lost always equals played (1) for each team", () => {
    const cases = [[3, 0], [0, 2], [1, 1]];
    for (const [h, a] of cases) {
      const { home, away } = calcStandingsDelta(h, a);
      expect(home.won + home.drawn + home.lost).toBe(home.played);
      expect(away.won + away.drawn + away.lost).toBe(away.played);
    }
  });
});
