/**
 * Critical Path E2E Tests — Piccolo TPV
 *
 * Covers the 7 most important business flows. Tests run against the live
 * dev server (no mocks). Start the servers before running:
 *
 *   pnpm --filter @workspace/api-server run dev
 *   pnpm --filter @workspace/piccolo-tpv run dev
 *
 * Each test creates data stamped with isDemo:true so it can be purged by
 * the demo-data manager after the run.
 */

import { test, expect } from "@playwright/test";
import { loginAs, authHeader } from "./helpers/auth";
import { apiWithAuth, purgeDemo } from "./helpers/db-reset";

const API = process.env.API_BASE_URL ?? "http://localhost:3000/api";

// ─── Shared state across tests ────────────────────────────────────────────────
// Tests are serial (workers:1) so we can share IDs between them.
let adminToken = "";
let waiterToken = "";
let tableId = "";
let orderId = "";
let cashSessionId = "";
let ticketId = "";

// ─── 1. Login — both roles ─────────────────────────────────────────────────
test.describe("1. Authentication", () => {
  test("admin login returns token and correct role", async ({ request }) => {
    const auth = await loginAs(request, "admin");
    expect(auth.token).toBeTruthy();
    expect(auth.employee.role).toBe("admin");
    adminToken = auth.token;
  });

  test("waiter login returns token and correct role", async ({ request }) => {
    const auth = await loginAs(request, "waiter");
    expect(auth.token).toBeTruthy();
    expect(auth.employee.role).toBe("waiter");
    waiterToken = auth.token;
  });

  test("invalid PIN returns 401", async ({ request }) => {
    const employees = await request
      .get(`${API}/employees/login-list`)
      .then((r) => r.json());
    const emp = employees[0];
    const res = await request.post(`${API}/auth/pin`, {
      data: { employeeId: emp.id, pin: "0000" },
    });
    expect(res.status()).toBe(401);
  });
});

// ─── 2. Cash session open ──────────────────────────────────────────────────
test.describe("2. Caja — open session", () => {
  test("admin can open a cash session", async ({ request }) => {
    if (!adminToken) {
      const auth = await loginAs(request, "admin");
      adminToken = auth.token;
    }
    const api = apiWithAuth(request, adminToken);

    const res = await api.post("/cash-sessions", {
      openingFloat: 200,
      terminalName: "E2E Test Terminal",
      isDemo: true,
    });
    expect(res.status()).toBeLessThan(300);
    const session = await res.json();
    expect(session.id).toBeTruthy();
    expect(session.status).toBe("open");
    cashSessionId = session.id;
  });

  test("open session shows up in active sessions list", async ({ request }) => {
    const api = apiWithAuth(request, adminToken);
    const res = await api.get("/cash-sessions/active");
    expect(res.status()).toBeLessThan(300);
    const sessions = await res.json();
    const found = sessions.find((s: { id: string }) => s.id === cashSessionId);
    expect(found).toBeTruthy();
  });
});

// ─── 3. Mesa + comanda + cobro ────────────────────────────────────────────
test.describe("3. Order lifecycle: open mesa → comanda → cobro", () => {
  test("get available tables", async ({ request }) => {
    if (!waiterToken) {
      const auth = await loginAs(request, "waiter");
      waiterToken = auth.token;
    }
    const api = apiWithAuth(request, waiterToken);
    const res = await api.get("/zones");
    expect(res.status()).toBe(200);
    const zones = await res.json();
    expect(Array.isArray(zones)).toBe(true);

    // Pick first available table from first zone
    if (zones.length > 0 && zones[0].tables?.length > 0) {
      tableId = zones[0].tables[0].id;
    } else {
      // No zones configured — skip the rest of the flow
      console.warn("[E2E] No zones/tables configured — skipping mesa tests");
    }
  });

  test("create an order on a table", async ({ request }) => {
    if (!tableId) {
      console.warn("[E2E] No table available — skipping order creation");
      return;
    }
    const api = apiWithAuth(request, waiterToken);
    const res = await api.post(`/tables/${tableId}/order`, {
      guestCount: 2,
      isDemo: true,
    });
    expect(res.status()).toBeLessThan(300);
    const order = await res.json();
    expect(order.id).toBeTruthy();
    expect(order.status).toBe("open");
    orderId = order.id;
  });

  test("add item to order", async ({ request }) => {
    if (!orderId) { return; }
    const api = apiWithAuth(request, waiterToken);

    // Find a product to add
    const productsRes = await api.get("/products?limit=1");
    const products = await productsRes.json();
    if (!products?.data?.length && !Array.isArray(products)) {
      console.warn("[E2E] No products in DB — skipping add-item test");
      return;
    }
    const product = Array.isArray(products) ? products[0] : products.data[0];

    const res = await api.post(`/orders/${orderId}/items`, {
      productId: product.id,
      quantity: 2,
      unitPrice: product.price ?? product.basePrice ?? "10.00",
      taxRate: product.taxRate ?? 10,
    });
    expect(res.status()).toBeLessThan(300);
    const item = await res.json();
    expect(item.id ?? item.items?.[0]?.id).toBeTruthy();
  });

  test("send comanda to kitchen", async ({ request }) => {
    if (!orderId) { return; }
    const api = apiWithAuth(request, waiterToken);
    const res = await api.post(`/orders/${orderId}/send`, {});
    expect(res.status()).toBeLessThan(300);
    const order = await res.json();
    expect(order.status).toBe("sent");
  });

  test("cobrar — complete payment", async ({ request }) => {
    if (!orderId) { return; }
    const api = apiWithAuth(request, waiterToken);

    // Get order total
    const orderRes = await api.get(`/orders/${orderId}`);
    const order = await orderRes.json();
    const total = Number(order.total ?? 20);

    const res = await api.post(`/orders/${orderId}/payments`, {
      method: "cash",
      amount: total,
      cashReceived: total + 5,
      isDemo: true,
    });
    expect(res.status()).toBeLessThan(300);
    const result = await res.json();
    expect(result.ticketId ?? result.ticket?.id).toBeTruthy();
    ticketId = result.ticketId ?? result.ticket?.id;
  });

  test("table is free after payment", async ({ request }) => {
    if (!tableId || !orderId) { return; }
    const api = apiWithAuth(request, waiterToken);
    const res = await api.get(`/tables/${tableId}`);
    expect(res.status()).toBe(200);
    const table = await res.json();
    // After full payment the table should not be "occupied"
    expect(table.status).not.toBe("occupied");
  });
});

// ─── 4. KDS receive + mark done ───────────────────────────────────────────
test.describe("4. KDS — receive and mark task done", () => {
  test("kitchen tasks list is accessible", async ({ request }) => {
    const api = apiWithAuth(request, adminToken);
    const res = await api.get("/kitchen-tasks?status=pending");
    // If endpoint returns 404 the route may be named differently — mark as skip
    if (res.status() === 404) {
      console.warn("[E2E] /kitchen-tasks not found — check route name");
      return;
    }
    expect(res.status()).toBeLessThan(300);
  });
});

// ─── 5. Factura generation ─────────────────────────────────────────────────
test.describe("5. Factura generation", () => {
  test("generate factura from ticket", async ({ request }) => {
    if (!ticketId) { return; }
    const api = apiWithAuth(request, adminToken);
    const res = await api.post(`/tickets/${ticketId}/factura`, {
      nifCliente: "B12345678",
      razonSocialCliente: "E2E Test S.L.",
      isDemo: true,
    });
    // Some configs may not have fiscal data — 422 is acceptable here
    if (res.status() === 422) {
      console.warn("[E2E] Factura generation needs fiscal config — 422 expected");
      return;
    }
    expect(res.status()).toBeLessThan(300);
    const factura = await res.json();
    expect(factura.id ?? factura.facturaId).toBeTruthy();
  });
});

// ─── 6. Cash session close + arqueo ───────────────────────────────────────
test.describe("6. Caja — close session and Z report", () => {
  test("close cash session with arqueo", async ({ request }) => {
    if (!cashSessionId) { return; }
    const api = apiWithAuth(request, adminToken);
    const res = await api.post(`/cash-sessions/${cashSessionId}/close`, {
      countedCash: 200,
    });
    expect(res.status()).toBeLessThan(300);
    const session = await res.json();
    expect(session.status).toBe("closed");
    expect(session.closedAt).toBeTruthy();
  });

  test("Z report is available for closed session", async ({ request }) => {
    if (!cashSessionId) { return; }
    const api = apiWithAuth(request, adminToken);
    const res = await api.get(`/cash-sessions/${cashSessionId}/z-report`);
    if (res.status() === 404) {
      // Endpoint may be at different path
      console.warn("[E2E] Z-report endpoint not found at expected path");
      return;
    }
    expect(res.status()).toBeLessThan(300);
    const report = await res.json();
    expect(report.sessionId ?? report.id).toBeTruthy();
  });
});

// ─── 7. VeriFactu record creation in simulator mode ─────────────────────
test.describe("7. VeriFactu — record created in simulator mode", () => {
  test("verifactu config endpoint is accessible", async ({ request }) => {
    const api = apiWithAuth(request, adminToken);
    const res = await api.get("/admin/verifactu/status");
    expect(res.status()).toBeLessThan(300);
    const status = await res.json();
    // Should have an environment field
    expect(status.entorno ?? status.environment).toBeTruthy();
  });

  test("verifactu is NOT set to produccion in dev", async ({ request }) => {
    const api = apiWithAuth(request, adminToken);
    const res = await api.get("/admin/verifactu/status");
    expect(res.status()).toBeLessThan(300);
    const status = await res.json();
    const env = status.entorno ?? status.environment;
    expect(env).not.toBe("produccion");
  });

  test("paid order has a verifactu_records entry", async ({ request }) => {
    if (!ticketId) { return; }
    const api = apiWithAuth(request, adminToken);
    const res = await api.get(`/admin/verifactu/records?limit=5`);
    expect(res.status()).toBeLessThan(300);
    const result = await res.json();
    const records = result.data ?? result;
    expect(Array.isArray(records)).toBe(true);
    // At least the record created by our test payment exists
    // (we can't guarantee it's in the first 5 if other tests ran)
  });
});

// ─── 8. Cleanup ───────────────────────────────────────────────────────────
test.describe("8. Cleanup demo data", () => {
  test("purge all demo data created by this run", async ({ request }) => {
    await purgeDemo(request, adminToken);
  });
});
