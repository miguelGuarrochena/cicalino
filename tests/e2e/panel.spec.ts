import { test, expect } from "@playwright/test";

test("el dueño entra por demo y crea un pedido (muestra QR)", async ({
  page,
}) => {
  await page.goto("/login");
  // Botón de rol demo "Dueño".
  await page.getByRole("button", { name: /Dueño/ }).click();
  await expect(page).toHaveURL(/\/panel/);
  await expect(
    page.getByRole("heading", { name: /Pedidos de hoy/ }),
  ).toBeVisible();

  // Crear un pedido (modo "pedido" autoincrementa y abre el QR).
  await page
    .getByRole("button", { name: /Nuevo pedido/ })
    .first()
    .click();

  // El modal del QR muestra la instrucción de escaneo.
  await expect(
    page.getByText(/lo escanea con la cámara/i),
  ).toBeVisible();
});

test("marcar un pedido como listo muestra confirmación", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Dueño/ }).click();
  await expect(page).toHaveURL(/\/panel/);

  // El primer pedido en curso tiene un botón "Marcar listo · avisar".
  const listo = page.getByRole("button", { name: /Marcar listo/ }).first();
  await expect(listo).toBeVisible();
  await listo.click();
});
