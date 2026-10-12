import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: null, query: vi.fn(), tx: vi.fn(), send: vi.fn(), limit: vi.fn(), release: vi.fn() }));
vi.mock("@/auth", () => ({ auth: arg => typeof arg === "function" ? req => { req.auth = mocks.session; return arg(req); } : Promise.resolve(mocks.session) }));
vi.mock("@neondatabase/serverless", () => ({ Pool: class { query(...a) { return mocks.query(...a); } async connect() { return { query: mocks.tx, release: mocks.release }; } } }));
vi.mock("@/app/api/utils/send-email", () => ({ sendEmail: mocks.send }));
vi.mock("@/app/api/utils/rate-limit", () => ({ rateLimit: mocks.limit }));
vi.mock("argon2", () => ({ hash: vi.fn(async () => "isolated-hash") }));
import middleware from "@/middleware";
import { NextRequest } from "next/server";
import { POST as signup } from "@/app/api/account/signup/route";
import { GET as inspectInvite, POST as createInvite } from "@/app/api/admin/invite/route";
import { POST as acceptInvite } from "@/app/api/admin/accept-invite/route";
import { POST as publicWelcome } from "@/app/api/auth/captain-welcome/route";
import { GET as leagues, POST as createLeague } from "@/app/api/leagues/route";
import { isValidJoinCode } from "@/utils/join-code";
import { isValidJoinCode as nativeCode } from "../../mobile/src/utils/join-code";
import { withJoinCode } from "@/utils/join-navigation";
import { weekdayNumber, weekdayLabel } from "@/utils/weekday";

const A = "00000000-0000-4000-8000-000000000001", B = "00000000-0000-4000-8000-000000000002";
const publicLeague = { id: A, name: "League", status: "active", day_of_week: 0, season_name: "Summer", season_start_date: "2030-01-01", season_end_date: "2030-04-01", match_format: "2x20", match_duration_minutes: 40, fields_count: 2, max_teams: 10, venue_name: "Venue" };
const privateLeague = { ...publicLeague, venue_id: A, join_code: "ABC12345", time_slots: ["18:30"], created_at: "2030-01-01" };
let invite, liveUser, full;
const request = (path, method = "GET", body) => new NextRequest("https://example.test" + path, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
const signupBody = code => ({ joinCode: code, name: "Captain", email: "captain@example.test", password: "password123", teamName: "Team" });
const through = async (req, handler) => { const gate = await middleware(req); return gate.headers.get("x-middleware-next") === "1" ? handler(req) : gate; };
beforeEach(() => {
  vi.clearAllMocks(); mocks.session = null; liveUser = null; invite = true; full = false;
  mocks.send.mockResolvedValue({}); mocks.limit.mockResolvedValue({ allowed: true });
  mocks.query.mockImplementation(async (q) => {
    let rows = [];
    if (q.includes("FROM invite_tokens")) rows = invite ? [{ token: "hashed", email: "invitee@example.test", role: "venue_admin", venue_id: A, organization_id: B, organization_name: "Org" }] : [];
    else if (q.includes("SELECT * FROM auth_users")) rows = liveUser ? [liveUser] : [];
    else if (q.includes("SELECT id FROM auth_users")) rows = [];
    else if (q.includes("SELECT id, name FROM leagues")) rows = [{ id: A, name: "League" }];
    else if (q.includes("FROM leagues WHERE id")) rows = [privateLeague];
    else if (q.includes("SELECT l.id, l.name")) rows = [publicLeague];
    else if (q.includes("INSERT INTO auth_users")) rows = [{ id: A, name: "Admin" }];
    else if (/^\s*(INSERT|UPDATE)/.test(q)) rows = [];
    else throw new Error("Unexpected SQL: " + q);
    return { rows, rowCount: rows.length };
  });
  mocks.tx.mockImplementation(async (q, p) => {
    let rows = [];
    if (q.includes("UPDATE invite_tokens")) rows = invite ? [{ token: "hashed", email: "invitee@example.test", role: "venue_admin", venue_id: A, organization_id: B }] : [];
    else if (q.includes("SELECT id FROM auth_users")) rows = [];
    else if (q.includes("SELECT name FROM organizations")) rows = [{ name: "Org" }];
    else if (q.includes("FROM league_slots")) rows = full ? [] : [{ id: B }];
    else if (q.includes("INSERT INTO auth_users")) rows = [{ id: A, email: "captain@example.test" }];
    else if (q.includes("INSERT INTO leagues")) rows = [{ id: A, day_of_week: p[2], join_code: p[10] }];
    return { rows, rowCount: rows.length };
  });
});
describe("D7 committed-registration mail boundary", () => {
  it("rejects arbitrary public recipients/content without dispatch", async () => { const response = await through(request("/api/auth/captain-welcome", "POST", { email: "victim@example.test", name: "Impersonation" }), publicWelcome); expect(response.status).toBe(410); expect(mocks.send).not.toHaveBeenCalled(); });
  it("dispatches welcome only after signup commits, using that registration", async () => {
    expect((await through(request("/api/account/signup", "POST", signupBody("ABC12345")), signup)).status).toBe(200);
    const welcome = mocks.send.mock.calls.find(([mail]) => mail.subject.startsWith("Welcome"))[0];
    expect(welcome.to).toBe("captain@example.test"); expect(welcome.text).toContain("Team");
    const commit = mocks.tx.mock.calls.findIndex(([q]) => q === "COMMIT");
    expect(mocks.tx.mock.invocationCallOrder[commit]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]);
  });
  it("failed registration cannot trigger mail", async () => { full = true; expect((await signup(request("/api/account/signup", "POST", signupBody("ABC12345")))).status).toBe(400); expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.tx.mock.calls.at(-1)[0]).toBe("ROLLBACK"); });
  it("rate-limited registration cannot trigger mail", async () => { mocks.limit.mockResolvedValue({ allowed: false }); expect((await signup(request("/api/account/signup", "POST", signupBody("ABC12345")))).status).toBe(429); expect(mocks.send).not.toHaveBeenCalled(); });
});
describe("D8 narrow anonymous middleware and authoritative handlers", () => {
  it("allows logged-out captain signup through the real middleware", async () => { expect((await through(request("/api/account/signup", "POST", signupBody("ABC12345")), signup)).status).toBe(200); });
  it("allows valid invitation inspection", async () => { expect((await through(request("/api/admin/invite?token=valid"), inspectInvite)).status).toBe(200); expect(mocks.query.mock.calls[0][0]).toContain("it.expires_at > NOW()"); expect(mocks.query.mock.calls[0][0]).toContain("it.used = FALSE"); });
  it("claims a valid invitation atomically before creating the identity", async () => {
    expect((await through(request("/api/admin/accept-invite", "POST", { token: "valid", name: "Admin", password: "password123" }), acceptInvite)).status).toBe(200);
    const claimIndex = mocks.tx.mock.calls.findIndex(([q]) => q.includes("UPDATE invite_tokens"));
    const userIndex = mocks.tx.mock.calls.findIndex(([q]) => q.includes("INSERT INTO auth_users"));
    expect(claimIndex).toBeGreaterThan(-1); expect(claimIndex).toBeLessThan(userIndex);
    expect(mocks.tx.mock.calls[claimIndex][0]).toContain("used = FALSE");
    expect(mocks.tx.mock.calls[claimIndex][0]).toContain("expires_at > NOW()");
  });
  it.each(["invalid", "expired", "used"])("handler still rejects %s invite", async token => { invite = false; expect((await through(request("/api/admin/invite?token=" + token), inspectInvite)).status).toBe(400); expect((await through(request("/api/admin/accept-invite", "POST", { token, name: "Admin", password: "password123" }), acceptInvite)).status).toBe(400); expect(mocks.send).not.toHaveBeenCalled(); });
  it("keeps invitation creation protected", async () => { expect((await through(request("/api/admin/invite", "POST", {}), createInvite)).status).toBe(401); expect(mocks.query).not.toHaveBeenCalled(); });
  it.each([["/api/account/signup", "GET"], ["/api/admin/accept-invite", "GET"], ["/api/admin/profile", "GET"], ["/api/admin/invite/anything", "GET"], ["/api/leagues", "GET"], ["/api/leagues?leagueId=" + A, "POST"]])("does not exempt %s %s", async (path, method) => { expect((await middleware(request(path, method))).status).toBe(401); });
  it("allows only the join redirect page, preserving its original code query", async () => { const req = request("/captain/join?code=abc12345"); expect((await middleware(req)).headers.get("x-middleware-next")).toBe("1"); expect(req.nextUrl.searchParams.get("code")).toBe("abc12345"); expect((await middleware(request("/captain/team"))).status).toBe(307); });
  it("carries the code through signup, signin, role redirect and the existing team form", () => { for (const path of ["/account/signup", "/account/signin", "/account/redirect", "/captain/team", "/captain/team/owned"]) expect(withJoinCode(path, "abc12345")).toBe(path + "?code=ABC12345"); expect(withJoinCode("/captain/team", "https://evil.test")).toBe("/captain/team"); });
});
describe("D9 code compatibility", () => {
  it.each(["ABC123", "a1b2c3d4", " abc12345 "])("accepts %s on web, native and signup handler", async code => { expect(isValidJoinCode(code)).toBe(true); expect(nativeCode(code)).toBe(true); expect((await signup(request("/api/account/signup", "POST", signupBody(code)))).status).toBe(200); });
  it.each(["", "ABC12", "ABC1234", "ABC123456", "AB!123", "AB CD123", null])("rejects invalid code %s consistently", async code => { expect(isValidJoinCode(code)).toBe(false); expect(nativeCode(code)).toBe(false); expect((await signup(request("/api/account/signup", "POST", signupBody(code)))).status).toBe(400); expect(mocks.send).not.toHaveBeenCalled(); });
});
describe("D10 numeric weekday contract", () => {
  it.each(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, value) => [day, value]))("submits %s as %i through actual creation handler", async (day, value) => {
    mocks.session = { user: { id: A } }; liveUser = { id: A, role: "venue_admin", venue_id: A };
    const response = await createLeague(request("/api/leagues", "POST", { action: "CREATE_LEAGUE", venueId: A, name: "League", dayOfWeek: weekdayNumber(day), seasonStartDate: "2099-01-01", matchFormat: "2x20", matchDuration: 40, fieldsCount: 1, timeSlots: ["18:30"], maxTeams: 2 }));
    expect(response.status).toBe(200); const result = await response.json(); expect(result.day_of_week).toBe(value); expect(weekdayLabel(value)).toBe(day); expect(result.join_code).toMatch(/^[A-F0-9]{8}$/);
  });
  it("rejects an unknown weekday", () => { expect(() => weekdayNumber("Someday")).toThrow("Invalid weekday"); });
  it("rejects duplicate normalized time slots before creating any league rows", async () => {
    mocks.session = { user: { id: A } }; liveUser = { id: A, role: "venue_admin", venue_id: A };
    const response = await createLeague(request("/api/leagues", "POST", { action: "CREATE_LEAGUE", venueId: A, name: "League", dayOfWeek: 1, seasonStartDate: "2099-01-01", matchFormat: "2x20", matchDuration: 40, fieldsCount: 1, timeSlots: ["18:00", "18:00"], maxTeams: 2 }));
    expect(response.status).toBe(400);
    expect(mocks.tx).not.toHaveBeenCalled();
  });
});
describe("D11 safe audience projection", () => {
  it.each([null, "captain", "referee"])("returns safe competition/rules data for %s", async role => {
    if (role) { mocks.session = { user: { id: A } }; liveUser = { id: A, role }; }
    const response = await through(request("/api/leagues?leagueId=" + A), leagues); expect(response.status).toBe(200);
    const body = await response.json(); expect(body).toEqual(publicLeague);
    for (const field of ["join_code", "venue_id", "time_slots", "created_at", "organization_id", "email"]) expect(body).not.toHaveProperty(field);
    const q = mocks.query.mock.calls.find(([sql]) => sql.includes("FROM leagues"))[0]; expect(q).not.toContain("SELECT *"); expect(q).not.toContain("join_code");
  });
  it.each(["venue_admin", "super_admin"])("keeps appropriate %s administrative details", async role => { mocks.session = { user: { id: A } }; liveUser = { id: A, role, venue_id: A }; expect(await (await leagues(request("/api/leagues?leagueId=" + A))).json()).toEqual(privateLeague); });
  it("denies foreign administrator private projection", async () => { mocks.session = { user: { id: A } }; liveUser = { id: A, role: "venue_admin", venue_id: B }; expect((await leagues(request("/api/leagues?leagueId=" + A))).status).toBe(403); });
  it("denies anonymous enumeration even if called without middleware", async () => { expect((await leagues(request("/api/leagues?venueId=" + A))).status).toBe(401); });
  it("rejects invalid league ID", async () => { expect((await through(request("/api/leagues?leagueId=bad"), leagues)).status).toBe(400); });
  it.each(["/api/matches?leagueId=" + A, "/api/stats?leagueId=" + A])("preserves public read gate %s", async path => { expect((await middleware(request(path))).headers.get("x-middleware-next")).toBe("1"); });
});
