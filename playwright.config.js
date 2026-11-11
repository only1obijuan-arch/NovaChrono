import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3100";
const database = process.env.PLAYWRIGHT_DATABASE_URL;

// Three release postures of the same production build. Port 3100 is the
// shipped default (every lifecycle flag unset). Ports 3101 (both flags on) and
// 3102 (primary switch only, completion paused) start only when an isolated,
// migrated database is supplied, because the account-lifecycle journeys run
// against the real routes and PostgreSQL rather than browser mocks.
function server(port, extraEnv = {}) {
  const origin = `http://127.0.0.1:${port}`;
  return {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    env: {
      AUTH_SECRET: "novachrono-playwright-only-secret-at-least-32-characters",
      // Auth sessions now resolve the current user from the database. Point
      // smoke tests at an isolated, migrated test database when one is set.
      DATABASE_URL: database ?? "postgresql://unused:unused@127.0.0.1:1/unused",
      DATABASE_DRIVER: database ? "pg" : "neon",
      NEXT_PUBLIC_APP_URL: origin,
      SENTRY_DSN: "",
      NEXT_PUBLIC_SENTRY_DSN: "",
      ...extraEnv,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: `${origin}/account/signin`,
  };
}

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    server(3100),
    ...(database
      ? [
          server(3101, {
            ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED: "true",
            ACCOUNT_LIFECYCLE_COMPLETION_ENABLED: "true",
          }),
          server(3102, { ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED: "true" }),
        ]
      : []),
  ],
});
