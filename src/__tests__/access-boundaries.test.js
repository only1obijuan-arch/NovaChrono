import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), send: vi.fn(), push: vi.fn(), limit: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
// sql and requireRole are production implementations; isolate only the database transport.
vi.mock("@neondatabase/serverless", () => ({ Pool: class {
  query(...args) { return mocks.query(...args); }
  async connect() {
    return {
      query: async (...args) => ["BEGIN", "COMMIT", "ROLLBACK"].includes(args[0])
        ? { rows: [], rowCount: 0 }
        : mocks.query(...args),
      release: vi.fn(),
    };
  }
} }));
vi.mock("@/app/api/utils/send-email", () => ({ sendEmail: mocks.send }));
vi.mock("@/app/api/utils/send-push", () => ({ sendPush: mocks.push }));
vi.mock("@/app/api/utils/rate-limit", () => ({ rateLimit: mocks.limit }));
import { PUT as profile } from "@/app/api/admin/profile/route";
import { GET as readTeams, POST as teams } from "@/app/api/teams/route";
import { POST as addPlayer, DELETE as deletePlayer } from "@/app/api/players/route";
import { POST as weather } from "@/app/api/weather/alert/route";
import { POST as reminder } from "@/app/api/send-match-reminder/route";
import { POST as register } from "@/app/api/register-team/route";
import { SignJWT } from "jose";

const id = n => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const A = id(1), B = id(2), USER = id(3), LEAGUE = id(4), TEAM = id(5), PLAYER = id(6), MATCH = id(7), CAPTAIN = id(8);
let user, targetVenue, targetOrganization, missing, captain, duplicate, leagueStatus;
const request = (body, method = "POST", path = "/api/test") => new Request("https://example.test" + path, { method, ...(method === "DELETE" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
const writes = () => mocks.query.mock.calls.filter(([sql]) => /^\s*(INSERT|UPDATE|DELETE)/i.test(sql));
beforeEach(() => {
  vi.clearAllMocks();
  user = { id: USER, role: "venue_admin", venue_id: A, organization_id: A }; targetVenue = A; targetOrganization = A; missing = false; captain = true; duplicate = false; leagueStatus = "registration";
  mocks.auth.mockImplementation(async () => ({ user: { id: USER, role: "super_admin", venue_id: B } })); // deliberately stale claims
  mocks.limit.mockResolvedValue({ allowed: true }); mocks.send.mockResolvedValue({}); mocks.push.mockResolvedValue({});
  mocks.query.mockImplementation(async (sql, params) => {
    let rows = [];
    if (sql.includes("mobile_sessions")) rows = [];
    else if (sql.includes("SELECT * FROM auth_users")) rows = user ? [user] : [];
    else if (sql.includes("FROM auth_users") && sql.includes("role = 'captain'")) rows = captain ? [{ id: CAPTAIN }] : [];
    else if (sql.includes("FROM auth_users")) rows = user ? [user] : [];
    else if (sql.includes("FROM venues")) rows = missing ? [] : [{ id: params[0] }];
    else if (sql.includes("FROM players")) rows = missing ? [] : [{ id: PLAYER, team_id: TEAM }];
    else if (sql.includes("SELECT l.venue_id, v.organization_id")) rows = missing ? [] : [{ venue_id: targetVenue, organization_id: targetOrganization }];
    else if (sql.includes("FROM teams t") && sql.includes("LEFT JOIN auth_users au") && !sql.includes("JOIN leagues")) rows = [{ id: TEAM, league_id: LEAGUE, slot_id: id(9), name: "Team", status: "active", captain_user_id: CAPTAIN, captain_name: "Captain", created_at: "2030-01-01T00:00:00Z" }];
    else if (sql.includes("FROM teams t") && sql.includes("t.league_id") && !sql.includes("JOIN leagues")) rows = [{ id: TEAM, league_id: LEAGUE, slot_id: id(9), name: "Team", status: "active" }];
    else if (sql.includes("FROM teams t") && sql.includes("JOIN leagues")) rows = missing ? [] : [{ id: TEAM, venue_id: targetVenue, organization_id: targetOrganization, captain_user_id: CAPTAIN }];
    else if (sql.includes("FROM teams t")) rows = missing ? [] : [{ id: TEAM, league_id: LEAGUE, slot_id: id(9), name: "Team", status: "active", captain_user_id: CAPTAIN }];
    else if (sql.includes("SELECT id, league_id FROM teams")) rows = missing ? [] : [{ id: TEAM, league_id: LEAGUE }];
    else if (sql.includes("SELECT id FROM teams")) rows = duplicate ? [{ id: TEAM }] : [];
    else if (sql.includes("FROM leagues")) rows = missing ? [] : [{ id: LEAGUE, venue_id: targetVenue, organization_id: targetOrganization, status: leagueStatus, join_code: "ABC12345", name: "League" }];
    else if (sql.includes("FROM matches")) rows = missing ? [] : [{ id: MATCH, status: "scheduled", venue_id: targetVenue, match_date: "2030-01-01", home_team_id: TEAM, home_captain_email: "captain@example.test", home_captain_id: CAPTAIN, home_team_name: "Team", time_slot: "18:30" }];
    else if (sql.includes("SELECT DISTINCT au")) rows = [{ id: CAPTAIN, email: "captain@example.test" }];
    else if (sql.includes("FROM availability_responses")) rows = [{ token: "token" }];
    else if (sql.includes("FROM league_slots")) rows = [{ id: id(9) }];
    else if (sql.trim().startsWith("WITH")) rows = [];
    else if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) rows = [{ id: TEAM }];
    else throw new Error("Unexpected SQL: " + sql);
    return { rows, rowCount: rows.length };
  });
});

describe("D1 live profile authority", () => {
  it("keeps assigned venue confirmation and legitimate name editing", async () => {
    expect((await profile(request({ venueId: A, role: "venue_admin", name: "New name" }, "PUT"))).status).toBe(200);
    expect(writes()).toHaveLength(2); expect(writes().every(([q]) => !q.includes("role ="))).toBe(true);
  });
  it.each(["captain", "referee"])("denies %s access regardless of stale privileged claims", async role => {
    user.role = role; expect((await profile(request({ role: "super_admin", venueId: B }, "PUT"))).status).toBe(401); expect(writes()).toEqual([]);
  });
  it("denies self-promotion", async () => { expect((await profile(request({ role: "super_admin", venueId: A }, "PUT"))).status).toBe(403); expect(writes()).toEqual([]); });
  it("denies foreign venue assignment", async () => { expect((await profile(request({ venueId: B }, "PUT"))).status).toBe(403); expect(writes()).toEqual([]); });
  it("allows a live platform administrator to select a venue without changing role", async () => { user.role = "super_admin"; expect((await profile(request({ venueId: B }, "PUT"))).status).toBe(200); expect(writes()[0][0]).not.toContain("role ="); });
  it("rejects nonexistent venue even for platform admin", async () => { user.role = "super_admin"; missing = true; expect((await profile(request({ venueId: B }, "PUT"))).status).toBe(404); expect(writes()).toEqual([]); });
});

const mutations = [
  ["add team", () => teams(request({ action: "ADD_TEAM", leagueId: LEAGUE, teamName: "Team" }))],
  ["rename team", () => teams(request({ action: "UPDATE_TEAM", teamId: TEAM, teamName: "Team" }))],
  ["withdraw team", () => {
    leagueStatus = "active";
    return teams(request({ action: "WITHDRAW_TEAM", teamId: TEAM, reason: "No longer participating", policy: "VACATE_FOR_REPLACEMENT" }));
  }],
  ["add player", () => addPlayer(request({ teamId: TEAM, name: "Player" }))],
  ["delete player", () => deletePlayer(request(null, "DELETE", "/api/players?playerId=" + PLAYER))],
  ["weather send", () => weather(request({ league_id: LEAGUE, alert_type: "warning", message: "Weather" }))],
  ["match reminder", () => reminder(request({ matchId: MATCH }))],
];
describe.each(mutations)("D2 %s", (_label, call) => {
  it("allows own venue", async () => { expect((await call()).status).toBe(200); });
  it("denies foreign venue before writes or sends", async () => { targetVenue = B; expect((await call()).status).toBe(403); expect(writes()).toEqual([]); expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled(); });
  it("preserves platform-wide authority", async () => { user.role = "super_admin"; targetVenue = B; expect((await call()).status).toBe(200); });
  it("rejects deleted target", async () => { missing = true; expect((await call()).status).toBe(404); expect(writes()).toEqual([]); expect(mocks.send).not.toHaveBeenCalled(); });
});
it("D2 rejects withdrawal outside an active league", async () => {
  leagueStatus = "registration";
  const response = await teams(request({ action: "WITHDRAW_TEAM", teamId: TEAM, reason: "No longer participating", policy: "VACATE_FOR_REPLACEMENT" }));
  expect(response.status).toBe(409);
  expect(writes()).toEqual([]);
});
it.each([
  [teams, { action: "ADD_TEAM", leagueId: "bad" }], [teams, { action: "UPDATE_TEAM", teamId: "bad" }], [teams, { action: "WITHDRAW_TEAM", teamId: "bad", reason: "reason", policy: "VACATE_FOR_REPLACEMENT" }],
  [addPlayer, { teamId: "bad", name: "Player" }], [weather, { league_id: "bad", message: "m", alert_type: "warning" }], [reminder, { matchId: "bad" }],
])("D2 rejects malformed IDs without a mutation", async (handler, body) => { expect((await handler(request(body))).status).toBe(400); expect(writes()).toEqual([]); });
it("D2 rejects malformed player deletion ID", async () => { expect((await deletePlayer(request(null, "DELETE", "/api/players?playerId=bad"))).status).toBe(400); expect(writes()).toEqual([]); });
it("D2 captain can maintain owned roster across venue context", async () => { user = { id: CAPTAIN, role: "captain", venue_id: null }; expect((await addPlayer(request({ teamId: TEAM, name: "Player" }))).status).toBe(200); });
it("D2 captain cannot maintain another captain's roster", async () => { user.role = "captain"; expect((await addPlayer(request({ teamId: TEAM, name: "Player" }))).status).toBe(403); expect(writes()).toEqual([]); });

describe("D2 team read object boundaries", () => {
  const read = () => readTeams(new Request(`https://example.test/api/teams?teamId=${TEAM}`));
  it("allows a captain to read the owned private team", async () => { user = { id: CAPTAIN, role: "captain" }; expect((await read()).status).toBe(200); });
  it("denies a captain changing the team ID to another captain's team", async () => { user = { id: USER, role: "captain" }; expect((await read()).status).toBe(403); });
  it("allows an organization admin only inside the live organization scope", async () => { user = { id: USER, role: "org_admin", organization_id: A }; expect((await read()).status).toBe(200); targetOrganization = B; expect((await read()).status).toBe(403); });
  it("respects a live tenant move despite stale session claims", async () => { user = { id: USER, role: "venue_admin", venue_id: B, organization_id: B }; expect((await read()).status).toBe(403); });
  it("denies deleted users even when an old session still exists", async () => { user = null; expect((await read()).status).toBe(401); });
});

describe("D2 league team projection", () => {
  const read = () => readTeams(new Request(`https://example.test/api/teams?leagueId=${LEAGUE}`));
  const body = async () => (await (await read()).json())[0];

  it("returns captain and registration fields to the owning venue administrator", async () => {
    expect(await body()).toMatchObject({ captain_user_id: CAPTAIN, captain_name: "Captain", created_at: "2030-01-01T00:00:00Z" });
  });
  it("returns the admin projection to an organization administrator in scope", async () => {
    user = { id: USER, role: "org_admin", organization_id: A };
    expect(await body()).toHaveProperty("captain_name", "Captain");
  });
  it("returns the admin projection to a platform administrator", async () => {
    user = { id: USER, role: "super_admin" };
    targetVenue = B;
    expect(await body()).toHaveProperty("created_at");
  });
  it("keeps the five-field public projection for an administrator outside the tenant", async () => {
    user = { id: USER, role: "venue_admin", venue_id: B };
    expect(Object.keys(await body()).sort()).toEqual(["id", "league_id", "name", "slot_id", "status"]);
  });
  it("keeps the five-field public projection for anonymous callers", async () => {
    mocks.auth.mockResolvedValue(null);
    user = null;
    expect(Object.keys(await body()).sort()).toEqual(["id", "league_id", "name", "slot_id", "status"]);
  });
});

describe("D3 registration", () => {
  const body = () => ({ leagueId: LEAGUE, captainUserId: CAPTAIN, teamName: "Team", joinCode: "abc12345" });
  it("permits own-venue administrator", async () => { expect((await register(request(body()))).status).toBe(200); });
  it("permits platform administrator across venues", async () => { user.role = "super_admin"; targetVenue = B; expect((await register(request(body()))).status).toBe(200); });
  it("denies foreign administrator", async () => { targetVenue = B; expect((await register(request(body()))).status).toBe(403); expect(writes()).toEqual([]); });
  it("permits captain with own identity and matching code", async () => { user = { id: CAPTAIN, role: "captain" }; expect((await register(request(body()))).status).toBe(200); });
  it("denies captain impersonation", async () => { user.role = "captain"; expect((await register(request(body()))).status).toBe(403); expect(writes()).toEqual([]); });
  it("denies captain without valid code", async () => { user = { id: CAPTAIN, role: "captain" }; expect((await register(request({ ...body(), joinCode: "BAD12345" }))).status).toBe(403); });
  it.each(["referee", "org_admin"])("denies unsupported %s caller", async role => { user.role = role; expect((await register(request(body()))).status).toBe(401); expect(writes()).toEqual([]); });
  it("rejects missing league", async () => { missing = true; expect((await register(request(body()))).status).toBe(404); });
  it.each(["cancelled", "completed"])("rejects %s league", async status => { leagueStatus = status; expect((await register(request(body()))).status).toBe(409); expect(writes()).toEqual([]); });
  it("rejects missing/non-captain account", async () => { captain = false; expect((await register(request(body()))).status).toBe(404); expect(writes()).toEqual([]); });
  it("rejects duplicate active team", async () => { duplicate = true; expect((await register(request(body()))).status).toBe(409); expect(writes()).toEqual([]); });
  it("rejects invalid identifiers", async () => { expect((await register(request({ ...body(), leagueId: "invalid" }))).status).toBe(400); });
  it.each([true, false])("rejects signed bearer without active session (jti=%s)", async hasJti => {
    mocks.auth.mockResolvedValue(null); vi.stubEnv("AUTH_SECRET", "isolated-test-secret");
    let signer = new SignJWT({ id: CAPTAIN, role: "captain" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m");
    if (hasJti) signer = signer.setJti("revoked-session");
    const token = await signer.sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    const req = request(body()); req.headers.set("authorization", "Bearer " + token);
    expect((await register(req)).status).toBe(401); expect(writes()).toEqual([]);
  });
});

afterEach(() => vi.unstubAllEnvs());

it("D3 accepts a currently active bearer session using live captain identity", async () => {
  mocks.auth.mockResolvedValue(null);
  vi.stubEnv("AUTH_SECRET", "isolated-test-secret");
  const normal = mocks.query.getMockImplementation();
  mocks.query.mockImplementation(async (q, p) => q.includes("mobile_sessions") ? { rows: [{ id: CAPTAIN, role: "captain" }], rowCount: 1 } : normal(q, p));
  const token = await new SignJWT({ id: CAPTAIN, role: "captain" }).setProtectedHeader({ alg: "HS256" }).setJti("active-session").setExpirationTime("5m").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const req = request({ leagueId: LEAGUE, teamName: "Team", joinCode: "ABC12345" });
  req.headers.set("authorization", "Bearer " + token);
  expect((await register(req)).status).toBe(200);
  expect(writes()[0][1]).toContain(CAPTAIN);
});
