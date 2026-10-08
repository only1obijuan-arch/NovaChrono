import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), query: vi.fn(), tx: vi.fn(), release: vi.fn(),
  hash: vi.fn(), limit: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("argon2", () => ({ hash: mocks.hash }));
vi.mock("@/app/api/utils/rate-limit", () => ({ rateLimit: mocks.limit }));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    query(...args) { return mocks.query(...args); }
    async connect() { return { query: mocks.tx, release: mocks.release }; }
  },
}));

import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { GET as legacyToken } from "@/app/api/auth/token/route";
import { POST as provisionReferee } from "@/app/api/admin/referees/route";
import { canonicalizeEmail } from "@/app/api/utils/email";
import { isSessionCurrent } from "@/app/api/utils/session-security";

const USER = "30000000-0000-4000-8000-000000000001";
const VENUE = "20000000-0000-4000-8000-000000000001";
let resetAvailable, existingVenue;

function post(path, body) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAvailable = true;
  existingVenue = VENUE;
  mocks.auth.mockResolvedValue({ user: { id: USER, role: "stale-role" } });
  mocks.hash.mockResolvedValue("new-hash");
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.query.mockImplementation(async (sql) => {
    let rows = [];
    if (sql.includes("SELECT * FROM auth_users WHERE id")) rows = [{ id: USER, role: "venue_admin", venue_id: VENUE }];
    else if (sql.includes("SELECT * FROM venues")) rows = [{ id: VENUE, name: "Arena", organization_id: "10000000-0000-4000-8000-000000000001" }];
    else if (sql.includes("SELECT au.*")) rows = [{ id: "30000000-0000-4000-8000-000000000009", name: "Referee", email: "ref-field1@arena.novachrono.com", role: "referee", venue_id: existingVenue }];
    else throw new Error(`Unexpected SQL: ${sql}`);
    return { rows, rowCount: rows.length };
  });
  mocks.tx.mockImplementation(async (sql) => {
    let rows = [];
    if (sql.includes("UPDATE password_reset_tokens")) {
      rows = resetAvailable ? [{ id: "reset", user_id: USER }] : [];
      resetAvailable = false;
    }
    return { rows, rowCount: rows.length };
  });
});

describe("Gate 2 credential revocation", () => {
  it("consumes a reset token conditionally and invalidates web and mobile sessions", async () => {
    const response = await resetPassword(post("/api/auth/reset-password", { token: "one-use-token", password: "password123" }));
    expect(response.status).toBe(200);
    const statements = mocks.tx.mock.calls.map(([sql]) => sql);
    expect(statements.find((sql) => sql.includes("UPDATE password_reset_tokens"))).toContain("used = FALSE");
    expect(statements.find((sql) => sql.includes("UPDATE password_reset_tokens"))).toContain("expires_at > NOW()");
    expect(statements.some((sql) => sql.includes("sessions_valid_after = NOW()"))).toBe(true);
    expect(statements.some((sql) => sql.includes("DELETE FROM mobile_sessions"))).toBe(true);

    const second = await resetPassword(post("/api/auth/reset-password", { token: "one-use-token", password: "password123" }));
    expect(second.status).toBe(400);
  });

  it("invalidates sessions when an existing referee credential is regenerated", async () => {
    const response = await provisionReferee(post("/api/admin/referees", { venueId: VENUE, fieldNumber: 1 }));
    expect(response.status).toBe(200);
    const statements = mocks.tx.mock.calls.map(([sql]) => sql);
    expect(statements.some((sql) => sql.includes("INSERT INTO auth_accounts") && sql.includes("ON CONFLICT (\"userId\", provider)"))).toBe(true);
    expect(statements.some((sql) => sql.includes("sessions_valid_after = NOW()"))).toBe(true);
    expect(statements.some((sql) => sql.includes("DELETE FROM mobile_sessions"))).toBe(true);
  });

  it("refuses to rotate a colliding referee identity owned by another venue", async () => {
    existingVenue = "20000000-0000-4000-8000-000000000099";
    const response = await provisionReferee(post("/api/admin/referees", { venueId: VENUE, fieldNumber: 1 }));
    expect(response.status).toBe(409);
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.tx).not.toHaveBeenCalled();
  });

  it("permanently disables the legacy unrevocable bearer route", async () => {
    const response = await legacyToken();
    expect(response.status).toBe(410);
    expect(await response.json()).not.toHaveProperty("jwt");
  });
});

describe("Gate 2 identity primitives", () => {
  it("canonicalises emails with trim and lowercase", () => {
    expect(canonicalizeEmail(" Person@Example.TEST ")).toBe("person@example.test");
  });

  it("accepts only sessions issued on or after the live boundary", () => {
    expect(isSessionCurrent(Date.parse("2030-01-01T00:00:01Z"), "2030-01-01T00:00:00Z")).toBe(true);
    expect(isSessionCurrent(Date.parse("2029-12-31T23:59:59Z"), "2030-01-01T00:00:00Z")).toBe(false);
  });
});
