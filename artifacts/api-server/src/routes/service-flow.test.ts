/**
 * service-flow.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Validación integral del flujo de servicio del restaurante — pasos 1-17
 *
 * Pasos cubiertos:
 *  1  Apertura de caja
 *  2  Inicio de sesión de camarero (auth PIN)
 *  3  Apertura de mesa
 *  4  Añadir productos con modificadores y observaciones
 *  5  Enviar comanda al KDS
 *  6  Transiciones de estado en KDS (new → preparing → ready)
 *  7  Generar prefactura (+ idempotencia de reimpresión)
 *  8  Cobro en efectivo
 *  9  Cobro con tarjeta
 * 10  Cobro mixto (split bill)
 * 11  Idempotencia de pago en pedido ya cobrado
 * 12  Estado post-pago: ticket recuperable, mesa liberada
 * 13  Cierre de caja (descuadre con/sin motivo)
 *
 * Corte transversal en cada paso:
 *  - Estado en base de datos (DB mock assertions)
 *  - Idempotencia (doble envío)
 *  - Permisos (rol insuficiente → 403)
 *  - Auditoría (writeAudit / logDocumentAction invocados)
 *  - Manejo de errores (400, 404, 409, 422)
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import request from "supertest";

// ─── Drizzle chain mock helper ────────────────────────────────────────────────
function makeChain(value: unknown) {
  const chain: Record<string, unknown> & {
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => Promise<unknown>;
  } = {
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  for (const m of [
    "select", "from", "where", "orderBy", "leftJoin", "innerJoin",
    "insert", "update", "delete", "set", "values", "returning",
    "limit", "offset", "groupBy", "having", "execute",
    "onConflictDoUpdate", "onConflictDoNothing", "selectDistinct",
  ]) {
    chain[m] = () => chain;
  }
  return chain;
}

// ─── Hoisted mock references ──────────────────────────────────────────────────
const mockDb = vi.hoisted(() => ({
  select:         vi.fn(),
  insert:         vi.fn(),
  update:         vi.fn(),
  delete:         vi.fn(),
  transaction:    vi.fn(),
  execute:        vi.fn(),
  selectDistinct: vi.fn(),
}));

const mockSocketEmit = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});

vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn(() => ({ id: "admin-uuid", role: "admin", name: "Test Admin" })),
    sign:   vi.fn(() => "mock-jwt-token"),
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash:    vi.fn(),
  },
}));

// express-rate-limit: no-op passthrough so PIN login tests aren't blocked
vi.mock("express-rate-limit", () => ({
  default: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock("drizzle-orm", async (importOriginal) => importOriginal());

vi.mock("../lib/socket", () => ({
  getIO:      vi.fn(() => ({ emit: mockSocketEmit, to: vi.fn(() => ({ emit: vi.fn() })) })),
  initSocket: vi.fn(),
}));

vi.mock("../lib/document-audit", () => ({
  logDocumentAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/print-dispatch", () => ({
  dispatchKitchenPrint: vi.fn().mockResolvedValue(undefined),
}));

// crm.js: preserve the actual module (default export is the Express router used by
// routes/index.ts). issuePoints is called in payments.ts inside a try-catch only
// when order.clientId is set — in all test fixtures clientId=null so it is never
// invoked. Mocking the whole module would replace the router with {} and crash
// routes/index.ts on startup.
vi.mock("./crm.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./crm")>();
  return { ...actual, issuePoints: vi.fn().mockResolvedValue({ pointsIssued: 0 }) };
});

// ─── App import (after mocks) ─────────────────────────────────────────────────
const { default: app } = await import("../app");

// ─── Import mocked modules to re-configure per-test ──────────────────────────
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { logDocumentAction } from "../lib/document-audit";

// ─── Fixtures ────────────────────────────────────────────────────────────────
const EMP_ID       = "emp-00000000-0000-0000-0000-000000000001";
const SESSION_ID   = "cs-000000000-0000-0000-0000-000000000002";
const TABLE_ID     = "tbl-00000000-0000-0000-0000-000000000003";
const ORDER_ID     = "ord-00000000-0000-0000-0000-000000000004";
const ITEM_ID      = "itm-00000000-0000-0000-0000-000000000005";
const TASK_ID      = "kds-00000000-0000-0000-0000-000000000006";
const PRODUCT_ID   = "prd-00000000-0000-0000-0000-000000000007";
const PM_CASH_ID   = "pm-cash-uuid";
const PM_CARD_ID   = "pm-card-uuid";
const TICKET_ID    = "tick-0000000-0000-0000-0000-000000000009";
const AUTH_HDR     = "Bearer test-token";
const MANAGER_HDR  = "Bearer manager-token";

// ── DB fixtures
const F = {
  employee:  { id: EMP_ID, name: "Carmen", role: "waiter", pinHash: "$2a$06$hash" },
  session:   { id: SESSION_ID, status: "open", openingFloat: "200", terminalName: "Caja 1", employeeId: EMP_ID },
  table:     { id: TABLE_ID, name: "Mesa 1", status: "free", zoneId: "zone-1",
               capacity: 4, x: 100, y: 100, width: 80, height: 80, shape: "square",
               rotation: 0, layout: "normal", active: true, mergeGroup: null },
  order:     { id: ORDER_ID, tableId: TABLE_ID, status: "open", employeeId: EMP_ID,
               guestCount: 2, notes: "", clientName: "", clientId: null,
               createdAt: new Date(), updatedAt: new Date(), sentAt: null,
               total: "0.00", subtotal: "0.00", taxTotal: "0.00",
               isDemo: false, orderNumber: 1, orderType: "tpv", deliveryType: "table" },
  product:   { id: PRODUCT_ID, name: "Cocido madrileño", price: "15.50", taxRate: 10,
               categoryId: "cat-1", active: true, sortOrder: 0, prepZone: "cocina" },
  orderItem: { id: ITEM_ID, orderId: ORDER_ID, productId: PRODUCT_ID,
               productName: "Cocido madrileño", quantity: 2, unitPrice: "15.50",
               taxRate: 10, status: "draft", notes: "sin sal", allergyNote: "",
               hasAllergy: false, isInvitation: false, formatId: null, formatName: null,
               createdAt: new Date() },
  kdsTask:   { id: TASK_ID, orderId: ORDER_ID, orderItemId: ITEM_ID,
               prepZone: "cocina", productName: "Cocido madrileño", quantity: 2,
               status: "new", notes: "sin sal", allergyNote: "", hasAllergy: false,
               createdAt: new Date(), updatedAt: new Date(),
               readyAt: null, collectedAt: null, servedAt: null, cancelledAt: null },
  pmCash:    { id: PM_CASH_ID, code: "cash",   name: "Efectivo", active: true, sortOrder: 1 },
  pmCard:    { id: PM_CARD_ID, code: "tarjeta", name: "Tarjeta",  active: true, sortOrder: 2 },
  payment:   { id: "pay-uuid", orderId: ORDER_ID, paymentMethodId: PM_CASH_ID,
               amount: "31.00", status: "completed", cashSessionId: SESSION_ID,
               createdAt: new Date() },
  ticket:    { id: TICKET_ID, orderId: ORDER_ID, ticketNumber: "0001",
               serie: "T", total: "34.41", subtotal: "31.00", taxTotal: "3.41",
               verifactuStatus: "pending", isDemo: false, voidedAt: null,
               cashSessionId: SESSION_ID, employeeId: EMP_ID,
               nifEmisor: "B12345678", razonSocialEmisor: "Piccolo SL",
               direccionEmisor: "Calle Mayor 1", formaPago: "Efectivo",
               issuedAt: new Date(), taxBreakdown: [] },
  bizConfig: { id: "biz-1", nif: "B12345678", razonSocial: "Piccolo SL",
               direccionFiscal: "Calle Mayor 1" },
};

// Draft item in the JOIN shape that Drizzle returns for SELECT...innerJoin
const F_DRAFT_JOIN = { order_items: F.orderItem, products: F.product };

// ─── beforeEach: reset all mocks + restore constant behaviors ─────────────────
beforeEach(() => {
  vi.resetAllMocks();
  process.env["SESSION_SECRET"] = "test-secret";

  // Always-on transaction passthrough
  mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockDb) => Promise<unknown>) => cb(mockDb));

  // JWT: restore constant verify/sign
  vi.mocked(jwt.verify).mockReturnValue({ id: "admin-uuid", role: "admin", name: "Test Admin" } as ReturnType<typeof jwt.verify>);
  vi.mocked(jwt.sign).mockReturnValue("mock-jwt-token" as ReturnType<typeof jwt.sign>);

  // bcrypt: default to valid PIN (tests that need invalid PIN override this)
  vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

  // document-audit: silent success
  vi.mocked(logDocumentAction).mockResolvedValue(undefined);

  // Socket
  mockSocketEmit.mockReturnValue(undefined);

  // Default catch-all DB returns (prevent "cannot read .from of undefined")
  mockDb.select.mockReturnValue(makeChain([]));
  mockDb.insert.mockReturnValue(makeChain([]));
  mockDb.update.mockReturnValue(makeChain([]));
  mockDb.delete.mockReturnValue(makeChain([]));
  mockDb.execute.mockResolvedValue({ rows: [] });
  mockDb.selectDistinct.mockReturnValue(makeChain([]));
});

afterAll(() => {
  delete process.env["SESSION_SECRET"];
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 1 — Apertura de caja
// ═══════════════════════════════════════════════════════════════════════════════
describe("Paso 1 — Apertura de caja (POST /api/cash-sessions/open)", () => {
  it("401 sin autenticación", async () => {
    const res = await request(app).post("/api/cash-sessions/open").send({ openingFloat: "200" });
    expect(res.status).toBe(401);
  });

  it("403 para rol camarero — la caja requiere manager o admin", async () => {
    vi.mocked(jwt.verify).mockReturnValue({ id: EMP_ID, role: "waiter", name: "Carmen" } as ReturnType<typeof jwt.verify>);
    const res = await request(app)
      .post("/api/cash-sessions/open")
      .set("Authorization", AUTH_HDR)
      .send({ openingFloat: "200", terminalName: "Caja 1" });
    expect(res.status).toBe(403);
  });

  it("409 cuando ya hay una sesión abierta en el mismo terminal", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([F.session])); // existing open session found
    const res = await request(app)
      .post("/api/cash-sessions/open")
      .set("Authorization", AUTH_HDR)
      .send({ openingFloat: "200", terminalName: "Caja 1" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/sesión abierta/i);
  });

  it("201 apertura exitosa — devuelve la sesión y registra auditoría", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([]));           // no existing session
    mockDb.insert.mockReturnValueOnce(makeChain([F.session]));  // new session

    const res = await request(app)
      .post("/api/cash-sessions/open")
      .set("Authorization", AUTH_HDR)
      .send({ openingFloat: "200", terminalName: "Caja 1" });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.status).toBe("open");
    // Auditoría registrada
    expect(logDocumentAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "open_cash_session" }),
    );
  });

  it("Idempotencia — doble apertura en el mismo terminal retorna 409, no duplica", async () => {
    // Primera apertura
    mockDb.select
      .mockReturnValueOnce(makeChain([]))           // no session for first open
      .mockReturnValueOnce(makeChain([F.session])); // session exists for second open
    mockDb.insert.mockReturnValueOnce(makeChain([F.session]));

    await request(app)
      .post("/api/cash-sessions/open")
      .set("Authorization", AUTH_HDR)
      .send({ openingFloat: "200", terminalName: "Caja 1" });

    const res2 = await request(app)
      .post("/api/cash-sessions/open")
      .set("Authorization", AUTH_HDR)
      .send({ openingFloat: "200", terminalName: "Caja 1" });

    expect(res2.status).toBe(409);
    // La tabla solo recibe un INSERT (no dos)
    const insertCalls = mockDb.insert.mock.calls.length;
    expect(insertCalls).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 2 — Login de camarero (auth PIN)
// ═══════════════════════════════════════════════════════════════════════════════
describe("Paso 2 — Login de camarero (POST /api/auth/pin)", () => {
  it("400 cuando faltan campos obligatorios", async () => {
    const res = await request(app).post("/api/auth/pin").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/obligatorios/i);
  });

  it("401 cuando el PIN es incorrecto", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([F.employee]));
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const res = await request(app)
      .post("/api/auth/pin")
      .send({ employeeId: EMP_ID, pin: "0000" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/PIN incorrecto/i);
  });

  it("401 cuando el empleado no existe", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([])); // no employee
    const res = await request(app)
      .post("/api/auth/pin")
      .send({ employeeId: "no-existe", pin: "1234" });
    expect(res.status).toBe(401);
  });

  it("200 login válido — devuelve token y datos del empleado", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([F.employee]));
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const res = await request(app)
      .post("/api/auth/pin")
      .send({ employeeId: EMP_ID, pin: "1234" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("employee");
    expect(res.body.employee).toHaveProperty("id", EMP_ID);
    // El role NO se expone a través de login-list (solo en auth/pin)
    expect(res.body.employee).toHaveProperty("role");
  });

  it("500 cuando SESSION_SECRET no está configurado", async () => {
    delete process.env["SESSION_SECRET"];
    mockDb.select.mockReturnValueOnce(makeChain([F.employee]));
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const res = await request(app)
      .post("/api/auth/pin")
      .send({ employeeId: EMP_ID, pin: "1234" });

    expect(res.status).toBe(500);
    process.env["SESSION_SECRET"] = "test-secret"; // restore
  });

  it("GET /api/employees/login-list — no expone el rol", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([{ id: EMP_ID, name: "Carmen" }]));
    const res = await request(app).get("/api/employees/login-list");
    expect(res.status).toBe(200);
    expect(res.body[0]).not.toHaveProperty("role");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 3 — Apertura de mesa
// ═══════════════════════════════════════════════════════════════════════════════
describe("Paso 3 — Apertura de mesa (POST /api/tables/:tableId/open)", () => {
  it("401 sin autenticación", async () => {
    const res = await request(app).post(`/api/tables/${TABLE_ID}/open`).send({ guestCount: 2 });
    expect(res.status).toBe(401);
  });

  it("409 cuando la mesa ya está ocupada", async () => {
    // Transaction: tx.update().returning() returns [] (no rows updated because
    // the WHERE clause `status IN ('free','reserved','pendiente_limpieza')` fails
    // for an already-occupied table). const [table] = [] → table = undefined → falsy
    // → handler returns null from the tx callback → res.status(409).
    mockDb.update.mockReturnValueOnce(makeChain([]));
    const res = await request(app)
      .post(`/api/tables/${TABLE_ID}/open`)
      .set("Authorization", AUTH_HDR)
      .send({ guestCount: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/disponible/i);
  });

  it("200 apertura exitosa — mesa pasa a occupied, se crea pedido", async () => {
    mockDb.update.mockReturnValueOnce(makeChain([F.table]));   // table updated to occupied
    mockDb.insert.mockReturnValueOnce(makeChain([F.order]));   // order created

    const res = await request(app)
      .post(`/api/tables/${TABLE_ID}/open`)
      .set("Authorization", AUTH_HDR)
      .send({ guestCount: 2, clientName: "Familia Pérez" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("table");
    expect(res.body).toHaveProperty("order");
    expect(res.body.order).toHaveProperty("id");
    expect(res.body.order.status).toBe("open");
  });

  it("Idempotencia — doble apertura de mesa ocupada retorna 409, no crea dos pedidos", async () => {
    // First open: succeeds
    mockDb.update
      .mockReturnValueOnce(makeChain([F.table]))  // first open succeeds
      .mockReturnValueOnce(makeChain([]));          // second open: table occupied → [] returned → table=undefined → handler returns null → 409
    mockDb.insert.mockReturnValueOnce(makeChain([F.order]));

    const res1 = await request(app)
      .post(`/api/tables/${TABLE_ID}/open`)
      .set("Authorization", AUTH_HDR)
      .send({ guestCount: 2 });
    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .post(`/api/tables/${TABLE_ID}/open`)
      .set("Authorization", AUTH_HDR)
      .send({ guestCount: 2 });
    expect(res2.status).toBe(409);

    // La primera apertura exitosa produce 2 inserts:
    //   1. tx.insert(ordersTable) — orden
    //   2. db.insert(tableEventsTable) — fire-and-forget addTableEvent
    // La segunda apertura (409) no debe añadir ninguno más.
    const totalInserts = mockDb.insert.mock.calls.length;
    expect(totalInserts).toBe(2); // ← 1 orden + 1 tabla-event, NO 3 (que sería 2 órdenes + 1 event)
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 4 — Añadir productos con modificadores y observaciones
// ═══════════════════════════════════════════════════════════════════════════════
describe("Paso 4 — Añadir productos (POST /api/orders/:orderId/items)", () => {
  it("401 sin autenticación", async () => {
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/items`)
      .send({ productId: PRODUCT_ID, quantity: 2 });
    expect(res.status).toBe(401);
  });

  it("400 sin productId", async () => {
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/items`)
      .set("Authorization", AUTH_HDR)
      .send({ quantity: 2 });
    expect(res.status).toBe(400);
  });

  it("404 cuando el pedido no existe", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([])); // order not found
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/items`)
      .set("Authorization", AUTH_HDR)
      .send({ productId: PRODUCT_ID, quantity: 1 });
    expect(res.status).toBe(404);
  });

  it("409 cuando el pedido está cobrado", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([{ status: "paid" }]));
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/items`)
      .set("Authorization", AUTH_HDR)
      .send({ productId: PRODUCT_ID, quantity: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/abierto/i);
  });

  it("404 cuando el producto no existe", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([{ status: "open" }])) // order ok
      .mockReturnValueOnce(makeChain([]));                   // product not found
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/items`)
      .set("Authorization", AUTH_HDR)
      .send({ productId: "no-existe", quantity: 1 });
    expect(res.status).toBe(404);
  });

  it("201 añade producto sin modificadores — estado draft", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([{ status: "open" }]))  // order check
      .mockReturnValueOnce(makeChain([F.product]))            // product
      .mockReturnValue(makeChain([]));                        // prefactura check + fallback
    mockDb.insert.mockReturnValue(makeChain([F.orderItem]));

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/items`)
      .set("Authorization", AUTH_HDR)
      .send({ productId: PRODUCT_ID, quantity: 2, notes: "sin sal" });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.status).toBe("draft");
    expect(res.body.productName).toBe("Cocido madrileño");
  });

  it("201 añade producto con modificadores — precio ajustado", async () => {
    const modifier = { modifierId: null, modifierName: "Sin gluten", priceDelta: "1.00" };
    const itemWithMod = { ...F.orderItem, unitPrice: "16.50" };
    const storedMod = { id: "mod-1", orderItemId: ITEM_ID, modifierName: "Sin gluten", priceDelta: "1.00" };

    mockDb.select
      .mockReturnValueOnce(makeChain([{ status: "open" }])) // order
      .mockReturnValueOnce(makeChain([F.product]))           // product
      .mockReturnValueOnce(makeChain([storedMod]))           // modifiers select (after insert)
      .mockReturnValue(makeChain([]));                       // prefactura + fallback
    mockDb.insert
      .mockReturnValueOnce(makeChain([itemWithMod]))         // order item
      .mockReturnValue(makeChain([]));                       // modifier insert + audit

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/items`)
      .set("Authorization", AUTH_HDR)
      .send({ productId: PRODUCT_ID, quantity: 1, modifiers: [modifier] });

    expect(res.status).toBe(201);
    expect(res.body.modifiers).toHaveLength(1);
    expect(res.body.modifiers[0].modifierName).toBe("Sin gluten");
  });

  it("Auditoría — add_item se registra en audit_log", async () => {
    const auditInsertSpy = vi.fn().mockReturnValue(makeChain([]));
    mockDb.select
      .mockReturnValueOnce(makeChain([{ status: "open" }]))
      .mockReturnValueOnce(makeChain([F.product]))
      .mockReturnValue(makeChain([]));
    mockDb.insert
      .mockReturnValueOnce(makeChain([F.orderItem]))  // item insert
      .mockImplementation((..._args: unknown[]) => {  // audit insert (among others)
        auditInsertSpy();
        return makeChain([]);
      });

    await request(app)
      .post(`/api/orders/${ORDER_ID}/items`)
      .set("Authorization", AUTH_HDR)
      .send({ productId: PRODUCT_ID, quantity: 1 });

    // writeAudit calls db.insert at least once after the item insert
    expect(auditInsertSpy).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 5 — Enviar comanda al KDS
// ═══════════════════════════════════════════════════════════════════════════════
describe("Paso 5 — Enviar comanda al KDS (POST /api/orders/:orderId/send)", () => {
  it("401 sin autenticación", async () => {
    const res = await request(app).post(`/api/orders/${ORDER_ID}/send`);
    expect(res.status).toBe(401);
  });

  it("404 cuando el pedido no existe", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([]));
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/send`)
      .set("Authorization", AUTH_HDR);
    expect(res.status).toBe(404);
  });

  it("400 cuando no hay líneas en borrador", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([{ status: "open" }]))          // order status
      .mockReturnValueOnce(makeChain([{ printMode: "kds_only" }]))   // businessConfig
      .mockReturnValueOnce(makeChain([{ sentAt: null }]))            // preUpdateOrder
      .mockReturnValue(makeChain([]));                                // draft items = []
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/send`)
      .set("Authorization", AUTH_HDR);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/borrador/i);
  });

  it("409 cuando la cuenta ya ha sido solicitada", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([{ status: "bill_requested" }]));
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/send`)
      .set("Authorization", AUTH_HDR);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cuenta/i);
  });

  it("200 envío exitoso — crea tareas KDS, emite kds:refresh, descuenta stock", async () => {
    const sentOrder = { ...F.order, status: "sent", sentAt: new Date() };

    mockDb.select
      .mockReturnValueOnce(makeChain([{ status: "open" }]))          // 1. order status
      .mockReturnValueOnce(makeChain([{ printMode: "kds_only" }]))   // 2. businessConfig
      .mockReturnValueOnce(makeChain([{ sentAt: null }]))            // 3. preUpdateOrder
      .mockReturnValueOnce(makeChain([F_DRAFT_JOIN]))                 // 4. draft items (join)
      .mockReturnValueOnce(makeChain([]))                             // 5. modifiers
      .mockReturnValueOnce(makeChain([]))                             // 6. recipe items (stock) → empty
      .mockReturnValue(makeChain([sentOrder]));                       // 7. updated order + fallback

    mockDb.insert.mockReturnValue(makeChain([F.kdsTask]));
    mockDb.update.mockReturnValue(makeChain([]));

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/send`)
      .set("Authorization", AUTH_HDR);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("sent");

    // Verificar que se emitió kds:refresh
    expect(mockSocketEmit).toHaveBeenCalledWith("kds:refresh", expect.any(Object));
    // Y que se creó la tarea KDS (insert)
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("Sincronización — kds:refresh emitido al socket al enviar", async () => {
    const sentOrder = { ...F.order, status: "sent", sentAt: new Date() };
    mockDb.select
      .mockReturnValueOnce(makeChain([{ status: "open" }]))
      .mockReturnValueOnce(makeChain([{ printMode: "kds_only" }]))
      .mockReturnValueOnce(makeChain([{ sentAt: null }]))
      .mockReturnValueOnce(makeChain([F_DRAFT_JOIN]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValue(makeChain([sentOrder]));
    mockDb.insert.mockReturnValue(makeChain([F.kdsTask]));
    mockDb.update.mockReturnValue(makeChain([]));

    await request(app)
      .post(`/api/orders/${ORDER_ID}/send`)
      .set("Authorization", AUTH_HDR);

    const emitCalls = mockSocketEmit.mock.calls.map(c => c[0]);
    expect(emitCalls).toContain("kds:refresh");
    expect(emitCalls).toContain("orders:refresh");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 6 — Transiciones de estado en KDS
// ═══════════════════════════════════════════════════════════════════════════════
describe("Paso 6 — Transiciones KDS (PATCH /api/kitchen-tasks/:taskId/status)", () => {
  const TASK_NEW      = { ...F.kdsTask, status: "new",      prepZone: "cocina" };
  const TASK_PREP     = { ...F.kdsTask, status: "preparing", prepZone: "cocina" };
  const TASK_READY    = { ...F.kdsTask, status: "ready",     prepZone: "cocina", readyAt: new Date() };

  it("401 sin autenticación", async () => {
    const res = await request(app)
      .patch(`/api/kitchen-tasks/${TASK_ID}/status`)
      .send({ status: "preparing" });
    expect(res.status).toBe(401);
  });

  it("400 estado inválido", async () => {
    const res = await request(app)
      .patch(`/api/kitchen-tasks/${TASK_ID}/status`)
      .set("Authorization", AUTH_HDR)
      .send({ status: "inventado" });
    expect(res.status).toBe(400);
  });

  it("404 tarea no encontrada", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([]));
    const res = await request(app)
      .patch(`/api/kitchen-tasks/${TASK_ID}/status`)
      .set("Authorization", AUTH_HDR)
      .send({ status: "preparing" });
    expect(res.status).toBe(404);
  });

  it("422 transición inválida (ready → preparing en cocina no permitida)", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([TASK_READY]));
    const res = await request(app)
      .patch(`/api/kitchen-tasks/${TASK_ID}/status`)
      .set("Authorization", AUTH_HDR)
      .send({ status: "preparing" });
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty("from", "ready");
    expect(res.body.allowed).not.toContain("preparing");
  });

  it("200 new → preparing — kds:refresh emitido", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([TASK_NEW]));
    mockDb.update.mockReturnValueOnce(makeChain([TASK_PREP]));

    const res = await request(app)
      .patch(`/api/kitchen-tasks/${TASK_ID}/status`)
      .set("Authorization", AUTH_HDR)
      .send({ status: "preparing" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("preparing");
    expect(mockSocketEmit).toHaveBeenCalledWith("kds:refresh");
  });

  it("200 preparing → ready — notificación a camarero cuando todas listas", async () => {
    const orderWithTable = { ...F.order, tableId: TABLE_ID, employeeId: EMP_ID };

    mockDb.select
      .mockReturnValueOnce(makeChain([TASK_PREP]))               // existing task
      .mockReturnValueOnce(makeChain([TASK_READY]))              // all tasks for order
      .mockReturnValueOnce(makeChain([orderWithTable]))          // order (for notification)
      .mockReturnValueOnce(makeChain([{ name: "Mesa 1" }]));    // table name
    mockDb.update
      .mockReturnValueOnce(makeChain([TASK_READY]))              // task updated
      .mockReturnValueOnce(makeChain([]));                       // order status → ready
    mockDb.insert.mockReturnValue(makeChain([]));                 // waiter notification

    const res = await request(app)
      .patch(`/api/kitchen-tasks/${TASK_ID}/status`)
      .set("Authorization", AUTH_HDR)
      .send({ status: "ready" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    // Se emite la notificación al camarero
    const emitted = mockSocketEmit.mock.calls.map(c => c[0]);
    expect(emitted).toContain("waiter:order-ready");
  });

  it("422 transición new → collected inválida en pizza", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([{ ...TASK_NEW, prepZone: "pizza" }]));
    const res = await request(app)
      .patch(`/api/kitchen-tasks/${TASK_ID}/status`)
      .set("Authorization", AUTH_HDR)
      .send({ status: "collected" });
    expect(res.status).toBe(422);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 7 — Generar prefactura
// ═══════════════════════════════════════════════════════════════════════════════
describe("Paso 7 — Prefactura (POST /api/orders/:orderId/prefactura/print)", () => {
  it("401 sin autenticación", async () => {
    const res = await request(app).post(`/api/orders/${ORDER_ID}/prefactura/print`);
    expect(res.status).toBe(401);
  });

  it("404 cuando el pedido no existe", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([]));
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/prefactura/print`)
      .set("Authorization", AUTH_HDR);
    expect(res.status).toBe(404);
  });

  it("409 cuando el pedido ya está cobrado", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([{ status: "paid" }]));
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/prefactura/print`)
      .set("Authorization", AUTH_HDR);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cobrada/i);
  });

  it("201 primera impresión — asigna número de secuencia nuevo", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([{ status: "sent" }]))    // order status
      .mockReturnValueOnce(makeChain([F.orderItem]));           // items for amount calc
    // Transaction: FOR UPDATE, existing prints = [], nextval, insert print
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: ORDER_ID }] })     // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [{ num: 42 }] });          // nextval
    mockDb.select
      .mockReturnValueOnce(makeChain([]));                      // existing prints = none
    mockDb.insert.mockReturnValue(makeChain([]));               // prefactura print insert + audit

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/prefactura/print`)
      .set("Authorization", AUTH_HDR);

    expect(res.status).toBe(201);
    expect(res.body.prefacturaNumber).toBe(42);
    expect(res.body.prefacturaCode).toBe("P-0042");
    expect(res.body.isReprint).toBe(false);
  });

  it("201 reimpresión — reutiliza el mismo número (idempotencia)", async () => {
    const existingPrint = { prefacturaNumber: 42, printedAt: new Date() };
    mockDb.select
      .mockReturnValueOnce(makeChain([{ status: "sent" }]))   // order status
      .mockReturnValueOnce(makeChain([F.orderItem]));          // items
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: ORDER_ID }] });   // SELECT FOR UPDATE
    mockDb.select
      .mockReturnValueOnce(makeChain([existingPrint]));        // existing prints = 1
    mockDb.insert.mockReturnValue(makeChain([]));

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/prefactura/print`)
      .set("Authorization", AUTH_HDR);

    expect(res.status).toBe(201);
    expect(res.body.prefacturaNumber).toBe(42);
    expect(res.body.isReprint).toBe(true);
    // nextval NO debe haberse llamado (reutilizó el número existente)
    const executeCalls = mockDb.execute.mock.calls;
    const nextvalCalled = executeCalls.some(c => String(c[0]).includes("nextval"));
    expect(nextvalCalled).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 8 — Cobro en efectivo
// ═══════════════════════════════════════════════════════════════════════════════
describe("Paso 8 — Cobro en efectivo (POST /api/orders/:id/payments)", () => {
  function setupCashPaymentMocks(opts: {
    orderStatus?: string;
    alreadyPaid?: string;
    openSession?: boolean;
    settles?: boolean;
  } = {}) {
    const { orderStatus = "sent", alreadyPaid = "0", openSession = true, settles = true } = opts;
    const order = { ...F.order, status: orderStatus };

    mockDb.select
      .mockReturnValueOnce(makeChain([order]))                 // order
      .mockReturnValueOnce(makeChain([F.pmCash]))              // payment method
      .mockReturnValueOnce(makeChain([F.orderItem]))           // items for total
      .mockReturnValueOnce(makeChain([{ total: "0" }]))       // discounts
      .mockReturnValueOnce(makeChain([{ paid: alreadyPaid }]))// already paid
      .mockReturnValueOnce(makeChain(                          // open session
        openSession ? [F.session] : [],
      ))
      .mockReturnValueOnce(makeChain([F.bizConfig]))           // businessConfig (in tx)
      .mockReturnValueOnce(makeChain([{ name: "Efectivo" }])) // pmRow (in tx)
      .mockReturnValue(makeChain([]));

    mockDb.insert
      .mockReturnValueOnce(makeChain([F.payment]))             // payment
      .mockReturnValueOnce(settles ? makeChain([F.ticket]) : makeChain([])) // ticket
      .mockReturnValue(makeChain([]));
    mockDb.update.mockReturnValue(makeChain([]));
  }

  it("401 sin autenticación", async () => {
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .send({ methodCode: "cash", amount: "31.00" });
    expect(res.status).toBe(401);
  });

  it("400 importe inválido (negativo)", async () => {
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH_HDR)
      .send({ methodCode: "cash", amount: "-5" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/importe/i);
  });

  it("404 cuando el pedido no existe", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([]));
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH_HDR)
      .send({ methodCode: "cash", amount: "31.00" });
    expect(res.status).toBe(404);
  });

  it("400 método de pago no válido o inactivo", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([F.order]))    // order
      .mockReturnValueOnce(makeChain([]));           // method not found
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH_HDR)
      .send({ methodCode: "bitcoins", amount: "31.00" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/método de pago/i);
  });

  it("409 sin caja abierta para cobro en efectivo", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([F.order]))              // order
      .mockReturnValueOnce(makeChain([F.pmCash]))             // method
      .mockReturnValueOnce(makeChain([F.orderItem]))          // items
      .mockReturnValueOnce(makeChain([{ total: "0" }]))      // discounts
      .mockReturnValueOnce(makeChain([{ paid: "0" }]))       // already paid
      .mockReturnValue(makeChain([]));                         // no open session

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH_HDR)
      .send({ methodCode: "cash", amount: "31.00", terminal: "Caja 1" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/caja abierta/i);
  });

  it("201 cobro total en efectivo — emite ticket y libera la mesa", async () => {
    setupCashPaymentMocks({ settles: true });

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH_HDR)
      .send({ methodCode: "cash", amount: "34.50", terminal: "Caja 1" });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("payment");
    expect(res.body).toHaveProperty("ticket");
    expect(res.body.ticket).not.toBeNull();
    // La mesa se libera (tables:refresh emitido)
    expect(mockSocketEmit).toHaveBeenCalledWith("tables:refresh");
    // logDocumentAction llamado para issue_ticket
    expect(logDocumentAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "issue_ticket" }),
    );
  });

  it("Cambio — efectivo > total → se devuelve cambio", async () => {
    setupCashPaymentMocks({ settles: true });

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH_HDR)
      .send({ methodCode: "cash", amount: "50.00", terminal: "Caja 1" });

    expect(res.status).toBe(201);
    // change debe ser > 0
    expect(parseFloat(res.body.change)).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 9 — Cobro con tarjeta
// ═══════════════════════════════════════════════════════════════════════════════
describe("Paso 9 — Cobro con tarjeta (POST /api/orders/:id/payments)", () => {
  it("201 tarjeta no requiere sesión de caja abierta", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([F.order]))              // order
      .mockReturnValueOnce(makeChain([F.pmCard]))             // card method
      .mockReturnValueOnce(makeChain([F.orderItem]))          // items
      .mockReturnValueOnce(makeChain([{ total: "0" }]))      // discounts
      .mockReturnValueOnce(makeChain([{ paid: "0" }]))       // already paid
      .mockReturnValueOnce(makeChain([F.session]))            // open session (found but optional)
      .mockReturnValueOnce(makeChain([F.bizConfig]))          // biz config
      .mockReturnValueOnce(makeChain([{ name: "Tarjeta" }])) // pmRow
      .mockReturnValue(makeChain([]));
    mockDb.insert
      .mockReturnValueOnce(makeChain([{ ...F.payment, paymentMethodId: PM_CARD_ID }]))
      .mockReturnValueOnce(makeChain([F.ticket]))
      .mockReturnValue(makeChain([]));
    mockDb.update.mockReturnValue(makeChain([]));

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH_HDR)
      // F.orderItem: unitPrice=15.50 × qty=2 = 31.00 total (IVA incluido).
      // Card payments cannot exceed the outstanding balance.
      .send({ methodCode: "tarjeta", amount: "31.00", terminal: "Caja 1" });

    expect(res.status).toBe(201);
    expect(res.body.ticket).not.toBeNull();
  });

  it("400 tarjeta no puede superar el pendiente", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([F.order]))
      .mockReturnValueOnce(makeChain([F.pmCard]))
      .mockReturnValueOnce(makeChain([F.orderItem]))          // items total = 31.00 (IVA incluido)
      .mockReturnValueOnce(makeChain([{ total: "0" }]))
      .mockReturnValueOnce(makeChain([{ paid: "0" }]))
      .mockReturnValue(makeChain([]));

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH_HDR)
      .send({ methodCode: "tarjeta", amount: "999.00" });    // far exceeds remaining

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/excede el pendiente/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 10 — Cobro mixto (split bill)
// ═══════════════════════════════════════════════════════════════════════════════
describe("Paso 10 — Cobro mixto / split bill", () => {
  it("Pago parcial NO cierra el pedido ni genera ticket", async () => {
    const partialPayment = { ...F.payment, amount: "15.00" };

    mockDb.select
      .mockReturnValueOnce(makeChain([F.order]))              // order
      .mockReturnValueOnce(makeChain([F.pmCash]))             // method
      .mockReturnValueOnce(makeChain([F.orderItem]))          // items total ≈ 34.41
      .mockReturnValueOnce(makeChain([{ total: "0" }]))      // discounts
      .mockReturnValueOnce(makeChain([{ paid: "0" }]))       // already paid = 0
      .mockReturnValueOnce(makeChain([F.session]))            // session
      .mockReturnValue(makeChain([]));
    mockDb.insert.mockReturnValueOnce(makeChain([partialPayment]));
    mockDb.update.mockReturnValue(makeChain([]));

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH_HDR)
      .send({ methodCode: "cash", amount: "15.00", terminal: "Caja 1" });

    expect(res.status).toBe(201);
    // ticket es null porque no se cerró el pedido
    expect(res.body.ticket).toBeNull();
    expect(res.body.newRemaining).toBeGreaterThan(0);
  });

  it("Segundo pago salda el pedido — genera ticket", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([F.order]))              // order
      .mockReturnValueOnce(makeChain([F.pmCard]))             // method
      .mockReturnValueOnce(makeChain([F.orderItem]))          // items
      .mockReturnValueOnce(makeChain([{ total: "0" }]))      // discounts
      .mockReturnValueOnce(makeChain([{ paid: "15.00" }]))   // already paid = 15
      .mockReturnValueOnce(makeChain([F.session]))            // session
      .mockReturnValueOnce(makeChain([F.bizConfig]))          // biz config (in tx)
      .mockReturnValueOnce(makeChain([{ name: "Tarjeta" }])) // pmRow (in tx)
      .mockReturnValue(makeChain([]));
    mockDb.insert
      .mockReturnValueOnce(makeChain([F.payment]))
      .mockReturnValueOnce(makeChain([F.ticket]))
      .mockReturnValue(makeChain([]));
    mockDb.update.mockReturnValue(makeChain([]));

    // total=31.00, alreadyPaid=15.00, remaining=16.00 — card amount must not exceed remaining
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH_HDR)
      .send({ methodCode: "tarjeta", amount: "16.00", terminal: "Caja 1" });

    expect(res.status).toBe(201);
    expect(res.body.ticket).not.toBeNull();
    expect(res.body.newRemaining).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 11 — Idempotencia de pago
// ═══════════════════════════════════════════════════════════════════════════════
describe("Paso 11 — Idempotencia de pago en pedido ya cobrado", () => {
  it("200 idempotent:true en reintento dentro de ventana de 60s", async () => {
    const paidOrder = { ...F.order, status: "paid" };

    mockDb.select
      .mockReturnValueOnce(makeChain([paidOrder]))            // order (status = paid)
      .mockReturnValueOnce(makeChain([F.pmCash]))             // method
      .mockReturnValueOnce(makeChain([F.payment]))            // recent matching payment → found
      .mockReturnValueOnce(makeChain([F.ticket]))             // existing ticket
      .mockReturnValue(makeChain([]));

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH_HDR)
      .send({ methodCode: "cash", amount: "31.00", terminal: "Caja 1" });

    expect(res.status).toBe(200);
    expect(res.body.idempotent).toBe(true);
    expect(res.body.payment).toBeDefined();
  });

  it("409 en segundo cobro sin coincidencia reciente (pedido ya saldado)", async () => {
    const paidOrder = { ...F.order, status: "paid" };

    mockDb.select
      .mockReturnValueOnce(makeChain([paidOrder]))            // order (paid)
      .mockReturnValueOnce(makeChain([F.pmCash]))             // method
      .mockReturnValueOnce(makeChain([]));                    // no recent payment → genuine conflict

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH_HDR)
      .send({ methodCode: "cash", amount: "31.00", terminal: "Caja 1" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/ya está cobrado/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 12 — Estado post-pago (ticket y mesa)
// ═══════════════════════════════════════════════════════════════════════════════
describe("Paso 12 — Estado post-pago", () => {
  it("GET /api/orders/:id/ticket — 404 para pedido sin ticket", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([]));
    const res = await request(app)
      .get(`/api/orders/${ORDER_ID}/ticket`)
      .set("Authorization", AUTH_HDR);
    expect(res.status).toBe(404);
  });

  it("GET /api/orders/:id/ticket — 200 con datos del ticket, pedido e ítems", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([F.ticket]))             // ticket
      .mockReturnValueOnce(makeChain([{ ...F.order, status: "paid" }])) // order
      .mockReturnValueOnce(makeChain([F.orderItem]))          // items
      .mockReturnValueOnce(makeChain([{ name: "Mesa 1" }]))  // table
      .mockReturnValueOnce(makeChain([{ name: "Carmen" }]))  // employee
      .mockReturnValue(makeChain([]));                        // payments

    const res = await request(app)
      .get(`/api/orders/${ORDER_ID}/ticket`)
      .set("Authorization", AUTH_HDR);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ticket");
    expect(res.body).toHaveProperty("items");
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("GET /api/orders/:id/payment-summary — 200 con desglose de IVA", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([F.order]))              // order
      .mockReturnValueOnce(makeChain([F.orderItem]))          // items (innerJoin)
      .mockReturnValueOnce(makeChain([{ name: "Mesa 1" }]))  // table
      .mockReturnValueOnce(makeChain([{ name: "Carmen" }]))  // employee
      .mockReturnValueOnce(makeChain([{ total: "0" }]))      // discounts
      .mockReturnValueOnce(makeChain([{ paid: "0" }]))       // paid sum
      .mockReturnValue(makeChain([]));                        // methods, payments

    const res = await request(app)
      .get(`/api/orders/${ORDER_ID}/payment-summary`)
      .set("Authorization", AUTH_HDR);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("taxBreakdown");
    expect(res.body).toHaveProperty("remaining");
  });

  it("GET /api/orders/:orderId/audit — devuelve entradas de auditoría del pedido", async () => {
    const auditEntry = { id: "audit-1", orderId: ORDER_ID, action: "add_item",
                         details: "Añadido: Cocido", employeeId: EMP_ID,
                         createdAt: new Date() };
    mockDb.select.mockReturnValueOnce(makeChain([auditEntry]));

    const res = await request(app)
      .get(`/api/orders/${ORDER_ID}/audit`)
      .set("Authorization", AUTH_HDR);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty("action", "add_item");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 13 — Cierre de caja
// ═══════════════════════════════════════════════════════════════════════════════
describe("Paso 13 — Cierre de caja (POST /api/cash-sessions/:id/close)", () => {
  const CLOSED_SESSION = {
    ...F.session,
    status: "closed",
    closedAt: new Date(),
    expectedCash: "210.00",
    countedCash: "210.00",
    difference: "0.00",
  };

  function setupCloseMocks(opts: {
    sessionOpen?: boolean;
    cashSales?: string;
    countedCash?: string;
  } = {}) {
    const { sessionOpen = true, cashSales = "10.00", countedCash = "210.00" } = opts;

    mockDb.select
      .mockReturnValueOnce(                                    // session lookup
        makeChain(sessionOpen ? [F.session] : []),
      )
      .mockReturnValueOnce(makeChain([{ id: PM_CASH_ID }]))  // cash method
      .mockReturnValueOnce(makeChain([{ total: cashSales }]))// cash payments SUM
      .mockReturnValueOnce(makeChain([]))                     // movements (grouped)
      .mockReturnValue(makeChain([]));
    mockDb.update.mockReturnValue(makeChain([{ ...CLOSED_SESSION, countedCash }]));
  }

  it("401 sin autenticación", async () => {
    const res = await request(app)
      .post(`/api/cash-sessions/${SESSION_ID}/close`)
      .send({ countedCash: "210.00" });
    expect(res.status).toBe(401);
  });

  it("403 para rol camarero", async () => {
    vi.mocked(jwt.verify).mockReturnValue({ id: EMP_ID, role: "waiter", name: "Carmen" } as ReturnType<typeof jwt.verify>);
    const res = await request(app)
      .post(`/api/cash-sessions/${SESSION_ID}/close`)
      .set("Authorization", AUTH_HDR)
      .send({ countedCash: "210.00" });
    expect(res.status).toBe(403);
  });

  it("400 sin countedCash", async () => {
    const res = await request(app)
      .post(`/api/cash-sessions/${SESSION_ID}/close`)
      .set("Authorization", AUTH_HDR)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/efectivo contado/i);
  });

  it("404 sesión no encontrada o ya cerrada", async () => {
    setupCloseMocks({ sessionOpen: false });
    const res = await request(app)
      .post(`/api/cash-sessions/${SESSION_ID}/close`)
      .set("Authorization", AUTH_HDR)
      .send({ countedCash: "210.00" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/cerrada/i);
  });

  it("422 descuadre sin motivo — requiere discrepancyReason", async () => {
    // Session openingFloat=200, cashSales=10 → expected=210, counted=100 → diff=-110
    setupCloseMocks({ cashSales: "10.00", countedCash: "100.00" });

    const res = await request(app)
      .post(`/api/cash-sessions/${SESSION_ID}/close`)
      .set("Authorization", AUTH_HDR)
      .send({ countedCash: "100.00" }); // differs from expected 210

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/descuadre/i);
    expect(res.body).toHaveProperty("expectedCash");
    expect(res.body).toHaveProperty("difference");
  });

  it("200 cierre con descuadre + motivo — OK", async () => {
    setupCloseMocks({ cashSales: "10.00", countedCash: "195.00" });

    const res = await request(app)
      .post(`/api/cash-sessions/${SESSION_ID}/close`)
      .set("Authorization", AUTH_HDR)
      .send({
        countedCash: "195.00",
        discrepancyReason: "Propina no registrada",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("closed");
    expect(logDocumentAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "close_cash_session" }),
    );
  });

  it("200 cierre sin descuadre (contado = esperado)", async () => {
    // openingFloat=200, cashSales=10, movements=0 → expected=210, counted=210 → diff=0
    setupCloseMocks({ cashSales: "10.00", countedCash: "210.00" });

    const res = await request(app)
      .post(`/api/cash-sessions/${SESSION_ID}/close`)
      .set("Authorization", AUTH_HDR)
      .send({ countedCash: "210.00" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("closed");
  });

  it("Idempotencia — doble cierre retorna 404 en el segundo intento", async () => {
    setupCloseMocks({ sessionOpen: true, cashSales: "10.00", countedCash: "210.00" });

    const res1 = await request(app)
      .post(`/api/cash-sessions/${SESSION_ID}/close`)
      .set("Authorization", AUTH_HDR)
      .send({ countedCash: "210.00" });
    expect(res1.status).toBe(200);

    // Second attempt: session is now closed (not open)
    mockDb.select.mockReturnValueOnce(makeChain([])); // closed session not found
    const res2 = await request(app)
      .post(`/api/cash-sessions/${SESSION_ID}/close`)
      .set("Authorization", AUTH_HDR)
      .send({ countedCash: "210.00" });
    expect(res2.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CORTE TRANSVERSAL — Permisos
// ═══════════════════════════════════════════════════════════════════════════════
describe("Permisos — corte transversal", () => {
  it("Camarero no puede abrir caja (403)", async () => {
    vi.mocked(jwt.verify).mockReturnValue({ id: EMP_ID, role: "waiter", name: "Carmen" } as ReturnType<typeof jwt.verify>);
    const res = await request(app)
      .post("/api/cash-sessions/open")
      .set("Authorization", AUTH_HDR)
      .send({ openingFloat: "200" });
    expect(res.status).toBe(403);
  });

  it("Camarero no puede cerrar caja (403)", async () => {
    vi.mocked(jwt.verify).mockReturnValue({ id: EMP_ID, role: "waiter", name: "Carmen" } as ReturnType<typeof jwt.verify>);
    const res = await request(app)
      .post(`/api/cash-sessions/${SESSION_ID}/close`)
      .set("Authorization", AUTH_HDR)
      .send({ countedCash: "210.00" });
    expect(res.status).toBe(403);
  });

  it("Pago con método 'invitation' requiere admin (403 para manager)", async () => {
    vi.mocked(jwt.verify).mockReturnValue({ id: EMP_ID, role: "manager", name: "Manager" } as ReturnType<typeof jwt.verify>);
    const invitationMethod = { ...F.pmCash, code: "invitation", name: "Invitación" };

    mockDb.select
      .mockReturnValueOnce(makeChain([F.order]))
      .mockReturnValueOnce(makeChain([invitationMethod]))
      .mockReturnValue(makeChain([]));

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH_HDR)
      .send({ methodCode: "invitation", amount: "31.00" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/administrador/i);
  });

  it("Historial de mesa requiere manager o admin (403 para camarero)", async () => {
    vi.mocked(jwt.verify).mockReturnValue({ id: EMP_ID, role: "waiter", name: "Carmen" } as ReturnType<typeof jwt.verify>);
    const res = await request(app)
      .get(`/api/tables/${TABLE_ID}/history`)
      .set("Authorization", AUTH_HDR);
    expect(res.status).toBe(403);
  });

  it("Sin token → 401 en todos los endpoints protegidos", async () => {
    const endpoints = [
      { method: "post", path: "/api/cash-sessions/open" },
      { method: "post", path: `/api/tables/${TABLE_ID}/open` },
      { method: "post", path: `/api/orders/${ORDER_ID}/items` },
      { method: "post", path: `/api/orders/${ORDER_ID}/send` },
      { method: "patch", path: `/api/kitchen-tasks/${TASK_ID}/status` },
      { method: "post", path: `/api/orders/${ORDER_ID}/payments` },
      { method: "get",  path: `/api/orders/${ORDER_ID}/ticket` },
    ];

    for (const { method, path } of endpoints) {
      const res = await (request(app) as any)[method](path);
      expect(res.status).toBe(401);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CORTE TRANSVERSAL — Manejo de errores y casos borde
// ═══════════════════════════════════════════════════════════════════════════════
describe("Manejo de errores — corte transversal", () => {
  it("Añadir ítem a pedido bill_requested retorna 409", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([{ status: "bill_requested" }]));
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/items`)
      .set("Authorization", AUTH_HDR)
      .send({ productId: PRODUCT_ID, quantity: 1 });
    expect(res.status).toBe(409);
  });

  it("Enviar comanda con todos ítems ya enviados retorna 400", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([{ status: "sent" }]))
      .mockReturnValueOnce(makeChain([{ printMode: "kds_only" }]))
      .mockReturnValueOnce(makeChain([{ sentAt: new Date() }]))
      .mockReturnValue(makeChain([]));   // no draft items
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/send`)
      .set("Authorization", AUTH_HDR);
    expect(res.status).toBe(400);
  });

  it("Prefactura sobre pedido cobrado retorna 409", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([{ status: "paid" }]));
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/prefactura/print`)
      .set("Authorization", AUTH_HDR);
    expect(res.status).toBe(409);
  });

  it("Transición KDS inválida (collected → new) retorna 422", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([
      { ...F.kdsTask, status: "collected", prepZone: "cocina" },
    ]));
    const res = await request(app)
      .patch(`/api/kitchen-tasks/${TASK_ID}/status`)
      .set("Authorization", AUTH_HDR)
      .send({ status: "new" });
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty("allowed");
    expect(res.body.allowed).toHaveLength(0);
  });

  it("Sesión de caja: movimiento en sesión cerrada retorna 404", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([])); // no open session found
    const res = await request(app)
      .post(`/api/cash-sessions/${SESSION_ID}/movements`)
      .set("Authorization", AUTH_HDR)
      .send({ movementType: "in", amount: "50", reason: "Fondo adicional" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/cerrada/i);
  });

  it("Movimiento de caja sin motivo retorna 400", async () => {
    const res = await request(app)
      .post(`/api/cash-sessions/${SESSION_ID}/movements`)
      .set("Authorization", AUTH_HDR)
      .send({ movementType: "in", amount: "50", reason: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/motivo/i);
  });

  it("Movimiento de caja con tipo inválido retorna 400", async () => {
    const res = await request(app)
      .post(`/api/cash-sessions/${SESSION_ID}/movements`)
      .set("Authorization", AUTH_HDR)
      .send({ movementType: "robo", amount: "50", reason: "Test" });
    expect(res.status).toBe(400);
  });
});
