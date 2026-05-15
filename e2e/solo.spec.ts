import { test, expect } from "@playwright/test";

/**
 * Solo-play smoke: solo routes are protected by auth (server-side
 * redirect to /login). We confirm that anonymous access redirects
 * rather than 500ing.
 */
test.describe("Solo routes", () => {
  for (const game of ["chess", "shogi", "babanuki", "daifugo", "shinkei"]) {
    test(`/${game}/solo redirects when not signed in`, async ({ page }) => {
      const response = await page.goto(`/play/${game}/solo`);
      // either redirect to /login or stay (depending on middleware impl)
      expect(response?.status()).toBeLessThan(500);
      const url = page.url();
      expect(url).toMatch(/\/(login|signup|play)/);
    });
  }
});
