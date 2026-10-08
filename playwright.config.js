import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3100";

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
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3100",
    env: {
      AUTH_SECRET: "novachrono-playwright-only-secret-at-least-32-characters",
      // Auth sessions now resolve the current user from the database. Point
      // smoke tests at an isolated, migrated test database when one is set.
      DATABASE_URL:
        process.env.PLAYWRIGHT_DATABASE_URL ??
        "postgresql://unused:unused@127.0.0.1:1/unused",
      DATABASE_DRIVER: process.env.PLAYWRIGHT_DATABASE_URL ? "pg" : "neon",
      NEXT_PUBLIC_APP_URL: baseURL,
      SENTRY_DSN: "",
      NEXT_PUBLIC_SENTRY_DSN: "",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: `${baseURL}/account/signin`,
  },
});
