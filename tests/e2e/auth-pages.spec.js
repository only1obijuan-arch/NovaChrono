import { expect, test } from "@playwright/test";

// Behaviour contract for the two token-driven auth pages. All backend calls are mocked
// in the browser, so no database or real token is involved.

const INVITE_PATH = "/api/admin/invite";
const ACCEPT_PATH = "/api/admin/accept-invite";
const RESET_PATH = "/api/auth/reset-password";
const STRONG_PASSWORD = "Str0ng!Passw0rd";

function watchRuntimeErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/hydrat|did not match|Minified React error|useSearchParams|Suspense|Maximum update depth|Warning:/i.test(text)) {
      errors.push(text);
    }
  });
  return errors;
}

async function mockAnonymousSession(page) {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: {} }));
}

// Registers a handler for one API path and records every request that reaches it.
async function mockApi(page, pathname, handler) {
  const requests = [];
  await page.route(
    (url) => url.pathname === pathname,
    async (route) => {
      requests.push(route.request());
      await handler(route, route.request());
    },
  );
  return requests;
}

test.describe("accept-invite page", () => {
  test("missing token shows the invalid state and never calls the API", async ({ page }) => {
    const errors = watchRuntimeErrors(page);
    await mockAnonymousSession(page);
    const validations = await mockApi(page, INVITE_PATH, (route) => route.fulfill({ json: { valid: true } }));
    await page.goto("/account/accept-invite");
    await expect(page.getByRole("heading", { name: "INVITE INVALID" })).toBeVisible();
    await expect(page.getByText("NO INVITE TOKEN FOUND. PLEASE USE THE LINK FROM YOUR EMAIL.")).toBeVisible();
    await page.waitForTimeout(500);
    expect(validations).toHaveLength(0);
    expect(errors).toEqual([]);
  });

  test("an empty token value is treated as missing", async ({ page }) => {
    await mockAnonymousSession(page);
    const validations = await mockApi(page, INVITE_PATH, (route) => route.fulfill({ json: { valid: true } }));
    await page.goto("/account/accept-invite?token=");
    await expect(page.getByRole("heading", { name: "INVITE INVALID" })).toBeVisible();
    expect(validations).toHaveLength(0);
  });

  test("valid token validates once, shows the invitation, and submits the query token", async ({ page }) => {
    const errors = watchRuntimeErrors(page);
    await mockAnonymousSession(page);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const validations = await mockApi(page, INVITE_PATH, async (route) => {
      await gate;
      await route.fulfill({
        json: { valid: true, email: "new.admin@example.test", organizationName: "Example Org" },
      });
    });
    const accepts = await mockApi(page, ACCEPT_PATH, (route) => route.fulfill({ json: { success: true } }));

    await page.goto("/account/accept-invite?token=abc123def456");
    await expect(page.getByText("VALIDATING INVITE...")).toBeVisible();
    release();
    await expect(page.getByRole("heading", { name: "CREATE YOUR ACCOUNT" })).toBeVisible();
    await expect(page.getByText("Example Org")).toBeVisible();
    await expect(page.getByText("new.admin@example.test")).toBeVisible();
    await expect(page.getByText("VALIDATING INVITE...")).toHaveCount(0);

    await page.getByPlaceholder("e.g. John Smith").fill("New Admin");
    await page.getByPlaceholder("Min. 8 characters").fill(STRONG_PASSWORD);
    await page.getByPlaceholder("Re-enter password").fill(STRONG_PASSWORD);
    await page.getByRole("button", { name: /ACTIVATE ACCOUNT/ }).click();
    await expect(page.getByRole("heading", { name: "ACCOUNT CREATED!" })).toBeVisible();

    expect(validations).toHaveLength(1);
    expect(new URL(validations[0].url()).searchParams.get("token")).toBe("abc123def456");
    expect(accepts).toHaveLength(1);
    expect(accepts[0].method()).toBe("POST");
    expect(accepts[0].postDataJSON()).toEqual({
      token: "abc123def456",
      name: "New Admin",
      password: STRONG_PASSWORD,
    });
    await page.waitForTimeout(500);
    expect(validations).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test("invalid or expired token shows the server message, with a generic fallback", async ({ page }) => {
    await mockAnonymousSession(page);
    await mockApi(page, INVITE_PATH, (route, request) => {
      const token = new URL(request.url()).searchParams.get("token");
      return route.fulfill({
        json: token === "expiredtoken" ? { valid: false, error: "This invite has expired" } : { valid: false },
      });
    });
    await page.goto("/account/accept-invite?token=expiredtoken");
    await expect(page.getByRole("heading", { name: "INVITE INVALID" })).toBeVisible();
    await expect(page.getByText("THIS INVITE HAS EXPIRED")).toBeVisible();

    await page.goto("/account/accept-invite?token=unknowntoken");
    await expect(page.getByRole("heading", { name: "INVITE INVALID" })).toBeVisible();
    await expect(page.getByText("INVALID OR EXPIRED INVITE LINK.")).toBeVisible();
  });

  test("a failed validation request shows the retry message", async ({ page }) => {
    await mockAnonymousSession(page);
    await mockApi(page, INVITE_PATH, (route) => route.abort());
    await page.goto("/account/accept-invite?token=networkfail");
    await expect(page.getByRole("heading", { name: "INVITE INVALID" })).toBeVisible();
    await expect(page.getByText("FAILED TO VALIDATE INVITE. PLEASE TRY AGAIN.")).toBeVisible();
  });

  test("the token is URL-encoded in the validation request", async ({ page }) => {
    await mockAnonymousSession(page);
    const validations = await mockApi(page, INVITE_PATH, (route) => route.fulfill({ json: { valid: false } }));
    await page.goto(`/account/accept-invite?token=${encodeURIComponent("a+b/c d&e=f")}`);
    await expect(page.getByRole("heading", { name: "INVITE INVALID" })).toBeVisible();
    expect(validations).toHaveLength(1);
    expect(new URL(validations[0].url()).searchParams.get("token")).toBe("a+b/c d&e=f");
  });
});

test.describe("reset-password page", () => {
  test("missing token shows the expired-link state and never calls the API", async ({ page }) => {
    const errors = watchRuntimeErrors(page);
    await mockAnonymousSession(page);
    const validations = await mockApi(page, RESET_PATH, (route) => route.fulfill({ json: { valid: true } }));
    await page.goto("/account/reset-password");
    await expect(page.getByRole("heading", { name: "LINK EXPIRED" })).toBeVisible();
    await expect(page.getByRole("link", { name: /REQUEST NEW LINK/ })).toHaveAttribute("href", "/account/forgot-password");
    await page.waitForTimeout(500);
    expect(validations).toHaveLength(0);
    expect(errors).toEqual([]);
  });

  test("valid token validates once, then submits the query token", async ({ page }) => {
    const errors = watchRuntimeErrors(page);
    await mockAnonymousSession(page);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const calls = await mockApi(page, RESET_PATH, async (route, request) => {
      if (request.method() === "GET") {
        await gate;
        return route.fulfill({ json: { valid: true } });
      }
      return route.fulfill({ json: { success: true } });
    });

    await page.goto("/account/reset-password?token=resettoken123");
    await expect(page.getByRole("heading", { name: "SET NEW PASSWORD" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "LINK EXPIRED" })).toHaveCount(0);
    release();
    await expect(page.getByRole("heading", { name: "SET NEW PASSWORD" })).toBeVisible();

    await page.getByPlaceholder("Min. 8 characters").fill(STRONG_PASSWORD);
    await page.getByPlaceholder("Re-enter password").fill(STRONG_PASSWORD);
    await page.getByRole("button", { name: /UPDATE PASSWORD/ }).click();
    await expect(page.getByRole("heading", { name: "PASSWORD UPDATED" })).toBeVisible();
    await expect(page.getByRole("link", { name: /SIGN IN/ }).last()).toHaveAttribute("href", "/account/signin");

    const gets = calls.filter((request) => request.method() === "GET");
    const posts = calls.filter((request) => request.method() === "POST");
    expect(gets).toHaveLength(1);
    expect(new URL(gets[0].url()).searchParams.get("token")).toBe("resettoken123");
    expect(posts).toHaveLength(1);
    expect(posts[0].postDataJSON()).toEqual({ token: "resettoken123", password: STRONG_PASSWORD });
    await page.waitForTimeout(500);
    expect(calls.filter((request) => request.method() === "GET")).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test("invalid or expired token shows the expired-link state", async ({ page }) => {
    await mockAnonymousSession(page);
    await mockApi(page, RESET_PATH, (route) => route.fulfill({ json: { valid: false } }));
    await page.goto("/account/reset-password?token=expiredtoken");
    await expect(page.getByRole("heading", { name: "LINK EXPIRED" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "SET NEW PASSWORD" })).toHaveCount(0);
  });

  test("a failed validation request shows the expired-link state", async ({ page }) => {
    await mockAnonymousSession(page);
    await mockApi(page, RESET_PATH, (route) => route.abort());
    await page.goto("/account/reset-password?token=networkfail");
    await expect(page.getByRole("heading", { name: "LINK EXPIRED" })).toBeVisible();
  });

  test("a rejected submit keeps the form and shows the server error", async ({ page }) => {
    await mockAnonymousSession(page);
    await mockApi(page, RESET_PATH, (route, request) => (
      request.method() === "GET"
        ? route.fulfill({ json: { valid: true } })
        : route.fulfill({ status: 400, json: { error: "Token already used" } })
    ));
    await page.goto("/account/reset-password?token=usedtoken");
    await page.getByPlaceholder("Min. 8 characters").fill(STRONG_PASSWORD);
    await page.getByPlaceholder("Re-enter password").fill(STRONG_PASSWORD);
    await page.getByRole("button", { name: /UPDATE PASSWORD/ }).click();
    await expect(page.getByText("TOKEN ALREADY USED")).toBeVisible();
    await expect(page.getByRole("heading", { name: "SET NEW PASSWORD" })).toBeVisible();
  });

  test("the token is URL-encoded in the validation request", async ({ page }) => {
    await mockAnonymousSession(page);
    const validations = await mockApi(page, RESET_PATH, (route) => route.fulfill({ json: { valid: false } }));
    await page.goto(`/account/reset-password?token=${encodeURIComponent("a+b/c d&e=f")}`);
    await expect(page.getByRole("heading", { name: "LINK EXPIRED" })).toBeVisible();
    expect(validations).toHaveLength(1);
    expect(new URL(validations[0].url()).searchParams.get("token")).toBe("a+b/c d&e=f");
  });
});
