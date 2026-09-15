import { expect, test } from "@playwright/test";

const APP = process.env.TPV_BASE_URL ?? "http://localhost:5173";
const API = process.env.API_BASE_URL ?? "http://localhost:3000/api";
const ADMIN_ID = process.env.E2E_ADMIN_ID;
const ADMIN_PIN = process.env.E2E_ADMIN_PIN ?? "1234";

test("manager reviews an explainable staffing-needs proposal", async ({ page }) => {
  test.skip(!ADMIN_ID, "E2E_ADMIN_ID is required for the live demand flow");
  const login = await page.request.post(`${API}/auth/pin`, {
    data: { employeeId: ADMIN_ID, pin: ADMIN_PIN },
  });
  expect(login.status()).toBe(200);

  await page.goto(`${APP}/personal/planificador`);
  await page.getByLabel("Cuadrante seleccionado").selectOption({ label: "Demanda supersede E2E" });
  await page.getByRole("button", { name: "Necesidades" }).click();
  await expect(page.getByRole("button", { name: "Calcular necesidades" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Necesidad manual" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Propuesta de necesidades" })).toBeVisible();
  await expect(page.getByText(/tickets históricos/)).toBeVisible();
  await expect(page.getByText("Demanda estimada")).toBeVisible();
  await expect(page.getByText("Asignables")).toBeVisible();
  await expect(page.getByText(/Déficit/).first()).toBeVisible();
  await expect(page.getByText(/Base:/).first()).toBeVisible();
  await expect(page.getByText(/Histórico:/).first()).toBeVisible();
  await expect(page.getByText(/Reservas:/).first()).toBeVisible();

  await page.getByRole("button", { name: /Reglas/ }).click();
  await expect(page.getByText("No hay coeficientes implícitos")).toBeVisible();
  await expect(page.getByText(/E2E Sala viernes/).first()).toBeVisible();
});
