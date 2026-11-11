import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  cancel: vi.fn(),
  complete: vi.fn(),
  resolveTeam: vi.fn(),
  resolveReferee: vi.fn(),
  list: vi.fn(),
}));

vi.mock("argon2", () => ({ verify: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ withTransaction: vi.fn() }));
vi.mock("@/app/api/utils/auth", () => ({
  requireRole: mocks.requireRole,
  resolveCurrentUser: vi.fn(),
}));
vi.mock("@/app/api/utils/account-lifecycle", async (importOriginal) => ({
  ...(await importOriginal()),
  cancelPendingDeletion: mocks.cancel,
  completeAccountDeidentification: mocks.complete,
  resolveTeamResponsibility: mocks.resolveTeam,
  resolveRefereeResponsibility: mocks.resolveReferee,
  listPendingLifecycleRequests: mocks.list,
}));

import { GET as adminGet, PATCH as adminPatch } from "@/app/api/admin/account-lifecycle/route";
import { GET as orgGet, PATCH as orgPatch } from "@/app/api/org-admin/account-lifecycle/route";
import { hasBearerAuthorization, sameOriginOrBearer } from "@/app/api/utils/request-security";

const ACTOR = "30000000-0000-4000-8000-0000000000aa";
const TARGET = "30000000-0000-4000-8000-0000000000bb";
const SUCCESSOR = "30000000-0000-4000-8000-0000000000cc";
const TEAM = "30000000-0000-4000-8000-0000000000dd";
const MATCH = "30000000-0000-4000-8000-0000000000ee";
const REASON = "Verified through the approved process";
const ORIGIN = "https://example.test";
const original = {
  mutations: process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED,
  completion: process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED,
};

const patchRequest = (path, body, { origin = ORIGIN, raw } = {}) => new Request(`${ORIGIN}${path}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
  body: raw ?? JSON.stringify(body),
});
const adminPath = "/api/admin/account-lifecycle";
const orgPath = "/api/org-admin/account-lifecycle";
const actorAs = (role) => mocks.requireRole.mockResolvedValue({ id: ACTOR, role });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED = "true";
  process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED = "true";
  actorAs("super_admin");
  mocks.cancel.mockResolvedValue({ status: "active" });
  mocks.complete.mockResolvedValue({ status: "deidentified" });
  mocks.resolveTeam.mockResolvedValue({ status: "pending_deletion", resolution: "successor_assigned" });
  mocks.resolveReferee.mockResolvedValue({ status: "pending_deletion", resolution: "referee_reassigned" });
  mocks.list.mockResolvedValue([]);
});

afterAll(() => {
  for (const [name, value] of [
    ["ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED", original.mutations],
    ["ACCOUNT_LIFECYCLE_COMPLETION_ENABLED", original.completion],
  ]) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

describe("Gate 6A.2 request boundary helpers", () => {
  it.each([
    ["Bearer abc.def", true],
    ["bearer abc", true],
    ["Bearer ", false],
    ["Bearer", false],
    ["Basic abc", false],
    ["Bearer a b", false],
    ["", false],
  ])("treats Authorization %j as bearer=%s", (value, expected) => {
    const request = new Request(`${ORIGIN}/x`, { headers: value ? { Authorization: value } : {} });
    expect(hasBearerAuthorization(request)).toBe(expected);
  });

  it.each([
    [{ Origin: ORIGIN }, true],
    [{ Origin: "https://example.test:444" }, false],
    [{ Origin: "https://evil.test" }, false],
    [{ Origin: "null" }, false],
    [{ Origin: "not a url" }, false],
    [{}, false],
    [{ Authorization: "Bearer mobile-token" }, true],
    [{ Authorization: "Bearer mobile-token", Origin: "https://evil.test" }, true],
    [{ Authorization: "Basic abc" }, false],
    // Next derives request.url from its own listener, so the addressed host is
    // taken from the forwarded/Host header (as Next's Server Actions check does).
    [{ Origin: "https://app.example.test", Host: "app.example.test" }, true],
    [{ Origin: "https://app.example.test", Host: "internal:8080", "X-Forwarded-Host": "app.example.test" }, true],
    [{ Origin: "https://evil.test", Host: "app.example.test" }, false],
    [{ Origin: ORIGIN, Host: "app.example.test" }, false],
    [{ Origin: "https://app.example.test:8443", Host: "app.example.test" }, false],
    [{ Origin: "https://app.example.test", "X-Forwarded-Host": "evil.test, app.example.test" }, false],
  ])("same-origin-or-bearer for %j is %s", (headers, expected) => {
    expect(sameOriginOrBearer(new Request(`${ORIGIN}/x`, { method: "PATCH", headers }))).toBe(expected);
  });
});

describe("Gate 6A.2 administrator lifecycle route", () => {
  it("requires the explicit identity attestation before assisted withdrawal", async () => {
    const missing = await adminPatch(patchRequest(adminPath, { action: "cancel", userId: TARGET, reason: REASON }));
    expect(missing.status).toBe(400);
    const falsy = await adminPatch(patchRequest(adminPath, { action: "cancel", userId: TARGET, reason: REASON, identityVerified: false }));
    expect(falsy.status).toBe(400);
    expect(mocks.cancel).not.toHaveBeenCalled();

    const accepted = await adminPatch(patchRequest(adminPath, { action: "cancel", userId: TARGET, reason: REASON, identityVerified: true }));
    expect(accepted.status).toBe(200);
    // The validated attestation is forwarded so the service can enforce and audit it.
    expect(mocks.cancel).toHaveBeenCalledWith({
      actorId: ACTOR,
      targetUserId: TARGET,
      reason: REASON,
      identityVerified: true,
    });
  });

  it("restricts withdrawal and completion to super administrators", async () => {
    actorAs("venue_admin");
    for (const body of [
      { action: "cancel", userId: TARGET, reason: REASON, identityVerified: true },
      { action: "complete", userId: TARGET, reason: REASON },
    ]) {
      expect((await adminPatch(patchRequest(adminPath, body))).status).toBe(403);
    }
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();

    const resolved = await adminPatch(patchRequest(adminPath, {
      action: "resolve_fixture", userId: TARGET, matchId: MATCH, successorUserId: SUCCESSOR, reason: REASON,
    }));
    expect(resolved.status).toBe(200);
    expect(mocks.resolveReferee).toHaveBeenCalledWith({
      actorId: ACTOR, targetUserId: TARGET, matchId: MATCH, successorUserId: SUCCESSOR, reason: REASON,
    });
  });

  it("keeps recovery available but refuses completion while completion is paused", async () => {
    delete process.env.ACCOUNT_LIFECYCLE_COMPLETION_ENABLED;
    const completion = await adminPatch(patchRequest(adminPath, { action: "complete", userId: TARGET, reason: REASON }));
    expect(completion.status).toBe(503);
    expect(await completion.json()).toMatchObject({ code: "LIFECYCLE_COMPLETION_DISABLED" });
    expect(mocks.complete).not.toHaveBeenCalled();

    const withdrawal = await adminPatch(patchRequest(adminPath, {
      action: "cancel", userId: TARGET, reason: REASON, identityVerified: true,
    }));
    expect(withdrawal.status).toBe(200);
  });

  it("refuses every action without the primary switch, before any authentication", async () => {
    delete process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED;
    const response = await adminPatch(patchRequest(adminPath, { action: "complete", userId: TARGET, reason: REASON }));
    expect(response.status).toBe(503);
    expect(mocks.requireRole).not.toHaveBeenCalled();
  });

  it("rejects cross-site, self-administering, unknown-field and unauthenticated requests", async () => {
    const body = { action: "complete", userId: TARGET, reason: REASON };
    expect((await adminPatch(patchRequest(adminPath, body, { origin: null }))).status).toBe(403);
    expect((await adminPatch(patchRequest(adminPath, body, { origin: "https://evil.test" }))).status).toBe(403);
    expect(mocks.requireRole).not.toHaveBeenCalled();

    expect((await adminPatch(patchRequest(adminPath, { ...body, userId: ACTOR }))).status).toBe(400);
    expect((await adminPatch(patchRequest(adminPath, { ...body, extra: true }))).status).toBe(400);
    expect((await adminPatch(patchRequest(adminPath, null, { raw: "{" }))).status).toBe(400);

    mocks.requireRole.mockResolvedValue(null);
    expect((await adminPatch(patchRequest(adminPath, body))).status).toBe(403);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("scopes read-only inspection to venue and super administrators", async () => {
    const response = await adminGet(new Request(`${ORIGIN}${adminPath}`));
    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith(expect.anything(), "venue_admin", "super_admin");
    expect(mocks.list).toHaveBeenCalledWith({ actorId: ACTOR });

    mocks.requireRole.mockResolvedValue(null);
    expect((await adminGet(new Request(`${ORIGIN}${adminPath}`))).status).toBe(403);
  });
});

describe("Gate 6A.2 organisation-administrator lifecycle route", () => {
  const teamBody = { action: "resolve_team", userId: TARGET, teamId: TEAM, successorUserId: SUCCESSOR, reason: REASON };

  it("is fail-closed, same-origin only and limited to organisation and super administrators", async () => {
    actorAs("org_admin");
    const ok = await orgPatch(patchRequest(orgPath, teamBody));
    expect(ok.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith(expect.anything(), "org_admin", "super_admin");
    expect(mocks.resolveTeam).toHaveBeenCalledWith({
      actorId: ACTOR, targetUserId: TARGET, teamId: TEAM, successorUserId: SUCCESSOR, reason: REASON,
    });

    expect((await orgPatch(patchRequest(orgPath, teamBody, { origin: null }))).status).toBe(403);
    expect((await orgPatch(patchRequest(orgPath, teamBody, { origin: "https://evil.test" }))).status).toBe(403);

    mocks.requireRole.mockResolvedValue(null);
    expect((await orgPatch(patchRequest(orgPath, teamBody))).status).toBe(403);

    actorAs("org_admin");
    delete process.env.ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED;
    expect((await orgPatch(patchRequest(orgPath, teamBody))).status).toBe(503);
    expect(mocks.resolveTeam).toHaveBeenCalledTimes(1);
  });

  it("cannot withdraw or complete a request and cannot administer itself", async () => {
    actorAs("org_admin");
    for (const action of ["cancel", "complete"]) {
      const response = await orgPatch(patchRequest(orgPath, { action, userId: TARGET, reason: REASON, identityVerified: true }));
      expect(response.status).toBe(400);
    }
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect((await orgPatch(patchRequest(orgPath, { ...teamBody, userId: ACTOR }))).status).toBe(400);
    expect((await orgPatch(patchRequest(orgPath, null, { raw: "{" }))).status).toBe(400);
  });

  it("reassigns fixtures and lists only the actor's scoped requests", async () => {
    actorAs("org_admin");
    const response = await orgPatch(patchRequest(orgPath, {
      action: "resolve_fixture", userId: TARGET, matchId: MATCH, reason: REASON,
    }));
    expect(response.status).toBe(200);
    expect(mocks.resolveReferee).toHaveBeenCalledWith({
      actorId: ACTOR, targetUserId: TARGET, matchId: MATCH, successorUserId: null, reason: REASON,
    });

    expect((await orgGet(new Request(`${ORIGIN}${orgPath}`))).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({ actorId: ACTOR });
    mocks.requireRole.mockResolvedValue(null);
    expect((await orgGet(new Request(`${ORIGIN}${orgPath}`))).status).toBe(403);
  });
});
