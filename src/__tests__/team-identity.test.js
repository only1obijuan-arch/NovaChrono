import { describe, expect, it } from "vitest";
import * as webIdentity from "@/utils/team-identity";
import * as mobileIdentity from "../../mobile/src/utils/team-identity";

const SHARED_SLOT = "slot-1";
const TEAM_A = "team-a";
const TEAM_B = "team-b";

const standings = [
  { team_id: TEAM_A, slot_id: SHARED_SLOT, played: 5, points: 7 },
  { team_id: TEAM_B, slot_id: SHARED_SLOT, played: 1, points: 1 },
];

const scorers = [
  { player_name: "Historical scorer", team_id: TEAM_A, team_slot_id: SHARED_SLOT, goals: 2 },
  { player_name: "Replacement scorer", team_id: TEAM_B, team_slot_id: SHARED_SLOT, goals: 1 },
];

const schedule = [
  { id: "historical-final", status: "final", home_team_id: TEAM_A, away_team_id: "opponent", home_slot_id: SHARED_SLOT },
  { id: "replacement-final", status: "final", home_team_id: TEAM_B, away_team_id: "opponent", home_slot_id: SHARED_SLOT },
];

describe.each([
  ["web", webIdentity],
  ["mobile", mobileIdentity],
])("historical client identity on %s", (_surface, identity) => {
  it("keeps old and replacement occupants independent despite their shared slot", () => {
    expect(standings[0].slot_id).toBe(standings[1].slot_id);

    expect(identity.findTeamStanding(standings, TEAM_A)).toMatchObject({ played: 5, points: 7 });
    expect(identity.findTeamStanding(standings, TEAM_B)).toMatchObject({ played: 1, points: 1 });
    expect(identity.findTeamPosition(standings, TEAM_A)).toBe(1);
    expect(identity.findTeamPosition(standings, TEAM_B)).toBe(2);

    expect(scorers.filter((scorer) => identity.scorerBelongsToTeam(scorer, TEAM_A)))
      .toEqual([scorers[0]]);
    expect(scorers.filter((scorer) => identity.scorerBelongsToTeam(scorer, TEAM_B)))
      .toEqual([scorers[1]]);

    expect(schedule.filter((match) => identity.matchBelongsToTeam(match, TEAM_A)).map((match) => match.id))
      .toEqual(["historical-final"]);
    expect(schedule.filter((match) => identity.matchBelongsToTeam(match, TEAM_B)).map((match) => match.id))
      .toEqual(["replacement-final"]);
    expect(identity.isHomeTeam(schedule[0], TEAM_A)).toBe(true);
    expect(identity.isHomeTeam(schedule[0], TEAM_B)).toBe(false);

    expect(standings.map(identity.standingRowKey)).toEqual([TEAM_A, TEAM_B]);
    expect(new Set(standings.map(identity.standingRowKey)).size).toBe(2);
  });
});
