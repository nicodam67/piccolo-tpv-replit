import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { apiWithAuth } from "./helpers/db-reset";

const API = process.env.API_BASE_URL ?? "http://localhost:3010/api";
let adminToken = "";
let waiterToken = "";

test.beforeAll(async ({ request }) => {
  adminToken = (await loginAs(request, "admin")).token;
  waiterToken = (await loginAs(request, "waiter")).token;
});

test.describe("Entrega 39 — module certification", () => {
  test("QR ticket opens a bound table session and public menu", async ({ request }) => {
    const admin = apiWithAuth(request, adminToken);
    const zones = await admin.get("/zones").then((response) => response.json());
    const tables = await admin.get(`/zones/${zones[0].id}/tables`).then((response) => response.json());
    const ticketResponse = await admin.get(`/admin/tables/${tables[0].id}/qr-ticket`);
    expect(ticketResponse.status()).toBe(200);
    const { ticket } = await ticketResponse.json();
    const sessionResponse = await request.post(`${API}/public/table-sessions`, { data: { ticket } });
    expect(sessionResponse.status()).toBe(201);
    const session = await sessionResponse.json();
    const check = await request.get(
      `${API}/public/table-sessions/check?token=${encodeURIComponent(session.token)}`,
    );
    expect(check.status()).toBe(200);
    expect((await request.get(`${API}/public/menu`)).status()).toBe(200);
    expect((await request.get(`${API}/public/branding`)).status()).toBe(200);
  });

  test("reservations create and list against PostgreSQL", async ({ request }) => {
    const waiter = apiWithAuth(request, waiterToken);
    const created = await waiter.post("/reservations", {
      fecha: "2026-07-24",
      hora: "20:00",
      nombre: "Certificación E39",
      telefono: "600000039",
      personas: 2,
      isDemo: true,
    });
    expect(created.status()).toBe(201);
    const list = await waiter.get("/reservations");
    expect(list.status()).toBe(200);
    expect((await list.json()).some((reservation: { nombre: string }) =>
      reservation.nombre === "Certificación E39")).toBe(true);
  });

  test("CRM and loyalty are reachable with manager authority", async ({ request }) => {
    const admin = apiWithAuth(request, adminToken);
    const clients = await admin.get("/crm/clients");
    const loyalty = await admin.get("/crm/loyalty/config");
    expect(clients.status()).toBe(200);
    expect(loyalty.status()).toBe(200);
  });

  test("fichaje records and settings are available", async ({ request }) => {
    const admin = apiWithAuth(request, adminToken);
    expect((await admin.get("/fichaje/records")).status()).toBe(200);
    expect((await admin.get("/fichaje/settings")).status()).toBe(200);
  });

  test("delivery and offline modules expose operational state", async ({ request }) => {
    const admin = apiWithAuth(request, adminToken);
    expect((await admin.get("/delivery-orders")).status()).toBe(200);
    expect((await admin.get("/offline/devices")).status()).toBe(200);
  });

  test("printing, backup and configuration are admin-operational", async ({ request }) => {
    const admin = apiWithAuth(request, adminToken);
    expect((await admin.get("/admin/printers")).status()).toBe(200);
    expect((await admin.get("/backup/list")).status()).toBe(200);
    expect((await admin.get("/config/business")).status()).toBe(200);
  });

  test("RBAC denies waiter access to backup administration", async ({ request }) => {
    const waiter = apiWithAuth(request, waiterToken);
    expect((await waiter.get("/backup/list")).status()).toBe(403);
  });

  test("installation assistant exposes 39 physical checks and admin export", async ({ request }) => {
    const admin = apiWithAuth(request, adminToken);
    const assistant = await admin.get("/admin/installation/assistant");
    expect(assistant.status()).toBe(200);
    const snapshot = await assistant.json();
    expect(snapshot.steps).toHaveLength(7);
    expect(snapshot.certification.cases).toHaveLength(39);
    expect((await admin.get("/admin/installation/certification/export?format=html")).status()).toBe(200);
  });

  test("waiter cannot access installation assistant", async ({ request }) => {
    const waiter = apiWithAuth(request, waiterToken);
    expect((await waiter.get("/admin/installation/assistant")).status()).toBe(403);
    expect((await waiter.get("/admin/installation/certification/export?format=json")).status()).toBe(403);
  });
});
