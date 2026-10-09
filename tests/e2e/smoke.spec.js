import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";

const baseURL = "http://127.0.0.1:3100";
const authSecret = "novachrono-playwright-only-secret-at-least-32-characters";
const cookieName = "authjs.session-token";
const organizationId = "92000000-0000-4000-8000-000000000001";
const venueId = "93000000-0000-4000-8000-000000000001";
const leagueId = "94000000-0000-4000-8000-000000000001";
const authUserIds = {
  venue_admin: "91000000-0000-4000-8000-000000000001",
  captain: "91000000-0000-4000-8000-000000000002",
  referee: "91000000-0000-4000-8000-000000000003",
};

const league = {
  id: leagueId,
  name: "Tuesday Premier League",
  status: "registration",
  day_of_week: 2,
  season_name: "2026",
  season_start_date: "2026-10-01",
  season_end_date: "2027-02-01",
  match_format: "2x20",
  match_duration_minutes: 40,
  fields_count: 2,
  max_teams: 10,
  join_code: "A1B2C3D4",
  venue_id: venueId,
  venue_name: "Nova Arena",
  win_points: 3,
  draw_points: 1,
  forfeit_score_home: 3,
  forfeit_score_away: 0,
};

function watchRuntimeErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function authenticate(context, page, role) {
  const user = {
    id: authUserIds[role],
    sub: authUserIds[role],
    name: `${role.replace("_", " ")} smoke user`,
    email: `${role}@example.test`,
    role,
    venue_id: venueId,
    organization_id: organizationId,
    field_number: role === "referee" ? 1 : null,
  };
  const value = await encode({
    token: user,
    secret: authSecret,
    salt: cookieName,
    maxAge: 60 * 60,
  });

  await context.addCookies([
    {
      name: cookieName,
      value,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user,
        expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    })
  );
  await mockJson(page, "**/api/notifications*", {
    notifications: [],
    unreadCount: 0,
  });
  return user;
}

async function mockJson(page, pattern, json) {
  await page.route(pattern, (route) => route.fulfill({ json }));
}

async function mockAnonymousSession(page) {
  await mockJson(page, "**/api/auth/session", {});
}

test("sign-in shell renders", async ({ page }) => {
  const errors = watchRuntimeErrors(page);
  await mockAnonymousSession(page);
  await page.goto("/account/signin");
  await expect(page.getByRole("heading", { name: "SYSTEM ACCESS" })).toBeVisible();
  await expect(page.getByLabel("EMAIL ADDRESS")).toBeVisible();
  expect(errors).toEqual([]);
});

test("venue-admin dashboard renders a numeric league weekday", async ({ context, page }) => {
  const errors = watchRuntimeErrors(page);
  const user = await authenticate(context, page, "venue_admin");
  await mockJson(page, "**/api/admin/profile", {
    user: { ...user, venue_name: "Nova Arena", venue_lat: -26.1, venue_lng: 28.05 },
  });
  await mockJson(page, "**/api/leagues?venueId=*", [league]);
  await mockJson(page, "**/api/admin/referees?venueId=*", { referees: [] });
  await mockJson(page, "**/api/weather?*", {
    temp: 23,
    condition: "Clear",
    wind_speed: 2,
    lightning_risk: false,
    severe: false,
  });

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Nova Arena" })).toBeVisible();
  await expect(page.getByText(/TUESDAY LEAGUE/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("league detail renders numeric day and primary tabs", async ({ context, page }) => {
  const errors = watchRuntimeErrors(page);
  await authenticate(context, page, "venue_admin");
  await mockJson(page, `**/api/leagues?leagueId=${leagueId}`, league);
  await mockJson(page, `**/api/stats?leagueId=${leagueId}`, { standings: [], topScorers: [] });
  await mockJson(page, `**/api/matches?leagueId=${leagueId}`, []);
  await mockJson(page, `**/api/teams?leagueId=${leagueId}`, [{
    id: "team-1",
    league_id: leagueId,
    slot_id: "slot-1",
    name: "Nova United",
    status: "active",
    captain_name: "Captain smoke user",
    created_at: "2026-10-01T00:00:00.000Z",
  }]);
  await mockJson(page, `**/api/admin/referees?venueId=${venueId}`, { referees: [] });

  await page.goto(`/admin/league/${leagueId}`);
  await expect(page.getByRole("heading", { name: league.name })).toBeVisible();
  await expect(page.getByText(/TUESDAY LEAGUE/)).toBeVisible();
  await expect(page.getByRole("button", { name: /fixtures/i })).toBeVisible();
  await page.getByRole("button", { name: /teams/i }).click();
  const teamRow = page.getByRole("row").filter({ hasText: "Nova United" });
  await expect(teamRow).toContainText("Captain smoke user");
  await expect(teamRow).toContainText(/2026/);
  expect(errors).toEqual([]);
});

test("captain area renders team operations shell", async ({ context, page }) => {
  const errors = watchRuntimeErrors(page);
  await authenticate(context, page, "captain");
  await mockJson(page, "**/api/teams?teamId=team-1", {
    id: "team-1",
    name: "Nova United",
    league_id: "league-1",
    league_name: league.name,
    venue_name: league.venue_name,
    slot_id: "slot-1",
    match_format: league.match_format,
  });
  await mockJson(page, "**/api/players?teamId=team-1", []);
  await mockJson(page, "**/api/matches?leagueId=league-1", []);
  await mockJson(page, "**/api/stats?leagueId=league-1", { standings: [], topScorers: [] });
  await page.goto("/captain/team/team-1");
  await expect(page.getByRole("heading", { name: "Nova United" })).toBeVisible();
  await expect(page.getByText(/team roster/i)).toBeVisible();
  expect(errors).toEqual([]);
});

test("referee area renders match-day shell", async ({ context, page }) => {
  const errors = watchRuntimeErrors(page);
  await authenticate(context, page, "referee");
  await mockJson(page, "**/api/matches?*", []);

  await page.goto("/referee");
  await expect(page.getByRole("heading", { name: "Referee Portal" })).toBeVisible();
  await expect(page.getByText("NO MATCHES TODAY")).toBeVisible();
  expect(errors).toEqual([]);
});

test("referee match commands surface HTTP failures without false success", async ({ context, page }) => {
  const errors = watchRuntimeErrors(page);
  await authenticate(context, page, "referee");
  await mockJson(page, "**/api/matches?matchId=match-command-failure", {
    match: {
      id: "match-command-failure",
      status: "scheduled",
      field_number: 1,
      home_score: 0,
      away_score: 0,
      home_team_name: "Nova United",
      away_team_name: "Orion City",
      home_team_id: "team-home",
      away_team_id: "team-away",
      time_slot: "18:30",
      match_duration_minutes: 20,
    },
    events: [],
  });
  await mockJson(page, "**/api/players?teamId=*", []);
  await page.route("**/api/matches", (route) => route.fulfill({
    status: 409,
    json: { error: "Cannot start a match with status 'live'" },
  }));

  await page.goto("/referee/match/match-command-failure");
  await page.getByRole("button", { name: /start match/i }).click();
  await expect(page.getByText("Cannot start a match with status 'live'")).toBeVisible();
  await expect(page.getByText("1st half started!")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("referee goal retry preserves one operation ID and server score authority", async ({ context, page }) => {
  const errors = watchRuntimeErrors(page);
  await authenticate(context, page, "referee");
  await mockJson(page, "**/api/matches?matchId=match-goal-retry", {
    match: {
      id: "match-goal-retry",
      status: "live",
      field_number: 1,
      home_score: 0,
      away_score: 0,
      home_team_name: "Nova United",
      away_team_name: "Orion City",
      home_team_id: "team-home",
      away_team_id: "team-away",
      start_time: new Date(Date.now() - 10_000).toISOString(),
      half2_start_time: null,
      time_slot: "18:30",
      match_duration_minutes: 20,
    },
    events: [],
  });
  await mockJson(page, "**/api/players?teamId=*", []);
  const commands = [];
  await page.route("**/api/matches", async (route) => {
    commands.push(route.request().postDataJSON());
    if (commands.length === 1) {
      await route.fulfill({ status: 500, json: { error: "Temporary database failure" } });
    } else {
      await route.fulfill({ status: 200, json: { success: true, idempotent: false } });
    }
  });

  await page.goto("/referee/match/match-goal-retry");
  await page.getByRole("button", { name: /\+ goal/i }).first().click();
  await page.getByRole("button", { name: /unknown \/ no roster/i }).click();
  await expect(page.getByText("Goal recorded!")).toBeVisible();
  expect(commands).toHaveLength(2);
  expect(commands[0].opId).toBe(commands[1].opId);
  expect(commands[0].opId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.locator(".mc-score-display").first()).toHaveText("0");
  expect(errors).toEqual([]);
});

test("public standings and results shell renders", async ({ page }) => {
  const errors = watchRuntimeErrors(page);
  await mockAnonymousSession(page);
  await mockJson(page, "**/api/leagues?leagueId=league-1", league);
  await mockJson(page, "**/api/stats?leagueId=league-1", {
    standings: [
      {
        id: "standing-1",
        slot_id: "slot-1",
        team_id: "team-1",
        team_name: "Nova United",
        played: 1,
        won: 1,
        drawn: 0,
        lost: 0,
        goals_for: 2,
        goals_against: 0,
        goal_difference: 2,
        points: 3,
        form_last5: ["W"],
      },
    ],
    topScorers: [],
  });
  await mockJson(page, "**/api/matches?leagueId=league-1", []);

  await page.goto("/league/league-1");
  await expect(page.getByRole("heading", { name: league.name })).toBeVisible();
  await expect(page.getByRole("button", { name: /standings/i })).toBeVisible();
  await expect(page.getByText("Nova United")).toBeVisible();
  expect(errors).toEqual([]);
});
