import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ actorId: null }));
const providers = vi.hoisted(() => ({ sendEmail: vi.fn(), sendPush: vi.fn() }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => state.actorId ? { user: { id: state.actorId } } : null),
}));
vi.mock("@/app/api/utils/send-email", () => ({ sendEmail: providers.sendEmail }));
vi.mock("@/app/api/utils/send-push", () => ({ sendPush: providers.sendPush }));

import { pool } from "@/app/api/utils/db";
import {
  findAutomaticReminderCandidates,
  sendMiddayUnconfirmedAlerts,
  sendReminderForTeam,
} from "@/app/api/utils/match-reminders";
import { GET as availabilityGet, POST as availabilityPost } from "@/app/api/auth/confirm-availability/route";
import { POST as cronPost } from "@/app/api/cron/match-reminders/route";
import { PATCH as notificationsPatch } from "@/app/api/notifications/route";
import { assignPushToken } from "@/app/api/utils/push-token-store";
import { POST as teamCommand } from "@/app/api/teams/route";
import { POST as matchCommand } from "@/app/api/matches/route";

const ID = {
  org: "c1000000-0000-4000-8000-000000000001",
  venue: "c2000000-0000-4000-8000-000000000001",
  admin: "c3000000-0000-4000-8000-000000000001",
  captainA: "c3000000-0000-4000-8000-000000000002",
  captainB: "c3000000-0000-4000-8000-000000000003",
  captainC: "c3000000-0000-4000-8000-000000000004",
  league: "c4000000-0000-4000-8000-000000000001",
  slotA: "c5000000-0000-4000-8000-000000000001",
  slotB: "c5000000-0000-4000-8000-000000000002",
  slotC: "c5000000-0000-4000-8000-000000000003",
  teamA: "c6000000-0000-4000-8000-000000000001",
  teamB: "c6000000-0000-4000-8000-000000000002",
  teamC: "c6000000-0000-4000-8000-000000000003",
  match: "c7000000-0000-4000-8000-000000000001",
};

const jsonRequest = (path, body, headers = {}) => new Request(`https://example.test${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

const formRequest = (token, response) => new Request("https://example.test/api/auth/confirm-availability", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ token, response }),
});

async function waitForLockWaiters(fragment, minimum = 1) {
  const observer = await pool.connect();
  try {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const { rows: [row] } = await observer.query(`
        SELECT count(*)::int AS waiting
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query LIKE $1
      `, [`%${fragment}%`]);
      if (row.waiting >= minimum) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const { rows } = await observer.query(`
      SELECT pid, state, wait_event_type, wait_event, query, pg_blocking_pids(pid) AS blockers
      FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
    `);
    throw new Error(`Expected ${minimum} lock waiter(s) for ${fragment}: ${JSON.stringify(rows)}`);
  } finally {
    observer.release();
  }
}

async function setPoolSessionTimeZone(timeZone) {
  pool.options.options = `-c timezone=${timeZone}`;
  const clients = (pool._clients ?? []).filter((client) => (
    client._connected && !client._ending && !client._ended
  ));
  await Promise.all(clients.map((client) => (
    client.query("SELECT set_config('TimeZone', $1, false)", [timeZone])
  )));
}

async function seed() {
  await pool.query("DELETE FROM notifications WHERE match_id = $1 OR user_id IN ($2, $3, $4, $5)", [ID.match, ID.admin, ID.captainA, ID.captainB, ID.captainC]);
  await pool.query("DELETE FROM availability_responses WHERE match_id = $1", [ID.match]);
  await pool.query("DELETE FROM match_events WHERE match_id = $1", [ID.match]);
  await pool.query("DELETE FROM standings WHERE league_id = $1", [ID.league]);
  await pool.query("DELETE FROM matches WHERE id = $1", [ID.match]);
  await pool.query("DELETE FROM audit_logs WHERE action_by IN ($1, $2, $3, $4)", [ID.admin, ID.captainA, ID.captainB, ID.captainC]);
  await pool.query("DELETE FROM teams WHERE league_id = $1", [ID.league]);
  await pool.query("DELETE FROM league_slots WHERE league_id = $1", [ID.league]);
  await pool.query("DELETE FROM leagues WHERE id = $1", [ID.league]);
  await pool.query("DELETE FROM auth_users WHERE id IN ($1, $2, $3, $4)", [ID.admin, ID.captainA, ID.captainB, ID.captainC]);
  await pool.query("DELETE FROM venues WHERE id = $1", [ID.venue]);
  await pool.query("DELETE FROM organizations WHERE id = $1", [ID.org]);

  await pool.query("INSERT INTO organizations (id, name) VALUES ($1, 'Gate 5 Org')", [ID.org]);
  await pool.query("INSERT INTO venues (id, organization_id, name) VALUES ($1, $2, 'Gate 5 Venue')", [ID.venue, ID.org]);
  await pool.query(`
    INSERT INTO auth_users (id, name, email, role, venue_id, organization_id)
    VALUES
      ($1, 'Gate 5 Admin', 'gate5-admin@example.test', 'venue_admin', $5, $6),
      ($2, 'Captain A', 'gate5-a@example.test', 'captain', NULL, NULL),
      ($3, 'Captain B', 'gate5-b@example.test', 'captain', NULL, NULL),
      ($4, 'Captain C', 'gate5-c@example.test', 'captain', NULL, NULL)
  `, [ID.admin, ID.captainA, ID.captainB, ID.captainC, ID.venue, ID.org]);
  await pool.query(`
    INSERT INTO leagues (
      id, venue_id, name, day_of_week, match_format, match_duration_minutes,
      fields_count, time_slots, max_teams, join_code, status
    ) VALUES ($1, $2, 'Gate 5 League', 2, '2x20', 40, 1, '["18:30"]', 3, 'GATE5001', 'active')
  `, [ID.league, ID.venue]);
  await pool.query(`
    INSERT INTO league_slots (id, league_id, slot_number)
    VALUES ($1, $4, 1), ($2, $4, 2), ($3, $4, 3)
  `, [ID.slotA, ID.slotB, ID.slotC, ID.league]);
  await pool.query(`
    INSERT INTO teams (id, league_id, slot_id, name, captain_user_id, status)
    VALUES
      ($1, $7, $4, 'Gate 5 Team A', $8, 'active'),
      ($2, $7, $5, 'Gate 5 Team B', $9, 'active'),
      ($3, $7, $6, 'Gate 5 Team C', $10, 'active')
  `, [ID.teamA, ID.teamB, ID.teamC, ID.slotA, ID.slotB, ID.slotC, ID.league, ID.captainA, ID.captainB, ID.captainC]);
  await pool.query(`
    INSERT INTO matches (
      id, league_id, round_number, match_date, time_slot, field_number,
      home_slot_id, away_slot_id, home_team_id, away_team_id, status
    ) VALUES (
      $1, $2, 1,
      (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Johannesburg')::date + 2,
      '18:30', 1, $3, $4, $5, $6, 'scheduled'
    )
  `, [ID.match, ID.league, ID.slotA, ID.slotB, ID.teamA, ID.teamB]);
}

async function issue(teamId = ID.teamA, side = "home", automatic = false) {
  const result = await sendReminderForTeam({
    matchId: ID.match,
    teamId,
    side,
    automatic,
    actorId: automatic ? null : ID.admin,
    appUrl: "https://example.test",
  });
  expect(result.status).toBe("sent");
  const { rows: [row] } = await pool.query(
    "SELECT * FROM availability_responses WHERE match_id = $1 AND team_id = $2",
    [ID.match, teamId],
  );
  return row;
}

async function resetOpportunity() {
  await pool.query("DELETE FROM notifications WHERE match_id = $1", [ID.match]);
  await pool.query("DELETE FROM availability_responses WHERE match_id = $1", [ID.match]);
  providers.sendEmail.mockClear();
  providers.sendPush.mockClear();
}

beforeEach(async () => {
  state.actorId = ID.admin;
  providers.sendEmail.mockReset().mockResolvedValue({ id: "gate5-email" });
  providers.sendPush.mockReset().mockResolvedValue({
    status: "accepted",
    accepted: true,
    retryable: false,
    ticketId: "gate5-push",
  });
  await seed();
});

afterAll(async () => {
  delete process.env.CRON_SECRET;
  await pool.end();
});

describe("Gate 5 availability oracle", () => {
  it("keeps normal and crawler GET previews read-only", async () => {
    const row = await issue();
    providers.sendEmail.mockClear();
    const before = await pool.query("SELECT response, responded_at, token, reminder_count FROM availability_responses WHERE id = $1", [row.id]);
    for (const agent of ["Mozilla/5.0", "SecurityScanner/1.0"]) {
      const response = await availabilityGet(new Request(
        `https://example.test/api/auth/confirm-availability?token=${row.token}&response=yes`,
        { headers: { "User-Agent": agent } },
      ));
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('method="post"');
    }
    const after = await pool.query("SELECT response, responded_at, token, reminder_count FROM availability_responses WHERE id = $1", [row.id]);
    expect(after.rows).toEqual(before.rows);
    expect(providers.sendEmail).not.toHaveBeenCalled();
  });

  it.each(["yes", "no"])("consumes a valid POST %s exactly once", async (answer) => {
    const row = await issue();
    providers.sendEmail.mockClear();
    expect((await availabilityPost(formRequest(row.token, answer))).status).toBe(200);
    expect((await availabilityPost(formRequest(row.token, answer))).status).toBe(410);
    const { rows: [saved] } = await pool.query("SELECT response, responded_at, token FROM availability_responses WHERE id = $1", [row.id]);
    expect(saved.response).toBe(answer);
    expect(saved.responded_at).not.toBeNull();
    expect(saved.token).toBeNull();
    expect(Number((await pool.query("SELECT count(*) FROM notifications WHERE match_id = $1 AND type LIKE 'availability_%'", [ID.match])).rows[0].count)).toBe(1);
    expect(providers.sendEmail).toHaveBeenCalledOnce();
  });

  it.each([
    ["expired token", "UPDATE availability_responses SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = $1"],
    ["cancelled match", "UPDATE matches SET status = 'cancelled' WHERE id = $1"],
    ["live match", "UPDATE matches SET status = 'live' WHERE id = $1"],
    ["final match", "UPDATE matches SET status = 'final' WHERE id = $1"],
    ["cancelled league", "UPDATE leagues SET status = 'cancelled' WHERE id = $1"],
    ["completed league", "UPDATE leagues SET status = 'completed' WHERE id = $1"],
    ["withdrawn team", "UPDATE teams SET status = 'inactive' WHERE id = $1"],
  ])("fails closed for %s", async (_name, statement) => {
    const row = await issue();
    const target = statement.includes("availability_responses") ? row.id
      : statement.includes("leagues") ? ID.league
        : statement.includes("teams") ? ID.teamA : ID.match;
    await pool.query(statement, [target]);
    expect((await availabilityPost(formRequest(row.token, "yes"))).status).toBe(410);
    expect((await pool.query("SELECT responded_at FROM availability_responses WHERE id = $1", [row.id])).rows[0].responded_at).toBeNull();
  });

  it("rejects malformed, nonexistent, wrong-team, begun, and rescheduled tokens", async () => {
    expect((await availabilityPost(formRequest("bad", "yes"))).status).toBe(400);
    expect((await availabilityPost(formRequest("a".repeat(64), "maybe"))).status).toBe(400);
    expect((await availabilityPost(formRequest("f".repeat(64), "yes"))).status).toBe(410);

    const row = await issue();
    await pool.query("UPDATE availability_responses SET team_id = $1 WHERE id = $2", [ID.teamC, row.id]);
    expect((await availabilityPost(formRequest(row.token, "yes"))).status).toBe(410);

    await resetOpportunity();
    const begun = await issue();
    await pool.query(`
      UPDATE matches
      SET match_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Johannesburg')::date,
          time_slot = '00:00'
      WHERE id = $1
    `, [ID.match]);
    await pool.query(`
      UPDATE availability_responses ar
      SET expires_at = (nova_planned_date(m.match_date) + m.time_slot::time)
        AT TIME ZONE 'Africa/Johannesburg'
      FROM matches m WHERE m.id = ar.match_id AND ar.id = $1
    `, [begun.id]);
    expect((await availabilityPost(formRequest(begun.token, "yes"))).status).toBe(410);

    await resetOpportunity();
    await pool.query("UPDATE matches SET match_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Johannesburg')::date + 2, time_slot = '18:30' WHERE id = $1", [ID.match]);
    const rescheduled = await issue();
    await pool.query("UPDATE matches SET match_date = nova_planned_date(match_date) + 1 WHERE id = $1", [ID.match]);
    expect((await availabilityPost(formRequest(rescheduled.token, "yes"))).status).toBe(410);
  });
});

describe("Gate 5 required-email failure recovery", () => {
  it.each([
    ["400", "EMAIL_PROVIDER_ERROR", false],
    ["429", "EMAIL_PROVIDER_ERROR", true],
    ["500", "EMAIL_PROVIDER_ERROR", true],
    ["timeout", "EMAIL_TIMEOUT", true],
    ["network", "EMAIL_NETWORK_ERROR", true],
  ])("releases a recoverable claim after email %s", async (_case, code, retryable) => {
    providers.sendEmail.mockRejectedValueOnce(Object.assign(new Error("sanitized"), { code, retryable }));
    const failed = await sendReminderForTeam({
      matchId: ID.match, teamId: ID.teamA, side: "home", automatic: true,
      appUrl: "https://example.test",
    });
    expect(failed).toMatchObject({ status: "email_failed", reason: code, retryable });
    const { rows: [afterFailure] } = await pool.query(`
      SELECT reminder_count, last_reminder_at, delivery_claim_id, delivery_claimed_at
      FROM availability_responses WHERE match_id = $1 AND team_id = $2
    `, [ID.match, ID.teamA]);
    expect(afterFailure.reminder_count).toBe(0);
    expect(afterFailure.last_reminder_at).toBeNull();
    expect(afterFailure.delivery_claim_id).not.toBeNull();
    expect(afterFailure.delivery_claimed_at).toBeNull();

    providers.sendEmail.mockResolvedValueOnce({ id: "retry-success" });
    const retry = await sendReminderForTeam({
      matchId: ID.match, teamId: ID.teamA, side: "home", automatic: true,
      appUrl: "https://example.test",
    });
    expect(retry.status).toBe("sent");
    const { rows: [afterRetry] } = await pool.query(`
      SELECT reminder_count, last_reminder_at, delivery_claim_id, delivery_claimed_at
      FROM availability_responses WHERE match_id = $1 AND team_id = $2
    `, [ID.match, ID.teamA]);
    expect(afterRetry.reminder_count).toBe(1);
    expect(afterRetry.last_reminder_at).not.toBeNull();
    expect(afterRetry.delivery_claim_id).toBeNull();
    expect(afterRetry.delivery_claimed_at).toBeNull();
  });

  it("keeps email success authoritative when optional push fails", async () => {
    await pool.query("UPDATE auth_users SET push_token = 'ExpoPushToken[gate5-valid]' WHERE id = $1", [ID.captainA]);
    providers.sendPush.mockResolvedValueOnce({ status: "provider_error", accepted: false, retryable: true });
    const result = await sendReminderForTeam({
      matchId: ID.match, teamId: ID.teamA, side: "home", automatic: true,
      appUrl: "https://example.test",
    });
    expect(result).toMatchObject({ status: "sent", push: { status: "provider_error" } });
    expect((await pool.query("SELECT reminder_count FROM availability_responses WHERE match_id = $1 AND team_id = $2", [ID.match, ID.teamA])).rows[0].reminder_count).toBe(1);
  });

  it("finalizes email success even when the optional push helper throws", async () => {
    await pool.query("UPDATE auth_users SET push_token = 'ExpoPushToken[gate5-valid]' WHERE id = $1", [ID.captainA]);
    providers.sendPush.mockRejectedValueOnce(new Error("temporary push failure"));
    const result = await sendReminderForTeam({
      matchId: ID.match, teamId: ID.teamA, side: "home", automatic: true,
      appUrl: "https://example.test",
    });
    expect(result).toMatchObject({ status: "sent", push: { status: "provider_error" } });
    expect((await pool.query("SELECT reminder_count, delivery_claimed_at FROM availability_responses WHERE match_id = $1 AND team_id = $2", [ID.match, ID.teamA])).rows[0]).toEqual({
      reminder_count: 1,
      delivery_claimed_at: null,
    });
  });
});

describe("Gate 5 deterministic PostgreSQL concurrency A-J", () => {
  it("A: availability POST yes vs no has exactly one winner", async () => {
    const row = await issue();
    providers.sendEmail.mockClear();
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [ID.match]);
      const yes = availabilityPost(formRequest(row.token, "yes"));
      const no = availabilityPost(formRequest(row.token, "no"));
      await waitForLockWaiters("FOR UPDATE OF m", 2);
      await blocker.query("COMMIT");
      const statuses = [(await yes).status, (await no).status].sort();
      expect(statuses).toEqual([200, 410]);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
    }
    expect(Number((await pool.query("SELECT count(*) FROM notifications WHERE match_id = $1 AND type LIKE 'availability_%'", [ID.match])).rows[0].count)).toBe(1);
    expect(providers.sendEmail).toHaveBeenCalledOnce();
  });

  it.each([
    ["B: cron vs cron", true, null, true, null],
    ["C: cron vs manual", true, null, false, ID.admin],
    ["D: manual vs manual", false, ID.admin, false, ID.admin],
  ])("%s produces one required email and no stranded claim", async (_name, automaticA, actorA, automaticB, actorB) => {
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [ID.match]);
      const first = sendReminderForTeam({ matchId: ID.match, teamId: ID.teamA, side: "home", automatic: automaticA, actorId: actorA, appUrl: "https://example.test" });
      const second = sendReminderForTeam({ matchId: ID.match, teamId: ID.teamA, side: "home", automatic: automaticB, actorId: actorB, appUrl: "https://example.test" });
      await waitForLockWaiters("FOR UPDATE OF m", 2);
      await blocker.query("COMMIT");
      const results = await Promise.all([first, second]);
      expect(results.filter((result) => result.status === "sent")).toHaveLength(1);
      expect(results.filter((result) => result.status === "skipped")).toHaveLength(1);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
    }
    expect(providers.sendEmail).toHaveBeenCalledOnce();
    const { rows: [row] } = await pool.query("SELECT reminder_count, delivery_claimed_at FROM availability_responses WHERE match_id = $1 AND team_id = $2", [ID.match, ID.teamA]);
    expect(row.reminder_count).toBe(1);
    expect(row.delivery_claimed_at).toBeNull();
  });

  it("E: replacement queued first makes the reminder resolve the new team", async () => {
    await pool.query("UPDATE teams SET status = 'inactive' WHERE id = $1", [ID.teamA]);
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [ID.match]);
      const replacement = teamCommand(jsonRequest("/api/teams", {
        action: "REPLACE_TEAM",
        priorTeamId: ID.teamA,
        teamName: "Gate 5 Replacement",
        captainUserId: ID.captainA,
        transferFutureFixtures: true,
        reason: "Gate 5 replacement race",
      }));
      await waitForLockWaiters("WHERE id = ANY", 1);
      const reminder = sendReminderForTeam({ matchId: ID.match, teamId: ID.teamA, side: "home", automatic: true, appUrl: "https://example.test" });
      await waitForLockWaiters("FOR UPDATE OF m", 1);
      await blocker.query("COMMIT");
      const replacementResponse = await replacement;
      expect(replacementResponse.status).toBe(200);
      const replacementBody = await replacementResponse.json();
      expect((await reminder).status).toBe("sent");
      const { rows } = await pool.query("SELECT team_id FROM availability_responses WHERE match_id = $1", [ID.match]);
      expect(rows.map((row) => row.team_id)).toEqual([replacementBody.team.id]);
      expect(rows[0].team_id).not.toBe(ID.teamA);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
    }
  });

  it("F: START_MATCH queued first prevents reminder issuance", async () => {
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [ID.match]);
      const start = matchCommand(jsonRequest("/api/matches", { action: "START_MATCH", matchId: ID.match }));
      await waitForLockWaiters("FOR UPDATE OF m", 1);
      const reminder = sendReminderForTeam({ matchId: ID.match, teamId: ID.teamA, side: "home", automatic: true, appUrl: "https://example.test" });
      await waitForLockWaiters("FOR UPDATE OF m", 2);
      await blocker.query("COMMIT");
      expect((await start).status).toBe(200);
      expect(await reminder).toMatchObject({ status: "skipped", reason: "match_not_scheduled" });
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
    }
    expect(providers.sendEmail).not.toHaveBeenCalled();
  });

  it("G: response queued behind replacement cannot transfer old-team history", async () => {
    const row = await issue();
    providers.sendEmail.mockClear();
    await pool.query("UPDATE teams SET status = 'inactive' WHERE id = $1", [ID.teamA]);
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [ID.match]);
      const replacement = teamCommand(jsonRequest("/api/teams", {
        action: "REPLACE_TEAM",
        priorTeamId: ID.teamA,
        teamName: "Gate 5 Response-Race Replacement",
        captainUserId: ID.captainA,
        transferFutureFixtures: true,
        reason: "Gate 5 response race",
      }));
      await waitForLockWaiters("WHERE id = ANY", 1);
      const response = availabilityPost(formRequest(row.token, "yes"));
      await waitForLockWaiters("FOR UPDATE OF m", 1);
      await blocker.query("COMMIT");
      const replacementResponse = await replacement;
      expect(replacementResponse.status).toBe(200);
      const replacementId = (await replacementResponse.json()).team.id;
      expect((await response).status).toBe(410);
      const { rows: [saved] } = await pool.query("SELECT team_id, response FROM availability_responses WHERE id = $1", [row.id]);
      expect(saved).toEqual({ team_id: ID.teamA, response: null });
      expect((await pool.query("SELECT home_team_id FROM matches WHERE id = $1", [ID.match])).rows[0].home_team_id).toBe(replacementId);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
    }
  });

  it("H: response queued behind match start fails closed", async () => {
    const row = await issue();
    providers.sendEmail.mockClear();
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [ID.match]);
      const start = matchCommand(jsonRequest("/api/matches", { action: "START_MATCH", matchId: ID.match }));
      await waitForLockWaiters("FOR UPDATE OF m", 1);
      const response = availabilityPost(formRequest(row.token, "yes"));
      await waitForLockWaiters("FOR UPDATE OF m", 2);
      await blocker.query("COMMIT");
      expect((await start).status).toBe(200);
      expect((await response).status).toBe(410);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
    }
    expect((await pool.query("SELECT response FROM availability_responses WHERE id = $1", [row.id])).rows[0].response).toBeNull();
  });

  it("I: duplicate same-day alert execution produces one notification and email", async () => {
    await pool.query("UPDATE matches SET match_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Johannesburg')::date WHERE id = $1", [ID.match]);
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM matches WHERE id = $1 FOR UPDATE", [ID.match]);
      const first = sendMiddayUnconfirmedAlerts();
      const second = sendMiddayUnconfirmedAlerts();
      await waitForLockWaiters("FOR UPDATE OF m", 2);
      await blocker.query("COMMIT");
      await Promise.all([first, second]);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
    }
    expect(Number((await pool.query("SELECT count(*) FROM notifications WHERE match_id = $1 AND type = 'unconfirmed_alert'", [ID.match])).rows[0].count)).toBe(1);
    expect(providers.sendEmail).toHaveBeenCalledOnce();
  });

  it("J: concurrent push-token assignment leaves one owner and no uncaught uniqueness error", async () => {
    const token = "ExpoPushToken[gate5-shared-device]";
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM auth_users WHERE id IN ($1, $2) ORDER BY id FOR UPDATE", [ID.captainA, ID.captainB]);
      const first = assignPushToken(ID.captainA, token);
      const second = assignPushToken(ID.captainB, token);
      await waitForLockWaiters("FROM auth_users", 2);
      await blocker.query("COMMIT");
      const results = await Promise.all([first, second]);
      expect(results.every((result) => ["registered", "conflict"].includes(result.status))).toBe(true);
      expect(results.some((result) => result.status === "registered")).toBe(true);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
    }
    expect(Number((await pool.query("SELECT count(*) FROM auth_users WHERE push_token = $1", [token])).rows[0].count)).toBe(1);
  });
});

describe("Gate 5 cron, timezone, and notification authorization", () => {
  it("preserves cron secret protection and rejects unknown work types", async () => {
    process.env.CRON_SECRET = "gate5-cron-secret";
    expect((await cronPost(new Request("https://example.test/api/cron/match-reminders", { method: "POST" }))).status).toBe(401);
    expect((await cronPost(new Request("https://example.test/api/cron/match-reminders", { method: "POST", headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    expect((await cronPost(new Request("https://example.test/api/cron/match-reminders?type=unknown", { method: "POST", headers: { authorization: "Bearer gate5-cron-secret" } }))).status).toBe(400);
    expect((await cronPost(new Request("https://example.test/api/cron/match-reminders?type=reminders", { method: "POST", headers: { authorization: "Bearer gate5-cron-secret" } }))).status).toBe(200);
  });

  it("selects the same Johannesburg reminder opportunity under three session timezones", async () => {
    const observed = [];
    for (const timeZone of ["UTC", "America/Los_Angeles", "Africa/Johannesburg"]) {
      await setPoolSessionTimeZone(timeZone);
      const candidates = await findAutomaticReminderCandidates();
      observed.push(candidates.filter((candidate) => candidate.match_id === ID.match).map((candidate) => candidate.side).sort());
    }
    expect(observed).toEqual([["away", "home"], ["away", "home"], ["away", "home"]]);
  });

  it("sets read_at once, scopes mark-all, and returns 404 for another user's ID", async () => {
    const own = (await pool.query(`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES ($1, 'admin_message', 'Own', 'Own message') RETURNING id
    `, [ID.admin])).rows[0];
    const ownSecond = (await pool.query(`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES ($1, 'admin_message', 'Own 2', 'Own message 2') RETURNING id
    `, [ID.admin])).rows[0];
    const foreign = (await pool.query(`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES ($1, 'admin_message', 'Foreign', 'Foreign message') RETURNING id
    `, [ID.captainA])).rows[0];

    const patch = (body) => notificationsPatch(jsonRequest("/api/notifications", body));
    expect((await patch({ notificationId: own.id })).status).toBe(200);
    const firstReadAt = (await pool.query("SELECT read_at FROM notifications WHERE id = $1", [own.id])).rows[0].read_at;
    expect((await patch({ notificationId: own.id })).status).toBe(200);
    expect((await pool.query("SELECT read_at FROM notifications WHERE id = $1", [own.id])).rows[0].read_at).toEqual(firstReadAt);
    expect((await patch({ notificationId: foreign.id })).status).toBe(404);
    expect((await patch({ markAllRead: true })).status).toBe(200);
    expect((await pool.query("SELECT read, read_at FROM notifications WHERE id = $1", [ownSecond.id])).rows[0]).toMatchObject({ read: true });
    expect((await pool.query("SELECT read, read_at FROM notifications WHERE id = $1", [foreign.id])).rows[0]).toEqual({ read: false, read_at: null });
  });
});
