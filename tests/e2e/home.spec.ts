import { test, expect } from "@playwright/test";

test("la home carga y linkea al panel", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Cicalino/i);
  await expect(page.locator('a[href="/panel"]').first()).toBeVisible();
});
