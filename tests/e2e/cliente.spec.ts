import { test, expect } from "@playwright/test";

test("un token inexistente muestra 'pedido no encontrado'", async ({ page }) => {
  await page.goto("/p/token-que-no-existe");
  await expect(page.getByText(/Pedido no encontrado/)).toBeVisible();
});
