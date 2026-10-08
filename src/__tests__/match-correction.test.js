import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), tx: vi.fn(), release: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@neondatabase/serverless", () => ({ Pool: class { query(...a) { return mocks.query(...a); } async connect() { return { query: mocks.tx, release: mocks.release }; } } }));
import { POST } from "@/app/api/matches/route";
let match, event, liveUser;
const request = () => new Request("https://example.test/api/matches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "DELETE_EVENT", matchId: "match-a", eventId: "event-a" }) });
const writes = () => mocks.tx.mock.calls.filter(([q]) => /^\s*(UPDATE|DELETE|INSERT)/.test(q));
beforeEach(() => {
  vi.clearAllMocks();
  match = { status: "live", venue_id: "venue-a", referee_id: "referee-a" };
  event = { id: "event-a", match_id: "match-a", type: "goal_home" };
  liveUser = { id: "referee-a", role: "referee", venue_id: "venue-a" };
  mocks.auth.mockResolvedValue({ user: { id: "referee-a", role: "stale-role", venue_id: "stale-venue" } });
  mocks.query.mockImplementation(async q => ({ rows: q.includes("FROM auth_users") ? [liveUser] : [], rowCount: q.includes("FROM auth_users") ? 1 : 0 }));
  mocks.tx.mockImplementation(async q => ({ rows: q.includes("FROM matches m") ? (match ? [match] : []) : q.includes("FROM match_events") ? (event ? [event] : []) : [] }));
});
describe("D4 event ownership and bounded correction", () => {
  it.each(["goal_home", "goal_away"])("corrects %s in the authorised match atomically", async type => {
    event.type = type; expect((await POST(request())).status).toBe(200);
    expect(writes()).toHaveLength(2);
    expect(writes()[0][1]).toEqual(["match-a"]); expect(writes()[1][1]).toEqual(["event-a", "match-a"]);
    expect(mocks.tx.mock.calls[0][0]).toBe("BEGIN"); expect(mocks.tx.mock.calls.at(-1)[0]).toBe("COMMIT");
    expect(mocks.tx.mock.calls[1][0]).toContain("FOR UPDATE OF m");
    expect(mocks.tx.mock.calls[2][0]).toContain("match_id = $2 FOR UPDATE");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("rejects cross-match event before writing even if a stale lookup returns it", async () => { event.match_id = "match-b"; expect((await POST(request())).status).toBe(404); expect(writes()).toEqual([]); });
  it("rejects missing/already deleted event", async () => { event = null; expect((await POST(request())).status).toBe(404); expect(writes()).toEqual([]); });
  it("rejects missing match", async () => { match = null; expect((await POST(request())).status).toBe(404); expect(writes()).toEqual([]); });
  it.each(["final", "cancelled", "scheduled", "postponed"])("rejects %s status read under finalisation's match lock", async status => { match.status = status; expect((await POST(request())).status).toBe(409); expect(writes()).toEqual([]); });
  it("does not delete phase events", async () => { event.type = "start_first_half"; expect((await POST(request())).status).toBe(409); expect(writes()).toEqual([]); });
  it("denies another referee's match", async () => { match.referee_id = "other"; expect((await POST(request())).status).toBe(403); expect(writes()).toEqual([]); });
  it("denies a foreign venue", async () => { match.venue_id = "other"; expect((await POST(request())).status).toBe(403); expect(writes()).toEqual([]); });
  it("preserves platform correction authority", async () => { mocks.auth.mockResolvedValue({ user: { id: "platform", role: "stale-role" } }); liveUser = { id: "platform", role: "super_admin" }; expect((await POST(request())).status).toBe(200); });
  it("rolls back and releases if deletion fails", async () => {
    const normal = mocks.tx.getMockImplementation(); mocks.tx.mockImplementation(async (q, p) => { if (q.startsWith("DELETE")) throw new Error("fixture failure"); return normal(q, p); });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request())).status).toBe(500); expect(mocks.tx.mock.calls.at(-1)[0]).toBe("ROLLBACK"); expect(mocks.release).toHaveBeenCalledOnce(); log.mockRestore();
  });
});
