import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), tx: vi.fn(), release: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@neondatabase/serverless", () => ({ Pool: class { query(...a) { return mocks.query(...a); } async connect() { return { query: mocks.tx, release: mocks.release }; } } }));
import { POST } from "@/app/api/matches/route";
const IDS = {
  match: "70000000-0000-4000-8000-000000000001",
  otherMatch: "70000000-0000-4000-8000-000000000002",
  event: "80000000-0000-4000-8000-000000000001",
  referee: "30000000-0000-4000-8000-000000000006",
  venue: "20000000-0000-4000-8000-000000000001",
  otherReferee: "30000000-0000-4000-8000-000000000007",
  otherVenue: "20000000-0000-4000-8000-000000000002",
  platform: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};
let match, event, liveUser;
const request = () => new Request("https://example.test/api/matches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "DELETE_EVENT", matchId: IDS.match, eventId: IDS.event }) });
const writes = () => mocks.tx.mock.calls.filter(([q]) => /^\s*(UPDATE|DELETE|INSERT)/.test(q));
beforeEach(() => {
  vi.clearAllMocks();
  match = { status: "live", league_venue_id: IDS.venue, referee_id: IDS.referee };
  event = { id: IDS.event, match_id: IDS.match, type: "goal_home" };
  liveUser = { id: IDS.referee, role: "referee", venue_id: IDS.venue };
  mocks.auth.mockResolvedValue({ user: { id: IDS.referee, role: "stale-role", venue_id: "stale-venue" } });
  mocks.query.mockImplementation(async q => ({ rows: q.includes("FROM auth_users") ? [liveUser] : [], rowCount: q.includes("FROM auth_users") ? 1 : 0 }));
  mocks.tx.mockImplementation(async q => ({ rows: q.includes("FROM matches m") ? (match ? [match] : []) : q.includes("FROM auth_users") ? (liveUser ? [liveUser] : []) : q.includes("FROM match_events") ? (event ? [event] : []) : [] }));
});
describe("D4 event ownership and bounded correction", () => {
  it("rejects a non-write role before opening a match transaction", async () => {
    liveUser.role = "captain";
    expect((await POST(request())).status).toBe(403);
    expect(mocks.tx).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it.each(["goal_home", "goal_away"])("corrects %s in the authorised match atomically", async type => {
    event.type = type; expect((await POST(request())).status).toBe(200);
    expect(writes()).toHaveLength(3);
    expect(writes()[0][1]).toEqual([IDS.match]); expect(writes()[1][1]).toEqual([IDS.event, IDS.match]);
    expect(writes()[2][0]).toContain("INSERT INTO audit_logs");
    expect(writes()[2][1][0]).toBe(IDS.referee);
    expect(writes()[2][1][1]).toBe(IDS.event);
    expect(mocks.tx.mock.calls[0][0]).toBe("BEGIN"); expect(mocks.tx.mock.calls.at(-1)[0]).toBe("COMMIT");
    expect(mocks.tx.mock.calls[1][0]).toContain("FOR UPDATE OF m");
    expect(mocks.tx.mock.calls[3][0]).toContain("match_id = $2 FOR UPDATE");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("rejects cross-match event before writing even if a stale lookup returns it", async () => { event.match_id = IDS.otherMatch; expect((await POST(request())).status).toBe(404); expect(writes()).toEqual([]); });
  it("rejects missing/already deleted event", async () => { event = null; expect((await POST(request())).status).toBe(404); expect(writes()).toEqual([]); });
  it("rejects missing match", async () => { match = null; expect((await POST(request())).status).toBe(404); expect(writes()).toEqual([]); });
  it.each(["final", "cancelled", "scheduled", "postponed"])("rejects %s status read under finalisation's match lock", async status => { match.status = status; expect((await POST(request())).status).toBe(409); expect(writes()).toEqual([]); });
  it("does not delete phase events", async () => { event.type = "start_first_half"; expect((await POST(request())).status).toBe(409); expect(writes()).toEqual([]); });
  it("denies another referee's match", async () => { match.referee_id = IDS.otherReferee; expect((await POST(request())).status).toBe(403); expect(writes()).toEqual([]); });
  it("denies a foreign venue", async () => { match.league_venue_id = IDS.otherVenue; expect((await POST(request())).status).toBe(403); expect(writes()).toEqual([]); });
  it("preserves platform correction authority", async () => { mocks.auth.mockResolvedValue({ user: { id: IDS.platform, role: "stale-role" } }); liveUser = { id: IDS.platform, role: "super_admin" }; expect((await POST(request())).status).toBe(200); });
  it("rolls back and releases if deletion fails", async () => {
    const normal = mocks.tx.getMockImplementation(); mocks.tx.mockImplementation(async (q, p) => { if (q.startsWith("DELETE")) throw new Error("fixture failure"); return normal(q, p); });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request())).status).toBe(500); expect(mocks.tx.mock.calls.at(-1)[0]).toBe("ROLLBACK"); expect(mocks.release).toHaveBeenCalledOnce(); log.mockRestore();
  });
});
