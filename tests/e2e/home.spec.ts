import { test, expect } from "@playwright/test";

test("la home carga y linkea a login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Cicalino/i);
  await expect(page.locator('a[href="/login"]').first()).toBeVisible();
});
