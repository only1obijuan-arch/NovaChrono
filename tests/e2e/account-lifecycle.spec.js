import { expect, test } from "@playwright/test";
import { hash } from "argon2";
import { encode } from "next-auth/jwt";
import pg from "pg";

// Gate 6A.2 account-lifecycle journeys. Unlike the smoke specs these use NO
// browser mocks: they drive the production build and a real, isolated, migrated
// PostgreSQL database through three release postures of the same build:
//   3100  every lifecycle flag unset (the shipped default)
//   3101  primary switch + completion approval enabled
//   3102  primary switch enabled, completion paused
// Only this spec's own rows (fixed a?000000-... ids) are created and removed,
// so it can share a database with the Gate 2 smoke fixtures.

const databaseUrl = process.env.PLAYWRIGHT_DATABASE_URL;
test.skip(!databaseUrl, "PLAYWRIGHT_DATABASE_URL (an isolated, migrated database) is required");

const DEFAULT_URL = "http://127.0.0.1:3100";
const ENABLED_URL = "http://127.0.0.1:3101";
const PAUSED_URL = "http://127.0.0.1:3102";
const AUTH_SECRET = "novachrono-playwright-only-secret-at-least-32-characters";
const COOKIE_NAME = "authjs.session-token";
const PASSWORD = "Gate6aE2ePassw0rd!";
const DOMAIN = "lifecycle-e2e.example.test";
const IDENTITY_LABEL = "External identity verification completed for this request";

const ID = {
  org: "a1000000-0000-4000-8000-000000000001",
  venue: "a2000000-0000-4000-8000-000000000001",
  superA: "a3000000-0000-4000-8000-000000000001",
  superB: "a3000000-0000-4000-8000-000000000002",
  venueAdmin: "a3000000-0000-4000-8000-000000000003",
  orgAdmin: "a3000000-0000-4000-8000-000000000004",
  captainFree: "a3000000-0000-4000-8000-000000000005",
  captainOwner: "a3000000-0000-4000-8000-000000000006",
  captainSuccessor: "a3000000-0000-4000-8000-000000000007",
  refTarget: "a3000000-0000-4000-8000-000000000008",
  refSuccessor: "a3000000-0000-4000-8000-000000000009",
  refBusy: "a3000000-0000-4000-8000-00000000000a",
  league: "a4000000-0000-4000-8000-000000000001",
  slotA: "a5000000-0000-4000-8000-000000000001",
  slotB: "a5000000-0000-4000-8000-000000000002",
  teamA: "a6000000-0000-4000-8000-000000000001",
  teamB: "a6000000-0000-4000-8000-000000000002",
  history: "a7000000-0000-4000-8000-000000000000",
  future: "a7000000-0000-4000-8000-000000000001",
  busy: "a7000000-0000-4000-8000-000000000002",
};

const USERS = [
  ["superA", "Super Admin A", "super_admin", false, null],
  ["superB", "Super Admin B", "super_admin", false, null],
  ["venueAdmin", "Venue Administrator", "venue_admin", true, null],
  ["orgAdmin", "Organisation Administrator", "org_admin", true, null],
  ["captainFree", "Captain Free", "captain", true, null],
  ["captainOwner", "Captain Owner", "captain", true, null],
  ["captainSuccessor", "Captain Successor", "captain", true, null],
  ["refTarget", "Referee Target", "referee", true, 1],
  ["refSuccessor", "Referee Successor", "referee", true, 2],
  ["refBusy", "Referee Busy", "referee", true, 3],
];
const emailOf = (key) => `${key.toLowerCase()}@${DOMAIN}`;
const userIds = Object.keys(ID).filter((key) => USERS.some(([k]) => k === key)).map((key) => ID[key]);
const teamIds = [ID.teamA, ID.teamB];
const matchIds = [ID.history, ID.future, ID.busy];

let pool;
let passwordHash;

const q = (text, params = []) => pool.query(text, params);
const one = async (text, params = []) => (await q(text, params)).rows[0];

async function cleanup() {
  await q("DELETE FROM audit_logs WHERE action_by = ANY($1::uuid[]) OR target_id = ANY($2::uuid[])", [
    userIds,
    [...userIds, ...teamIds, ...matchIds],
  ]);
  await q("DELETE FROM notifications WHERE user_id = ANY($1::uuid[])", [userIds]);
  await q("DELETE FROM matches WHERE league_id = $1", [ID.league]);
  await q("DELETE FROM teams WHERE league_id = $1", [ID.league]);
  await q("DELETE FROM league_slots WHERE league_id = $1", [ID.league]);
  await q("DELETE FROM leagues WHERE id = $1", [ID.league]);
  await q("DELETE FROM auth_users WHERE id = ANY($1::uuid[])", [userIds]);
  await q("DELETE FROM venues WHERE id = $1", [ID.venue]);
  await q("DELETE FROM organizations WHERE id = $1", [ID.org]);
  await q("DELETE FROM auth_rate_limits WHERE identifier LIKE $1", [`%${DOMAIN}`]);
  await q(
    "DELETE FROM api_rate_limits WHERE identifier LIKE $1 OR identifier LIKE 'account-deletion:a_000000-0000-4000-8000-%'",
    [`%${DOMAIN}%`],
  );
}

async function seed() {
  await cleanup();
  await q("INSERT INTO organizations (id, name) VALUES ($1, 'Lifecycle E2E Org')", [ID.org]);
  await q(
    "INSERT INTO venues (id, organization_id, name, location) VALUES ($1, $2, 'Lifecycle E2E Venue', 'E2E City')",
    [ID.venue, ID.org],
  );
  for (const [key, name, role, scoped, field] of USERS) {
    await q(
      `INSERT INTO auth_users (id, name, email, role, venue_id, organization_id, field_number, "emailVerified")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [ID[key], name, emailOf(key), role, scoped ? ID.venue : null, scoped ? ID.org : null, field],
    );
    await q(
      `INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
       VALUES ($1, 'credentials', 'credentials', $2, $3)`,
      [ID[key], emailOf(key), passwordHash],
    );
  }
  await q(
    `INSERT INTO leagues (id, venue_id, name, day_of_week, match_format, match_duration_minutes,
                          fields_count, time_slots, max_teams, join_code, status)
     VALUES ($1, $2, 'Lifecycle E2E League', 2, '5v5', 40, 3, '["18:00"]', 2, 'E2ELIFE1', 'active')`,
    [ID.league, ID.venue],
  );
  await q("INSERT INTO league_slots (id, league_id, slot_number) VALUES ($1,$3,1),($2,$3,2)", [
    ID.slotA, ID.slotB, ID.league,
  ]);
  await q(
    `INSERT INTO teams (id, league_id, slot_id, name, status, captain_user_id)
     VALUES ($1,$3,$4,'Lifecycle Team A','active',$6),($2,$3,$5,'Lifecycle Team B','active',NULL)`,
    [ID.teamA, ID.teamB, ID.league, ID.slotA, ID.slotB, ID.captainOwner],
  );
  const insertMatch = (id, round, date, field, status, refereeId, scores) => q(
    `INSERT INTO matches (id, league_id, round_number, match_date, time_slot, field_number,
                          home_slot_id, away_slot_id, home_team_id, away_team_id,
                          home_score, away_score, status, referee_id, result_type)
     VALUES ($1,$2,$3,$4,'18:00',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [id, ID.league, round, date, field, ID.slotA, ID.slotB, ID.teamA, ID.teamB,
      scores?.[0] ?? 0, scores?.[1] ?? 0, status, refereeId, "played"],
  );
  await insertMatch(ID.history, 1, "2030-01-01", 1, "final", ID.refTarget, [2, 1]);
  await insertMatch(ID.future, 2, "2031-01-07", 1, "scheduled", ID.refTarget);
  await insertMatch(ID.busy, 3, "2031-01-07", 2, "scheduled", ID.refBusy);
}

async function markPending(userId) {
  await q(
    `UPDATE auth_users
     SET account_status = 'pending_deletion', deletion_request_id = gen_random_uuid(),
         deletion_requested_at = NOW(), sessions_valid_after = NOW()
     WHERE id = $1`,
    [userId],
  );
}

const userState = (userId) => one(
  `SELECT account_status, deletion_request_id, email, name FROM auth_users WHERE id = $1`,
  [userId],
);

async function signInAs(context, userId, baseURL) {
  // Cookie minted after any DB change so session_issued_at is never older than
  // sessions_valid_after. The server still re-reads the live user on each call.
  const value = await encode({
    token: { id: userId, sub: userId, session_issued_at: Date.now() },
    secret: AUTH_SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
  await context.clearCookies();
  await context.addCookies([
    { name: COOKIE_NAME, value, url: baseURL, httpOnly: true, sameSite: "Lax", secure: false },
  ]);
}

async function api(context, baseURL, method, path, data, headers) {
  const response = await context.request.fetch(`${baseURL}${path}`, {
    method,
    ...(data === undefined ? {} : { data }),
    headers: headers ?? { Origin: baseURL },
  });
  let body = null;
  try { body = await response.json(); } catch { /* non-JSON body */ }
  return { status: response.status(), body };
}

const card = (page, name) => page.locator("article.request-card", { hasText: name });
const statusLine = (page) => page.getByRole("status");
const reasonField = (page) => page.getByLabel("Audit reason");

test.beforeAll(async () => {
  pool = new pg.Pool({ connectionString: databaseUrl });
  passwordHash = await hash(PASSWORD);
});
test.afterAll(async () => {
  await cleanup();
  await pool.end();
});
test.beforeEach(seed);

test.describe("default release posture: every lifecycle flag unset", () => {
  test.use({ baseURL: DEFAULT_URL });

  test("deletion is unavailable in the UI, refused by the API and changes nothing", async ({ context, page }) => {
    await signInAs(context, ID.captainFree, DEFAULT_URL);
    await page.goto("/account/settings");
    await expect(statusLine(page)).toContainText("not currently available");
    await expect(page.getByLabel("Current password")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "REQUEST ACCOUNT DELETION" })).toHaveCount(0);

    expect(await api(context, DEFAULT_URL, "GET", "/api/account/deletion"))
      .toMatchObject({ status: 200, body: { available: false } });
    const refused = await api(context, DEFAULT_URL, "POST", "/api/account/deletion", { password: PASSWORD });
    expect(refused.status).toBe(503);
    expect(refused.body.code).toBe("LIFECYCLE_DISABLED");

    expect(await userState(ID.captainFree)).toMatchObject({ account_status: "active", deletion_request_id: null });
    expect((await one("SELECT count(*)::int AS n FROM audit_logs WHERE action_type LIKE 'ACCOUNT_%'")).n).toBe(0);
  });

  test("administrators can inspect but every lifecycle mutation is refused", async ({ context, page }) => {
    await markPending(ID.refTarget);
    await signInAs(context, ID.superA, DEFAULT_URL);
    await page.goto("/account/lifecycle-admin");
    await expect(card(page, "Referee Target")).toBeVisible();

    for (const payload of [
      { action: "complete", userId: ID.refTarget, reason: "Default posture must refuse completion" },
      { action: "cancel", userId: ID.refTarget, reason: "Default posture must refuse cancel", identityVerified: true },
      { action: "resolve_fixture", userId: ID.refTarget, matchId: ID.future, successorUserId: ID.refSuccessor, reason: "Default posture must refuse" },
    ]) {
      const response = await api(context, DEFAULT_URL, "PATCH", "/api/admin/account-lifecycle", payload);
      expect(response.status).toBe(503);
      expect(response.body.code).toBe("LIFECYCLE_DISABLED");
    }
    expect(await userState(ID.refTarget)).toMatchObject({ account_status: "pending_deletion" });
    expect((await one("SELECT referee_id FROM matches WHERE id = $1", [ID.future])).referee_id).toBe(ID.refTarget);
  });
});

test.describe("lifecycle enabled: primary switch and completion approval on", () => {
  test.use({ baseURL: ENABLED_URL });

  test("captain signs in, must re-enter the password, is signed out and cannot sign back in", async ({ page }) => {
    await page.goto("/account/signin");
    await page.getByLabel("EMAIL ADDRESS").fill(emailOf("captainFree"));
    await page.getByLabel("PASSWORD").fill(PASSWORD);
    await page.getByRole("button", { name: /SIGN IN/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/account/signin"));

    await page.goto("/account/settings");
    await expect(page.getByLabel("Current password")).toBeVisible();
    const submit = page.getByRole("button", { name: "REQUEST ACCOUNT DELETION" });
    await expect(submit).toBeDisabled();
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await expect(submit).toBeEnabled();

    await page.getByLabel("Current password").fill("not-the-real-password");
    await submit.click();
    await expect(page.locator('p[role="alert"]')).toContainText("reauthentication failed");
    expect(await userState(ID.captainFree)).toMatchObject({ account_status: "active" });

    await page.getByLabel("Current password").fill(PASSWORD);
    await submit.click();
    await page.waitForURL(/\/account\/signin\?deletion=pending/);

    const pending = await userState(ID.captainFree);
    expect(pending.account_status).toBe("pending_deletion");
    expect(pending.deletion_request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await one(
      "SELECT count(*)::int AS n FROM audit_logs WHERE action_type = 'ACCOUNT_DELETION_REQUESTED' AND target_id = $1",
      [ID.captainFree],
    )).n).toBe(1);

    await page.getByLabel("EMAIL ADDRESS").fill(emailOf("captainFree"));
    await page.getByLabel("PASSWORD").fill(PASSWORD);
    await page.getByRole("button", { name: /SIGN IN/ }).click();
    await expect(page.getByText(/INCORRECT EMAIL OR PASSWORD/)).toBeVisible();
    expect(page.url()).toContain("/account/signin");
  });

  test("cookie mutations need a same-origin Origin header and a malformed body is a client error", async ({ context }) => {
    await signInAs(context, ID.captainFree, ENABLED_URL);
    const body = { password: PASSWORD };
    expect((await api(context, ENABLED_URL, "POST", "/api/account/deletion", body, {})).status).toBe(403);
    expect((await api(context, ENABLED_URL, "POST", "/api/account/deletion", body, { Origin: "https://attacker.example" })).status).toBe(403);
    expect((await api(context, ENABLED_URL, "POST", "/api/account/deletion", { unexpected: true })).status).toBe(400);
    expect(await userState(ID.captainFree)).toMatchObject({ account_status: "active" });

    await signInAs(context, ID.superA, ENABLED_URL);
    const noOrigin = await api(context, ENABLED_URL, "PATCH", "/api/admin/account-lifecycle", {
      action: "complete", userId: ID.refTarget, reason: "Cross-site request must be rejected",
    }, {});
    expect(noOrigin.status).toBe(403);
    const malformed = await context.request.fetch(`${ENABLED_URL}/api/admin/account-lifecycle`, {
      method: "PATCH",
      headers: { Origin: ENABLED_URL, "Content-Type": "application/json" },
      data: "{",
    });
    expect(malformed.status()).toBe(400);
  });

  test("venue administrator rejects a conflicting successor, then reassigns the fixture", async ({ context, page }) => {
    await signInAs(context, ID.refTarget, ENABLED_URL);
    const requested = await api(context, ENABLED_URL, "POST", "/api/account/deletion", { password: PASSWORD });
    expect(requested.status).toBe(202);
    expect(requested.body.blockers.map((blocker) => blocker.type)).toContain("future_referee_fixtures");

    await signInAs(context, ID.venueAdmin, ENABLED_URL);
    await page.goto("/account/lifecycle-admin");
    const request = card(page, "Referee Target");
    await expect(request).toContainText("future referee fixtures");
    await expect(request.getByRole("button", { name: "COMPLETE DE-IDENTIFICATION" })).toHaveCount(0);
    await expect(request.getByRole("button", { name: "ASSISTED WITHDRAWAL" })).toHaveCount(0);

    const successor = page.getByLabel(`Successor for ${ID.future}`);
    const resolve = request.locator(".record", { has: successor }).getByRole("button");
    await reasonField(page).fill("Verified succession for the pending referee");
    await successor.fill(ID.refBusy);
    await resolve.click();
    await expect(statusLine(page)).toContainText("Successor has a conflicting fixture");
    expect((await one("SELECT referee_id FROM matches WHERE id = $1", [ID.future])).referee_id).toBe(ID.refTarget);

    await successor.fill(ID.refSuccessor);
    await resolve.click();
    await expect(statusLine(page)).toContainText("Lifecycle action completed and audited");
    await expect(request).not.toContainText("future referee fixtures");
    expect((await one("SELECT referee_id FROM matches WHERE id = $1", [ID.future])).referee_id).toBe(ID.refSuccessor);
    expect((await one("SELECT referee_id FROM matches WHERE id = $1", [ID.history])).referee_id).toBe(ID.refTarget);
    expect((await one(
      "SELECT count(*)::int AS n FROM audit_logs WHERE action_type = 'ACCOUNT_REFEREE_SUCCESSION' AND target_id = $1",
      [ID.future],
    )).n).toBe(1);
  });

  test("organisation administrator hands an active team to a successor captain", async ({ context, page }) => {
    await signInAs(context, ID.captainOwner, ENABLED_URL);
    expect((await api(context, ENABLED_URL, "POST", "/api/account/deletion", { password: PASSWORD })).status).toBe(202);

    await signInAs(context, ID.orgAdmin, ENABLED_URL);
    await page.goto("/account/lifecycle-admin");
    const request = card(page, "Captain Owner");
    await expect(request).toContainText("active teams");
    const successor = page.getByLabel(`Successor for ${ID.teamA}`);
    await reasonField(page).fill("Verified captain succession by organisation");
    await successor.fill(ID.captainSuccessor);
    await request.locator(".record", { has: successor }).getByRole("button", { name: "RESOLVE TEAM" }).click();
    await expect(statusLine(page)).toContainText("Lifecycle action completed and audited");

    expect((await one("SELECT captain_user_id FROM teams WHERE id = $1", [ID.teamA])).captain_user_id)
      .toBe(ID.captainSuccessor);
    const audit = await one(
      "SELECT new_value FROM audit_logs WHERE action_type = 'ACCOUNT_TEAM_SUCCESSION' AND target_id = $1",
      [ID.teamA],
    );
    expect(audit.new_value).toEqual({ captain_user_id: ID.captainSuccessor, custody: "successor" });
    expect((await api(context, ENABLED_URL, "GET", "/api/admin/account-lifecycle")).status).toBe(403);
  });

  test("venue administrator places a team in administrator custody without a successor", async ({ context, page }) => {
    await signInAs(context, ID.captainOwner, ENABLED_URL);
    expect((await api(context, ENABLED_URL, "POST", "/api/account/deletion", { password: PASSWORD })).status).toBe(202);

    await signInAs(context, ID.venueAdmin, ENABLED_URL);
    await page.goto("/account/lifecycle-admin");
    const request = card(page, "Captain Owner");
    await reasonField(page).fill("Administrator custody pending approved succession");
    await request.locator(".record", { has: page.getByLabel(`Successor for ${ID.teamA}`) })
      .getByRole("button", { name: "RESOLVE TEAM" }).click();
    await expect(statusLine(page)).toContainText("Lifecycle action completed and audited");

    expect((await one("SELECT captain_user_id FROM teams WHERE id = $1", [ID.teamA])).captain_user_id).toBeNull();
    expect((await one(
      "SELECT new_value FROM audit_logs WHERE action_type = 'ACCOUNT_TEAM_SUCCESSION' AND target_id = $1",
      [ID.teamA],
    )).new_value).toEqual({ captain_user_id: null, custody: "administrator" });
  });

  test("super administrator completes de-identification only after confirmation and keeps sporting history", async ({ context, page }) => {
    await markPending(ID.refTarget);
    await q("UPDATE matches SET referee_id = $1 WHERE id = $2", [ID.refSuccessor, ID.future]);

    await signInAs(context, ID.superA, ENABLED_URL);
    await page.goto("/account/lifecycle-admin");
    const request = card(page, "Referee Target");
    const complete = request.getByRole("button", { name: "COMPLETE DE-IDENTIFICATION" });
    await expect(complete).toBeEnabled();
    await reasonField(page).fill("Responsibilities reviewed and retention approved");

    const prompts = [];
    page.once("dialog", async (dialog) => { prompts.push(dialog.message()); await dialog.dismiss(); });
    await complete.click();
    await expect.poll(() => prompts.length).toBe(1);
    expect(prompts[0]).toMatch(/cannot be undone/i);
    expect(await userState(ID.refTarget)).toMatchObject({ account_status: "pending_deletion" });

    page.once("dialog", async (dialog) => { await dialog.accept(); });
    await complete.click();
    await expect(statusLine(page)).toContainText("Lifecycle action completed and audited");
    // The page refreshes its list after the message; let that request finish so
    // its refreshed session cookie cannot overwrite the identity swapped in below.
    await expect(card(page, "Referee Target")).toHaveCount(0);
    await page.goto("about:blank");

    const done = await userState(ID.refTarget);
    expect(done.account_status).toBe("deidentified");
    expect(done.email).toBe(`deidentified+${ID.refTarget.replaceAll("-", "")}@account.invalid`);
    expect(done.name).toBe("Former referee");
    expect((await one('SELECT count(*)::int AS n FROM auth_accounts WHERE "userId" = $1', [ID.refTarget])).n).toBe(0);
    expect((await one("SELECT referee_id, home_score, away_score FROM matches WHERE id = $1", [ID.history])))
      .toEqual({ referee_id: ID.refTarget, home_score: 2, away_score: 1 });

    await signInAs(context, ID.refTarget, ENABLED_URL);
    expect((await api(context, ENABLED_URL, "GET", "/api/account/deletion")).status).toBe(401);
  });

  test("completion stays disabled while a responsibility blocker remains", async ({ context, page }) => {
    await markPending(ID.refTarget);
    await signInAs(context, ID.superA, ENABLED_URL);
    await page.goto("/account/lifecycle-admin");
    await expect(card(page, "Referee Target").getByRole("button", { name: "COMPLETE DE-IDENTIFICATION" })).toBeDisabled();
    const refused = await api(context, ENABLED_URL, "PATCH", "/api/admin/account-lifecycle", {
      action: "complete", userId: ID.refTarget, reason: "Attempt to complete with unresolved blockers",
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("LIFECYCLE_BLOCKED");
    expect(await userState(ID.refTarget)).toMatchObject({ account_status: "pending_deletion" });
  });

  test("assisted withdrawal needs an explicit identity attestation and restores access", async ({ context, page }) => {
    await markPending(ID.captainFree);
    await signInAs(context, ID.superA, ENABLED_URL);

    const withoutAttestation = await api(context, ENABLED_URL, "PATCH", "/api/admin/account-lifecycle", {
      action: "cancel", userId: ID.captainFree, reason: "Missing the identity attestation",
    });
    expect(withoutAttestation.status).toBe(400);
    expect(await userState(ID.captainFree)).toMatchObject({ account_status: "pending_deletion" });

    await page.goto("/account/lifecycle-admin");
    const request = card(page, "Captain Free");
    const withdraw = request.getByRole("button", { name: "ASSISTED WITHDRAWAL" });
    await expect(withdraw).toBeDisabled();
    await request.getByLabel(IDENTITY_LABEL).check();
    await expect(withdraw).toBeEnabled();
    await reasonField(page).fill("Identity verified through the approved external process");
    await withdraw.click();
    await expect(statusLine(page)).toContainText("Lifecycle action completed and audited");
    await expect(card(page, "Captain Free")).toHaveCount(0);
    await page.goto("about:blank");

    expect(await userState(ID.captainFree)).toMatchObject({ account_status: "active", deletion_request_id: null });
    await signInAs(context, ID.captainFree, ENABLED_URL);
    expect((await api(context, ENABLED_URL, "GET", "/api/account/deletion")).body).toEqual({ available: true });
  });
});

test.describe("completion paused: primary switch on, irreversible completion not authorised", () => {
  test.use({ baseURL: PAUSED_URL });

  test("no new request can be created and no pending request is stranded", async ({ context, page }) => {
    await signInAs(context, ID.captainFree, PAUSED_URL);
    await page.goto("/account/settings");
    await expect(statusLine(page)).toContainText("not currently available");
    await expect(page.getByLabel("Current password")).toHaveCount(0);
    expect((await api(context, PAUSED_URL, "GET", "/api/account/deletion")).body).toEqual({ available: false });
    const refused = await api(context, PAUSED_URL, "POST", "/api/account/deletion", { password: PASSWORD });
    expect(refused.status).toBe(503);
    expect(refused.body.code).toBe("LIFECYCLE_COMPLETION_DISABLED");
    expect(await userState(ID.captainFree)).toMatchObject({ account_status: "active", deletion_request_id: null });

    // An already-pending account can still be recovered, but never completed.
    await markPending(ID.refTarget);
    await q("UPDATE matches SET referee_id = $1 WHERE id = $2", [ID.refSuccessor, ID.future]);
    await signInAs(context, ID.superA, PAUSED_URL);
    await page.goto("/account/lifecycle-admin");
    const request = card(page, "Referee Target");
    await reasonField(page).fill("Attempt completion while paused");
    page.once("dialog", async (dialog) => { await dialog.accept(); });
    await request.getByRole("button", { name: "COMPLETE DE-IDENTIFICATION" }).click();
    await expect(statusLine(page)).toContainText("not currently authorised");
    expect(await userState(ID.refTarget)).toMatchObject({ account_status: "pending_deletion" });

    await request.getByLabel(IDENTITY_LABEL).check();
    await reasonField(page).fill("Identity verified; withdrawing while completion is paused");
    await request.getByRole("button", { name: "ASSISTED WITHDRAWAL" }).click();
    await expect(statusLine(page)).toContainText("Lifecycle action completed and audited");
    expect(await userState(ID.refTarget)).toMatchObject({ account_status: "active", deletion_request_id: null });
  });
});
