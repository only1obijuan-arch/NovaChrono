import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encode } from "next-auth/jwt";

// Real Auth.js JWT/session pipeline against real PostgreSQL: the signed-in
// cookie is decoded by the application's own `jwt` and `session` callbacks. Only
// account_status differs between cases, so the status check is what is under test.
vi.mock("@/app/api/utils/send-email", () => ({ sendEmail: vi.fn(async () => ({ id: "test-mail" })) }));

import { pool } from "@/app/api/utils/db";
import { handlers } from "@/auth";
import { cancelPendingDeletion } from "@/app/api/utils/account-lifecycle";

const COOKIE = "authjs.session-token";
const ID = {
  subject: "d4000000-0000-4000-8000-000000000001",
  super: "d4000000-0000-4000-8000-000000000002",
};
const flags = {
  mutations: process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED,
  completion: process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED,
};

const reset = () => pool.query(`TRUNCATE TABLE audit_logs, mobile_sessions, password_reset_tokens, auth_accounts,
  auth_verification_token, auth_users RESTART IDENTITY CASCADE`);

async function sessionFor(userId, issuedAt = Date.now()) {
  const value = await encode({
    token: { id: userId, sub: userId, session_issued_at: issuedAt },
    secret: process.env.AUTH_SECRET,
    salt: COOKIE,
    maxAge: 3600,
  });
  const response = await handlers.GET(new Request("http://localhost:3000/api/auth/session", {
    headers: { cookie: `${COOKIE}=${value}` },
  }));
  return response.json();
}

beforeAll(async () => { await reset(); });
beforeEach(async () => {
  process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED = "true";
  process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED = "true";
  await reset();
  await pool.query(
    `INSERT INTO auth_users (id, name, email, role, "emailVerified") VALUES
       ($1,'Subject','subject@session.example.test','captain',NOW()),
       ($2,'Super','super@session.example.test','super_admin',NOW())`,
    [ID.subject, ID.super],
  );
});
afterAll(async () => {
  await reset();
  await pool.end();
  for (const [name, value] of [["ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED", flags.mutations], ["ACCOUNT_LIFECYCLE_COMPLETION_ENABLED", flags.completion]]) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

describe("Auth.js session resolution", () => {
  it("resolves a signed-in cookie for an active account with live role claims", async () => {
    const session = await sessionFor(ID.subject);
    expect(session?.user?.id).toBe(ID.subject);
    expect(session.user.role).toBe("captain");
  });

  it("revokes a still-valid cookie as soon as the account is pending deletion", async () => {
    await pool.query(
      `UPDATE auth_users SET account_status = 'pending_deletion', deletion_request_id = gen_random_uuid(),
         deletion_requested_at = NOW() WHERE id = $1`,
      [ID.subject],
    );
    const session = await sessionFor(ID.subject);
    expect(session?.user ?? null).toBeNull();
  });

  it("revokes a still-valid cookie for a de-identified account", async () => {
    await pool.query(
      `UPDATE auth_users SET account_status = 'deidentified', deletion_request_id = gen_random_uuid(),
         deletion_requested_at = NOW(), deidentified_at = NOW(), "emailVerified" = NULL,
         email = 'deidentified+d4000000000040008000000000000001@account.invalid', name = 'Former captain'
       WHERE id = $1`,
      [ID.subject],
    );
    const session = await sessionFor(ID.subject);
    expect(session?.user ?? null).toBeNull();
  });

  it("does not revive a cookie minted while the account was pending once the request is cancelled", async () => {
    await pool.query(
      `UPDATE auth_users SET account_status = 'pending_deletion', deletion_request_id = gen_random_uuid(),
         deletion_requested_at = NOW(), sessions_valid_after = NOW() WHERE id = $1`,
      [ID.subject],
    );
    const mintedWhilePending = Date.now() + 5;
    await new Promise((resolve) => setTimeout(resolve, 30));
    await cancelPendingDeletion({
      actorId: ID.super,
      targetUserId: ID.subject,
      reason: "Verified withdrawal of the request",
      identityVerified: true,
    });
    // The account is active again, but the cancellation advanced the session boundary
    // past anything minted during the pending window.
    expect((await pool.query("SELECT account_status FROM auth_users WHERE id = $1", [ID.subject])).rows[0].account_status)
      .toBe("active");
    expect((await sessionFor(ID.subject, mintedWhilePending))?.user ?? null).toBeNull();
    expect((await sessionFor(ID.subject, Date.now() + 5))?.user?.id).toBe(ID.subject);
  });
});
