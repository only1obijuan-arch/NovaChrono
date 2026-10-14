import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

const authState = vi.hoisted(() => ({ actorId: null }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => authState.actorId ? { user: { id: authState.actorId } } : null),
}));
vi.mock("@/app/api/utils/send-email", () => ({ sendEmail: vi.fn(async () => ({ id: "test-mail" })) }));
vi.mock("@/app/api/utils/send-push", () => ({ sendPush: vi.fn(async () => ({ success: true })) }));

import { pool } from "@/app/api/utils/db";
import { withTransaction } from "@/app/api/utils/sql";
import { DELETE as deleteReferee, POST as createReferee } from "@/app/api/admin/referees/route";
import { DELETE as deleteUser } from "@/app/api/super-admin/users/route";
import { GET as getTeams, POST as teamCommand } from "@/app/api/teams/route";
import { POST as refreshMobile } from "@/app/api/auth/mobile-refresh/route";
import { GET as getMatches, POST as matchCommand } from "@/app/api/matches/route";
import { GET as getStats } from "@/app/api/stats/route";
import { GET as getLeague, POST as leagueCommand } from "@/app/api/leagues/route";
import { POST as postponeRoundCommand } from "@/app/api/leagues/postpone-round/route";
import { recomputeLeagueStandings } from "@/app/api/matches/standings";
import { fixtureScheduleKey, refereeScheduleKey } from "@/app/api/matches/scheduling";

const IDS = {
  orgA: "10000000-0000-4000-8000-000000000001",
  orgB: "10000000-0000-4000-8000-000000000002",
  venueA: "20000000-0000-4000-8000-000000000001",
  venueB: "20000000-0000-4000-8000-000000000002",
  super: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  venueAdminA: "30000000-0000-4000-8000-000000000002",
  venueAdminB: "30000000-0000-4000-8000-000000000003",
  orgAdminA: "30000000-0000-4000-8000-000000000004",
  captain: "30000000-0000-4000-8000-000000000005",
  referee: "30000000-0000-4000-8000-000000000006",
  protectedReferee: "30000000-0000-4000-8000-000000000007",
  mobile: "30000000-0000-4000-8000-000000000008",
  foreignReferee: "30000000-0000-4000-8000-000000000009",
  league: "40000000-0000-4000-8000-000000000001",
  leagueB: "40000000-0000-4000-8000-000000000002",
  slotA: "50000000-0000-4000-8000-000000000001",
  slotB: "50000000-0000-4000-8000-000000000002",
  slotC: "50000000-0000-4000-8000-000000000003",
  slotD: "50000000-0000-4000-8000-000000000004",
  team: "60000000-0000-4000-8000-000000000001",
  teamB: "60000000-0000-4000-8000-000000000002",
  teamC: "60000000-0000-4000-8000-000000000003",
  teamD: "60000000-0000-4000-8000-000000000004",
  playerA: "61000000-0000-4000-8000-000000000001",
  playerB: "61000000-0000-4000-8000-000000000002",
  match: "70000000-0000-4000-8000-000000000001",
  protectedMatch: "70000000-0000-4000-8000-000000000002",
  match2: "70000000-0000-4000-8000-000000000003",
  match3: "70000000-0000-4000-8000-000000000004",
  match4: "70000000-0000-4000-8000-000000000005",
};

const request = (url, method = "GET", body) => new Request(`https://example.test${url}`, {
  method,
  ...(body === undefined ? {} : {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
});

describe("Gate 4B lifecycle concurrency and historical identity", () => {
  const withdraw = (teamId, bearer = null) => postTeam({
    action: "WITHDRAW_TEAM",
    teamId,
    reason: "Gate 4B integration withdrawal",
    policy: "VACATE_FOR_REPLACEMENT",
  }, bearer);
  const replace = (priorTeamId, name, bearer = null) => postTeam({
    action: "REPLACE_TEAM",
    priorTeamId,
    teamName: name,
    transferFutureFixtures: true,
    reason: "Gate 4B integration replacement",
  }, bearer);
  const completeValidSeason = async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE matches SET status = 'cancelled' WHERE league_id = $1", [IDS.league]);
    await pool.query("UPDATE matches SET status = 'final', home_score = 2, away_score = 0 WHERE id = $1", [IDS.match]);
    const response = await postLeague({ action: "COMPLETE_SEASON", leagueId: IDS.league });
    expect(response.status).toBe(200);
  };

  it("enforces the Gate 4B foreign keys, triggers, distinct-team check, and active-slot index", async () => {
    const constraints = (await pool.query(`
      SELECT conname, contype, convalidated
      FROM pg_constraint
      WHERE conrelid = 'matches'::regclass
        AND conname IN ('matches_home_team_id_fkey', 'matches_away_team_id_fkey', 'matches_distinct_team_ids_check')
      ORDER BY conname
    `)).rows;
    expect(constraints).toEqual([
      { conname: "matches_away_team_id_fkey", contype: "f", convalidated: true },
      { conname: "matches_distinct_team_ids_check", contype: "c", convalidated: true },
      { conname: "matches_home_team_id_fkey", contype: "f", convalidated: true },
    ]);

    const triggers = (await pool.query(`
      SELECT tgname
      FROM pg_trigger
      WHERE tgrelid IN ('matches'::regclass, 'teams'::regclass)
        AND NOT tgisinternal
        AND tgname IN ('matches_team_identity_guard', 'teams_historical_identity_guard')
      ORDER BY tgname
    `)).rows.map((row) => row.tgname);
    expect(triggers).toEqual(["matches_team_identity_guard", "teams_historical_identity_guard"]);

    const [activeSlotIndex] = (await pool.query(`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'teams_one_active_per_slot'
    `)).rows;
    expect(activeSlotIndex.indexdef).toContain("UNIQUE INDEX");
    expect(activeSlotIndex.indexdef).toContain("WHERE ((status = 'active'::text) AND (slot_id IS NOT NULL))");

    await expect(pool.query(
      "INSERT INTO teams (league_id, slot_id, name, status) VALUES ($1, $2, 'Duplicate occupant', 'active')",
      [IDS.league, IDS.slotA],
    )).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query(
      "UPDATE teams SET league_id = $1, slot_id = $2 WHERE id = $3",
      [IDS.leagueB, IDS.slotC, IDS.team],
    )).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query(
      "UPDATE matches SET home_team_id = $1 WHERE id = $2",
      [IDS.teamB, IDS.match],
    )).rejects.toMatchObject({ code: "P0001" });

    await pool.query("ALTER TABLE matches DISABLE TRIGGER matches_team_identity_guard");
    try {
      await expect(pool.query(
        "UPDATE matches SET home_team_id = $1 WHERE id = $2",
        ["60000000-0000-4000-8000-000000000099", IDS.match],
      )).rejects.toMatchObject({ code: "23503" });
      await expect(pool.query(
        "UPDATE matches SET away_team_id = home_team_id WHERE id = $1",
        [IDS.match],
      )).rejects.toMatchObject({ code: "23514" });
    } finally {
      await pool.query("ALTER TABLE matches ENABLE TRIGGER matches_team_identity_guard");
    }
  });

  it("A: serializes two JOIN_LEAGUE calls claiming the final free slot", async () => {
    await pool.query("UPDATE leagues SET status = 'registration' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE teams SET status = 'inactive' WHERE id = $1", [IDS.team]);
    authState.actorId = null;
    const captainToken = await issueActorToken(IDS.captain, "join-final-slot");
    const blocker = await pool.connect();
    let first;
    let second;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM leagues WHERE id = $1 FOR UPDATE", [IDS.league]);
      first = postTeam({ action: "JOIN_LEAGUE", joinCode: "G2ROUTE1", teamName: "First claimant" }, captainToken);
      second = postTeam({ action: "JOIN_LEAGUE", joinCode: "G2ROUTE1", teamName: "Second claimant" }, captainToken);
      await waitForLockQueue("UPPER(l.join_code)", "JOIN_LEAGUE never waited on the league lock");
      await blocker.query("COMMIT");
      expect((await Promise.all([first, second])).map((response) => response.status).sort()).toEqual([200, 409]);
      expect(Number((await pool.query("SELECT count(*) FROM teams WHERE slot_id = $1 AND status = 'active'", [IDS.slotA])).rows[0].count)).toBe(1);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (first) await first.catch(() => {});
      if (second) await second.catch(() => {});
    }
  }, 20_000);

  it("B: serializes JOIN_LEAGUE against ADD_TEAM for the final free slot", async () => {
    await pool.query("UPDATE leagues SET status = 'registration' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE teams SET status = 'inactive' WHERE id = $1", [IDS.team]);
    authState.actorId = null;
    const captainToken = await issueActorToken(IDS.captain, "join-v-add-captain");
    const adminToken = await issueActorToken(IDS.super, "join-v-add-admin");
    const blocker = await pool.connect();
    let joinRequest;
    let addRequest;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM leagues WHERE id = $1 FOR UPDATE", [IDS.league]);
      joinRequest = postTeam({ action: "JOIN_LEAGUE", joinCode: "G2ROUTE1", teamName: "Captain claimant" }, captainToken);
      addRequest = postTeam({ action: "ADD_TEAM", leagueId: IDS.league, teamName: "Admin claimant" }, adminToken);
      await waitForLockQueue("FROM leagues l", "slot claimants never waited on the league lock");
      await blocker.query("COMMIT");
      expect((await Promise.all([joinRequest, addRequest])).map((response) => response.status).sort()).toEqual([200, 409]);
      expect(Number((await pool.query("SELECT count(*) FROM teams WHERE slot_id = $1 AND status = 'active'", [IDS.slotA])).rows[0].count)).toBe(1);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (joinRequest) await joinRequest.catch(() => {});
      if (addRequest) await addRequest.catch(() => {});
    }
  }, 20_000);

  it("C: allows only one of two replacements for the same vacant slot", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE teams SET status = 'inactive' WHERE id = $1", [IDS.team]);
    authState.actorId = null;
    const adminToken = await issueActorToken(IDS.super, "double-replace");
    const blocker = await pool.connect();
    let first;
    let second;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match]);
      first = replace(IDS.team, "Replacement One", adminToken);
      second = replace(IDS.team, "Replacement Two", adminToken);
      await waitForLockQueue("WHERE id = ANY", "REPLACE_TEAM never waited on the match row");
      await blocker.query("COMMIT");
      expect((await Promise.all([first, second])).map((response) => response.status).sort()).toEqual([200, 409]);
      expect(Number((await pool.query("SELECT count(*) FROM teams WHERE slot_id = $1 AND status = 'active'", [IDS.slotA])).rows[0].count)).toBe(1);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (first) await first.catch(() => {});
      if (second) await second.catch(() => {});
    }
  }, 20_000);

  it("D: withdrawal racing START_MATCH produces one valid winner", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    authState.actorId = null;
    const adminToken = await issueActorToken(IDS.super, "withdraw-v-start-admin");
    const refereeToken = await issueActorToken(IDS.referee, "withdraw-v-start-referee");
    const blocker = await pool.connect();
    let withdrawal;
    let start;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match]);
      withdrawal = withdraw(IDS.team, adminToken);
      start = postMatchAs({ action: "START_MATCH", matchId: IDS.match }, refereeToken);
      await waitForLockQueue("FOR UPDATE OF m", "START_MATCH never waited on the match row");
      await blocker.query("COMMIT");
      expect((await Promise.all([withdrawal, start])).map((response) => response.status).sort()).toEqual([200, 409]);
      const state = (await pool.query("SELECT m.status, t.status AS team_status FROM matches m JOIN teams t ON t.id = $2 WHERE m.id = $1", [IDS.match, IDS.team])).rows[0];
      expect(["active:live", "inactive:scheduled"]).toContain(`${state.team_status}:${state.status}`);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (withdrawal) await withdrawal.catch(() => {});
      if (start) await start.catch(() => {});
    }
  }, 20_000);

  it("E: withdrawal racing FORFEIT_MATCH never resolves an inactive participant", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    authState.actorId = null;
    const adminToken = await issueActorToken(IDS.super, "withdraw-v-forfeit");
    const blocker = await pool.connect();
    let withdrawal;
    let forfeit;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match]);
      withdrawal = withdraw(IDS.team, adminToken);
      forfeit = postMatchAs({ action: "FORFEIT_MATCH", matchId: IDS.match, winnerSide: "away", reason: "race" }, adminToken);
      await waitForLockQueue("FOR UPDATE OF m", "FORFEIT_MATCH never waited on the match row");
      await blocker.query("COMMIT");
      const statuses = (await Promise.all([withdrawal, forfeit])).map((response) => response.status);
      expect(statuses.every((status) => [200, 409].includes(status))).toBe(true);
      const state = (await pool.query("SELECT m.status, t.status AS team_status FROM matches m JOIN teams t ON t.id = $2 WHERE m.id = $1", [IDS.match, IDS.team])).rows[0];
      expect(state.team_status).toBe("inactive");
      expect(["scheduled", "final"]).toContain(state.status);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (withdrawal) await withdrawal.catch(() => {});
      if (forfeit) await forfeit.catch(() => {});
    }
  }, 20_000);

  it("F: replacement racing fixture edit preserves both updates", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE teams SET status = 'inactive' WHERE id = $1", [IDS.team]);
    authState.actorId = null;
    const adminToken = await issueActorToken(IDS.super, "replace-v-edit");
    const blocker = await pool.connect();
    let replacement;
    let edit;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match]);
      replacement = replace(IDS.team, "Edit Race Replacement", adminToken);
      edit = postMatchAs({ action: "EDIT_FIXTURE", matchId: IDS.match, matchDate: "2030-03-05", timeSlot: "18:30", fieldNumber: 1, refereeId: IDS.referee }, adminToken);
      await waitForLockQueue("FOR UPDATE OF m", "fixture edit never waited on the match row");
      await blocker.query("COMMIT");
      expect((await Promise.all([replacement, edit])).map((response) => response.status)).toEqual([200, 200]);
      const state = (await pool.query("SELECT home_team_id, nova_planned_date(match_date)::text AS match_date FROM matches WHERE id = $1", [IDS.match])).rows[0];
      expect(state.home_team_id).not.toBe(IDS.team);
      expect(state.match_date).toBe("2030-03-05");
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (replacement) await replacement.catch(() => {});
      if (edit) await edit.catch(() => {});
    }
  }, 20_000);

  it("G: replacement racing round-postpone preserves team identity and date shift", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE teams SET status = 'inactive' WHERE id = $1", [IDS.team]);
    authState.actorId = null;
    const adminToken = await issueActorToken(IDS.super, "replace-v-round");
    const blocker = await pool.connect();
    let replacement;
    let postpone;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match4]);
      replacement = replace(IDS.team, "Round Race Replacement", adminToken);
      postpone = postPostponeRoundAs({ league_id: IDS.league, round_number: 5 }, adminToken);
      await waitForLockQueue("WHERE id =", "round lifecycle operations never waited on the match row");
      await blocker.query("COMMIT");
      expect((await Promise.all([replacement, postpone])).map((response) => response.status)).toEqual([200, 200]);
      const state = (await pool.query("SELECT home_team_id, nova_planned_date(match_date)::text AS match_date FROM matches WHERE id = $1", [IDS.match4])).rows[0];
      expect(state.home_team_id).not.toBe(IDS.team);
      expect(state.match_date).toBe("2030-02-05");
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (replacement) await replacement.catch(() => {});
      if (postpone) await postpone.catch(() => {});
    }
  }, 20_000);

  it("H: competing replacements of two historical occupants leave one active team", async () => {
    const historicalId = "60000000-0000-4000-8000-000000000099";
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE teams SET status = 'inactive' WHERE id = $1", [IDS.team]);
    await pool.query("INSERT INTO teams (id, league_id, slot_id, name, status) VALUES ($1, $2, $3, 'Older occupant', 'inactive')", [historicalId, IDS.league, IDS.slotA]);
    authState.actorId = null;
    const adminToken = await issueActorToken(IDS.super, "competing-history-replace");
    const blocker = await pool.connect();
    let first;
    let second;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM leagues WHERE id = $1 FOR UPDATE", [IDS.league]);
      first = replace(IDS.team, "Recent replacement", adminToken);
      second = replace(historicalId, "Older replacement", adminToken);
      await waitForLockQueue("FROM leagues l", "competing replacements never waited on the league lock");
      await blocker.query("COMMIT");
      expect((await Promise.all([first, second])).map((response) => response.status).sort()).toEqual([200, 409]);
      expect(Number((await pool.query("SELECT count(*) FROM teams WHERE slot_id = $1 AND status = 'active'", [IDS.slotA])).rows[0].count)).toBe(1);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (first) await first.catch(() => {});
      if (second) await second.catch(() => {});
    }
  }, 20_000);

  it("I: COMPLETE_SEASON racing finalisation cannot complete with a live match", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE matches SET status = CASE WHEN id = $1 THEN 'live' ELSE 'cancelled' END", [IDS.match]);
    authState.actorId = null;
    const adminToken = await issueActorToken(IDS.super, "complete-v-final-admin");
    const refereeToken = await issueActorToken(IDS.referee, "complete-v-final-referee");
    const blocker = await pool.connect();
    let completion;
    let finalisation;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match]);
      completion = postLeagueAs({ action: "COMPLETE_SEASON", leagueId: IDS.league }, adminToken);
      finalisation = postMatchAs({ action: "END_MATCH", matchId: IDS.match }, refereeToken);
      await waitForLockQueue("FOR UPDATE OF m", "match finalisation never waited on the match row");
      await blocker.query("COMMIT");
      const statuses = (await Promise.all([completion, finalisation])).map((response) => response.status);
      expect(statuses.every((status) => [200, 409].includes(status))).toBe(true);
      const state = (await pool.query("SELECT l.status AS league_status, m.status AS match_status FROM leagues l JOIN matches m ON m.league_id = l.id WHERE l.id = $1 AND m.id = $2", [IDS.league, IDS.match])).rows[0];
      expect(state.match_status).toBe("final");
      expect(["active", "completed"]).toContain(state.league_status);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (completion) await completion.catch(() => {});
      if (finalisation) await finalisation.catch(() => {});
    }
  }, 20_000);

  it("J: standings recompute racing replacement retains old totals and seeds new zero", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE matches SET status = CASE WHEN id = $1 THEN 'final' ELSE 'cancelled' END, home_score = CASE WHEN id = $1 THEN 2 ELSE 0 END, away_score = 0", [IDS.match]);
    await pool.query("UPDATE teams SET status = 'inactive' WHERE id = $1", [IDS.team]);
    authState.actorId = null;
    const adminToken = await issueActorToken(IDS.super, "standings-v-replace");
    const blocker = await pool.connect();
    let replacement;
    let rebuild;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM leagues WHERE id = $1 FOR UPDATE", [IDS.league]);
      replacement = replace(IDS.team, "Standings Race Replacement", adminToken);
      rebuild = withTransaction((txSql) => recomputeLeagueStandings(txSql, IDS.league));
      await waitForLockQueue("SELECT id, win_points, draw_points", "standings rebuild never waited on the league lock");
      await blocker.query("COMMIT");
      await Promise.all([replacement, rebuild]);
      const rows = (await pool.query("SELECT s.team_id, s.played, s.points, t.status FROM standings s JOIN teams t ON t.id = s.team_id WHERE s.league_id = $1 ORDER BY t.created_at", [IDS.league])).rows;
      expect(rows.find((row) => row.team_id === IDS.team)).toMatchObject({ played: 1, points: 3, status: "inactive" });
      expect(rows.find((row) => row.status === "active" && row.team_id !== IDS.teamB)).toMatchObject({ played: 0, points: 0 });
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (replacement) await replacement.catch(() => {});
      if (rebuild) await rebuild.catch(() => {});
    }
  }, 20_000);

  it("keeps a replacement team's standings and public history independent", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    const scores = [[2, 0], [1, 1], [0, 1], [3, 0], [1, 2]];
    for (let index = 0; index < scores.length; index += 1) {
      await pool.query("UPDATE matches SET status = 'final', home_score = $2, away_score = $3 WHERE id = $1", [[IDS.match, IDS.protectedMatch, IDS.match2, IDS.match3, IDS.match4][index], scores[index][0], scores[index][1]]);
    }
    await pool.query(
      "INSERT INTO match_events (match_id, type, player_id, team_id) VALUES ($1, 'goal_home', $2, $3)",
      [IDS.match, IDS.playerA, IDS.team],
    );
    const futureScheduled = "70000000-0000-4000-8000-000000000090";
    const futurePostponed = "70000000-0000-4000-8000-000000000091";
    await pool.query(`
      INSERT INTO matches (id, league_id, round_number, match_date, time_slot, field_number,
        home_slot_id, away_slot_id, home_team_id, away_team_id, status)
      VALUES
        ($1, $3, 90, DATE '2031-01-01', '18:30', 1, $4, $5, $6, $7, 'scheduled'),
        ($2, $3, 91, DATE '2031-01-08', '18:30', 1, $4, $5, $6, $7, 'postponed')
    `, [futureScheduled, futurePostponed, IDS.league, IDS.slotA, IDS.slotB, IDS.team, IDS.teamB]);
    await withTransaction((txSql) => recomputeLeagueStandings(txSql, IDS.league));
    expect((await withdraw(IDS.team)).status).toBe(200);
    const replacementResponse = await replace(IDS.team, "Nova Successor");
    expect(replacementResponse.status).toBe(200);
    const replacementTeam = (await replacementResponse.json()).team;

    const historical = (await pool.query("SELECT count(*)::int AS count FROM matches WHERE status = 'final' AND home_team_id = $1", [IDS.team])).rows[0];
    expect(historical.count).toBe(5);
    expect((await pool.query("SELECT count(*)::int AS count FROM matches WHERE id IN ($1, $2) AND home_team_id = $3", [futureScheduled, futurePostponed, replacementTeam.id])).rows[0].count).toBe(2);
    const initialRows = (await pool.query("SELECT team_id, played, won, drawn, lost, points FROM standings WHERE league_id = $1", [IDS.league])).rows;
    expect(initialRows.find((row) => row.team_id === IDS.team)).toMatchObject({ played: 5, won: 2, drawn: 1, lost: 2, points: 7 });
    expect(initialRows.find((row) => row.team_id === replacementTeam.id)).toMatchObject({ played: 0, won: 0, drawn: 0, lost: 0, points: 0 });

    const stats = await (await getStats(request(`/api/stats?leagueId=${IDS.league}`))).json();
    expect(stats.standings.find((row) => row.team_id === IDS.team).form_last5).toEqual(["L", "W", "L", "D", "W"]);
    expect(stats.standings.find((row) => row.team_id === replacementTeam.id).form_last5).toEqual([]);
    expect(stats.topScorers.find((row) => row.player_name === "Home Player")).toMatchObject({
      team_id: IDS.team,
      team_slot_id: IDS.slotA,
    });
    const fixtureHistory = await (await getMatches(request(`/api/matches?leagueId=${IDS.league}`))).json();
    expect(fixtureHistory.filter((match) => match.status === "final").every((match) => match.home_team_name === "Nova United")).toBe(true);
    expect(fixtureHistory.find((match) => match.id === futureScheduled).home_team_name).toBe("Nova Successor");

    expect((await postMatch({ action: "ADMIN_OVERRIDE", matchId: futureScheduled, homeScore: 1, awayScore: 1, status: "final", reason: "replacement oracle" })).status).toBe(200);
    const finalRows = (await pool.query("SELECT team_id, played, points FROM standings WHERE league_id = $1", [IDS.league])).rows;
    expect(finalRows.find((row) => row.team_id === IDS.team)).toMatchObject({ played: 5, points: 7 });
    expect(finalRows.find((row) => row.team_id === replacementTeam.id)).toMatchObject({ played: 1, points: 1 });
  });

  it.each(["scheduled", "live", "postponed"])("rejects season completion while a %s fixture remains", async (status) => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE matches SET status = 'cancelled'");
    await pool.query("UPDATE matches SET status = $1 WHERE id = $2", [status, IDS.match]);
    const response = await postLeague({ action: "COMPLETE_SEASON", leagueId: IDS.league });
    expect(response.status).toBe(409);
    expect((await pool.query("SELECT status FROM leagues WHERE id = $1", [IDS.league])).rows[0].status).toBe("active");
  });

  it("completes only final/cancelled seasons, audits once, and retries idempotently", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE matches SET status = 'cancelled'");
    await pool.query("UPDATE matches SET status = 'final', home_score = 2, away_score = 0 WHERE id = $1", [IDS.match]);
    expect((await postLeague({ action: "COMPLETE_SEASON", leagueId: IDS.league })).status).toBe(200);
    expect((await postLeague({ action: "COMPLETE_SEASON", leagueId: IDS.league })).status).toBe(200);
    expect((await pool.query("SELECT status FROM leagues WHERE id = $1", [IDS.league])).rows[0].status).toBe("completed");
    expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE action_type = 'COMPLETE_SEASON' AND target_id = $1", [IDS.league])).rows[0].count)).toBe(1);
    expect((await pool.query("SELECT played, points FROM standings WHERE league_id = $1 AND team_id = $2", [IDS.league, IDS.team])).rows[0]).toMatchObject({ played: 1, points: 3 });
  });

  it("blocks final-to-scheduled override after season completion", async () => {
    await completeValidSeason();
    const response = await postMatch({
      action: "ADMIN_OVERRIDE",
      matchId: IDS.match,
      homeScore: 2,
      awayScore: 0,
      status: "scheduled",
      reason: "Attempted completed-season reopen",
    });
    expect(response.status).toBe(409);
    expect((await pool.query("SELECT status FROM matches WHERE id = $1", [IDS.match])).rows[0].status).toBe("final");
    expect((await pool.query("SELECT status FROM leagues WHERE id = $1", [IDS.league])).rows[0].status).toBe("completed");
    expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE action_type = 'ADMIN_OVERRIDE' AND target_id = $1", [IDS.match])).rows[0].count)).toBe(0);
  });

  it("serializes completion ahead of a queued final-to-scheduled override", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE matches SET status = 'cancelled' WHERE league_id = $1", [IDS.league]);
    await pool.query("UPDATE matches SET status = 'final', home_score = 2, away_score = 0 WHERE id = $1", [IDS.match]);
    authState.actorId = null;
    const completeToken = await issueActorToken(IDS.super, "complete-before-reopen");
    const overrideToken = await issueActorToken(IDS.venueAdminA, "reopen-after-complete");
    const blocker = await pool.connect();
    let completion;
    let override;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match]);
      completion = postLeagueAs({ action: "COMPLETE_SEASON", leagueId: IDS.league }, completeToken);
      await waitForLockQueue("WHERE id = ANY", "COMPLETE_SEASON never queued before the reopen attempt");
      override = postMatchAs({
        action: "ADMIN_OVERRIDE",
        matchId: IDS.match,
        homeScore: 2,
        awayScore: 0,
        status: "scheduled",
        reason: "Queued completed-season reopen",
      }, overrideToken);
      await waitForLockQueue("FOR UPDATE OF m", "ADMIN_OVERRIDE never queued behind completion");
      await blocker.query("COMMIT");
      expect((await completion).status).toBe(200);
      expect((await override).status).toBe(409);
      expect((await pool.query("SELECT l.status AS league_status, m.status AS match_status FROM leagues l JOIN matches m ON m.league_id = l.id WHERE l.id = $1 AND m.id = $2", [IDS.league, IDS.match])).rows[0])
        .toMatchObject({ league_status: "completed", match_status: "final" });
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (completion) await completion.catch(() => {});
      if (override) await override.catch(() => {});
    }
  }, 20_000);

  it("blocks START_MATCH in a completed league even if a scheduled row already exists", async () => {
    await completeValidSeason();
    await pool.query("UPDATE matches SET status = 'scheduled' WHERE id = $1", [IDS.match]);
    authState.actorId = IDS.referee;
    const response = await postMatch({ action: "START_MATCH", matchId: IDS.match });
    expect(response.status).toBe(409);
    expect((await pool.query("SELECT status FROM matches WHERE id = $1", [IDS.match])).rows[0].status).toBe("scheduled");
    expect(await eventCount(IDS.match, "start_first_half")).toBe(0);
  });

  it("blocks a new FORFEIT_MATCH result in a completed league", async () => {
    await completeValidSeason();
    await pool.query("UPDATE matches SET status = 'scheduled', result_type = 'played', home_score = 0, away_score = 0 WHERE id = $1", [IDS.match]);
    const response = await postMatch({ action: "FORFEIT_MATCH", matchId: IDS.match, winnerSide: "home", reason: "Attempted completed-season forfeit" });
    expect(response.status).toBe(409);
    expect((await pool.query("SELECT status, result_type, home_score, away_score FROM matches WHERE id = $1", [IDS.match])).rows[0])
      .toMatchObject({ status: "scheduled", result_type: "played", home_score: 0, away_score: 0 });
    expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE action_type = 'FORFEIT_MATCH' AND target_id = $1", [IDS.match])).rows[0].count)).toBe(0);
  });

  it("serializes completion ahead of a queued new forfeit result", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE matches SET status = 'cancelled' WHERE league_id = $1", [IDS.league]);
    await pool.query("UPDATE matches SET status = 'final', result_type = 'played', home_score = 2, away_score = 0 WHERE id = $1", [IDS.match]);
    authState.actorId = null;
    const completeToken = await issueActorToken(IDS.super, "complete-before-forfeit");
    const forfeitToken = await issueActorToken(IDS.venueAdminA, "forfeit-after-complete");
    const blocker = await pool.connect();
    let completion;
    let forfeit;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match]);
      completion = postLeagueAs({ action: "COMPLETE_SEASON", leagueId: IDS.league }, completeToken);
      await waitForLockQueue("WHERE id = ANY", "COMPLETE_SEASON never queued before the forfeit attempt");
      forfeit = postMatchAs({ action: "FORFEIT_MATCH", matchId: IDS.match, winnerSide: "away", reason: "Queued completed-season forfeit" }, forfeitToken);
      await waitForLockQueue("FOR UPDATE OF m", "FORFEIT_MATCH never queued behind completion");
      await blocker.query("COMMIT");
      expect((await completion).status).toBe(200);
      expect((await forfeit).status).toBe(409);
      expect((await pool.query("SELECT l.status AS league_status, m.status AS match_status, m.result_type FROM leagues l JOIN matches m ON m.league_id = l.id WHERE l.id = $1 AND m.id = $2", [IDS.league, IDS.match])).rows[0])
        .toMatchObject({ league_status: "completed", match_status: "final", result_type: "played" });
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (completion) await completion.catch(() => {});
      if (forfeit) await forfeit.catch(() => {});
    }
  }, 20_000);

  it("allows final-to-final correction after completion", async () => {
    await completeValidSeason();
    const response = await postMatch({
      action: "ADMIN_OVERRIDE",
      matchId: IDS.match,
      homeScore: 1,
      awayScore: 1,
      status: "final",
      reason: "Official correction after completion",
    });
    expect(response.status).toBe(200);
    expect((await pool.query("SELECT status, home_score, away_score FROM matches WHERE id = $1", [IDS.match])).rows[0])
      .toMatchObject({ status: "final", home_score: 1, away_score: 1 });
    expect((await pool.query("SELECT status FROM leagues WHERE id = $1", [IDS.league])).rows[0].status).toBe("completed");
  });

  it("rejects idempotent completion when a completed league contains an unresolved fixture", async () => {
    await completeValidSeason();
    await pool.query("UPDATE matches SET status = 'scheduled' WHERE id = $1", [IDS.match]);
    const response = await postLeague({ action: "COMPLETE_SEASON", leagueId: IDS.league });
    expect(response.status).toBe(409);
    expect((await response.json()).unresolvedMatchIds).toEqual([IDS.match]);
    expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE action_type = 'COMPLETE_SEASON' AND target_id = $1", [IDS.league])).rows[0].count)).toBe(1);
  });

  it("preserves exact FORFEIT_MATCH idempotency after completion", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE matches SET status = 'cancelled' WHERE league_id = $1", [IDS.league]);
    await pool.query("UPDATE matches SET status = 'scheduled' WHERE id = $1", [IDS.match]);
    expect((await postMatch({ action: "FORFEIT_MATCH", matchId: IDS.match, winnerSide: "home", reason: "No-show" })).status).toBe(200);
    expect((await postLeague({ action: "COMPLETE_SEASON", leagueId: IDS.league })).status).toBe(200);
    const retry = await postMatch({ action: "FORFEIT_MATCH", matchId: IDS.match, winnerSide: "home", reason: "Retry" });
    expect(retry.status).toBe(200);
    expect((await retry.json()).idempotent).toBe(true);
    expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE action_type = 'FORFEIT_MATCH' AND target_id = $1", [IDS.match])).rows[0].count)).toBe(1);
  });

  it("rejects start and forfeit while a withdrawn team still owns the fixture", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE teams SET status = 'inactive' WHERE id = $1", [IDS.team]);
    authState.actorId = IDS.referee;
    expect((await postMatch({ action: "START_MATCH", matchId: IDS.match })).status).toBe(409);
    authState.actorId = IDS.super;
    expect((await postMatch({ action: "FORFEIT_MATCH", matchId: IDS.match, winnerSide: "away", reason: "Inactive participant" })).status).toBe(409);
    expect((await pool.query("SELECT status FROM matches WHERE id = $1", [IDS.match])).rows[0].status).toBe("scheduled");
  });

  it("allows start after explicit replacement transfers the fixture to an active team", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE teams SET status = 'inactive' WHERE id = $1", [IDS.team]);
    const replacementResponse = await replace(IDS.team, "Startable replacement");
    expect(replacementResponse.status).toBe(200);
    const replacementTeam = (await replacementResponse.json()).team;
    expect((await pool.query("SELECT home_team_id FROM matches WHERE id = $1", [IDS.match])).rows[0].home_team_id).toBe(replacementTeam.id);
    authState.actorId = IDS.referee;
    expect((await postMatch({ action: "START_MATCH", matchId: IDS.match })).status).toBe(200);
    expect((await pool.query("SELECT status FROM matches WHERE id = $1", [IDS.match])).rows[0].status).toBe("live");
  });

  it("WITHDRAW_TEAM rechecks a queued actor before mutation", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    authState.actorId = null;
    const token = await issueActorToken(IDS.venueAdminA, "withdraw-actor-recheck");
    const blocker = await pool.connect();
    let queued;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match]);
      queued = withdraw(IDS.team, token);
      await waitForLockQueue("WHERE id = ANY", "WITHDRAW_TEAM never queued on its lifecycle lock");
      await pool.query("UPDATE auth_users SET role = 'captain' WHERE id = $1", [IDS.venueAdminA]);
      await blocker.query("COMMIT");
      expect((await queued).status).toBe(403);
      expect((await pool.query("SELECT status FROM teams WHERE id = $1", [IDS.team])).rows[0].status).toBe("active");
      expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE action_type = 'WITHDRAW_TEAM' AND target_id = $1", [IDS.team])).rows[0].count)).toBe(0);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (queued) await queued.catch(() => {});
    }
  }, 20_000);

  it("REPLACE_TEAM rechecks a queued actor before mutation", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE teams SET status = 'inactive' WHERE id = $1", [IDS.team]);
    authState.actorId = null;
    const token = await issueActorToken(IDS.venueAdminA, "replace-actor-recheck");
    const blocker = await pool.connect();
    let queued;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match]);
      queued = replace(IDS.team, "Forbidden replacement", token);
      await waitForLockQueue("WHERE id = ANY", "REPLACE_TEAM never queued on its lifecycle lock");
      await pool.query("UPDATE auth_users SET role = 'captain' WHERE id = $1", [IDS.venueAdminA]);
      await blocker.query("COMMIT");
      expect((await queued).status).toBe(403);
      expect(Number((await pool.query("SELECT count(*) FROM teams WHERE slot_id = $1 AND status = 'active'", [IDS.slotA])).rows[0].count)).toBe(0);
      expect((await pool.query("SELECT home_team_id FROM matches WHERE id = $1", [IDS.match])).rows[0].home_team_id).toBe(IDS.team);
      expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE action_type = 'REPLACE_TEAM'", [])).rows[0].count)).toBe(0);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (queued) await queued.catch(() => {});
    }
  }, 20_000);

  it("COMPLETE_SEASON rechecks a queued actor before mutation", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    await pool.query("UPDATE matches SET status = 'cancelled' WHERE league_id = $1", [IDS.league]);
    authState.actorId = null;
    const token = await issueActorToken(IDS.venueAdminA, "complete-actor-recheck");
    const blocker = await pool.connect();
    let queued;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match]);
      queued = postLeagueAs({ action: "COMPLETE_SEASON", leagueId: IDS.league }, token);
      await waitForLockQueue("WHERE id = ANY", "COMPLETE_SEASON never queued on its lifecycle lock");
      await pool.query("UPDATE auth_users SET role = 'captain' WHERE id = $1", [IDS.venueAdminA]);
      await blocker.query("COMMIT");
      expect((await queued).status).toBe(403);
      expect((await pool.query("SELECT status FROM leagues WHERE id = $1", [IDS.league])).rows[0].status).toBe("active");
      expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE action_type = 'COMPLETE_SEASON' AND target_id = $1", [IDS.league])).rows[0].count)).toBe(0);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (queued) await queued.catch(() => {});
    }
  }, 20_000);

  it("requires a completed parent and creates a clean successor season", async () => {
    await pool.query("UPDATE leagues SET status = 'active' WHERE id = $1", [IDS.league]);
    const body = { action: "CREATE_NEW_SEASON", parentLeagueId: IDS.league, seasonName: "Successor", seasonStartDate: "2031-01-07" };
    expect((await postLeague(body)).status).toBe(409);
    await pool.query("UPDATE leagues SET status = 'completed' WHERE id = $1", [IDS.league]);
    const response = await postLeague(body);
    expect(response.status).toBe(200);
    const successor = await response.json();
    expect(Number((await pool.query("SELECT count(*) FROM league_slots WHERE league_id = $1", [successor.id])).rows[0].count)).toBe(2);
    expect(Number((await pool.query("SELECT count(*) FROM teams WHERE league_id = $1", [successor.id])).rows[0].count)).toBe(0);
    expect(Number((await pool.query("SELECT count(*) FROM matches WHERE league_id = $1", [successor.id])).rows[0].count)).toBe(0);
    expect(Number((await pool.query("SELECT count(*) FROM standings WHERE league_id = $1", [successor.id])).rows[0].count)).toBe(0);
  });
});

const resetDatabase = () => pool.query(`TRUNCATE TABLE
    auth_rate_limits, api_rate_limits, audit_logs, notifications, availability_responses, match_events,
    matches, standings, players, teams, league_slots, leagues, invite_tokens,
    mobile_sessions, password_reset_tokens, auth_accounts,
    auth_verification_token, auth_users, venues, organizations RESTART IDENTITY CASCADE`);

async function seed() {
  await resetDatabase();

  await pool.query(
    "INSERT INTO organizations (id, name) VALUES ($1, 'Org A'), ($2, 'Org B')",
    [IDS.orgA, IDS.orgB],
  );
  await pool.query(
    "INSERT INTO venues (id, organization_id, name) VALUES ($1, $2, 'Shared Arena'), ($3, $4, 'Shared Arena')",
    [IDS.venueA, IDS.orgA, IDS.venueB, IDS.orgB],
  );
  await pool.query(`
    INSERT INTO auth_users
      (id, name, email, role, venue_id, organization_id, field_number, "emailVerified")
    VALUES
      ($1, 'Platform', 'platform@example.test', 'super_admin', NULL, NULL, NULL, NOW()),
      ($2, 'Venue A', 'venue-a@example.test', 'venue_admin', $9, $10, NULL, NOW()),
      ($3, 'Venue B', 'venue-b@example.test', 'venue_admin', $11, $12, NULL, NOW()),
      ($4, 'Org A', 'org-a@example.test', 'org_admin', NULL, $10, NULL, NOW()),
      ($5, 'Captain', 'captain@example.test', 'captain', $9, $10, NULL, NOW()),
      ($6, 'Referee', 'ref-field1@sharedarena.novachrono.com', 'referee', $9, $10, 1, NOW()),
      ($7, 'Protected Referee', 'protected-ref@example.test', 'referee', $9, $10, 2, NOW()),
      ($8, 'Mobile User', 'mobile@example.test', 'captain', $9, $10, NULL, NOW()),
      ($13, 'Foreign Referee', 'foreign-ref@example.test', 'referee', $11, $12, 1, NOW())
  `, [
    IDS.super, IDS.venueAdminA, IDS.venueAdminB, IDS.orgAdminA,
    IDS.captain, IDS.referee, IDS.protectedReferee, IDS.mobile,
    IDS.venueA, IDS.orgA, IDS.venueB, IDS.orgB, IDS.foreignReferee,
  ]);
  await pool.query(`
    INSERT INTO leagues
      (id, venue_id, name, day_of_week, match_format, match_duration_minutes,
       fields_count, time_slots, max_teams, join_code, status)
    VALUES ($1, $2, 'League', 2, '2x20', 40, 1, '["18:30"]', 2, 'G2ROUTE1', 'active')
  `, [IDS.league, IDS.venueA]);
  await pool.query(`
    INSERT INTO leagues
      (id, venue_id, name, day_of_week, match_format, match_duration_minutes,
       fields_count, time_slots, max_teams, join_code, status, forfeit_score_home, forfeit_score_away)
    VALUES ($1, $2, 'League B', 2, '2x20', 40, 2, '["18:30","19:30"]', 2, 'G4ROUTE2', 'active', 5, 0)
  `, [IDS.leagueB, IDS.venueA]);
  await pool.query(
    "INSERT INTO league_slots (id, league_id, slot_number) VALUES ($1, $3, 1), ($2, $3, 2)",
    [IDS.slotA, IDS.slotB, IDS.league],
  );
  await pool.query(
    "INSERT INTO league_slots (id, league_id, slot_number) VALUES ($1, $3, 1), ($2, $3, 2)",
    [IDS.slotC, IDS.slotD, IDS.leagueB],
  );
  await pool.query(`
    INSERT INTO teams (id, league_id, slot_id, name, captain_user_id, created_at)
    VALUES
      ($1, $3, $4, 'Nova United', $6, TIMESTAMPTZ '2026-10-01 00:00:00+00'),
      ($2, $3, $5, 'Orion City', NULL, TIMESTAMPTZ '2026-10-02 00:00:00+00')
  `, [IDS.team, IDS.teamB, IDS.league, IDS.slotA, IDS.slotB, IDS.captain]);
  await pool.query(`
    INSERT INTO teams (id, league_id, slot_id, name)
    VALUES ($1, $3, $4, 'Cosmos FC'), ($2, $3, $5, 'Meteor FC')
  `, [IDS.teamC, IDS.teamD, IDS.leagueB, IDS.slotC, IDS.slotD]);
  await pool.query(
    "INSERT INTO players (id, team_id, name) VALUES ($1, $2, 'Home Player'), ($3, $4, 'Away Player')",
    [IDS.playerA, IDS.team, IDS.playerB, IDS.teamB],
  );
  await pool.query(
    "INSERT INTO standings (league_id, team_id) VALUES ($1, $2), ($1, $3)",
    [IDS.league, IDS.team, IDS.teamB],
  );
  await pool.query(
    "INSERT INTO standings (league_id, team_id) VALUES ($1, $2), ($1, $3)",
    [IDS.leagueB, IDS.teamC, IDS.teamD],
  );
  await pool.query(`
    INSERT INTO matches
      (id, league_id, round_number, match_date, time_slot, field_number,
       home_slot_id, away_slot_id, home_team_id, away_team_id, referee_id)
    VALUES
      ($1, $3, 1, DATE '2030-01-01', '18:30', 1, $4, $5, $11, $12, $6),
      ($2, $3, 2, DATE '2030-01-08', '18:30', 1, $4, $5, $11, $12, $7),
      ($8, $3, 3, DATE '2030-01-15', '18:30', 1, $4, $5, $11, $12, $6),
      ($9, $3, 4, DATE '2030-01-22', '18:30', 1, $4, $5, $11, $12, $6),
      ($10, $3, 5, DATE '2030-01-29', '18:30', 1, $4, $5, $11, $12, $6)
  `, [
    IDS.match, IDS.protectedMatch, IDS.league, IDS.slotA, IDS.slotB,
    IDS.referee, IDS.protectedReferee, IDS.match2, IDS.match3, IDS.match4,
    IDS.team, IDS.teamB,
  ]);
  await pool.query(`
    INSERT INTO invite_tokens
      (token, email, role, organization_id, venue_id, invited_by, used, expires_at)
    VALUES ('protected-history', 'history@example.test', 'venue_admin', $1, $2, $3, TRUE, NOW() - INTERVAL '1 day')
  `, [IDS.orgA, IDS.venueA, IDS.protectedReferee]);
  authState.actorId = IDS.super;
}

beforeEach(seed);
afterAll(async () => {
  await resetDatabase();
  await pool.end();
});

describe("FK-safe user deletion", () => {
  it("deletes a referee and preserves the match by nulling its assignment", async () => {
    const response = await deleteReferee(request(`/api/admin/referees?id=${IDS.referee}`, "DELETE"));
    expect(response.status).toBe(200);
    expect((await pool.query("SELECT count(*)::int AS count FROM auth_users WHERE id = $1", [IDS.referee])).rows[0].count).toBe(0);
    expect((await pool.query("SELECT referee_id FROM matches WHERE id = $1", [IDS.match])).rows[0].referee_id).toBeNull();
  });

  it("deletes a captain and preserves the team by nulling its captain", async () => {
    const response = await deleteUser(request(`/api/super-admin/users?id=${IDS.captain}`, "DELETE"));
    expect(response.status).toBe(200);
    expect((await pool.query("SELECT captain_user_id FROM teams WHERE id = $1", [IDS.team])).rows[0].captain_user_id).toBeNull();
  });

  it("returns 409 for protected history and rolls back the match update", async () => {
    const response = await deleteReferee(request(`/api/admin/referees?id=${IDS.protectedReferee}`, "DELETE"));
    expect(response.status).toBe(409);
    expect((await pool.query("SELECT referee_id FROM matches WHERE id = $1", [IDS.protectedMatch])).rows[0].referee_id).toBe(IDS.protectedReferee);
    expect((await pool.query("SELECT count(*)::int AS count FROM auth_users WHERE id = $1", [IDS.protectedReferee])).rows[0].count).toBe(1);
  });

  it("blocks self-deletion even when the UUID uses uppercase hex", async () => {
    const response = await deleteUser(request(`/api/super-admin/users?id=${IDS.super.toUpperCase()}`, "DELETE"));
    expect(response.status).toBe(400);
    expect((await pool.query("SELECT count(*)::int AS count FROM auth_users WHERE id = $1", [IDS.super])).rows[0].count).toBe(1);
  });
});

describe("tenant-safe projections and provisioning", () => {
  async function teamFor(actorId) {
    authState.actorId = actorId;
    const response = await getTeams(request(`/api/teams?leagueId=${IDS.league}`));
    expect(response.status).toBe(200);
    return (await response.json()).find((team) => team.id === IDS.team);
  }

  it.each([
    ["venue administrator", IDS.venueAdminA],
    ["organization administrator", IDS.orgAdminA],
    ["platform administrator", IDS.super],
  ])("returns captain and registration data to an in-scope %s", async (_label, actorId) => {
    expect(await teamFor(actorId)).toMatchObject({
      captain_user_id: IDS.captain,
      captain_name: "Captain",
      created_at: "2026-10-01T00:00:00.000Z",
    });
  });

  it.each([
    ["other tenant", IDS.venueAdminB],
    ["anonymous caller", null],
  ])("returns only the public five fields to an %s", async (_label, actorId) => {
    expect(Object.keys(await teamFor(actorId)).sort()).toEqual(["id", "league_id", "name", "slot_id", "status"]);
  });

  it("rejects a generated referee email already owned by another venue", async () => {
    authState.actorId = IDS.venueAdminB;
    const response = await createReferee(request("/api/admin/referees", "POST", {
      venueId: IDS.venueB,
      fieldNumber: 1,
    }));
    expect(response.status).toBe(409);
  });
});

describe("mobile refresh rotation", () => {
  it("allows exactly one concurrent exchange of a refresh token", async () => {
    const oldJti = "single-use-mobile-session";
    await pool.query(
      "INSERT INTO mobile_sessions (jti, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 day')",
      [oldJti, IDS.mobile],
    );
    const token = await new SignJWT({ id: IDS.mobile })
      .setProtectedHeader({ alg: "HS256" })
      .setJti(oldJti)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    const makeRequest = () => new Request("https://example.test/api/auth/mobile-refresh", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

    const responses = await Promise.all([refreshMobile(makeRequest()), refreshMobile(makeRequest())]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    const sessions = await pool.query("SELECT jti FROM mobile_sessions WHERE user_id = $1", [IDS.mobile]);
    expect(sessions.rowCount).toBe(1);
    expect(sessions.rows[0].jti).not.toBe(oldJti);
  });
});

const opId = (suffix) => `90000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const postMatch = (body) => matchCommand(request("/api/matches", "POST", body));
const postLeague = (body) => leagueCommand(request("/api/leagues", "POST", body));
const postPostponeRound = (body) => postponeRoundCommand(request("/api/leagues/postpone-round", "POST", body));
const postTeam = (body, bearer = null) => {
  const nextRequest = request("/api/teams", "POST", body);
  if (bearer) nextRequest.headers.set("authorization", `Bearer ${bearer}`);
  return teamCommand(nextRequest);
};
const postMatchAs = (body, bearer) => {
  const nextRequest = request("/api/matches", "POST", body);
  nextRequest.headers.set("authorization", `Bearer ${bearer}`);
  return matchCommand(nextRequest);
};
const postLeagueAs = (body, bearer) => {
  const nextRequest = request("/api/leagues", "POST", body);
  nextRequest.headers.set("authorization", `Bearer ${bearer}`);
  return leagueCommand(nextRequest);
};
const postPostponeRoundAs = (body, bearer) => {
  const nextRequest = request("/api/leagues/postpone-round", "POST", body);
  nextRequest.headers.set("authorization", `Bearer ${bearer}`);
  return postponeRoundCommand(nextRequest);
};
const eventCount = async (matchId, type) => Number((await pool.query(
  "SELECT count(*) FROM match_events WHERE match_id = $1 AND type = $2",
  [matchId, type],
)).rows[0].count);

async function waitForMatchRowLockQueue() {
  const observer = await pool.connect();
  try {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const { rows: [state] } = await observer.query(`
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND wait_event_type = 'Lock'
            AND query LIKE '%FOR UPDATE OF m%'
        ) AS waiting
      `);
      if (state.waiting) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Route request never queued on the locked match row");
  } finally {
    observer.release();
  }
}

async function waitForLockQueue(queryFragment, failureMessage) {
  const observer = await pool.connect();
  try {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const { rows: [state] } = await observer.query(`
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND wait_event_type = 'Lock'
            AND query LIKE $1
        ) AS waiting
      `, [`%${queryFragment}%`]);
      if (state.waiting) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const { rows } = await observer.query(`
      SELECT pid, state, wait_event_type, wait_event, query, pg_blocking_pids(pid) AS blockers
      FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
      ORDER BY pid
    `);
    throw new Error(`${failureMessage}: ${JSON.stringify(rows)}`);
  } finally {
    observer.release();
  }
}

async function setPoolSessionTimeZone(timeZone) {
  pool.options.options = `-c timezone=${timeZone}`;
  const clients = (pool._clients ?? []).filter((client) => (
    client._connected && !client._ending && !client._ended
  ));
  const results = await Promise.allSettled(clients.map((client) => (
    client.query("SELECT set_config('TimeZone', $1, false)", [timeZone])
  )));
  const unexpectedFailure = results.find((result) => (
    result.status === "rejected" && result.reason?.message !== "Connection terminated"
  ));
  if (unexpectedFailure) throw unexpectedFailure.reason;
}

async function issueActorToken(actorId, suffix) {
  const jti = `gate4b-${suffix}-${actorId}`;
  await pool.query(
    "INSERT INTO mobile_sessions (jti, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')",
    [jti, actorId],
  );
  return new SignJWT({ id: actorId })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
}

async function startMatch(matchId = IDS.match) {
  authState.actorId = IDS.referee;
  return postMatch({ action: "START_MATCH", matchId });
}

async function installFailureTrigger({ name, table, timing = "BEFORE", event, body }) {
  await pool.query(`
    CREATE OR REPLACE FUNCTION ${name}() RETURNS trigger AS $$
    BEGIN
      ${body}
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER ${name}_trigger ${timing} ${event} ON ${table}
    FOR EACH ROW EXECUTE FUNCTION ${name}();
  `);
}

async function removeFailureTrigger(name, table) {
  await pool.query(`DROP TRIGGER IF EXISTS ${name}_trigger ON ${table}; DROP FUNCTION IF EXISTS ${name}()`);
}

describe("Gate 3 match command UUID validation", () => {
  it.each([
    ["matchId", { action: "START_MATCH", matchId: "not-a-uuid" }],
    ["playerId", { action: "RECORD_GOAL", matchId: IDS.match, type: "goal_home", playerId: "not-a-uuid", opId: opId(90) }],
    ["eventId", { action: "DELETE_EVENT", matchId: IDS.match, eventId: "not-a-uuid" }],
    ["refereeId", { action: "ASSIGN_REFEREE", matchId: IDS.match, refereeId: "not-a-uuid" }],
    ["opId", { action: "RECORD_GOAL", matchId: IDS.match, type: "goal_home", playerId: null, opId: "not-a-uuid" }],
  ])("returns 400 for a malformed %s", async (_field, body) => {
    authState.actorId = IDS.referee;
    expect((await postMatch(body)).status).toBe(400);
  });
});

describe("Gate 3 match command transactions", () => {
  it("starts scheduled matches atomically and rejects repeated starts", async () => {
    expect((await startMatch()).status).toBe(200);
    const match = (await pool.query("SELECT status, start_time FROM matches WHERE id = $1", [IDS.match])).rows[0];
    expect(match.status).toBe("live");
    expect(match.start_time).toBeTruthy();
    expect(await eventCount(IDS.match, "start_first_half")).toBe(1);
    expect((await startMatch()).status).toBe(409);
    expect(await eventCount(IDS.match, "start_first_half")).toBe(1);
  });

  it.each(["live", "final", "postponed", "cancelled"])("rejects START_MATCH from %s", async (status) => {
    await pool.query("UPDATE matches SET status = $1 WHERE id = $2", [status, IDS.match]);
    expect((await startMatch()).status).toBe(409);
    expect(await eventCount(IDS.match, "start_first_half")).toBe(0);
  });

  it("authorizes START_MATCH from the locked row", async () => {
    authState.actorId = IDS.protectedReferee;
    expect((await postMatch({ action: "START_MATCH", matchId: IDS.match })).status).toBe(403);
    authState.actorId = IDS.foreignReferee;
    expect((await postMatch({ action: "START_MATCH", matchId: IDS.match })).status).toBe(403);
  });

  it("serializes concurrent START_MATCH calls into one phase event", async () => {
    authState.actorId = IDS.referee;
    const responses = await Promise.all([
      postMatch({ action: "START_MATCH", matchId: IDS.match }),
      postMatch({ action: "START_MATCH", matchId: IDS.match }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await eventCount(IDS.match, "start_first_half")).toBe(1);
  });

  it("observes a committed referee reassignment after queueing on the match lock", async () => {
    const blocker = await pool.connect();
    let blockerFinished = false;
    let queuedRequest;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match]);
      await blocker.query("UPDATE matches SET referee_id = $1 WHERE id = $2", [IDS.protectedReferee, IDS.match]);

      authState.actorId = IDS.referee;
      queuedRequest = postMatch({ action: "START_MATCH", matchId: IDS.match });
      await waitForMatchRowLockQueue();

      await blocker.query("COMMIT");
      blockerFinished = true;

      expect((await queuedRequest).status).toBe(403);
      expect((await pool.query("SELECT status, referee_id FROM matches WHERE id = $1", [IDS.match])).rows[0])
        .toMatchObject({ status: "scheduled", referee_id: IDS.protectedReferee });
      expect(await eventCount(IDS.match, "start_first_half")).toBe(0);
    } finally {
      if (!blockerFinished) await blocker.query("ROLLBACK");
      blocker.release();
      if (queuedRequest) await queuedRequest.catch(() => {});
    }
  });

  it("rolls START_MATCH back when phase-event insertion fails", async () => {
    await installFailureTrigger({
      name: "gate3_fail_first_half",
      table: "match_events",
      event: "INSERT",
      body: "IF NEW.type = 'start_first_half' THEN RAISE EXCEPTION 'forced first-half failure'; END IF;",
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await startMatch()).status).toBe(500);
    } finally {
      log.mockRestore();
      await removeFailureTrigger("gate3_fail_first_half", "match_events");
    }
    const match = (await pool.query("SELECT status, start_time FROM matches WHERE id = $1", [IDS.match])).rows[0];
    expect(match).toMatchObject({ status: "scheduled", start_time: null });
    expect(await eventCount(IDS.match, "start_first_half")).toBe(0);
  });

  it("starts the second half once and treats exact repeats idempotently", async () => {
    expect((await startMatch()).status).toBe(200);
    const first = await postMatch({ action: "START_SECOND_HALF", matchId: IDS.match });
    const second = await postMatch({ action: "START_SECOND_HALF", matchId: IDS.match });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await second.json()).idempotent).toBe(true);
    expect(await eventCount(IDS.match, "start_second_half")).toBe(1);
    expect((await pool.query("SELECT half2_start_time FROM matches WHERE id = $1", [IDS.match])).rows[0].half2_start_time).toBeTruthy();
  });

  it("requires a consistent live first half before starting the second", async () => {
    await pool.query("UPDATE matches SET status = 'live' WHERE id = $1", [IDS.match]);
    authState.actorId = IDS.referee;
    expect((await postMatch({ action: "START_SECOND_HALF", matchId: IDS.match })).status).toBe(409);
  });

  it("authorizes START_SECOND_HALF from the locked referee assignment", async () => {
    expect((await startMatch()).status).toBe(200);
    authState.actorId = IDS.protectedReferee;
    expect((await postMatch({ action: "START_SECOND_HALF", matchId: IDS.match })).status).toBe(403);
    expect(await eventCount(IDS.match, "start_second_half")).toBe(0);
  });

  it("rolls second-half timestamp back when its event fails", async () => {
    expect((await startMatch()).status).toBe(200);
    await installFailureTrigger({
      name: "gate3_fail_second_half",
      table: "match_events",
      event: "INSERT",
      body: "IF NEW.type = 'start_second_half' THEN RAISE EXCEPTION 'forced second-half failure'; END IF;",
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await postMatch({ action: "START_SECOND_HALF", matchId: IDS.match })).status).toBe(500);
    } finally {
      log.mockRestore();
      await removeFailureTrigger("gate3_fail_second_half", "match_events");
    }
    expect((await pool.query("SELECT half2_start_time FROM matches WHERE id = $1", [IDS.match])).rows[0].half2_start_time).toBeNull();
    expect(await eventCount(IDS.match, "start_second_half")).toBe(0);
  });
});

describe("Gate 3 goal-operation schema enforcement", () => {
  it("allows historical NULL operation IDs and rejects operation IDs on NULL or non-goal types", async () => {
    await pool.query("ALTER TABLE match_events ALTER COLUMN type DROP NOT NULL");
    try {
      await pool.query(
        "INSERT INTO match_events (match_id, type) VALUES ($1, 'start_first_half')",
        [IDS.match],
      );
      await pool.query("INSERT INTO match_events (match_id, type) VALUES ($1, NULL)", [IDS.match]);
      await expect(pool.query(
        "INSERT INTO match_events (match_id, type, operation_id) VALUES ($1, NULL, $2)",
        [IDS.match, opId(79)],
      )).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query(
        "INSERT INTO match_events (match_id, type, operation_id) VALUES ($1, 'end_match', $2)",
        [IDS.match, opId(80)],
      )).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query(
        "INSERT INTO match_events (match_id, type, team_id, operation_id) VALUES ($1, 'goal_home', $2, $3)",
        [IDS.match, IDS.team, opId(82)],
      )).resolves.toBeTruthy();
    } finally {
      await pool.query("DELETE FROM match_events WHERE type IS NULL");
      await pool.query("ALTER TABLE match_events ALTER COLUMN type SET NOT NULL");
    }
  });

  it("enforces operation uniqueness per match while allowing another match", async () => {
    await pool.query(
      "INSERT INTO match_events (match_id, type, team_id, operation_id) VALUES ($1, 'goal_home', $2, $3)",
      [IDS.match, IDS.team, opId(81)],
    );
    await expect(pool.query(
      "INSERT INTO match_events (match_id, type, team_id, operation_id) VALUES ($1, 'goal_home', $2, $3)",
      [IDS.match, IDS.team, opId(81)],
    )).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query(
      "INSERT INTO match_events (match_id, type, team_id, operation_id) VALUES ($1, 'goal_home', $2, $3)",
      [IDS.match2, IDS.team, opId(81)],
    )).resolves.toBeTruthy();
  });
});

describe("Gate 3 goal integrity and audit", () => {
  beforeEach(async () => {
    expect((await startMatch()).status).toBe(200);
  });

  const goal = (overrides = {}) => postMatch({
    action: "RECORD_GOAL",
    matchId: IDS.match,
    type: "goal_home",
    playerId: IDS.playerA,
    opId: opId(1),
    ...overrides,
  });

  it("keeps valid legacy goals atomic while storing a NULL operation ID", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const response = await goal({ opId: undefined });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ success: true, idempotent: false, legacy: true });
      expect(warning).toHaveBeenCalledWith(
        "[matches] Legacy RECORD_GOAL received without opId; request is atomic but not retry-idempotent.",
      );
    } finally {
      warning.mockRestore();
    }
    const event = (await pool.query(
      "SELECT player_id, team_id, operation_id FROM match_events WHERE match_id = $1 AND type = 'goal_home'",
      [IDS.match],
    )).rows[0];
    expect(event).toMatchObject({ player_id: IDS.playerA, team_id: IDS.team, operation_id: null });
    expect((await pool.query("SELECT home_score FROM matches WHERE id = $1", [IDS.match])).rows[0].home_score).toBe(1);
  });

  it("retains authorization and player-team validation for legacy goals", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect((await goal({ opId: undefined, playerId: IDS.playerB })).status).toBe(409);
      authState.actorId = IDS.protectedReferee;
      expect((await goal({ opId: undefined })).status).toBe(403);
    } finally {
      warning.mockRestore();
    }
    expect(await eventCount(IDS.match, "goal_home")).toBe(0);
    expect((await pool.query("SELECT home_score FROM matches WHERE id = $1", [IDS.match])).rows[0].home_score).toBe(0);
  });

  it("writes the event and score once for duplicate delivery", async () => {
    const responses = await Promise.all([goal(), goal()]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(await eventCount(IDS.match, "goal_home")).toBe(1);
    expect((await pool.query("SELECT home_score FROM matches WHERE id = $1", [IDS.match])).rows[0].home_score).toBe(1);
  });

  it("accepts different operation IDs as distinct goals", async () => {
    expect((await goal()).status).toBe(200);
    expect((await goal({ opId: opId(2) })).status).toBe(200);
    expect(await eventCount(IDS.match, "goal_home")).toBe(2);
    expect((await pool.query("SELECT home_score FROM matches WHERE id = $1", [IDS.match])).rows[0].home_score).toBe(2);
  });

  it("rejects a reused opId with changed command content", async () => {
    expect((await goal()).status).toBe(200);
    expect((await goal({ type: "goal_away", playerId: IDS.playerB })).status).toBe(409);
    const score = (await pool.query("SELECT home_score, away_score FROM matches WHERE id = $1", [IDS.match])).rows[0];
    expect(score).toMatchObject({ home_score: 1, away_score: 0 });
  });

  it("rejects opposing and nonexistent players without writing", async () => {
    expect((await goal({ playerId: IDS.playerB })).status).toBe(409);
    expect((await goal({ playerId: "61000000-0000-4000-8000-999999999999" })).status).toBe(404);
    expect(await eventCount(IDS.match, "goal_home")).toBe(0);
  });

  it("continues to support an unknown player", async () => {
    expect((await goal({ playerId: null })).status).toBe(200);
    const event = (await pool.query("SELECT player_id, team_id FROM match_events WHERE operation_id = $1", [opId(1)])).rows[0];
    expect(event).toMatchObject({ player_id: null, team_id: IDS.team });
  });

  it("rejects wrong referees and non-live matches", async () => {
    authState.actorId = IDS.protectedReferee;
    expect((await goal()).status).toBe(403);
    authState.actorId = IDS.referee;
    await pool.query("UPDATE matches SET status = 'final' WHERE id = $1", [IDS.match]);
    expect((await goal()).status).toBe(409);
  });

  it("rolls the goal event back when score update fails", async () => {
    await installFailureTrigger({
      name: "gate3_fail_score",
      table: "matches",
      event: "UPDATE",
      body: "IF NEW.home_score <> OLD.home_score OR NEW.away_score <> OLD.away_score THEN RAISE EXCEPTION 'forced score failure'; END IF;",
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect((await goal({ opId: undefined })).status).toBe(500);
    } finally {
      log.mockRestore();
      warning.mockRestore();
      await removeFailureTrigger("gate3_fail_score", "matches");
    }
    expect(await eventCount(IDS.match, "goal_home")).toBe(0);
    expect((await pool.query("SELECT home_score FROM matches WHERE id = $1", [IDS.match])).rows[0].home_score).toBe(0);
  });

  it("audits a successful goal deletion with the deleted event context", async () => {
    expect((await goal()).status).toBe(200);
    const event = (await pool.query("SELECT id FROM match_events WHERE operation_id = $1", [opId(1)])).rows[0];
    expect((await postMatch({ action: "DELETE_EVENT", matchId: IDS.match, eventId: event.id })).status).toBe(200);
    const audit = (await pool.query("SELECT action_by, target_id, action_type, old_value FROM audit_logs WHERE target_id = $1", [event.id])).rows[0];
    expect(audit.action_by).toBe(IDS.referee);
    expect(audit.target_id).toBe(event.id);
    expect(audit.action_type).toBe("DELETE_MATCH_GOAL");
    expect(audit.old_value).toMatchObject({ id: event.id, match_id: IDS.match, type: "goal_home", operation_id: opId(1) });
  });

  it("rolls goal restoration back and creates no audit when audit insertion fails", async () => {
    expect((await goal()).status).toBe(200);
    const event = (await pool.query("SELECT id FROM match_events WHERE operation_id = $1", [opId(1)])).rows[0];
    await installFailureTrigger({
      name: "gate3_fail_audit",
      table: "audit_logs",
      event: "INSERT",
      body: "RAISE EXCEPTION 'forced audit failure';",
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await postMatch({ action: "DELETE_EVENT", matchId: IDS.match, eventId: event.id })).status).toBe(500);
    } finally {
      log.mockRestore();
      await removeFailureTrigger("gate3_fail_audit", "audit_logs");
    }
    expect((await pool.query("SELECT count(*)::int AS count FROM match_events WHERE id = $1", [event.id])).rows[0].count).toBe(1);
    expect((await pool.query("SELECT home_score FROM matches WHERE id = $1", [IDS.match])).rows[0].home_score).toBe(1);
    expect((await pool.query("SELECT count(*)::int AS count FROM audit_logs WHERE target_id = $1", [event.id])).rows[0].count).toBe(0);
  });
});

describe("Gate 3 deterministic standings", () => {
  async function setFinal(matchId, homeScore, awayScore) {
    await pool.query(
      "UPDATE matches SET status = 'final', home_score = $2, away_score = $3 WHERE id = $1",
      [matchId, homeScore, awayScore],
    );
  }

  const standings = () => pool.query(`
    SELECT team_id, played, won, drawn, lost, goals_for, goals_against, goal_difference, points
    FROM standings WHERE league_id = $1 ORDER BY team_id
  `, [IDS.league]).then(({ rows }) => rows);

  it("finalises once and recomputes league-specific points", async () => {
    await pool.query("UPDATE leagues SET win_points = 5, draw_points = 2 WHERE id = $1", [IDS.league]);
    expect((await startMatch()).status).toBe(200);
    expect((await postMatch({ action: "RECORD_GOAL", matchId: IDS.match, type: "goal_home", playerId: IDS.playerA, opId: opId(20) })).status).toBe(200);
    expect((await postMatch({ action: "END_MATCH", matchId: IDS.match })).status).toBe(200);
    expect((await postMatch({ action: "END_MATCH", matchId: IDS.match })).status).toBe(200);
    expect(await eventCount(IDS.match, "end_match")).toBe(1);
    const rows = await standings();
    expect(rows.find((row) => row.team_id === IDS.team)).toMatchObject({ played: 1, won: 1, points: 5 });
    expect(rows.find((row) => row.team_id === IDS.teamB)).toMatchObject({ played: 1, lost: 1, points: 0 });
  });

  it("rolls finalisation, end event, and standings back together", async () => {
    expect((await startMatch()).status).toBe(200);
    await installFailureTrigger({
      name: "gate3_fail_standings",
      table: "standings",
      event: "UPDATE",
      body: "RAISE EXCEPTION 'forced standings failure';",
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await postMatch({ action: "END_MATCH", matchId: IDS.match })).status).toBe(500);
    } finally {
      log.mockRestore();
      await removeFailureTrigger("gate3_fail_standings", "standings");
    }
    expect((await pool.query("SELECT status, end_time FROM matches WHERE id = $1", [IDS.match])).rows[0]).toMatchObject({ status: "live", end_time: null });
    expect(await eventCount(IDS.match, "end_match")).toBe(0);
  });

  it("rebuilds multiple results identically and follows final-match truth after overrides", async () => {
    await pool.query("UPDATE leagues SET win_points = 5, draw_points = 2 WHERE id = $1", [IDS.league]);
    await setFinal(IDS.match, 2, 0);
    await setFinal(IDS.match2, 1, 3);
    await setFinal(IDS.match3, 2, 2);
    await withTransaction((txSql) => recomputeLeagueStandings(txSql, IDS.league));
    const initial = await standings();
    expect(initial).toEqual([
      { team_id: IDS.team, played: 3, won: 1, drawn: 1, lost: 1, goals_for: 5, goals_against: 5, goal_difference: 0, points: 7 },
      { team_id: IDS.teamB, played: 3, won: 1, drawn: 1, lost: 1, goals_for: 5, goals_against: 5, goal_difference: 0, points: 7 },
    ]);

    await withTransaction((txSql) => recomputeLeagueStandings(txSql, IDS.league));
    expect(await standings()).toEqual(initial);

    authState.actorId = IDS.venueAdminA;
    expect((await postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match, homeScore: 0, awayScore: 2, status: "final", reason: "correction" })).status).toBe(200);
    expect(await standings()).toEqual([
      { team_id: IDS.team, played: 3, won: 0, drawn: 1, lost: 2, goals_for: 3, goals_against: 7, goal_difference: -4, points: 2 },
      { team_id: IDS.teamB, played: 3, won: 2, drawn: 1, lost: 0, goals_for: 7, goals_against: 3, goal_difference: 4, points: 12 },
    ]);

    expect((await postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match, homeScore: 0, awayScore: 2, status: "scheduled", reason: "remove final" })).status).toBe(200);
    expect((await standings()).map((row) => ({ team_id: row.team_id, played: row.played, points: row.points }))).toEqual([
      { team_id: IDS.team, played: 2, points: 2 },
      { team_id: IDS.teamB, played: 2, points: 7 },
    ]);

    expect((await postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match, homeScore: 2, awayScore: 0, status: "final", reason: "restore final" })).status).toBe(200);
    expect(await standings()).toEqual(initial);
  });

  it("denies END_MATCH to a referee not assigned in the locked row", async () => {
    expect((await startMatch()).status).toBe(200);
    authState.actorId = IDS.protectedReferee;
    expect((await postMatch({ action: "END_MATCH", matchId: IDS.match })).status).toBe(403);
    expect((await pool.query("SELECT status FROM matches WHERE id = $1", [IDS.match])).rows[0].status).toBe("live");
  });
});

describe("Gate 4A fixture and result operations", () => {
  beforeEach(async () => {
    authState.actorId = IDS.venueAdminA;
    await pool.query(`
      UPDATE leagues
      SET status = 'active', fields_count = 2, time_slots = '["18:30","19:30"]',
          forfeit_score_home = 5, forfeit_score_away = 0
      WHERE id = $1
    `, [IDS.league]);
    await pool.query(`
      UPDATE matches
      SET status = 'scheduled', result_type = 'played', home_score = 0, away_score = 0,
          start_time = NULL, half2_start_time = NULL, end_time = NULL, referee_id = NULL
      WHERE league_id = $1
    `, [IDS.league]);
    await pool.query("UPDATE matches SET match_date = DATE '2030-02-05', time_slot = '18:30', field_number = 1 WHERE id = $1", [IDS.match]);
    await pool.query("UPDATE matches SET match_date = DATE '2030-02-12', time_slot = '18:30', field_number = 1 WHERE id = $1", [IDS.match2]);
    await pool.query("UPDATE matches SET match_date = DATE '2030-02-12', time_slot = '18:30', field_number = 2 WHERE id = $1", [IDS.match3]);
    await pool.query("UPDATE matches SET match_date = DATE '2030-02-19', time_slot = '18:30', field_number = 1 WHERE id = $1", [IDS.match4]);
  });

  const createFixture = (overrides = {}) => postMatch({
    action: "CREATE_FIXTURE",
    leagueId: IDS.leagueB,
    roundNumber: 10,
    matchDate: "2030-03-05",
    timeSlot: "18:30",
    fieldNumber: 1,
    homeSlotId: IDS.slotC,
    awaySlotId: IDS.slotD,
    refereeId: null,
    ...overrides,
  });

  const editFixture = (matchId = IDS.match2, overrides = {}) => postMatch({
    action: "EDIT_FIXTURE",
    matchId,
    matchDate: "2030-02-26",
    timeSlot: "19:30",
    fieldNumber: 2,
    refereeId: null,
    ...overrides,
  });

  it("creates a valid fixture and audits it", async () => {
    const response = await createFixture();
    expect(response.status).toBe(200);
    const { matchId } = await response.json();
    expect((await pool.query("SELECT status FROM matches WHERE id = $1", [matchId])).rows[0].status).toBe("scheduled");
    expect((await pool.query("SELECT action_type FROM audit_logs WHERE target_id = $1", [matchId])).rows[0].action_type).toBe("CREATE_FIXTURE");
  });

  it("returns 409 for an occupied venue field and kickoff", async () => {
    expect((await createFixture({ matchDate: "2030-02-05" })).status).toBe(409);
  });

  it("serializes concurrent fixture claims into one winner", async () => {
    const responses = await Promise.all([createFixture(), createFixture({ roundNumber: 11 })]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(Number((await pool.query(`
      SELECT count(*) FROM matches m JOIN leagues l ON l.id = m.league_id
      WHERE l.venue_id = $1 AND nova_planned_date(m.match_date) = DATE '2030-03-05'
        AND m.time_slot = '18:30' AND m.field_number = 1 AND m.status = 'scheduled'
    `, [IDS.venueA])).rows[0].count)).toBe(1);
  });

  it("reschedules normally, rejects a collision, and rejects live/final edits", async () => {
    expect((await editFixture()).status).toBe(200);
    expect((await editFixture(IDS.match3, { matchDate: "2030-02-05", timeSlot: "18:30", fieldNumber: 1 })).status).toBe(409);
    for (const status of ["live", "final"]) {
      await pool.query("UPDATE matches SET status = $1 WHERE id = $2", [status, IDS.match3]);
      expect((await editFixture(IDS.match3)).status).toBe(409);
    }
  });

  it("allows only one winner when a reschedule races fixture creation", async () => {
    const target = { matchDate: "2030-03-05", timeSlot: "18:30", fieldNumber: 1 };
    const responses = await Promise.all([
      editFixture(IDS.match2, target),
      createFixture(target),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  });

  it("assigns a valid referee and rejects wrong role or venue", async () => {
    expect((await postMatch({ action: "ASSIGN_REFEREE", matchId: IDS.match, refereeId: IDS.referee })).status).toBe(200);
    expect((await postMatch({ action: "ASSIGN_REFEREE", matchId: IDS.match, refereeId: IDS.captain })).status).toBe(404);
    expect((await postMatch({ action: "ASSIGN_REFEREE", matchId: IDS.match, refereeId: IDS.foreignReferee })).status).toBe(403);
  });

  it("serializes simultaneous referee assignments", async () => {
    const responses = await Promise.all([
      postMatch({ action: "ASSIGN_REFEREE", matchId: IDS.match2, refereeId: IDS.referee }),
      postMatch({ action: "ASSIGN_REFEREE", matchId: IDS.match3, refereeId: IDS.referee }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(Number((await pool.query(
      "SELECT count(*) FROM matches WHERE referee_id = $1 AND nova_planned_date(match_date) = DATE '2030-02-12' AND time_slot = '18:30'",
      [IDS.referee],
    )).rows[0].count)).toBe(1);
  });

  it("postpones one scheduled fixture, audits it, releases capacity, and reschedules it", async () => {
    expect((await postMatch({ action: "POSTPONE_FIXTURE", matchId: IDS.match })).status).toBe(200);
    expect((await pool.query("SELECT status FROM matches WHERE id = $1", [IDS.match])).rows[0].status).toBe("postponed");
    expect((await pool.query("SELECT action_type FROM audit_logs WHERE target_id = $1", [IDS.match])).rows[0].action_type).toBe("POSTPONE_FIXTURE");
    expect((await createFixture({ matchDate: "2030-02-05" })).status).toBe(200);
    expect((await editFixture(IDS.match)).status).toBe(200);
    expect((await pool.query("SELECT status FROM matches WHERE id = $1", [IDS.match])).rows[0].status).toBe("scheduled");
  });

  it("rejects postponing a final fixture", async () => {
    await pool.query("UPDATE matches SET status = 'final' WHERE id = $1", [IDS.match]);
    expect((await postMatch({ action: "POSTPONE_FIXTURE", matchId: IDS.match })).status).toBe(409);
  });

  it("cancels one fixture without changing standings and releases capacity", async () => {
    await pool.query("UPDATE matches SET status = 'final', home_score = 2 WHERE id = $1", [IDS.match4]);
    await withTransaction((txSql) => recomputeLeagueStandings(txSql, IDS.league));
    const before = (await pool.query("SELECT team_id, played, points FROM standings WHERE league_id = $1 ORDER BY team_id", [IDS.league])).rows;
    expect((await postMatch({ action: "CANCEL_FIXTURE", matchId: IDS.match })).status).toBe(200);
    const after = (await pool.query("SELECT team_id, played, points FROM standings WHERE league_id = $1 ORDER BY team_id", [IDS.league])).rows;
    expect(after).toEqual(before);
    expect((await createFixture({ matchDate: "2030-02-05" })).status).toBe(200);
    expect((await pool.query("SELECT action_type FROM audit_logs WHERE target_id = $1", [IDS.match])).rows[0].action_type).toBe("CANCEL_FIXTURE");
  });

  it.each(["live", "final"])("rejects cancelling a %s fixture", async (status) => {
    await pool.query("UPDATE matches SET status = $1 WHERE id = $2", [status, IDS.match]);
    expect((await postMatch({ action: "CANCEL_FIXTURE", matchId: IDS.match })).status).toBe(409);
  });

  it("requires a nonblank correction reason", async () => {
    const base = { action: "ADMIN_OVERRIDE", matchId: IDS.match4, homeScore: 2, awayScore: 1, status: "final" };
    expect((await postMatch(base)).status).toBe(400);
    expect((await postMatch({ ...base, reason: "   " })).status).toBe(400);
  });

  it("records correction before/after state and rebuilds standings", async () => {
    const response = await postMatch({
      action: "ADMIN_OVERRIDE",
      matchId: IDS.match4,
      homeScore: 0,
      awayScore: 2,
      status: "final",
      reason: "Score sheet correction",
    });
    expect(response.status).toBe(200);
    const audit = (await pool.query("SELECT old_value, new_value, reason FROM audit_logs WHERE target_id = $1", [IDS.match4])).rows[0];
    expect(audit.reason).toBe("Score sheet correction");
    expect(audit.old_value).toMatchObject({ home_score: 0, away_score: 0, status: "scheduled" });
    expect(audit.new_value).toMatchObject({ home_score: 0, away_score: 2, status: "final", result_type: "played" });
    expect((await pool.query("SELECT played, won FROM standings WHERE team_id = $1", [IDS.teamB])).rows[0]).toMatchObject({ played: 1, won: 1 });
  });

  it("rolls a correction back when its audit fails", async () => {
    await installFailureTrigger({ name: "gate4_fail_override_audit", table: "audit_logs", event: "INSERT", body: "RAISE EXCEPTION 'forced audit failure';" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match4, homeScore: 3, awayScore: 1, status: "final", reason: "Correction" })).status).toBe(500);
    } finally {
      log.mockRestore();
      await removeFailureTrigger("gate4_fail_override_audit", "audit_logs");
    }
    expect((await pool.query("SELECT home_score, away_score, status FROM matches WHERE id = $1", [IDS.match4])).rows[0])
      .toMatchObject({ home_score: 0, away_score: 0, status: "scheduled" });
  });

  it.each([
    ["home", 5, 0, "forfeit_home_win", IDS.team],
    ["away", 0, 5, "forfeit_away_win", IDS.teamB],
  ])("records a configured %s-side forfeit atomically", async (winnerSide, homeScore, awayScore, resultType, winningTeam) => {
    const response = await postMatch({ action: "FORFEIT_MATCH", matchId: IDS.match4, winnerSide, reason: "No-show" });
    expect(response.status).toBe(200);
    expect((await pool.query("SELECT home_score, away_score, status, result_type FROM matches WHERE id = $1", [IDS.match4])).rows[0])
      .toMatchObject({ home_score: homeScore, away_score: awayScore, status: "final", result_type: resultType });
    expect((await pool.query("SELECT won, points FROM standings WHERE team_id = $1", [winningTeam])).rows[0])
      .toMatchObject({ won: 1, points: 3 });
    expect((await pool.query("SELECT action_type FROM audit_logs WHERE target_id = $1", [IDS.match4])).rows[0].action_type).toBe("FORFEIT_MATCH");
  });

  it("treats concurrent repeated forfeits as one audited result", async () => {
    const command = () => postMatch({ action: "FORFEIT_MATCH", matchId: IDS.match4, winnerSide: "home", reason: "No-show" });
    const responses = await Promise.all([command(), command()]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE target_id = $1 AND action_type = 'FORFEIT_MATCH'", [IDS.match4])).rows[0].count)).toBe(1);
  });

  it("rolls a forfeit back on downstream standings failure", async () => {
    await installFailureTrigger({ name: "gate4_fail_forfeit_standings", table: "standings", event: "UPDATE", body: "RAISE EXCEPTION 'forced standings failure';" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await postMatch({ action: "FORFEIT_MATCH", matchId: IDS.match4, winnerSide: "home" })).status).toBe(500);
    } finally {
      log.mockRestore();
      await removeFailureTrigger("gate4_fail_forfeit_standings", "standings");
    }
    expect((await pool.query("SELECT home_score, away_score, status, result_type FROM matches WHERE id = $1", [IDS.match4])).rows[0])
      .toMatchObject({ home_score: 0, away_score: 0, status: "scheduled", result_type: "played" });
    expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE target_id = $1", [IDS.match4])).rows[0].count)).toBe(0);
  });

  it("serializes correction racing finalisation and preserves final truth", async () => {
    authState.actorId = IDS.super;
    await pool.query("UPDATE matches SET status = 'live', home_score = 1 WHERE id = $1", [IDS.match4]);
    const responses = await Promise.all([
      postMatch({ action: "END_MATCH", matchId: IDS.match4 }),
      postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match4, homeScore: 2, awayScore: 0, status: "final", reason: "Official correction" }),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect((await pool.query("SELECT status, home_score, away_score FROM matches WHERE id = $1", [IDS.match4])).rows[0])
      .toMatchObject({ status: "final", home_score: 2, away_score: 0 });
  });

  it("serializes cancellation racing a forfeit", async () => {
    const responses = await Promise.all([
      postMatch({ action: "CANCEL_FIXTURE", matchId: IDS.match4 }),
      postMatch({ action: "FORFEIT_MATCH", matchId: IDS.match4, winnerSide: "home" }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(["cancelled", "final"]).toContain((await pool.query("SELECT status FROM matches WHERE id = $1", [IDS.match4])).rows[0].status);
  });

  it.each([
    ["scheduled", "scheduled", 200], ["scheduled", "final", 200],
    ["final", "scheduled", 200], ["final", "final", 200],
    ["live", "scheduled", 409], ["live", "final", 409],
    ["postponed", "scheduled", 409], ["postponed", "final", 409],
    ["cancelled", "scheduled", 409], ["cancelled", "final", 409],
  ])("enforces ADMIN_OVERRIDE current %s to target %s", async (current, target, expectedStatus) => {
    await pool.query("UPDATE matches SET status = $1, home_score = 1, away_score = 0 WHERE id = $2", [current, IDS.match4]);
    if (current === "final") await withTransaction((txSql) => recomputeLeagueStandings(txSql, IDS.league));
    const beforeMatch = (await pool.query("SELECT home_score, away_score, status, result_type FROM matches WHERE id = $1", [IDS.match4])).rows[0];
    const beforeStandings = (await pool.query("SELECT * FROM standings WHERE league_id = $1 ORDER BY team_id", [IDS.league])).rows;
    const response = await postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match4, homeScore: 2, awayScore: 1, status: target, reason: "Matrix check" });
    expect(response.status).toBe(expectedStatus);
    if (expectedStatus !== 200) {
      expect((await pool.query("SELECT home_score, away_score, status, result_type FROM matches WHERE id = $1", [IDS.match4])).rows[0]).toEqual(beforeMatch);
      expect((await pool.query("SELECT * FROM standings WHERE league_id = $1 ORDER BY team_id", [IDS.league])).rows).toEqual(beforeStandings);
      expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE target_id = $1", [IDS.match4])).rows[0].count)).toBe(0);
    }
  });

  it("rejects final-to-scheduled reactivation when its resource is occupied", async () => {
    await pool.query("UPDATE matches SET status = 'final', home_score = 2 WHERE id = $1", [IDS.match4]);
    await pool.query("UPDATE matches SET match_date = DATE '2030-02-19', time_slot = '18:30', field_number = 1 WHERE id = $1", [IDS.match2]);
    await withTransaction((txSql) => recomputeLeagueStandings(txSql, IDS.league));
    const standingsBefore = (await pool.query("SELECT * FROM standings WHERE league_id = $1 ORDER BY team_id", [IDS.league])).rows;
    expect((await postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match4, homeScore: 2, awayScore: 0, status: "scheduled", reason: "Reopen" })).status).toBe(409);
    expect((await pool.query("SELECT status FROM matches WHERE id = $1", [IDS.match4])).rows[0].status).toBe("final");
    expect((await pool.query("SELECT * FROM standings WHERE league_id = $1 ORDER BY team_id", [IDS.league])).rows).toEqual(standingsBefore);
    expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE target_id = $1", [IDS.match4])).rows[0].count)).toBe(0);
  });

  it("rejects final-to-scheduled reactivation when its retained referee is occupied", async () => {
    await pool.query("UPDATE matches SET status = 'final', referee_id = $1 WHERE id = $2", [IDS.referee, IDS.match4]);
    await pool.query("UPDATE matches SET match_date = DATE '2030-02-19', time_slot = '18:30', field_number = 2, referee_id = $1 WHERE id = $2", [IDS.referee, IDS.match2]);
    expect((await postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match4, homeScore: 0, awayScore: 0, status: "scheduled", reason: "Reopen" })).status).toBe(409);
    expect((await pool.query("SELECT status FROM matches WHERE id = $1", [IDS.match4])).rows[0].status).toBe("final");
    expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE target_id = $1", [IDS.match4])).rows[0].count)).toBe(0);
  });

  it("serializes final-to-scheduled reactivation against CREATE_FIXTURE for the same slot", async () => {
    await pool.query("UPDATE matches SET status = 'final', referee_id = NULL WHERE id = $1", [IDS.match4]);
    const responses = await Promise.all([
      postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match4, homeScore: 0, awayScore: 0, status: "scheduled", reason: "Reopen" }),
      createFixture({ matchDate: "2030-02-19", timeSlot: "18:30", fieldNumber: 1 }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(Number((await pool.query(`
      SELECT count(*)
      FROM matches m JOIN leagues l ON l.id = m.league_id
      WHERE l.venue_id = $1
        AND nova_planned_date(m.match_date) = DATE '2030-02-19'
        AND m.time_slot = '18:30' AND m.field_number = 1
        AND m.status IN ('scheduled', 'live')
    `, [IDS.venueA])).rows[0].count)).toBe(1);
    expect(Number((await pool.query(`
      SELECT count(*) FROM audit_logs
      WHERE action_type IN ('ADMIN_OVERRIDE', 'CREATE_FIXTURE')
        AND target_id IN (SELECT id FROM matches WHERE nova_planned_date(match_date) = DATE '2030-02-19')
    `)).rows[0].count)).toBe(1);
  }, 20_000);

  it("serializes final-to-scheduled reactivation against POSTPONE_ROUND for the same destination", async () => {
    await pool.query("UPDATE matches SET status = 'final', referee_id = NULL WHERE id = $1", [IDS.match4]);
    await pool.query("UPDATE matches SET match_date = DATE '2030-02-12', field_number = 1, referee_id = NULL WHERE id = $1", [IDS.match3]);
    const blocker = await pool.connect();
    let roundRequest;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match3]);
      roundRequest = postPostponeRound({ league_id: IDS.league, round_number: 4 });
      await waitForLockQueue("nova_planned_date(match_date)", "POSTPONE_ROUND never queued on its original scope");
      expect((await postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match4, homeScore: 0, awayScore: 0, status: "scheduled", reason: "Reopen" })).status).toBe(200);
      await blocker.query("COMMIT");
      expect((await roundRequest).status).toBe(409);
      expect(Number((await pool.query(`
        SELECT count(*) FROM matches
        WHERE nova_planned_date(match_date) = DATE '2030-02-19'
          AND time_slot = '18:30' AND field_number = 1
          AND status IN ('scheduled', 'live')
      `)).rows[0].count)).toBe(1);
      expect(Number((await pool.query(`
        SELECT count(*) FROM audit_logs
        WHERE action_type IN ('ADMIN_OVERRIDE', 'POSTPONE_ROUND')
      `)).rows[0].count)).toBe(1);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (roundRequest) await roundRequest.catch(() => {});
    }
  }, 20_000);

  it("queues final-to-scheduled reactivation on the fixture advisory claim", async () => {
    await pool.query("UPDATE matches SET status = 'final', referee_id = NULL WHERE id = $1", [IDS.match4]);
    const blocker = await pool.connect();
    let queued;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [fixtureScheduleKey({ venueId: IDS.venueA, fieldNumber: 1, matchDate: "2030-02-19", timeSlot: "18:30" })]);
      queued = postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match4, homeScore: 0, awayScore: 0, status: "scheduled", reason: "Reopen" });
      await waitForLockQueue("pg_advisory_xact_lock", "ADMIN_OVERRIDE never queued on the fixture claim lock");
      await blocker.query("COMMIT");
      expect((await queued).status).toBe(200);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (queued) await queued.catch(() => {});
    }
  });

  it("queues final-to-scheduled reactivation on the retained-referee advisory claim", async () => {
    await pool.query("UPDATE matches SET status = 'final', referee_id = $1 WHERE id = $2", [IDS.referee, IDS.match4]);
    const blocker = await pool.connect();
    let queued;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [refereeScheduleKey({ refereeId: IDS.referee, matchDate: "2030-02-19", timeSlot: "18:30" })]);
      queued = postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match4, homeScore: 0, awayScore: 0, status: "scheduled", reason: "Reopen" });
      await waitForLockQueue("pg_advisory_xact_lock", "ADMIN_OVERRIDE never queued on the referee claim lock");
      await blocker.query("COMMIT");
      expect((await queued).status).toBe(200);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (queued) await queued.catch(() => {});
    }
  });

  it("rechecks the actor role after queueing on the locked match", async () => {
    const blocker = await pool.connect();
    let queued;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match4]);
      queued = postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match4, homeScore: 2, awayScore: 0, status: "final", reason: "Queued correction" });
      await waitForMatchRowLockQueue();
      await pool.query("UPDATE auth_users SET role = 'captain' WHERE id = $1", [IDS.venueAdminA]);
      await blocker.query("COMMIT");
      expect((await queued).status).toBe(403);
      expect((await pool.query("SELECT status FROM matches WHERE id = $1", [IDS.match4])).rows[0].status).toBe("scheduled");
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (queued) await queued.catch(() => {});
    }
  });

  it.each([[3, 0, 200], [2, 0, 200], [0, 3, 409], [1, 1, 409]])(
    "validates configured forfeit winner/loser scores %i-%i",
    async (winnerScore, loserScore, status) => {
      await pool.query("UPDATE leagues SET forfeit_score_home = $1, forfeit_score_away = $2 WHERE id = $3", [winnerScore, loserScore, IDS.league]);
      const response = await postMatch({ action: "FORFEIT_MATCH", matchId: IDS.match4, winnerSide: "home" });
      expect(response.status).toBe(status);
      if (status === 409) {
        expect((await pool.query("SELECT status, home_score, away_score FROM matches WHERE id = $1", [IDS.match4])).rows[0]).toMatchObject({ status: "scheduled", home_score: 0, away_score: 0 });
        expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE target_id = $1", [IDS.match4])).rows[0].count)).toBe(0);
      }
    },
  );

  it("normalizes result_type through correction, reopening, and opposite forfeit", async () => {
    await pool.query("UPDATE matches SET status = 'final', home_score = 1, result_type = 'played' WHERE id = $1", [IDS.match4]);
    expect((await postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match4, homeScore: 2, awayScore: 1, status: "final", reason: "Played correction" })).status).toBe(200);
    expect((await pool.query("SELECT result_type FROM matches WHERE id = $1", [IDS.match4])).rows[0].result_type).toBe("played");
    expect((await postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match4, homeScore: 2, awayScore: 1, status: "scheduled", reason: "Reopen" })).status).toBe(200);
    expect((await postMatch({ action: "FORFEIT_MATCH", matchId: IDS.match4, winnerSide: "away" })).status).toBe(200);
    expect((await pool.query("SELECT result_type FROM matches WHERE id = $1", [IDS.match4])).rows[0].result_type).toBe("forfeit_away_win");
    expect((await postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match4, homeScore: 0, awayScore: 5, status: "scheduled", reason: "Reopen forfeit" })).status).toBe(200);
    expect((await pool.query("SELECT result_type FROM matches WHERE id = $1", [IDS.match4])).rows[0].result_type).toBe("played");
    expect((await postMatch({ action: "FORFEIT_MATCH", matchId: IDS.match4, winnerSide: "home" })).status).toBe(200);
    expect((await pool.query("SELECT result_type FROM matches WHERE id = $1", [IDS.match4])).rows[0].result_type).toBe("forfeit_home_win");
    expect((await postMatch({ action: "ADMIN_OVERRIDE", matchId: IDS.match4, homeScore: 1, awayScore: 0, status: "final", reason: "Correct forfeit" })).status).toBe(200);
    expect((await pool.query("SELECT result_type FROM matches WHERE id = $1", [IDS.match4])).rows[0].result_type).toBe("played");
  });

  it("rejects duplicate time slots without a partial league write", async () => {
    const before = Number((await pool.query("SELECT count(*) FROM leagues")).rows[0].count);
    const response = await postLeague({
      action: "CREATE_LEAGUE",
      venueId: IDS.venueA,
      name: "Duplicate Slots",
      dayOfWeek: 2,
      seasonStartDate: "2099-01-01",
      matchFormat: "2x20",
      matchDuration: 40,
      fieldsCount: 1,
      timeSlots: ["18:00", "18:00"],
      maxTeams: 2,
    });
    expect(response.status).toBe(400);
    expect(Number((await pool.query("SELECT count(*) FROM leagues")).rows[0].count)).toBe(before);
  });

  it("rejects duplicate legacy time slots before fixture generation writes anything", async () => {
    await pool.query("UPDATE leagues SET status = 'registration', time_slots = '[\"18:00\",\"18:00\"]' WHERE id = $1", [IDS.leagueB]);
    await pool.query("DELETE FROM matches WHERE league_id = $1", [IDS.leagueB]);
    expect((await postLeague({ action: "GENERATE_FIXTURES", leagueId: IDS.leagueB })).status).toBe(409);
    expect(Number((await pool.query("SELECT count(*) FROM matches WHERE league_id = $1", [IDS.leagueB])).rows[0].count)).toBe(0);
    expect((await pool.query("SELECT status FROM leagues WHERE id = $1", [IDS.leagueB])).rows[0].status).toBe("registration");
  });

  it.each([
    ...["UTC", "Africa/Johannesburg", "America/New_York", "Pacific/Auckland"].flatMap((processTimeZone) => (
      ["UTC", "Africa/Johannesburg", "America/New_York", "Pacific/Auckland"].map((databaseTimeZone) => [processTimeZone, databaseTimeZone])
    )),
  ])("keeps stored and returned schedules stable with process TZ %s and PostgreSQL TZ %s", async (processTimeZone, databaseTimeZone) => {
    const originalProcessTimeZone = process.env.TZ;
    const originalPoolOptions = pool.options.options;
    try {
      process.env.TZ = processTimeZone;
      await setPoolSessionTimeZone(databaseTimeZone);

      const created = await createFixture({ matchDate: "2031-12-31", roundNumber: 90 });
      expect(created.status).toBe(200);
      const { matchId } = await created.json();
      const yearBoundary = (await pool.query(`
        SELECT pg_typeof(match_date)::text AS storage_type,
               nova_planned_date(match_date)::text AS planned_date,
               EXTRACT(ISODOW FROM nova_planned_date(match_date))::int AS weekday,
               CASE WHEN pg_typeof(match_date)::text = 'date'
                 THEN match_date::text
                 ELSE to_char(match_date AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
               END AS stored_value,
               time_slot
        FROM matches WHERE id = $1
      `, [matchId])).rows[0];
      expect(yearBoundary.planned_date).toBe("2031-12-31");
      expect(yearBoundary.weekday).toBe(3);
      expect(yearBoundary.stored_value).toBe(yearBoundary.storage_type === "date" ? "2031-12-31" : "2031-12-31 00:00:00");
      expect(yearBoundary.time_slot).toBe("18:30");

      const leapEdit = { matchDate: "2032-02-29", timeSlot: "18:30", fieldNumber: 1, refereeId: null };
      expect((await editFixture(matchId, leapEdit)).status).toBe(200);
      expect((await editFixture(matchId, leapEdit)).status).toBe(200);
      const leapRoundTrip = (await pool.query(`
        SELECT nova_planned_date(match_date)::text AS planned_date,
               EXTRACT(ISODOW FROM nova_planned_date(match_date))::int AS weekday,
               CASE WHEN pg_typeof(match_date)::text = 'date'
                 THEN match_date::text
                 ELSE to_char(match_date AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
               END AS stored_value
        FROM matches WHERE id = $1
      `, [matchId])).rows[0];
      expect(leapRoundTrip.planned_date).toBe("2032-02-29");
      expect(leapRoundTrip.weekday).toBe(7);
      expect(leapRoundTrip.stored_value).toBe(yearBoundary.storage_type === "date" ? "2032-02-29" : "2032-02-29 00:00:00");

      await pool.query("DELETE FROM matches WHERE league_id = $1", [IDS.leagueB]);
      await pool.query(`
        UPDATE leagues
        SET status = 'registration', season_start_date = '2032-03-07 00:00:00+00',
            season_end_date = '2032-06-07 00:00:00+00', fields_count = 1,
            time_slots = '["18:30"]'
        WHERE id = $1
      `, [IDS.leagueB]);
      expect((await postLeague({ action: "GENERATE_FIXTURES", leagueId: IDS.leagueB })).status).toBe(200);
      const generated = (await pool.query(`
        SELECT id, nova_planned_date(match_date)::text AS match_date, time_slot,
               EXTRACT(ISODOW FROM nova_planned_date(match_date))::int AS weekday,
               CASE WHEN pg_typeof(match_date)::text = 'date'
                 THEN match_date::text
                 ELSE to_char(match_date AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
               END AS stored_value
        FROM matches WHERE league_id = $1
      `, [IDS.leagueB])).rows[0];
      expect(generated).toMatchObject({ match_date: "2032-03-07", time_slot: "18:30", weekday: 7 });
      expect(generated.stored_value).toBe(yearBoundary.storage_type === "date" ? "2032-03-07" : "2032-03-07 00:00:00");

      const leagueResponse = await getLeague(request(`/api/leagues?leagueId=${IDS.leagueB}`));
      expect(leagueResponse.status).toBe(200);
      expect((await leagueResponse.json()).season_start_date).toBe("2032-03-07");
      expect((await postPostponeRound({ league_id: IDS.leagueB, round_number: 1 })).status).toBe(200);
      const postponed = (await pool.query(`
        SELECT nova_planned_date(match_date)::text AS match_date, time_slot,
               EXTRACT(ISODOW FROM nova_planned_date(match_date))::int AS weekday,
               CASE WHEN pg_typeof(match_date)::text = 'date'
                 THEN match_date::text
                 ELSE to_char(match_date AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
               END AS stored_value
        FROM matches WHERE id = $1
      `, [generated.id])).rows[0];
      expect(postponed).toMatchObject({ match_date: "2032-03-14", time_slot: "18:30", weekday: 7 });
      expect(postponed.stored_value).toBe(yearBoundary.storage_type === "date" ? "2032-03-14" : "2032-03-14 00:00:00");
    } finally {
      process.env.TZ = originalProcessTimeZone;
      if (originalPoolOptions === undefined) delete pool.options.options;
      else pool.options.options = originalPoolOptions;
      await Promise.all((pool._clients ?? []).map((client) => (
        client.query("SELECT set_config('TimeZone', 'Africa/Johannesburg', false)")
      )));
    }
  }, 30_000);

  it("postpones a scheduled round by seven calendar days", async () => {
    const response = await postPostponeRound({ league_id: IDS.league, round_number: 5 });
    expect(response.status).toBe(200);
    expect((await pool.query("SELECT nova_planned_date(match_date)::text AS match_date FROM matches WHERE id = $1", [IDS.match4])).rows[0].match_date).toBe("2030-02-26");
  });

  it("rejects a wrong-venue administrator before waiting on a victim match lock", async () => {
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match4]);
      authState.actorId = IDS.venueAdminB;
      const response = await Promise.race([
        postPostponeRound({ league_id: IDS.league, round_number: 5 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("wrong-venue request waited on victim locks")), 1000)),
      ]);
      expect(response.status).toBe(403);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
    }
  });

  it.each([IDS.captain, IDS.referee])("rejects a non-admin identity before waiting on victim locks (%s)", async (actorId) => {
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match4]);
      authState.actorId = actorId;
      const response = await Promise.race([
        postPostponeRound({ league_id: IDS.league, round_number: 5 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("non-admin request waited on victim locks")), 1000)),
      ]);
      expect(response.status).toBe(401);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
    }
  });

  it("does not reveal whether a forbidden league exists during cheap preauthorization", async () => {
    authState.actorId = IDS.venueAdminB;
    const existing = await postPostponeRound({ league_id: IDS.league, round_number: 5 });
    const absent = await postPostponeRound({ league_id: "40000000-0000-4000-8000-999999999999", round_number: 5 });
    expect([existing.status, absent.status]).toEqual([403, 403]);
    expect(await existing.json()).toEqual(await absent.json());
  });

  it("rechecks actor role after early authorization while queued on a victim row", async () => {
    const blocker = await pool.connect();
    let queued;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match4]);
      queued = postPostponeRound({ league_id: IDS.league, round_number: 5 });
      await waitForLockQueue("nova_planned_date(match_date)", "POSTPONE_ROUND never queued on the victim match row");
      await pool.query("UPDATE auth_users SET role = 'captain' WHERE id = $1", [IDS.venueAdminA]);
      await blocker.query("COMMIT");
      expect((await queued).status).toBe(403);
      expect((await pool.query("SELECT nova_planned_date(match_date)::text AS match_date FROM matches WHERE id = $1", [IDS.match4])).rows[0].match_date).toBe("2030-02-19");
      expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE action_type = 'POSTPONE_ROUND'")).rows[0].count)).toBe(0);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (queued) await queued.catch(() => {});
    }
  }, 20_000);

  it("rechecks tenant scope after early authorization while queued on a victim row", async () => {
    const blocker = await pool.connect();
    let queued;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match4]);
      queued = postPostponeRound({ league_id: IDS.league, round_number: 5 });
      await waitForLockQueue("nova_planned_date(match_date)", "POSTPONE_ROUND never queued on the victim match row");
      await pool.query("UPDATE auth_users SET venue_id = $1, organization_id = $2 WHERE id = $3", [IDS.venueB, IDS.orgB, IDS.venueAdminA]);
      await blocker.query("COMMIT");
      expect((await queued).status).toBe(403);
      expect((await pool.query("SELECT nova_planned_date(match_date)::text AS match_date FROM matches WHERE id = $1", [IDS.match4])).rows[0].match_date).toBe("2030-02-19");
      expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE action_type = 'POSTPONE_ROUND'")).rows[0].count)).toBe(0);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (queued) await queued.catch(() => {});
    }
  }, 20_000);

  it("locks every target row and re-evaluates it after a concurrent status change", async () => {
    const blocker = await pool.connect();
    let queued;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [IDS.match4]);
      queued = postPostponeRound({ league_id: IDS.league, round_number: 5 });
      await waitForLockQueue("nova_planned_date(match_date)", "POSTPONE_ROUND never queued on the victim match row");
      await blocker.query("UPDATE matches SET status = 'cancelled' WHERE id = $1", [IDS.match4]);
      await blocker.query("COMMIT");
      expect((await queued).status).toBe(404);
      expect((await pool.query("SELECT status, nova_planned_date(match_date)::text AS match_date FROM matches WHERE id = $1", [IDS.match4])).rows[0])
        .toMatchObject({ status: "cancelled", match_date: "2030-02-19" });
      expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE action_type = 'POSTPONE_ROUND'")).rows[0].count)).toBe(0);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (queued) await queued.catch(() => {});
    }
  }, 20_000);

  it.each(["referee", "mixed resource and referee"])("rejects a round shift with a %s conflict atomically", async (kind) => {
    await pool.query("UPDATE matches SET referee_id = $1 WHERE id = $2", [IDS.referee, IDS.match4]);
    await pool.query("UPDATE matches SET match_date = DATE '2030-02-26', time_slot = '18:30', field_number = $1, referee_id = $2 WHERE id = $3", [kind === "referee" ? 2 : 1, IDS.referee, IDS.match2]);
    const before = (await pool.query("SELECT id, nova_planned_date(match_date)::text AS match_date FROM matches WHERE league_id = $1 ORDER BY id", [IDS.league])).rows;
    expect((await postPostponeRound({ league_id: IDS.league, round_number: 5 })).status).toBe(409);
    expect((await pool.query("SELECT id, nova_planned_date(match_date)::text AS match_date FROM matches WHERE league_id = $1 ORDER BY id", [IDS.league])).rows).toEqual(before);
    expect(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE action_type = 'POSTPONE_ROUND'", [])).rows[0].count)).toBe(0);
    expect(Number((await pool.query("SELECT count(*) FROM notifications", [])).rows[0].count)).toBe(0);
  });

  it("serializes a round referee claim against concurrent referee assignment", async () => {
    await pool.query("UPDATE matches SET referee_id = $1 WHERE id = $2", [IDS.referee, IDS.match4]);
    await pool.query("UPDATE matches SET match_date = DATE '2030-02-26', field_number = 2, referee_id = NULL WHERE id = $1", [IDS.match2]);
    const blocker = await pool.connect();
    let roundRequest;
    let assignmentRequest;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [refereeScheduleKey({ refereeId: IDS.referee, matchDate: "2030-02-26", timeSlot: "18:30" })]);
      roundRequest = postPostponeRound({ league_id: IDS.league, round_number: 5 });
      await waitForLockQueue("pg_advisory_xact_lock", "Round postpone never queued on the referee claim lock");
      assignmentRequest = postMatch({ action: "ASSIGN_REFEREE", matchId: IDS.match2, refereeId: IDS.referee });
      await blocker.query("COMMIT");
      expect((await roundRequest).status).toBe(200);
      expect((await assignmentRequest).status).toBe(409);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (roundRequest) await roundRequest.catch(() => {});
      if (assignmentRequest) await assignmentRequest.catch(() => {});
    }
  }, 20_000);

  it.each(["ADMIN_OVERRIDE", "FORFEIT_MATCH"])("uses match-before-league ordering against %s without deadlock", async (action) => {
    const blocker = await pool.connect();
    let resultRequest;
    let roundRequest;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM leagues WHERE id = $1 FOR UPDATE", [IDS.league]);
      resultRequest = action === "FORFEIT_MATCH"
        ? postMatch({ action, matchId: IDS.match4, winnerSide: "home" })
        : postMatch({ action, matchId: IDS.match4, homeScore: 2, awayScore: 0, status: "final", reason: "Lock order" });
      await waitForLockQueue("SELECT id, venue_id, status, fields_count", `${action} never queued on the league lock`);
      roundRequest = postPostponeRound({ league_id: IDS.league, round_number: 5 });
      await waitForLockQueue("nova_planned_date(match_date)", "Round postpone never queued on the match row");
      await blocker.query("COMMIT");
      expect((await resultRequest).status).toBe(200);
      expect([404, 409]).toContain((await roundRequest).status);
      expect((await pool.query("SELECT status FROM matches WHERE id = $1", [IDS.match4])).rows[0].status).toBe("final");
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      if (resultRequest) await resultRequest.catch(() => {});
      if (roundRequest) await roundRequest.catch(() => {});
    }
  }, 20_000);
});
