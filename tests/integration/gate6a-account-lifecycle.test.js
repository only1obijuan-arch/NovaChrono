import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hash } from "argon2";
import { pool } from "@/app/api/utils/db";
import {
  completeAccountDeidentification,
  requestAccountDeletion,
} from "@/app/api/utils/account-lifecycle";
import { POST as mobileSignin } from "@/app/api/auth/mobile-signin/route";
import { POST as mobileRefresh } from "@/app/api/auth/mobile-refresh/route";

const IDS = {
  org: "11000000-0000-4000-8000-000000000001",
  venue: "22000000-0000-4000-8000-000000000001",
  super: "33000000-0000-4000-8000-000000000001",
  super2: "33000000-0000-4000-8000-000000000004",
  referee: "33000000-0000-4000-8000-000000000002",
  mobile: "33000000-0000-4000-8000-000000000003",
  league: "44000000-0000-4000-8000-000000000001",
  slotA: "55000000-0000-4000-8000-000000000001",
  slotB: "55000000-0000-4000-8000-000000000002",
  teamA: "66000000-0000-4000-8000-000000000001",
  teamB: "66000000-0000-4000-8000-000000000002",
  match: "77000000-0000-4000-8000-000000000001",
};

const PASSWORD = "Gate6aIntegrationPass!";
const originalLifecycleFlag = process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED;

const resetDatabase = () => pool.query(`TRUNCATE TABLE
  auth_rate_limits, api_rate_limits, audit_logs, notifications, availability_responses, match_events,
  matches, standings, players, teams, league_slots, leagues, invite_tokens,
  mobile_sessions, password_reset_tokens, auth_accounts,
  auth_verification_token, auth_users, venues, organizations RESTART IDENTITY CASCADE`);

async function seed() {
  await resetDatabase();
  const passwordHash = await hash(PASSWORD);
  await pool.query("INSERT INTO organizations (id, name) VALUES ($1, 'Gate 6 Org')", [IDS.org]);
  await pool.query(
    "INSERT INTO venues (id, organization_id, name) VALUES ($1, $2, 'Gate 6 Venue')",
    [IDS.venue, IDS.org],
  );
  await pool.query(`
    INSERT INTO auth_users
      (id, name, email, role, venue_id, organization_id, field_number, "emailVerified")
    VALUES
      ($1, 'Platform', 'gate6-super@example.test', 'super_admin', NULL, NULL, NULL, NOW()),
      ($2, 'Historical Referee', 'gate6-referee@example.test', 'referee', $4, $5, 1, NOW()),
      ($3, 'Mobile Account', 'gate6-mobile@example.test', 'captain', $4, $5, NULL, NOW())
  `, [IDS.super, IDS.referee, IDS.mobile, IDS.venue, IDS.org]);
  await pool.query(`
    INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
    VALUES
      ($1, 'credentials', 'credentials', ($1::uuid)::text, $4),
      ($2, 'credentials', 'credentials', ($2::uuid)::text, $4),
      ($3, 'credentials', 'credentials', ($3::uuid)::text, $4)
  `, [IDS.super, IDS.referee, IDS.mobile, passwordHash]);
  await pool.query(`
    INSERT INTO leagues
      (id, venue_id, name, day_of_week, match_format, match_duration_minutes,
       fields_count, time_slots, max_teams, join_code, status)
    VALUES ($1, $2, 'Gate 6 League', 2, '5v5', 40, 1, '["18:00"]', 2, 'GATE6A01', 'completed')
  `, [IDS.league, IDS.venue]);
  await pool.query(
    "INSERT INTO league_slots (id, league_id, slot_number) VALUES ($1,$3,1),($2,$3,2)",
    [IDS.slotA, IDS.slotB, IDS.league],
  );
  await pool.query(`
    INSERT INTO teams (id, league_id, slot_id, name, status)
    VALUES ($1,$3,$4,'History A','inactive'),($2,$3,$5,'History B','inactive')
  `, [IDS.teamA, IDS.teamB, IDS.league, IDS.slotA, IDS.slotB]);
  await pool.query(`
    INSERT INTO matches
      (id, league_id, round_number, match_date, time_slot, field_number,
       home_slot_id, away_slot_id, home_team_id, away_team_id,
       home_score, away_score, status, referee_id, result_type)
    VALUES ($1,$2,1,'2030-01-01','18:00',1,$3,$4,$5,$6,2,1,'final',$7,'played')
  `, [IDS.match, IDS.league, IDS.slotA, IDS.slotB, IDS.teamA, IDS.teamB, IDS.referee]);
}

function mobileRequest(path, body, token) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(async () => {
  process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED = "true";
  await seed();
});
afterAll(async () => {
  await resetDatabase();
  await pool.end();
  if (originalLifecycleFlag === undefined) {
    delete process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED;
  } else {
    process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED = originalLifecycleFlag;
  }
});

describe("Gate 6A.2 account lifecycle integration", () => {
  it("installs validated lifecycle constraints without changing sporting FKs", async () => {
    const constraints = (await pool.query(`
      SELECT conname, convalidated
      FROM pg_constraint
      WHERE conrelid = 'auth_users'::regclass
        AND conname LIKE 'auth_users_%lifecycle%'
      ORDER BY conname
    `)).rows;
    expect(constraints).toEqual([
      { conname: "auth_users_lifecycle_email_consistent", convalidated: true },
      { conname: "auth_users_lifecycle_state_consistent", convalidated: true },
    ]);
    const refereeFk = (await pool.query(`
      SELECT confdeltype FROM pg_constraint
      WHERE conrelid = 'matches'::regclass AND conname = 'matches_referee_id_fkey'
    `)).rows[0];
    expect(refereeFk.confdeltype).toBe("a");
  });

  it("de-identifies a referee while preserving completed-match attribution and team history", async () => {
    const pending = await requestAccountDeletion({ userId: IDS.referee, password: PASSWORD });
    expect(pending).toMatchObject({ status: "pending_deletion", blockers: [] });

    const completed = await completeAccountDeidentification({
      actorId: IDS.super,
      targetUserId: IDS.referee,
      reason: "Verified Gate 6A integration completion",
    });
    expect(completed.status).toBe("deidentified");

    const user = (await pool.query(
      "SELECT id, name, email, role, account_status, venue_id, field_number FROM auth_users WHERE id = $1",
      [IDS.referee],
    )).rows[0];
    expect(user).toMatchObject({
      id: IDS.referee,
      name: "Former referee",
      email: "deidentified+33000000000040008000000000000002@account.invalid",
      role: "referee",
      account_status: "deidentified",
      venue_id: null,
      field_number: null,
    });
    expect((await pool.query("SELECT referee_id FROM matches WHERE id = $1", [IDS.match])).rows[0].referee_id)
      .toBe(IDS.referee);
    expect(Number((await pool.query("SELECT count(*) FROM auth_accounts WHERE \"userId\" = $1", [IDS.referee])).rows[0].count)).toBe(0);
  });

  it("serializes mobile sign-in against deletion so no session survives", async () => {
    const deletion = requestAccountDeletion({ userId: IDS.mobile, password: PASSWORD });
    const signin = mobileSignin(mobileRequest("/api/auth/mobile-signin", {
      email: "gate6-mobile@example.test",
      password: PASSWORD,
    }));
    const [deletionResult, signinResponse] = await Promise.all([deletion, signin]);
    expect(deletionResult.status).toBe("pending_deletion");
    expect([200, 401]).toContain(signinResponse.status);
    expect(Number((await pool.query("SELECT count(*) FROM mobile_sessions WHERE user_id = $1", [IDS.mobile])).rows[0].count)).toBe(0);
    expect((await pool.query("SELECT account_status FROM auth_users WHERE id = $1", [IDS.mobile])).rows[0].account_status)
      .toBe("pending_deletion");
  }, 20_000);

  it("serializes atomic refresh rotation against deletion", async () => {
    const signedIn = await mobileSignin(mobileRequest("/api/auth/mobile-signin", {
      email: "gate6-mobile@example.test",
      password: PASSWORD,
    }));
    expect(signedIn.status).toBe(200);
    const { token } = await signedIn.json();

    const deletion = requestAccountDeletion({ userId: IDS.mobile, password: PASSWORD });
    const refresh = mobileRefresh(mobileRequest("/api/auth/mobile-refresh", null, token));
    const [deletionResult, refreshResponse] = await Promise.all([deletion, refresh]);
    expect(deletionResult.status).toBe("pending_deletion");
    expect([200, 401]).toContain(refreshResponse.status);
    expect(Number((await pool.query("SELECT count(*) FROM mobile_sessions WHERE user_id = $1", [IDS.mobile])).rows[0].count)).toBe(0);
  }, 20_000);

  it("blocks the final active super administrator before access is revoked", async () => {
    await expect(requestAccountDeletion({ userId: IDS.super, password: PASSWORD }))
      .rejects.toMatchObject({ code: "FINAL_SUPER_ADMIN", status: 409 });
    const superAdmin = (await pool.query(
      "SELECT account_status, sessions_valid_after FROM auth_users WHERE id = $1",
      [IDS.super],
    )).rows[0];
    expect(superAdmin.account_status).toBe("active");
    expect(new Date(superAdmin.sessions_valid_after).getTime()).toBe(0);
  });

  it("serializes concurrent super-admin deletion requests and preserves one active successor", async () => {
    await pool.query(`
      INSERT INTO auth_users (id, name, email, role, "emailVerified")
      VALUES ($1, 'Platform Successor', 'gate6-super2@example.test', 'super_admin', NOW())
    `, [IDS.super2]);
    await pool.query(`
      INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
      SELECT $1, 'credentials', 'credentials', ($1::uuid)::text, password
      FROM auth_accounts
      WHERE "userId" = $2 AND provider = 'credentials'
    `, [IDS.super2, IDS.super]);

    const results = await Promise.allSettled([
      requestAccountDeletion({ userId: IDS.super, password: PASSWORD }),
      requestAccountDeletion({ userId: IDS.super2, password: PASSWORD }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected").reason)
      .toMatchObject({ code: "FINAL_SUPER_ADMIN", status: 409 });

    const states = (await pool.query(`
      SELECT account_status, count(*)::int AS count
      FROM auth_users
      WHERE role = 'super_admin'
      GROUP BY account_status
      ORDER BY account_status
    `)).rows;
    expect(states).toEqual([
      { account_status: "active", count: 1 },
      { account_status: "pending_deletion", count: 1 },
    ]);
  }, 20_000);
});
