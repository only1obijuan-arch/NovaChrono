import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { SignJWT } from "jose";

// Non-active account rejection (Gate 6A.2 hardening), real PostgreSQL. Every
// test changes ONLY account_status (never the session boundary) so that the
// status check is the one control that can reject the caller, and an active
// control proves the same fixture works when the account is active.
const authState = vi.hoisted(() => ({ actorId: null }));
const hashControl = vi.hoisted(() => ({ waiter: null }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => authState.actorId ? { user: { id: authState.actorId } } : null),
}));
vi.mock("@/app/api/utils/send-email", () => ({ sendEmail: vi.fn(async () => ({ id: "test-mail" })) }));
vi.mock("argon2", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    hash: vi.fn(async (...args) => {
      const waiter = hashControl.waiter;
      if (waiter) {
        hashControl.waiter = null;
        waiter.started();
        await waiter.release;
      }
      return actual.hash(...args);
    }),
  };
});

import { hash } from "argon2";
import { pool } from "@/app/api/utils/db";
import { requestAccountDeletion } from "@/app/api/utils/account-lifecycle";
import { requireRole, resolveCurrentUser } from "@/app/api/utils/auth";
import { verifyMobileToken } from "@/app/api/utils/mobile-auth";
import { GET as deletionAvailability } from "@/app/api/account/deletion/route";
import { POST as mobileRefresh } from "@/app/api/auth/mobile-refresh/route";
import { GET as validateReset, POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { GET as verifyEmail } from "@/app/api/auth/verify-email/route";
import { POST as acceptInvite } from "@/app/api/admin/accept-invite/route";
import { POST as provisionReferee } from "@/app/api/admin/referees/route";

const u = (n) => `d3000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = {
  org: "d1000000-0000-4000-8000-000000000001", venue: "d2000000-0000-4000-8000-000000000001",
  admin: u(1), subject: u(2), inviter: u(3), referee: u(4), super: u(5),
};
const PASSWORD = "NonActivePass!123";
const NON_ACTIVE = ["pending_deletion", "deidentified"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const flags = {
  mutations: process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED,
  completion: process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED,
};
let passwordHash;

const reset = () => pool.query(`TRUNCATE TABLE
  auth_rate_limits, api_rate_limits, audit_logs, notifications, availability_responses, match_events,
  matches, standings, players, teams, league_slots, leagues, invite_tokens,
  mobile_sessions, password_reset_tokens, auth_accounts,
  auth_verification_token, auth_users, venues, organizations RESTART IDENTITY CASCADE`);

async function seed() {
  await reset();
  await pool.query("INSERT INTO organizations (id, name) VALUES ($1,'Org')", [ID.org]);
  await pool.query("INSERT INTO venues (id, organization_id, name) VALUES ($1,$2,'Gate 6 Venue')", [ID.venue, ID.org]);
  const rows = [
    ["admin", "venue_admin", ID.venue, ID.org, null, "admin@nonactive.example.test"],
    ["subject", "captain", ID.venue, ID.org, null, "subject@nonactive.example.test"],
    ["inviter", "venue_admin", ID.venue, ID.org, null, "inviter@nonactive.example.test"],
    ["referee", "referee", ID.venue, ID.org, 1, "ref-field1@gate6venue.novachrono.com"],
    ["super", "super_admin", null, null, null, "super@nonactive.example.test"],
  ];
  for (const [key, role, venue, org, field, email] of rows) {
    await pool.query(
      `INSERT INTO auth_users (id, name, email, role, venue_id, organization_id, field_number, "emailVerified")
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [ID[key], `Person ${key}`, email, role, venue, org, field],
    );
    await pool.query(
      `INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
       VALUES ($1,'credentials','credentials',$2,$3)`,
      [ID[key], email, passwordHash],
    );
  }
}

// Changes status only. The session boundary is deliberately left at its default
// so the status check, not the boundary, has to reject the caller.
async function setStatus(userId, status) {
  if (status === "active") return;
  const compact = String(userId).replaceAll("-", "");
  if (status === "pending_deletion") {
    await pool.query(
      `UPDATE auth_users SET account_status = 'pending_deletion', deletion_request_id = gen_random_uuid(),
         deletion_requested_at = NOW() WHERE id = $1`,
      [userId],
    );
    return;
  }
  await pool.query(
    `UPDATE auth_users SET account_status = 'deidentified', deletion_request_id = gen_random_uuid(),
       deletion_requested_at = NOW(), deidentified_at = NOW(), "emailVerified" = NULL,
       email = $2, name = 'Former captain', venue_id = NULL, organization_id = NULL
     WHERE id = $1`,
    [userId, `deidentified+${compact}@account.invalid`],
  );
}

async function mintMobileSession(userId) {
  const jti = randomUUID();
  await pool.query(
    "INSERT INTO mobile_sessions (jti, user_id, expires_at) VALUES ($1,$2,NOW() + interval '7 days')",
    [jti, userId],
  );
  const token = await new SignJWT({ id: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  return { jti, token };
}

const bearer = (token, path = "/api/x") => new Request(`https://example.test${path}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
});
const jsonPost = (path, body) => new Request(`https://example.test${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://example.test" },
  body: JSON.stringify(body),
});

beforeAll(async () => { passwordHash = await hash(PASSWORD); });
beforeEach(async () => {
  process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED = "true";
  process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED = "true";
  authState.actorId = null;
  hashControl.waiter = null;
  await seed();
});
afterAll(async () => {
  await reset();
  await pool.end();
  for (const [name, value] of [["ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED", flags.mutations], ["ACCOUNT_LIFECYCLE_COMPLETION_ENABLED", flags.completion]]) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

describe("web session resolution", () => {
  it("resolves an active account but never a pending or de-identified one", async () => {
    authState.actorId = ID.subject;
    expect((await resolveCurrentUser(new Request("https://example.test/x")))?.id).toBe(ID.subject);
    expect((await requireRole(new Request("https://example.test/x"), "captain"))?.id).toBe(ID.subject);

    for (const status of NON_ACTIVE) {
      await seed();
      await setStatus(ID.subject, status);
      authState.actorId = ID.subject;
      expect(await resolveCurrentUser(new Request("https://example.test/x")), status).toBeNull();
      expect(await requireRole(new Request("https://example.test/x"), "captain"), status).toBeNull();
      const response = await deletionAvailability(new Request("https://example.test/api/account/deletion"));
      expect(response.status, status).toBe(401);
    }
  });
});

describe("mobile bearer validation and refresh", () => {
  it("validates a bearer token for an active account only, even while its session row survives", async () => {
    const live = await mintMobileSession(ID.subject);
    expect((await verifyMobileToken(bearer(live.token)))?.id).toBe(ID.subject);
    expect((await resolveCurrentUser(bearer(live.token)))?.id).toBe(ID.subject);

    for (const status of NON_ACTIVE) {
      await seed();
      const session = await mintMobileSession(ID.subject);
      await setStatus(ID.subject, status);
      expect(await verifyMobileToken(bearer(session.token)), status).toBeNull();
      expect(await resolveCurrentUser(bearer(session.token)), status).toBeNull();
    }
  });

  it("rotates a token for an active account but mints nothing for a pending or de-identified one", async () => {
    const active = await mintMobileSession(ID.subject);
    const rotated = await mobileRefresh(bearer(active.token, "/api/auth/mobile-refresh"));
    expect(rotated.status).toBe(200);
    expect((await pool.query("SELECT count(*)::int AS n FROM mobile_sessions WHERE user_id = $1", [ID.subject])).rows[0].n).toBe(1);

    for (const status of NON_ACTIVE) {
      await seed();
      const session = await mintMobileSession(ID.subject);
      await setStatus(ID.subject, status);
      const refused = await mobileRefresh(bearer(session.token, "/api/auth/mobile-refresh"));
      expect(refused.status, status).toBe(401);
      expect((await refused.json()).token, status).toBeUndefined();
      const rows = (await pool.query("SELECT jti FROM mobile_sessions WHERE user_id = $1", [ID.subject])).rows;
      expect(rows.map((row) => row.jti), status).toEqual([session.jti]);
    }
  });
});

describe("password reset and email verification", () => {
  async function issueResetToken(userId, raw) {
    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1,$2,NOW() + interval '1 hour')",
      [userId, sha256(raw)],
    );
  }

  it("resets an active account's password", async () => {
    await issueResetToken(ID.subject, "active-reset-token");
    expect((await (await validateReset(new Request("https://example.test/api/auth/reset-password?token=active-reset-token"))).json()).valid).toBe(true);
    const response = await resetPassword(jsonPost("/api/auth/reset-password", { token: "active-reset-token", password: "BrandNewPass!456" }));
    expect(response.status).toBe(200);
  });

  it.each(NON_ACTIVE)("refuses a reset token issued to a %s account and leaves it unchanged", async (status) => {
    await issueResetToken(ID.subject, "stale-reset-token");
    await setStatus(ID.subject, status);
    const before = (await pool.query(
      `SELECT a.password, u.sessions_valid_after FROM auth_accounts a JOIN auth_users u ON u.id = a."userId"
       WHERE a."userId" = $1`, [ID.subject],
    )).rows[0];

    const validation = await validateReset(new Request("https://example.test/api/auth/reset-password?token=stale-reset-token"));
    expect((await validation.json()).valid).toBe(false);
    const response = await resetPassword(jsonPost("/api/auth/reset-password", { token: "stale-reset-token", password: "BrandNewPass!456" }));
    expect(response.status).toBe(400);

    const after = (await pool.query(
      `SELECT a.password, u.sessions_valid_after, u.account_status FROM auth_accounts a JOIN auth_users u ON u.id = a."userId"
       WHERE a."userId" = $1`, [ID.subject],
    )).rows[0];
    expect(after.password).toBe(before.password);
    expect(new Date(after.sessions_valid_after).getTime()).toBe(new Date(before.sessions_valid_after).getTime());
    expect(after.account_status).toBe(status);
    expect((await pool.query("SELECT used FROM password_reset_tokens WHERE token = $1", [sha256("stale-reset-token")])).rows[0].used).toBe(false);
  });

  it("verifies an active account's email address", async () => {
    await pool.query(`UPDATE auth_users SET "emailVerified" = NULL WHERE id = $1`, [ID.subject]);
    await pool.query(
      "INSERT INTO auth_verification_token (identifier, token, expires) VALUES ($1,$2,NOW() + interval '1 hour')",
      ["subject@nonactive.example.test", sha256("active-verify-token")],
    );
    const response = await verifyEmail(new Request("https://example.test/api/auth/verify-email?token=active-verify-token"));
    expect(response.headers.get("location")).toContain("verified=true");
    expect((await pool.query(`SELECT "emailVerified" FROM auth_users WHERE id = $1`, [ID.subject])).rows[0].emailVerified).not.toBeNull();
  });

  it("does not verify, or otherwise touch, a pending account", async () => {
    await pool.query(`UPDATE auth_users SET "emailVerified" = NULL WHERE id = $1`, [ID.subject]);
    await pool.query(
      "INSERT INTO auth_verification_token (identifier, token, expires) VALUES ($1,$2,NOW() + interval '1 hour')",
      ["subject@nonactive.example.test", sha256("stale-verify-token")],
    );
    await setStatus(ID.subject, "pending_deletion");
    const response = await verifyEmail(new Request("https://example.test/api/auth/verify-email?token=stale-verify-token"));
    expect(response.headers.get("location")).toContain("error=invalid_token");
    expect((await pool.query(`SELECT "emailVerified" FROM auth_users WHERE id = $1`, [ID.subject])).rows[0].emailVerified).toBeNull();
    expect((await pool.query("SELECT count(*)::int AS n FROM auth_verification_token WHERE token = $1", [sha256("stale-verify-token")])).rows[0].n).toBe(0);
  });
});

describe("invitation acceptance", () => {
  const INVITEE = "new-admin@nonactive.example.test";
  const issueInvite = (raw) => pool.query(
    `INSERT INTO invite_tokens (token, email, role, organization_id, venue_id, invited_by, expires_at)
     VALUES ($1,$2,'venue_admin',$3,$4,$5,NOW() + interval '1 day')`,
    [sha256(raw), INVITEE, ID.org, ID.venue, ID.inviter],
  );
  const accept = (raw) => acceptInvite(jsonPost("/api/admin/accept-invite", { token: raw, name: "New Admin", password: PASSWORD }));

  it("accepts an invitation from an active inviter", async () => {
    await issueInvite("active-invite");
    expect((await accept("active-invite")).status).toBe(200);
    expect((await pool.query("SELECT count(*)::int AS n FROM auth_users WHERE email = $1", [INVITEE])).rows[0].n).toBe(1);
  });

  it.each(NON_ACTIVE)("refuses an invitation whose inviter is %s and leaves it unconsumed", async (status) => {
    await issueInvite("stale-invite");
    await setStatus(ID.inviter, status);
    const response = await accept("stale-invite");
    expect(response.status).toBe(400);
    expect((await pool.query("SELECT count(*)::int AS n FROM auth_users WHERE email = $1", [INVITEE])).rows[0].n).toBe(0);
    expect((await pool.query("SELECT used FROM invite_tokens WHERE token = $1", [sha256("stale-invite")])).rows[0].used).toBe(false);
  });
});

describe("administrative credential reset", () => {
  it("refuses to rewrite credentials when the referee turns pending while the new password is hashing", async () => {
    authState.actorId = ID.super;
    const original = (await pool.query(`SELECT password FROM auth_accounts WHERE "userId" = $1`, [ID.referee])).rows[0].password;
    let signalStarted;
    let releaseHash;
    const started = new Promise((resolve) => { signalStarted = resolve; });
    const release = new Promise((resolve) => { releaseHash = resolve; });
    hashControl.waiter = { started: signalStarted, release };

    const resetCall = provisionReferee(jsonPost("/api/admin/referees", { venueId: ID.venue, fieldNumber: 1 }));
    await started;
    // Pending only: email, role and venue are all unchanged, so the status re-check
    // under the row lock is the single control that can stop the credential write.
    await requestAccountDeletion({ userId: ID.referee, password: PASSWORD });
    releaseHash();

    const response = await resetCall;
    expect(response.status).toBe(409);
    expect((await pool.query(`SELECT password FROM auth_accounts WHERE "userId" = $1`, [ID.referee])).rows[0].password)
      .toBe(original);
    expect((await pool.query("SELECT account_status FROM auth_users WHERE id = $1", [ID.referee])).rows[0].account_status)
      .toBe("pending_deletion");
  }, 20_000);
});
