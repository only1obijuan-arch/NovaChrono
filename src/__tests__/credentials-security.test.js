import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), auth: vi.fn(), verify: vi.fn(), hash: vi.fn(), release: vi.fn(), config: null }));
vi.mock("next-auth", () => ({ default: config => { mocks.config = config; return { auth: mocks.auth }; } }));
vi.mock("next-auth/providers/credentials", () => ({ default: config => config }));
vi.mock("argon2", () => ({ verify: mocks.verify, hash: mocks.hash }));
vi.mock("@neondatabase/serverless", () => ({ Pool: class { query(...args) { return mocks.query(...args); } async connect() { return { query: mocks.query, release: mocks.release }; } } }));
import "@/auth";
import { POST as feedback, GET as status } from "@/app/api/auth/rate-limit/route";
import { POST as provision } from "@/app/api/super-admin/users/route";
import { reserveLoginAttempt } from "@/app/api/utils/login-limit";
let account, allowed, lock;
const credentials = () => mocks.config.providers[0].authorize({ email: "person@example.test", password: "correct-password" });
const bodyRequest = (body) => new Request("https://example.test/api/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); account = { id: "captain", email: "person@example.test", role: "captain", emailVerified: "2030-01-01", sessions_valid_after: new Date(0).toISOString() }; allowed = true; lock = null;
  mocks.auth.mockResolvedValue({ user: { id: "platform" } }); mocks.verify.mockResolvedValue(true); mocks.hash.mockResolvedValue("fixture-hash");
  mocks.query.mockImplementation(async (sql, values) => {
    let rows = [];
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) rows = [];
    else if (sql.startsWith("INSERT INTO auth_rate_limits")) rows = allowed ? [{ attempts: 1 }] : [];
    else if (sql.startsWith("DELETE FROM auth_rate_limits")) rows = [];
    else if (sql.startsWith("SELECT attempts")) rows = lock ? [lock] : [];
    else if (sql.includes("SELECT id, email, name, role, venue_id, organization_id, field_number, sessions_valid_after")) rows = account ? [account] : [];
    else if (sql.includes("SELECT * FROM auth_users WHERE lower(email)")) rows = account ? [account] : [];
    else if (sql.includes("SELECT * FROM auth_users WHERE id")) rows = [{ id: "platform", role: "super_admin" }];
    else if (sql.includes("SELECT * FROM auth_accounts")) rows = [{ provider: "credentials", password: "fixture-hash" }];
    else if (sql.includes("SELECT id FROM auth_users")) rows = [];
    else if (sql.includes("INSERT INTO auth_users")) { account = { id: "new-admin", email: values[0], name: values[1], role: values[2], emailVerified: sql.includes('"emailVerified"') ? "2030-01-01" : null }; rows = [account]; }
    else if (sql.includes("INSERT INTO auth_accounts")) rows = [];
    else throw new Error("Unexpected SQL: " + sql);
    return { rows, rowCount: rows.length };
  });
});
describe("D5 authoritative credentials limiting", () => {
  it("reserves before direct authentication and clears only after verified success", async () => {
    expect(await credentials()).toMatchObject({ id: "captain" });
    expect(mocks.query.mock.calls[0][0]).toContain("INSERT INTO auth_rate_limits");
    expect(mocks.query.mock.calls.at(-1)[0]).toContain("DELETE FROM auth_rate_limits");
  });
  it("denies direct submissions at limit before password verification", async () => { allowed = false; expect(await credentials()).toBeNull(); expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.query).toHaveBeenCalledOnce(); });
  it("failed password never resets limiter", async () => { mocks.verify.mockResolvedValue(false); expect(await credentials()).toBeNull(); expect(mocks.query.mock.calls.some(([q]) => q.startsWith("DELETE"))).toBe(false); });
  it("unknown account still consumes a bounded attempt", async () => { account = null; expect(await credentials()).toBeNull(); expect(mocks.query.mock.calls[0][0]).toContain("INSERT INTO auth_rate_limits"); });
  it("unverified account remains denied and cannot clear limiter", async () => { account.emailVerified = null; expect(await credentials()).toBeNull(); expect(mocks.query.mock.calls.some(([q]) => q.startsWith("DELETE"))).toBe(false); });
  it.each([true, false])("public claimed success=%s neither writes nor resets", async success => {
    lock = { attempts: 5, locked_until: new Date(Date.now() + 600000), last_attempt: new Date() };
    const response = await feedback(bodyRequest({ email: "person@example.test", success }));
    expect((await response.json()).allowed).toBe(false); expect(mocks.query.mock.calls.every(([q]) => q.startsWith("SELECT"))).toBe(true);
  });
  it("feedback does not manufacture failures", async () => { const response = await feedback(bodyRequest({ email: "new@example.test", success: false })); expect((await response.json()).attemptsLeft).toBe(5); expect(mocks.query.mock.calls.every(([q]) => q.startsWith("SELECT"))).toBe(true); });
  it("expired lock permits status without deleting data", async () => { lock = { attempts: 5, locked_until: new Date(0), last_attempt: new Date(0) }; expect((await (await status(new Request("https://example.test/api/auth/rate-limit?email=a%40b.test"))).json()).allowed).toBe(true); expect(mocks.query.mock.calls.every(([q]) => q.startsWith("SELECT"))).toBe(true); });
  it("canonicalises only limiter keys and uses atomic bounded reservation", async () => { await reserveLoginAttempt(" User@Example.test "); expect(mocks.query.mock.calls[0][1]).toEqual(["user@example.test", 5]); expect(mocks.query.mock.calls[0][0]).toContain("ON CONFLICT (identifier) DO UPDATE"); expect(mocks.query.mock.calls[0][0]).toContain("auth_rate_limits.attempts < $2"); });
  it("fails closed when limiter unavailable", async () => { mocks.query.mockRejectedValue(new Error("fixture unavailable")); await expect(credentials()).rejects.toThrow("fixture unavailable"); expect(mocks.verify).not.toHaveBeenCalled(); });
  it("blocks the removed isSignup self-registration input", async () => { account = null; expect(await mocks.config.providers[0].authorize({ email: "new@example.test", password: "password123", isSignup: "true", name: "Owner" })).toBeNull(); expect(mocks.query.mock.calls.every(([q]) => !q.includes("INSERT INTO auth_users"))).toBe(true); });
  it("canonicalises credential email lookup", async () => { await mocks.config.providers[0].authorize({ email: " Person@Example.Test ", password: "correct-password" }); const lookup = mocks.query.mock.calls.find(([q]) => q.includes("lower(email)")); expect(lookup[1]).toEqual(["person@example.test"]); });
  it("refreshes role and tenant claims from the live user row", async () => { account.role = "referee"; account.venue_id = "venue-new"; const token = await mocks.config.callbacks.jwt({ token: { id: account.id, iat: 2_000_000_000 }, user: null }); expect(token).toMatchObject({ role: "referee", venue_id: "venue-new", revoked: false }); });
  it("revokes a deleted user and a token older than the session boundary", async () => { account = null; expect((await mocks.config.callbacks.jwt({ token: { id: "deleted", iat: 2_000_000_000 }, user: null })).revoked).toBe(true); account = { id: "captain", role: "captain", sessions_valid_after: "2099-01-01T00:00:00.000Z" }; expect((await mocks.config.callbacks.jwt({ token: { id: "captain", iat: 2_000_000_000 }, user: null })).revoked).toBe(true); });
});
describe("D19 directly provisioned administrator", () => {
  it("creates verified credentials that pass the unchanged verification requirement", async () => {
    const response = await provision(bodyRequest({ email: "admin@example.test", password: "correct-password", name: "Admin", venueId: "venue-a", organizationId: "org-a" }));
    expect(response.status).toBe(200); expect(account.emailVerified).toBeTruthy();
    const user = await mocks.config.providers[0].authorize({ email: "admin@example.test", password: "correct-password" });
    expect(user).toMatchObject({ role: "venue_admin", id: "new-admin" });
  });
  it("does not grant provisioning to a non-platform user", async () => {
    mocks.query.mockResolvedValue({ rows: [{ role: "venue_admin" }], rowCount: 1 });
    expect((await provision(bodyRequest({}))).status).toBe(403); expect(mocks.query.mock.calls.every(([q]) => !q.includes("INSERT"))).toBe(true);
  });
});

it("D5 preserves existing valid long passwords", async () => {
  const password = "x".repeat(140);
  expect(await mocks.config.providers[0].authorize({ email: "person@example.test", password })).toMatchObject({ id: "captain" });
  expect(mocks.verify).toHaveBeenCalledWith("fixture-hash", password);
});
