import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for BoardArena.
 *
 * Run with:  npm run e2e
 * Run UI:    npm run e2e:ui
 *
 * The dev server is started automatically (`npm run dev`) and reused if
 * already running. Tests that require Supabase credentials are skipped
 * when env vars are missing so CI without secrets still passes.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
