import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyMobileToken: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/mobile-auth", () => ({ verifyMobileToken: mocks.verifyMobileToken }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));

import { resolveCurrentUser } from "@/app/api/utils/auth";

const user = { id: "30000000-0000-4000-8000-000000000001", role: "captain", account_status: "active" };
const request = (headers = {}) => new Request("https://example.test/api/account/deletion", { method: "POST", headers });

describe("Gate 6A.2 bearer exclusivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: user.id } });
    mocks.sql.mockResolvedValue([user]);
    mocks.verifyMobileToken.mockResolvedValue(null);
  });

  it("never falls back to a browser cookie when a bearer header is present", async () => {
    // A syntactic Authorization header must not turn an ambient cookie into a
    // CSRF bypass: the bearer credential alone decides, and an invalid one fails.
    const resolved = await resolveCurrentUser(request({ Authorization: "Bearer invalid-token" }));
    expect(resolved).toBeNull();
    expect(mocks.verifyMobileToken).toHaveBeenCalledTimes(1);
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("uses the verified mobile identity for a valid bearer token", async () => {
    mocks.verifyMobileToken.mockResolvedValue(user);
    expect(await resolveCurrentUser(request({ Authorization: "Bearer valid-token" }))).toEqual(user);
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("uses only the web session when no bearer header is sent", async () => {
    expect(await resolveCurrentUser(request())).toEqual(user);
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    expect(mocks.verifyMobileToken).not.toHaveBeenCalled();
  });

  it("returns no identity without a session or bearer credential", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await resolveCurrentUser(request())).toBeNull();
    expect(mocks.verifyMobileToken).not.toHaveBeenCalled();
  });
});
