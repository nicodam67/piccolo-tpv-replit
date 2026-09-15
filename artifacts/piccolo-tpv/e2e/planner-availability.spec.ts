import { expect, test } from "@playwright/test";

const APP = process.env.TPV_BASE_URL ?? "http://localhost:5173";
const API = process.env.API_BASE_URL ?? "http://localhost:3000/api";
const ADMIN_ID = process.env.E2E_ADMIN_ID;
const ADMIN_PIN = process.env.E2E_ADMIN_PIN ?? "1234";

test("manager configures and compares planner availability", async ({ page }) => {
  test.skip(!ADMIN_ID, "E2E_ADMIN_ID is required for the live availability flow");
  const login = await page.request.post(`${API}/auth/pin`, {
    data: { employeeId: ADMIN_ID, pin: ADMIN_PIN },
  });
  expect(login.status()).toBe(200);

  await page.goto(`${APP}/personal/planificador`);
  await page.getByRole("button", { name: "Disponibilidad" }).click();
  await expect(page.getByRole("heading", { name: "Disponibilidad semanal" })).toBeVisible();
  await expect(page.getByText("Restricción obligatoria")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Preferencias" })).toBeVisible();

  const ana = page.getByRole("button", { name: /Ana Sala/ });
  if (await ana.count()) await ana.click();
  await expect(page.getByText(/Disponible/).first()).toBeVisible();
  await expect(page.getByText(/Zona Atlantic\/Canary/)).toBeVisible();

  await page.getByRole("button", { name: "Vista del equipo" }).click();
  await expect(page.getByRole("heading", { name: "Disponibilidad del equipo" })).toBeVisible();
  await expect(page.getByText("Semana local · Atlantic/Canary")).toBeVisible();
  await expect(page.getByText("Ana Sala")).toBeVisible();
  await expect(page.getByText("Ausencia aprobada").or(page.getByText("Todo el día")).first()).toBeVisible();
});
