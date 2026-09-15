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
  const schedules = await page.request.get(`${API}/planner/schedules`).then((response) => response.json());
  const demandSchedule = schedules.find((schedule: { name: string }) => schedule.name === "Demanda supersede E2E");
  expect(demandSchedule?.id).toBeTruthy();
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(`/api/planner/schedules/${demandSchedule.id}`)),
    page.getByLabel("Cuadrante seleccionado").selectOption(demandSchedule.id),
  ]);
  await page.getByRole("button", { name: "Necesidades" }).click();
  await expect(page.getByRole("button", { name: "Calcular necesidades" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Necesidad manual" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Propuesta de necesidades" })).toBeVisible();
  await expect(page.getByText(/tickets históricos/)).toBeVisible();
  await expect(page.getByText("Demanda estimada")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Asignables" })).toBeVisible();
  await expect(page.getByText(/Déficit/).first()).toBeVisible();
  await expect(page.getByText(/Base:/).first()).toBeVisible();
  await expect(page.getByText(/Histórico:/).first()).toBeVisible();
  await expect(page.getByText(/Reservas:/).first()).toBeVisible();

  await page.getByRole("button", { name: /Reglas/ }).click();
  await expect(page.getByText("No hay coeficientes implícitos")).toBeVisible();
  await expect(page.getByText(/E2E Sala viernes/).first()).toBeVisible();
});

test("configured reservation demand becomes an applied need and generated assignment", async ({ request }) => {
  const centerId = process.env.E2E_DEMAND_CENTER_ID;
  const positionId = process.env.E2E_DEMAND_POSITION_ID;
  test.skip(!ADMIN_ID || !centerId || !positionId, "Demand center and position fixtures are required");
  const login = await request.post(`${API}/auth/pin`, {
    data: { employeeId: ADMIN_ID, pin: ADMIN_PIN },
  });
  expect(login.status()).toBe(200);
  const token = (await login.json()).token as string;
  const headers = { Authorization: `Bearer ${token}` };
  const marker = Date.now();
  let ruleId = "";
  let reservationId = "";

  try {
    const ruleResponse = await request.post(`${API}/planner/demand-rules`, {
      headers,
      data: {
        name: `E2E reserva ${marker}`,
        workCenterId: centerId,
        positionId,
        departmentId: null,
        dayOfWeek: 3,
        startTime: "16:00",
        endTime: "18:00",
        validFrom: "2027-03-01",
        validTo: "2027-03-07",
        baseCount: 0,
        historicalWeeks: 1,
        minimumComparableWeeks: 1,
        historicalMetric: null,
        historicalThreshold: null,
        historicalIncrement: null,
        historicalRounding: null,
        reservationGuestThreshold: 4,
        reservationIncrement: 1,
        reservationRounding: "PER_COMPLETE_BLOCK",
        categoryId: null,
        prepZone: null,
      },
    });
    expect(ruleResponse.status()).toBe(201);
    ruleId = (await ruleResponse.json()).id;

    const reservationResponse = await request.post(`${API}/reservations`, {
      headers,
      data: {
        fecha: "2027-03-03",
        hora: "16:30",
        nombre: `Reserva E2E ${marker}`,
        personas: 4,
        duracionMinutos: 60,
        workCenterId: centerId,
      },
    });
    expect(reservationResponse.status()).toBe(201);
    reservationId = (await reservationResponse.json()).id;

    const scheduleResponse = await request.post(`${API}/planner/schedules`, {
      headers,
      data: {
        name: `Demanda Playwright ${marker}`,
        dateFrom: "2027-03-03",
        dateTo: "2027-03-03",
        workCenterId: centerId,
      },
    });
    expect(scheduleResponse.status()).toBe(201);
    const scheduleId = (await scheduleResponse.json()).id as string;

    const calculated = await request.post(`${API}/planner/schedules/${scheduleId}/need-proposals/calculate`, {
      headers,
      data: { workCenterId: centerId, historicalWeeksOverride: null },
    });
    expect(calculated.status()).toBe(201);
    const proposal = await calculated.json();
    expect(proposal.items).toEqual([
      expect.objectContaining({
        requirementDate: "2027-03-03",
        reservationGuests: 4,
        suggestedCount: 1,
      }),
    ]);

    const proposalId = proposal.proposal.id as string;
    expect((await request.post(`${API}/planner/need-proposals/${proposalId}/review`, { headers, data: {} })).status()).toBe(200);
    expect((await request.post(`${API}/planner/need-proposals/${proposalId}/apply`, { headers, data: {} })).status()).toBe(200);
    const generated = await request.post(`${API}/planner/schedules/${scheduleId}/generate`, { headers, data: {} });
    expect(generated.status()).toBe(200);
    expect((await generated.json()).generated).toBe(1);

    const context = await request.get(`${API}/planner/schedules/${scheduleId}`, { headers }).then((response) => response.json());
    expect(context.requirements).toEqual([
      expect.objectContaining({ source: "demand-v1", requiredCount: 1 }),
    ]);
    expect(context.shiftRows).toEqual([
      expect.objectContaining({ date: "2027-03-03", positionId }),
    ]);
  } finally {
    if (ruleId) await request.delete(`${API}/planner/demand-rules/${ruleId}`, { headers });
    if (reservationId) await request.delete(`${API}/reservations/${reservationId}`, { headers });
  }
});
