import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tx: vi.fn(),
  verify: vi.fn(),
  requireRole: vi.fn(),
  resolveCurrentUser: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("argon2", () => ({ verify: mocks.verify }));
vi.mock("@/app/api/utils/sql", () => ({
  withTransaction: vi.fn(async (operation) => operation(mocks.tx)),
}));
vi.mock("@/app/api/utils/auth", () => ({
  requireRole: mocks.requireRole,
  resolveCurrentUser: mocks.resolveCurrentUser,
}));
vi.mock("@/app/api/utils/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
}));

import {
  accountLifecycleMutationsEnabled,
  accountLifecycleCompletionEnabled,
  completeAccountDeidentification,
  deidentifiedEmailForUserId,
  historicalAccountLabel,
  isReservedLifecycleEmail,
  LifecycleError,
  requestAccountDeletion,
} from "@/app/api/utils/account-lifecycle";
import { POST as deletionPost } from "@/app/api/account/deletion/route";
import { PATCH as lifecyclePatch } from "@/app/api/admin/account-lifecycle/route";

const USER = "30000000-0000-4000-8000-000000000001";
const ADMIN = "30000000-0000-4000-8000-000000000002";
const originalLifecycleFlag = process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED;
const originalCompletionFlag = process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED;

function queryText(strings) {
  return strings.join("?").replace(/\s+/g, " ").trim();
}

function activeUser(overrides = {}) {
  return {
    id: USER,
    email: "person@example.test",
    name: "Person",
    role: "captain",
    venue_id: null,
    organization_id: null,
    account_status: "active",
    deletion_request_id: null,
    deletion_requested_at: null,
    ...overrides,
  };
}

describe("Gate 6A.2 account lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue(true);
    mocks.resolveCurrentUser.mockResolvedValue(activeUser());
    mocks.requireRole.mockResolvedValue(activeUser({ id: ADMIN, role: "super_admin" }));
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED = "true";
    process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED = "true";
  });

  afterAll(() => {
    if (originalLifecycleFlag === undefined) {
      delete process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED;
    } else {
      process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED = originalLifecycleFlag;
    }
    if (originalCompletionFlag === undefined) {
      delete process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED;
    } else {
      process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED = originalCompletionFlag;
    }
  });

  it("fails closed at service and route boundaries until both request controls are enabled", async () => {
    delete process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED;
    expect(accountLifecycleMutationsEnabled()).toBe(false);

    await expect(requestAccountDeletion({ userId: USER, password: "correct-password" }))
      .rejects.toMatchObject({ code: "LIFECYCLE_DISABLED", status: 503 });
    expect(mocks.tx).not.toHaveBeenCalled();

    const deletionResponse = await deletionPost(new Request("https://example.test/api/account/deletion", {
      method: "POST",
    }));
    expect(deletionResponse.status).toBe(503);
    expect(await deletionResponse.json()).toMatchObject({ code: "LIFECYCLE_DISABLED" });

    const adminResponse = await lifecyclePatch(new Request("https://example.test/api/admin/account-lifecycle", {
      method: "PATCH",
    }));
    expect(adminResponse.status).toBe(503);
    expect(await adminResponse.json()).toMatchObject({ code: "LIFECYCLE_DISABLED" });

    process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED = "true";
    delete process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED;
    expect(accountLifecycleCompletionEnabled()).toBe(false);
    await expect(requestAccountDeletion({ userId: USER, password: "correct-password" }))
      .rejects.toMatchObject({ code: "LIFECYCLE_COMPLETION_DISABLED", status: 503 });
    const completionDisabled = await deletionPost(new Request("https://example.test/api/account/deletion", {
      method: "POST",
    }));
    expect(completionDisabled.status).toBe(503);
    expect(await completionDisabled.json()).toMatchObject({ code: "LIFECYCLE_COMPLETION_DISABLED" });
  });

  it("rejects missing/cross-origin cookie mutations and accepts the bearer request shape", async () => {
    const missingOrigin = await deletionPost(new Request("https://example.test/api/account/deletion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }));
    expect(missingOrigin.status).toBe(403);

    const crossOrigin = await deletionPost(new Request("https://example.test/api/account/deletion", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.test" },
      body: "{}",
    }));
    expect(crossOrigin.status).toBe(403);

    const bearer = await deletionPost(new Request("https://example.test/api/account/deletion", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer valid-mobile-shape" },
      body: "{}",
    }));
    expect(bearer.status).toBe(400);
    expect(mocks.resolveCurrentUser).toHaveBeenCalled();
  });

  it("returns a client error for malformed lifecycle JSON", async () => {
    const response = await lifecyclePatch(new Request("https://example.test/api/admin/account-lifecycle", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: "https://example.test" },
      body: "{",
    }));
    expect(response.status).toBe(400);
  });

  it("provides functional web and mobile deletion initiation paths", () => {
    const webSettings = readFileSync("src/app/account/settings/page.jsx", "utf8");
    const mobileSettings = readFileSync("mobile/src/app/account/delete.jsx", "utf8");
    const mobileApi = readFileSync("mobile/src/utils/api.js", "utf8");
    const adminPanel = readFileSync("src/app/account/lifecycle-admin/page.jsx", "utf8");

    expect(webSettings).toContain('fetch("/api/account/deletion"');
    expect(webSettings).toContain("body: JSON.stringify({ password })");
    expect(mobileSettings).toContain("await requestAccountDeletion(password)");
    expect(mobileApi).toContain('apiFetch("/api/account/deletion"');
    expect(mobileApi).toContain("getAccountLifecycleAvailability");
    expect(adminPanel).toContain("Pending deletion requests");
  });

  it("uses an irreversible, deterministic non-deliverable replacement email", () => {
    expect(deidentifiedEmailForUserId(USER)).toBe(
      "deidentified+30000000000040008000000000000001@account.invalid",
    );
    expect(isReservedLifecycleEmail("X@ACCOUNT.INVALID")).toBe(true);
    expect(isReservedLifecycleEmail("person@example.test")).toBe(false);
    expect(historicalAccountLabel("referee")).toBe("Former referee");
  });

  it("moves an authenticated account to pending and revokes every local session class", async () => {
    const statements = [];
    mocks.tx.mockImplementation(async (strings) => {
      const text = queryText(strings);
      statements.push(text);
      if (text.includes("WHERE role = 'super_admin'")) return [];
      if (text.includes("FROM auth_users") && text.includes("FOR UPDATE") && text.includes("deletion_request_id")) {
        return [activeUser()];
      }
      if (text.includes("FROM auth_accounts")) return [{ password: "argon-hash" }];
      if (text.includes("to_regclass('public.auth_sessions')")) return [{ exists: true }];
      if (text.includes("FROM teams")) return [];
      if (text.includes("FROM matches")) return [];
      return [];
    });

    const result = await requestAccountDeletion({ userId: USER, password: "correct-password" });

    expect(result.status).toBe("pending_deletion");
    expect(result.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.verify).toHaveBeenCalledWith("argon-hash", "correct-password");
    expect(statements.some((text) => text.includes("WHERE role = 'super_admin'") && text.includes("FOR UPDATE"))).toBe(true);
    expect(statements.some((text) => text.includes("account_status = 'pending_deletion'"))).toBe(true);
    expect(statements.some((text) => text.includes("sessions_valid_after = NOW()"))).toBe(true);
    expect(statements.some((text) => text.includes("DELETE FROM mobile_sessions"))).toBe(true);
    expect(statements.some((text) => text.includes("DELETE FROM auth_sessions"))).toBe(true);
    expect(statements.some((text) => text.includes("DELETE FROM password_reset_tokens"))).toBe(true);
    expect(statements.some((text) => text.includes("ACCOUNT_DELETION_REQUESTED"))).toBe(true);
  });

  it("requires the current credential before changing lifecycle state", async () => {
    mocks.verify.mockResolvedValue(false);
    mocks.tx.mockImplementation(async (strings) => {
      const text = queryText(strings);
      if (text.includes("WHERE role = 'super_admin'")) return [];
      if (text.includes("FROM auth_users") && text.includes("FOR UPDATE")) return [activeUser()];
      if (text.includes("FROM auth_accounts")) return [{ password: "argon-hash" }];
      return [];
    });

    await expect(requestAccountDeletion({ userId: USER, password: "wrong" }))
      .rejects.toMatchObject({ code: "REAUTHENTICATION_FAILED", status: 403 });
    expect(mocks.tx.mock.calls.some(([strings]) => queryText(strings).includes("pending_deletion"))).toBe(false);
  });

  it("cannot place the final active super administrator into pending deletion", async () => {
    mocks.tx.mockImplementation(async (strings) => {
      const text = queryText(strings);
      if (text.includes("WHERE role = 'super_admin'") && text.includes("deletion_request_id")) {
        return [activeUser({ role: "super_admin" })];
      }
      if (text.includes("FROM auth_accounts")) return [{ password: "argon-hash" }];
      return [];
    });

    await expect(requestAccountDeletion({ userId: USER, password: "correct-password" }))
      .rejects.toMatchObject({ code: "FINAL_SUPER_ADMIN", status: 409 });
  });

  it("blocks completion while active team ownership remains", async () => {
    const target = activeUser({
      account_status: "pending_deletion",
      deletion_request_id: "40000000-0000-4000-8000-000000000001",
      deletion_requested_at: new Date().toISOString(),
    });
    const actor = activeUser({ id: ADMIN, role: "super_admin" });
    mocks.tx.mockImplementation(async (strings) => {
      const text = queryText(strings);
      if (text.includes("WHERE role = 'super_admin'") && text.includes("FOR UPDATE")) return [actor];
      if (text.includes("WHERE id =") && text.includes("deletion_request_id") && text.includes("FOR UPDATE")) return [target];
      if (text.includes("FROM teams")) return [{ id: "team", name: "History FC", venue_id: "venue" }];
      if (text.includes("FROM matches")) return [];
      return [];
    });

    await expect(completeAccountDeidentification({
      actorId: ADMIN,
      targetUserId: USER,
      reason: "Verified responsibilities review completed",
    })).rejects.toMatchObject({
      code: "LIFECYCLE_BLOCKED",
      status: 409,
      details: [{ type: "active_teams" }],
    });
  });

  it("de-identifies without deleting the stable auth_users row", async () => {
    const statements = [];
    const target = activeUser({
      account_status: "pending_deletion",
      deletion_request_id: "40000000-0000-4000-8000-000000000001",
      deletion_requested_at: new Date().toISOString(),
    });
    const actor = activeUser({ id: ADMIN, role: "super_admin" });
    mocks.tx.mockImplementation(async (strings) => {
      const text = queryText(strings);
      statements.push(text);
      if (text.includes("WHERE role = 'super_admin'") && text.includes("FOR UPDATE")) return [actor];
      if (text.includes("WHERE id =") && text.includes("deletion_request_id") && text.includes("FOR UPDATE")) return [target];
      if (text.includes("FROM teams") || text.includes("FROM matches")) return [];
      if (text.includes("to_regclass('public.auth_sessions')")) return [{ exists: false }];
      return [];
    });

    const result = await completeAccountDeidentification({
      actorId: ADMIN,
      targetUserId: USER,
      reason: "Verified responsibilities review completed",
    });

    expect(result.status).toBe("deidentified");
    expect(statements.some((text) => text.includes("UPDATE auth_users") && text.includes("account_status = 'deidentified'"))).toBe(true);
    expect(statements.some((text) => text.includes("DELETE FROM auth_users"))).toBe(false);
    expect(statements.some((text) => text.includes("DELETE FROM auth_accounts"))).toBe(true);
    expect(statements.some((text) => text.includes("DELETE FROM notifications"))).toBe(true);
    expect(statements.some((text) => text.includes("ACCOUNT_DEIDENTIFIED"))).toBe(true);
  });

  it("uses typed lifecycle failures for route-safe error handling", () => {
    const error = new LifecycleError("BLOCKED", 409, "Blocked", [{ type: "fixture" }]);
    expect(error).toMatchObject({ name: "LifecycleError", code: "BLOCKED", status: 409 });
  });
});
