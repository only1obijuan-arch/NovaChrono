import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  requireRole: vi.fn(),
  sendPush: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/app/api/utils/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/app/api/utils/send-push", () => ({ sendPush: mocks.sendPush }));

import { POST as requestPasswordReset } from "@/app/api/auth/request-reset/route";
import { POST as sendCaptainMessage } from "@/app/admin/captain-message/route";
import { POST as sendWeatherAlert } from "@/app/api/weather/alert/route";

const LEAGUE_ID = "10000000-0000-4000-8000-000000000001";
const VENUE_ID = "20000000-0000-4000-8000-000000000001";
const USER_ID = "30000000-0000-4000-8000-000000000001";
const CAPTAIN_ID = "30000000-0000-4000-8000-000000000002";

function jsonRequest(path, body) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function acceptedThenLostProvider() {
  const attemptsByKey = new Map();
  const deliveries = new Map();
  const keys = [];
  const fetchMock = vi.fn(async (_url, options) => {
    const key = options.headers["Idempotency-Key"];
    keys.push(key);
    const attempts = (attemptsByKey.get(key) ?? 0) + 1;
    attemptsByKey.set(key, attempts);
    if (!deliveries.has(key)) {
      deliveries.set(key, `route-delivery-${deliveries.size + 1}`);
    }
    if (attempts === 1) {
      throw new Error("connection reset after provider acceptance");
    }
    return new Response(JSON.stringify({ id: deliveries.get(key) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return { deliveries, fetchMock, keys };
}

function expectOneLogicalDelivery(provider) {
  expect(provider.fetchMock).toHaveBeenCalledTimes(2);
  expect(provider.keys).toHaveLength(2);
  expect(provider.keys[0]).toBeTruthy();
  expect(provider.keys[1]).toBe(provider.keys[0]);
  expect(provider.deliveries.size).toBe(1);
}

describe("Gate 5 non-reminder route email idempotency", () => {
  let provider;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "route-test-key";
    process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
    provider = acceptedThenLostProvider();
    vi.stubGlobal("fetch", provider.fetchMock);
    mocks.rateLimit.mockReset().mockResolvedValue({ allowed: true });
    mocks.requireRole.mockReset().mockResolvedValue({
      id: USER_ID,
      role: "venue_admin",
      venue_id: VENUE_ID,
    });
    mocks.sendPush.mockReset().mockResolvedValue({ accepted: true, status: "accepted" });
    mocks.sql.mockReset().mockImplementation(async (strings) => {
      const query = strings.join(" ");
      if (query.includes("FROM auth_users") && query.includes("lower(email)")) {
        return [{ id: USER_ID, email: "admin@example.test", name: "Admin", role: "venue_admin" }];
      }
      if (query.includes("INSERT INTO password_reset_tokens")) return [];
      if (query.includes("SELECT id, name, venue_id FROM leagues")) {
        return [{ id: LEAGUE_ID, name: "Route League", venue_id: VENUE_ID }];
      }
      if (query.includes("SELECT * FROM leagues")) {
        return [{ id: LEAGUE_ID, name: "Route League", venue_id: VENUE_ID }];
      }
      if (query.includes("SELECT DISTINCT au.id")) {
        return [{
          id: CAPTAIN_ID,
          email: "captain@example.test",
          name: "Captain",
          push_token: null,
        }];
      }
      if (query.includes("INSERT INTO notifications")) return [];
      throw new Error(`Unexpected SQL in route idempotency test: ${query}`);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("deduplicates a password-reset email when the accepted response is lost", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await requestPasswordReset(jsonRequest("/api/auth/request-reset", {
      email: "admin@example.test",
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
    expectOneLogicalDelivery(provider);
  });

  it("deduplicates a captain/admin message when the accepted response is lost", async () => {
    const response = await sendCaptainMessage(jsonRequest("/admin/captain-message", {
      league_id: LEAGUE_ID,
      message: "Fixture operations update",
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).channels.email).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expectOneLogicalDelivery(provider);
  });

  it("deduplicates a weather alert when the accepted response is lost", async () => {
    const response = await sendWeatherAlert(jsonRequest("/api/weather/alert", {
      league_id: LEAGUE_ID,
      alert_type: "warning",
      message: "Storm conditions are being monitored",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, sent: 1, total: 1, errors: [] });
    expectOneLogicalDelivery(provider);
  });
});
