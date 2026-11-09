import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailDeliveryError, sendEmail } from "@/app/api/utils/send-email";

const db = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@/app/api/utils/db", () => ({ sql: db.sql }));

import { sendPushNotifications } from "@/app/api/utils/send-push";

function emailInput(overrides = {}) {
  return {
    to: "captain@example.test",
    subject: "Match reminder",
    text: "Confirm availability",
    idempotencyKey: "match-reminder/00000000-0000-4000-8000-000000000001",
    ...overrides,
  };
}

function fakeIdempotentProvider(steps = ["success"]) {
  const keys = [];
  const deliveries = new Map();
  let attempt = 0;
  const fetchMock = vi.fn(async (_url, options) => {
    const key = options.headers["Idempotency-Key"];
    keys.push(key);
    if (!deliveries.has(key)) {
      deliveries.set(key, `logical-delivery-${deliveries.size + 1}`);
    }
    const providerId = deliveries.get(key);
    const step = steps[Math.min(attempt, steps.length - 1)];
    attempt += 1;
    if (step === "timeout") {
      throw Object.assign(new Error("response lost after acceptance"), { name: "AbortError" });
    }
    if (step === "network") {
      throw new Error("connection reset after acceptance");
    }
    if (typeof step === "number") {
      return new Response("{}", { status: step });
    }
    return new Response(JSON.stringify({ id: providerId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return { deliveries, fetchMock, keys };
}

describe("Gate 5 Resend transport semantics", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "unit-test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
  });

  it("uses one request and one logical delivery on first-attempt success", async () => {
    const { deliveries, fetchMock, keys } = fakeIdempotentProvider();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendEmail(emailInput())).resolves.toEqual({ id: "logical-delivery-1" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(deliveries.size).toBe(1);
    expect(keys).toEqual(["match-reminder/00000000-0000-4000-8000-000000000001"]);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer unit-test-key");
  });

  it.each([
    ["timeout/lost response", "timeout"],
    ["connection reset", "network"],
    ["retryable 5xx after acceptance", 500],
  ])("deduplicates a provider-accepted email after %s", async (_name, firstStep) => {
    const { deliveries, fetchMock, keys } = fakeIdempotentProvider([firstStep, "success"]);
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendEmail(emailInput({ idempotencyKey: undefined, maxAttempts: 2 })))
      .resolves.toEqual({ id: "logical-delivery-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(keys[0]).toBeTruthy();
    expect(new Set(keys).size).toBe(1);
    expect(deliveries.size).toBe(1);
  });

  it("fails clearly when delivery is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendEmail(emailInput())).rejects.toMatchObject({
      code: "EMAIL_NOT_CONFIGURED",
      retryable: false,
    });
  });

  it("does not retry a provider 400 and sanitizes its response", async () => {
    const { deliveries, fetchMock, keys } = fakeIdempotentProvider([400]);
    vi.stubGlobal("fetch", fetchMock);
    const failure = await sendEmail(emailInput({ idempotencyKey: undefined })).catch((error) => error);
    expect(failure).toBeInstanceOf(EmailDeliveryError);
    expect(failure).toMatchObject({ code: "EMAIL_PROVIDER_ERROR", status: 400, retryable: false });
    expect(failure.message).not.toContain("provider details");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(keys[0]).toBeTruthy();
    expect(deliveries.size).toBe(1);
  });

  it("retries 429 with the same automatic key", async () => {
    const { deliveries, fetchMock, keys } = fakeIdempotentProvider([429, "success"]);
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendEmail(emailInput({ idempotencyKey: undefined, maxAttempts: 2 })))
      .resolves.toEqual({ id: "logical-delivery-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Set(keys).size).toBe(1);
    expect(deliveries.size).toBe(1);
  });

  it("preserves an explicit domain key exactly across retries", async () => {
    const explicitKey = "match-reminder/00000000-0000-4000-8000-000000000001";
    const { deliveries, fetchMock, keys } = fakeIdempotentProvider(["network", "success"]);
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendEmail(emailInput({ idempotencyKey: explicitKey, maxAttempts: 2 })))
      .resolves.toEqual({ id: "logical-delivery-1" });
    expect(keys).toEqual([explicitKey, explicitKey]);
    expect(deliveries.size).toBe(1);
  });

  it.each(["", "x".repeat(257), 42])("rejects invalid explicit idempotency key %j before I/O", async (key) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendEmail(emailInput({ idempotencyKey: key }))).rejects.toMatchObject({
      code: "INVALID_IDEMPOTENCY_KEY",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("generates one bounded UUID key outside the retry loop", async () => {
    const { deliveries, fetchMock, keys } = fakeIdempotentProvider([500, "success"]);
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendEmail(emailInput({ idempotencyKey: undefined, maxAttempts: 2 })))
      .resolves.toEqual({ id: "logical-delivery-1" });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(keys[0].length).toBeLessThanOrEqual(256);
    expect(keys[1]).toBe(keys[0]);
    expect(deliveries.size).toBe(1);
  });

  it("uses different automatic keys for independent logical invocations", async () => {
    const { deliveries, fetchMock, keys } = fakeIdempotentProvider(["success"]);
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail(emailInput({ idempotencyKey: undefined }));
    await sendEmail(emailInput({ idempotencyKey: undefined }));
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    expect(deliveries.size).toBe(2);
  });

  it("reports a retryable network failure without leaking transport details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket secret")));
    const failure = await sendEmail(emailInput({ maxAttempts: 1 })).catch((error) => error);
    expect(failure).toMatchObject({ code: "EMAIL_NETWORK_ERROR", retryable: true });
    expect(failure.message).not.toContain("socket secret");
  });

  it("aborts a bounded timeout and reports it as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })));
    const failure = await sendEmail(emailInput({ timeoutMs: 5, maxAttempts: 1 })).catch((error) => error);
    expect(failure).toMatchObject({ code: "EMAIL_TIMEOUT", retryable: true });
  });
});

describe("Gate 5 Expo immediate-ticket semantics", () => {
  beforeEach(() => {
    db.sql.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps accepted and DeviceNotRegistered tickets in input order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { status: "ok", id: "ticket-1" },
      { status: "error", details: { error: "DeviceNotRegistered" } },
    ] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const results = await sendPushNotifications([
      { token: "ExponentPushToken[first]", title: "One", body: "Body" },
      { token: "ExpoPushToken[second]", title: "Two", body: "Body" },
    ]);
    expect(results).toEqual([
      { status: "accepted", accepted: true, retryable: false, ticketId: "ticket-1" },
      { status: "invalid_token", accepted: false, retryable: false, message: "The device is no longer registered", tokenCleared: true },
    ]);
    expect(db.sql).toHaveBeenCalledOnce();
  });

  it("classifies malformed tokens locally and clears only the exact stored value", async () => {
    const results = await sendPushNotifications([
      { token: "ExponentPushToken-not-bracketed", title: "Bad", body: "Body" },
    ]);
    expect(results[0]).toMatchObject({ status: "invalid_token", accepted: false });
    expect(db.sql).toHaveBeenCalledOnce();
  });

  it("does not clear tokens for a provider 5xx or network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    const http = await sendPushNotifications([
      { token: "ExpoPushToken[temporary]", title: "Wait", body: "Body" },
    ]);
    expect(http[0]).toMatchObject({ status: "provider_error", retryable: true });
    expect(db.sql).not.toHaveBeenCalled();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const network = await sendPushNotifications([
      { token: "ExpoPushToken[temporary]", title: "Wait", body: "Body" },
    ]);
    expect(network[0]).toMatchObject({ status: "provider_error", retryable: true });
    expect(db.sql).not.toHaveBeenCalled();
  });
});
