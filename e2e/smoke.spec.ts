import { test, expect } from "@playwright/test";

test.describe("smoke @upgrade-regression", () => {
  test("landing page renders the Magic Vault title", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Magic Vault" })).toBeVisible();
  });

  test("unauthenticated landing page does not show authed nav links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Your Collections" })).toHaveCount(0);
  });

  test("next-auth signin page is reachable", async ({ page }) => {
    const response = await page.goto("/api/auth/signin");
    expect(response?.ok()).toBeTruthy();
  });
});
