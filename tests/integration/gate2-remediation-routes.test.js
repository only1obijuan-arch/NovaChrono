import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

const authState = vi.hoisted(() => ({ actorId: null }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => authState.actorId ? { user: { id: authState.actorId } } : null),
}));

import { pool } from "@/app/api/utils/db";
import { DELETE as deleteReferee, POST as createReferee } from "@/app/api/admin/referees/route";
import { DELETE as deleteUser } from "@/app/api/super-admin/users/route";
import { GET as getTeams } from "@/app/api/teams/route";
import { POST as refreshMobile } from "@/app/api/auth/mobile-refresh/route";

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
  league: "40000000-0000-4000-8000-000000000001",
  slotA: "50000000-0000-4000-8000-000000000001",
  slotB: "50000000-0000-4000-8000-000000000002",
  team: "60000000-0000-4000-8000-000000000001",
  match: "70000000-0000-4000-8000-000000000001",
  protectedMatch: "70000000-0000-4000-8000-000000000002",
};

const request = (url, method = "GET", body) => new Request(`https://example.test${url}`, {
  method,
  ...(body === undefined ? {} : {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
});

const resetDatabase = () => pool.query(`TRUNCATE TABLE
    auth_rate_limits, notifications, availability_responses, match_events,
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
      ($8, 'Mobile User', 'mobile@example.test', 'captain', $9, $10, NULL, NOW())
  `, [
    IDS.super, IDS.venueAdminA, IDS.venueAdminB, IDS.orgAdminA,
    IDS.captain, IDS.referee, IDS.protectedReferee, IDS.mobile,
    IDS.venueA, IDS.orgA, IDS.venueB, IDS.orgB,
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
    VALUES ($1, $2, $3, 'Nova United', $4, TIMESTAMPTZ '2026-10-01 00:00:00+00')
  `, [IDS.team, IDS.league, IDS.slotA, IDS.captain]);
  await pool.query(`
    INSERT INTO matches
      (id, league_id, round_number, match_date, time_slot, field_number, home_slot_id, away_slot_id, referee_id)
    VALUES
      ($1, $3, 1, DATE '2030-01-01', '18:30', 1, $4, $5, $6),
      ($2, $3, 2, DATE '2030-01-08', '18:30', 1, $4, $5, $7)
  `, [IDS.match, IDS.protectedMatch, IDS.league, IDS.slotA, IDS.slotB, IDS.referee, IDS.protectedReferee]);
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
    return (await response.json())[0];
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
