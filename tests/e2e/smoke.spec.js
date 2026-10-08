import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";

const baseURL = "http://127.0.0.1:3100";
const authSecret = "novachrono-playwright-only-secret-at-least-32-characters";
const cookieName = "authjs.session-token";
const authUserIds = {
  venue_admin: "91000000-0000-4000-8000-000000000001",
  captain: "91000000-0000-4000-8000-000000000002",
  referee: "91000000-0000-4000-8000-000000000003",
};

const league = {
  id: "league-1",
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
  venue_id: "venue-1",
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
    venue_id: "venue-1",
    org_id: "org-1",
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
  await mockJson(page, "**/api/leagues?leagueId=league-1", league);
  await mockJson(page, "**/api/teams?leagueId=league-1", []);
  await mockJson(page, "**/api/stats?leagueId=league-1", { standings: [], topScorers: [] });
  await mockJson(page, "**/api/matches?leagueId=league-1", []);
  await mockJson(page, "**/api/admin/referees?venueId=venue-1", { referees: [] });

  await page.goto("/admin/league/league-1");
  await expect(page.getByRole("heading", { name: league.name })).toBeVisible();
  await expect(page.getByText(/TUESDAY LEAGUE/)).toBeVisible();
  await expect(page.getByRole("button", { name: /fixtures/i })).toBeVisible();
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
