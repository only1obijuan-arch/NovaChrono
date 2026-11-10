import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTrustedClientIp } from "@/app/api/utils/client-ip";
import { getAuthSecretKey } from "@/app/api/utils/auth-secret";

const signin = vi.hoisted(() => ({ verify: vi.fn(), query: vi.fn() }));
vi.mock("argon2", () => ({ verify: signin.verify }));
vi.mock("@/app/api/utils/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/app/api/utils/db", () => ({
  pool: { connect: vi.fn(async () => ({ query: signin.query, release: vi.fn() })) },
}));

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

afterEach(() => vi.unstubAllEnvs());

describe("Gate 6A trusted proxy boundary", () => {
  it("does not trust client-selectable forwarding headers outside Vercel", () => {
    vi.stubEnv("VERCEL", "");
    const request = new Request("https://example.test", {
      headers: {
        "x-forwarded-for": "203.0.113.10",
        "x-real-ip": "203.0.113.11",
        "x-vercel-forwarded-for": "203.0.113.12",
      },
    });
    expect(getTrustedClientIp(request)).toBe("unknown");
  });

  it("uses Vercel's edge-provided client address in the accepted deployment", () => {
    vi.stubEnv("VERCEL", "1");
    const request = new Request("https://example.test", {
      headers: { "x-vercel-forwarded-for": "203.0.113.20" },
    });
    expect(getTrustedClientIp(request)).toBe("203.0.113.20");
  });

  it.each(["not-an-ip", "", "203.0.113.20, attacker-controlled"])(
    "fails closed for malformed or multi-hop address %j",
    (value) => {
      vi.stubEnv("VERCEL", "1");
      const request = new Request("https://example.test", {
        headers: { "x-vercel-forwarded-for": value },
      });
      const expected = value.startsWith("203.0.113.20,") ? "203.0.113.20" : "unknown";
      expect(getTrustedClientIp(request)).toBe(expected);
    },
  );
});

describe("Gate 6A mobile secret and legacy utility cleanup", () => {
  it.each([undefined, "short"])("fails closed for an unsafe AUTH_SECRET value", (value) => {
    vi.stubEnv("AUTH_SECRET", value);
    expect(() => getAuthSecretKey()).toThrow(/AUTH_SECRET/);
  });

  it("does not embed or transmit a shared mobile authentication secret", () => {
    const mobileApi = read("mobile/src/utils/api.js");
    const signinRoute = read("src/app/api/auth/mobile-signin/route.js");
    const environmentExample = read(".env.example");

    expect(mobileApi).not.toMatch(/EXPO_PUBLIC_MOBILE_SECRET|x-mobile-secret|MOBILE_SECRET/);
    expect(signinRoute).not.toMatch(/process\.env\.MOBILE_SECRET|headers\.get\(["']x-mobile-secret/);
    expect(environmentExample).not.toMatch(/^MOBILE_SECRET=|^EXPO_PUBLIC_MOBILE_SECRET=/m);
  });

  it.each([
    ["an unknown email", { users: [], accounts: [] }],
    ["an account without a credentials row", { users: [{ id: "u1", email: "a@example.test" }], accounts: [] }],
    ["an account with no stored password", { users: [{ id: "u1", email: "a@example.test" }], accounts: [{ password: null }] }],
  ])("spends an Argon2 verification before rejecting %s", async (_label, { users, accounts }) => {
    signin.verify.mockReset().mockResolvedValue(false);
    signin.query.mockReset().mockImplementation(async (text) => {
      const rows = String(text).includes("FROM auth_users") ? users : String(text).includes("FROM auth_accounts") ? accounts : [];
      return { rows, rowCount: rows.length };
    });
    const { POST } = await import("@/app/api/auth/mobile-signin/route");
    const response = await POST(new Request("https://example.test/api/auth/mobile-signin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@example.test", password: "whatever-it-is" }),
    }));
    expect(response.status).toBe(401);
    expect(signin.verify).toHaveBeenCalledTimes(1);
    expect(signin.verify.mock.calls[0][0]).toMatch(/^\$argon2id\$/);
  });

  it("removes obsolete hardcoded password-reset pages without recreating APIs", () => {
    expect(existsSync(resolve(root, "src/app/admin/reset-password-utility/page.jsx"))).toBe(false);
    expect(existsSync(resolve(root, "src/app/admin/reset-all-passwords/page.jsx"))).toBe(false);
    expect(existsSync(resolve(root, "src/app/api/reset-admin-password/route.js"))).toBe(false);
    expect(existsSync(resolve(root, "src/app/api/reset-all-passwords/route.js"))).toBe(false);
  });
});
