import { test, expect } from "@playwright/test";

test("el superadmin crea una empresa (demo)", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Superadmin/ }).click();
  await expect(page).toHaveURL(/\/admin/);

  await page.getByRole("button", { name: /Crear empresa/ }).click();
  await expect(
    page.getByRole("heading", { name: /Nueva empresa/ }),
  ).toBeVisible();

  await page.getByLabel("Nombre de la empresa").fill("Test E2E SA");
  await page.getByLabel("Responsable").fill("Juan Test");
  await page.getByLabel("Email del dueño").fill("test@e2e.com");
  await page.getByRole("button", { name: "Guardar" }).click();

  await expect(page.getByText("Test E2E SA")).toBeVisible();
});
