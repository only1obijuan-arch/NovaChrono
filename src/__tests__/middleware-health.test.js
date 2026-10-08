import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyMobileToken: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: (handler) => handler,
}));

vi.mock("@/app/api/utils/mobile-auth", () => ({
  verifyMobileToken: mocks.verifyMobileToken,
}));

import middleware from "@/middleware";

function request(pathname, auth = null) {
  const url = new URL(`https://example.test${pathname}`);
  return {
    auth,
    method: "GET",
    nextUrl: url,
    url: url.toString(),
  };
}

describe("middleware health boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyMobileToken.mockResolvedValue(null);
  });

  it("allows anonymous readiness checks through to /api/health", async () => {
    const response = await middleware(request("/api/health"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps private API routes protected", async () => {
    const response = await middleware(request("/api/profile"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});
