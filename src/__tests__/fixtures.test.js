import { describe, it, expect } from "vitest";

// Mirrors the GENERATE_FIXTURES round-robin algorithm in
// src/app/api/leagues/route.js (lines 206-228).
// Teams are represented as integer indices; null = bye slot.
function generateRoundRobin(numSlots) {
  const rounds = numSlots % 2 === 0 ? numSlots - 1 : numSlots;

  const slotIds = Array.from({ length: numSlots }, (_, i) => i);
  if (numSlots % 2 !== 0) slotIds.push(null);
  const matchesPerRound = slotIds.length / 2; // must use post-null-append length

  const currentSlotIds = [...slotIds];
  const fixtures = [];

  for (let r = 0; r < rounds; r++) {
    const roundMatches = [];
    for (let m = 0; m < matchesPerRound; m++) {
      const home = currentSlotIds[m];
      const away = currentSlotIds[currentSlotIds.length - 1 - m];
      if (home !== null && away !== null) {
        roundMatches.push({ home, away });
      }
    }
    fixtures.push(roundMatches);

    const last = currentSlotIds.pop();
    currentSlotIds.splice(1, 0, last);
  }

  return fixtures;
}

// Helper: collect all canonical pairings (sorted pair) across all rounds
function allPairings(fixtures) {
  const pairs = [];
  for (const round of fixtures) {
    for (const { home, away } of round) {
      pairs.push([home, away].sort((a, b) => a - b).join("-"));
    }
  }
  return pairs;
}

// Helper: count how many times each team appears across all fixtures
function playCountMap(fixtures, numTeams) {
  const counts = new Map(Array.from({ length: numTeams }, (_, i) => [i, 0]));
  for (const round of fixtures) {
    for (const { home, away } of round) {
      counts.set(home, counts.get(home) + 1);
      counts.set(away, counts.get(away) + 1);
    }
  }
  return counts;
}

describe("GENERATE_FIXTURES round-robin algorithm", () => {
  describe("4 teams (even count)", () => {
    const fixtures = generateRoundRobin(4);

    it("produces n-1 = 3 rounds", () => {
      expect(fixtures).toHaveLength(3);
    });

    it("produces n/2 = 2 matches per round", () => {
      for (const round of fixtures) {
        expect(round).toHaveLength(2);
      }
    });

    it("generates all C(4,2) = 6 unique pairings", () => {
      const pairs = allPairings(fixtures);
      expect(new Set(pairs).size).toBe(6);
      expect(pairs).toHaveLength(6);
    });

    it("no team plays itself", () => {
      for (const round of fixtures) {
        for (const { home, away } of round) {
          expect(home).not.toBe(away);
        }
      }
    });

    it("each team plays exactly 3 matches (once per round)", () => {
      const counts = playCountMap(fixtures, 4);
      for (const count of counts.values()) {
        expect(count).toBe(3);
      }
    });
  });

  describe("5 teams (odd count — one bye per round)", () => {
    const fixtures = generateRoundRobin(5);

    it("produces n = 5 rounds", () => {
      expect(fixtures).toHaveLength(5);
    });

    it("produces floor(n/2) = 2 matches per round", () => {
      for (const round of fixtures) {
        expect(round).toHaveLength(2);
      }
    });

    it("no duplicate pairings across all rounds", () => {
      const pairs = allPairings(fixtures);
      expect(new Set(pairs).size).toBe(pairs.length);
    });

    it("no team plays itself", () => {
      for (const round of fixtures) {
        for (const { home, away } of round) {
          expect(home).not.toBe(away);
        }
      }
    });

    it("each team plays exactly 4 matches (sits out exactly once)", () => {
      const counts = playCountMap(fixtures, 5);
      for (const count of counts.values()) {
        expect(count).toBe(4);
      }
    });
  });

  describe("6 teams (even count)", () => {
    const fixtures = generateRoundRobin(6);

    it("produces n-1 = 5 rounds", () => {
      expect(fixtures).toHaveLength(5);
    });

    it("produces n/2 = 3 matches per round", () => {
      for (const round of fixtures) {
        expect(round).toHaveLength(3);
      }
    });

    it("generates all C(6,2) = 15 unique pairings", () => {
      const pairs = allPairings(fixtures);
      expect(new Set(pairs).size).toBe(15);
      expect(pairs).toHaveLength(15);
    });

    it("each team plays exactly 5 matches", () => {
      const counts = playCountMap(fixtures, 6);
      for (const count of counts.values()) {
        expect(count).toBe(5);
      }
    });
  });

  describe("3 teams (odd count)", () => {
    const fixtures = generateRoundRobin(3);

    it("produces 3 rounds", () => {
      expect(fixtures).toHaveLength(3);
    });

    it("produces 1 match per round (one team on bye)", () => {
      for (const round of fixtures) {
        expect(round).toHaveLength(1);
      }
    });

    it("each team plays 2 matches (sits out once)", () => {
      const counts = playCountMap(fixtures, 3);
      for (const count of counts.values()) {
        expect(count).toBe(2);
      }
    });
  });

  describe("2 teams (minimum)", () => {
    const fixtures = generateRoundRobin(2);

    it("produces 1 round with 1 match", () => {
      expect(fixtures).toHaveLength(1);
      expect(fixtures[0]).toHaveLength(1);
    });

    it("the two teams face each other", () => {
      const { home, away } = fixtures[0][0];
      expect(new Set([home, away])).toEqual(new Set([0, 1]));
    });
  });
});
