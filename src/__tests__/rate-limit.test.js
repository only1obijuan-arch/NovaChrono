import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the Neon pool before rate-limit.js loads it
vi.mock("../app/api/utils/db", () => ({
  pool: { query: vi.fn() },
}));

const { rateLimit } = await import("../app/api/utils/rate-limit");
const { pool } = await import("../app/api/utils/db");

describe("rateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows request when count equals the max", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ count: 5 }] });
    const { allowed } = await rateLimit("test:127.0.0.1", { max: 5 });
    expect(allowed).toBe(true);
  });

  it("blocks request when count exceeds max by 1", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ count: 6 }] });
    const { allowed } = await rateLimit("test:127.0.0.1", { max: 5 });
    expect(allowed).toBe(false);
  });

  it("allows the first request (count = 1)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] });
    const { allowed } = await rateLimit("auth:new-ip", { max: 5 });
    expect(allowed).toBe(true);
  });

  it("passes the identifier as the first query parameter", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] });
    await rateLimit("auth:user@example.com", { max: 10, windowMinutes: 15 });
    const [, params] = pool.query.mock.calls[0];
    expect(params[0]).toBe("auth:user@example.com");
  });

  it("uses an upsert query with atomic count increment", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] });
    await rateLimit("test:ip");
    const [query] = pool.query.mock.calls[0];
    expect(query).toMatch(/ON CONFLICT/i);
    expect(query).toMatch(/count \+ 1/i);
    expect(query).toMatch(/RETURNING count/i);
  });

  it("window_start is floored to the window boundary (no sub-window remainder)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] });
    await rateLimit("test:window", { max: 10, windowMinutes: 15 });
    const [, params] = pool.query.mock.calls[0];
    const windowStart = params[1];
    const windowMs = 15 * 60 * 1000;
    expect(windowStart.getTime() % windowMs).toBe(0);
  });

  it("window_start is in the past (never in the future)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] });
    const before = Date.now();
    await rateLimit("test:timing", { max: 10, windowMinutes: 5 });
    const [, params] = pool.query.mock.calls[0];
    expect(params[1].getTime()).toBeLessThanOrEqual(before);
  });

  it("different window sizes produce different window_start values for the same instant", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] });

    await rateLimit("x", { windowMinutes: 1 });
    await rateLimit("x", { windowMinutes: 60 });

    const window1 = pool.query.mock.calls[0][1][1].getTime();
    const window2 = pool.query.mock.calls[1][1][1].getTime();
    // A smaller window size floors to a more recent boundary, so window1 ≥ window2
    expect(window1).toBeGreaterThanOrEqual(window2);
  });

  it("simulates concurrency: correct allow/deny split when DB returns incrementing counts", async () => {
    // The DB guarantees atomic increments via ON CONFLICT DO UPDATE.
    // Simulate 5 concurrent calls returning counts 1-5 against a max of 3.
    let call = 0;
    pool.query.mockImplementation(() =>
      Promise.resolve({ rows: [{ count: ++call }] })
    );

    const results = await Promise.all(
      Array.from({ length: 5 }, () => rateLimit("burst:test", { max: 3 }))
    );

    const allowed = results.filter((r) => r.allowed).length;
    const blocked = results.filter((r) => !r.allowed).length;
    expect(allowed).toBe(3);
    expect(blocked).toBe(2);
  });
});
