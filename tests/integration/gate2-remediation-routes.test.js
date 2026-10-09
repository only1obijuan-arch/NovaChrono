import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

const authState = vi.hoisted(() => ({ actorId: null }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => authState.actorId ? { user: { id: authState.actorId } } : null),
}));

import { pool } from "@/app/api/utils/db";
import { withTransaction } from "@/app/api/utils/sql";
import { DELETE as deleteReferee, POST as createReferee } from "@/app/api/admin/referees/route";
import { DELETE as deleteUser } from "@/app/api/super-admin/users/route";
import { GET as getTeams } from "@/app/api/teams/route";
import { POST as refreshMobile } from "@/app/api/auth/mobile-refresh/route";
import { POST as matchCommand } from "@/app/api/matches/route";
import { recomputeLeagueStandings } from "@/app/api/matches/standings";

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
  slotA: "50000000-0000-4000-8000-000000000001",
  slotB: "50000000-0000-4000-8000-000000000002",
  team: "60000000-0000-4000-8000-000000000001",
  teamB: "60000000-0000-4000-8000-000000000002",
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

const resetDatabase = () => pool.query(`TRUNCATE TABLE
    auth_rate_limits, audit_logs, notifications, availability_responses, match_events,
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
       fields_count, time_slots, max_teams, join_code)
    VALUES ($1, $2, 'League', 2, '2x20', 40, 1, '["18:30"]', 2, 'G2ROUTE1')
  `, [IDS.league, IDS.venueA]);
  await pool.query(
    "INSERT INTO league_slots (id, league_id, slot_number) VALUES ($1, $3, 1), ($2, $3, 2)",
    [IDS.slotA, IDS.slotB, IDS.league],
  );
  await pool.query(`
    INSERT INTO teams (id, league_id, slot_id, name, captain_user_id, created_at)
    VALUES
      ($1, $3, $4, 'Nova United', $6, TIMESTAMPTZ '2026-10-01 00:00:00+00'),
      ($2, $3, $5, 'Orion City', NULL, TIMESTAMPTZ '2026-10-02 00:00:00+00')
  `, [IDS.team, IDS.teamB, IDS.league, IDS.slotA, IDS.slotB, IDS.captain]);
  await pool.query(
    "INSERT INTO players (id, team_id, name) VALUES ($1, $2, 'Home Player'), ($3, $4, 'Away Player')",
    [IDS.playerA, IDS.team, IDS.playerB, IDS.teamB],
  );
  await pool.query(
    "INSERT INTO standings (league_id, team_id) VALUES ($1, $2), ($1, $3)",
    [IDS.league, IDS.team, IDS.teamB],
  );
  await pool.query(`
    INSERT INTO matches
      (id, league_id, round_number, match_date, time_slot, field_number, home_slot_id, away_slot_id, referee_id)
    VALUES
      ($1, $3, 1, DATE '2030-01-01', '18:30', 1, $4, $5, $6),
      ($2, $3, 2, DATE '2030-01-08', '18:30', 1, $4, $5, $7),
      ($8, $3, 3, DATE '2030-01-15', '18:30', 1, $4, $5, $6),
      ($9, $3, 4, DATE '2030-01-22', '18:30', 1, $4, $5, $6),
      ($10, $3, 5, DATE '2030-01-29', '18:30', 1, $4, $5, $6)
  `, [
    IDS.match, IDS.protectedMatch, IDS.league, IDS.slotA, IDS.slotB,
    IDS.referee, IDS.protectedReferee, IDS.match2, IDS.match3, IDS.match4,
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
