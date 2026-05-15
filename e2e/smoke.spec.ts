import { test, expect } from "@playwright/test";

/**
 * Smoke test: visit each public route and confirm the page renders
 * without a fatal error. These pages do not require authentication.
 *
 * Full multi-user matching flow is intentionally out-of-scope here
 * because it requires two authenticated browser contexts and live
 * Supabase credentials. See README for that scenario.
 */
test.describe("BoardArena smoke", () => {
  test("home page loads with game cards", async ({ page }) => {
    await page.goto("/");
    // Header should always render
    await expect(page.locator("body")).toBeVisible();
    // At least one known game title appears somewhere on the page
    await expect(page.getByText(/チェス|将棋|ババ抜き/).first()).toBeVisible();
  });

  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input[type=email], input[name=email]").first()).toBeVisible();
  });

  test("signup page renders", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator("input[type=email], input[name=email]").first()).toBeVisible();
  });
});
