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

describe("Gate 5 Resend transport semantics", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "unit-test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
  });

  it("returns the provider ID and forwards a bounded idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendEmail(emailInput())).resolves.toEqual({ id: "email-1" });
    expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toContain("match-reminder/");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer unit-test-key");
  });

  it("fails clearly when delivery is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendEmail(emailInput())).rejects.toMatchObject({
      code: "EMAIL_NOT_CONFIGURED",
      retryable: false,
    });
  });

  it("does not retry a provider 400 and sanitizes its response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "sensitive provider text" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const failure = await sendEmail(emailInput()).catch((error) => error);
    expect(failure).toBeInstanceOf(EmailDeliveryError);
    expect(failure).toMatchObject({ code: "EMAIL_PROVIDER_ERROR", status: 400, retryable: false });
    expect(failure.message).not.toContain("sensitive provider text");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([429, 500])("retries retryable HTTP %s responses", async (status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: `after-${status}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendEmail(emailInput({ maxAttempts: 2 }))).resolves.toEqual({ id: `after-${status}` });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
