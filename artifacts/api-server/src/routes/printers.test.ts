/**
 * printers.test.ts
 * 18 test scenarios for the printing module.
 *
 * Scenarios 1-7: pure unit tests for ticket-builder (no DB needed).
 * Scenarios 8-18: HTTP integration tests via supertest + mocked DB.
 *
 * Pattern mirrors cash.test.ts: vi.mock(@workspace/db), makeChain helper,
 * then import app after mocks are in place.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import {
  buildKitchenTicket,
  buildAddedTicket,
  buildCancellationTicket,
  buildModificationTicket,
  buildReprintHeader,
  buildTestTicket,
} from "../lib/ticket-builder";

// ── makeChain helper (same as cash.test.ts) ───────────────────────────────────
function makeChain(value: unknown) {
  const chain: Record<string, unknown> & {
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => Promise<unknown>;
  } = {
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  for (const m of [
    "select", "from", "where", "orderBy", "insert", "update", "delete",
    "set", "values", "returning", "innerJoin", "leftJoin", "limit",
    "groupBy", "offset", "onConflictDoUpdate",
    "catch",  // required because auditPrint calls db.insert(...).values(...).catch(() => {})
  ]) {
    chain[m] = () => chain;
  }
  return chain;
}

// ── Module mocks (hoisted before imports) ─────────────────────────────────────
const mockJwtVerify = vi.hoisted(() =>
  vi.fn().mockImplementation((_token: string) => ({
    id: "user-1",
    name: "Test Manager",
    role: "manager",
  }))
);

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});

vi.mock("jsonwebtoken", () => ({
  default: { verify: mockJwtVerify },
}));

vi.mock("drizzle-orm", async (importOriginal) => importOriginal());

vi.mock("../lib/socket", () => ({
  getIO: () => ({ emit: vi.fn() }),
  initSocket: vi.fn(),
}));

vi.mock("../lib/document-audit", () => ({
  logDocumentAction: vi.fn().mockResolvedValue(undefined),
}));

// Mock the print connector so tests never try real network connections
vi.mock("../lib/print-connector-sim", () => ({
  sendToPrinter: vi.fn().mockResolvedValue({ ok: true, simulated: true }),
  getPrinterStatus: vi.fn().mockResolvedValue({ status: "online", simulated: true }),
}));

// Mock the print worker to avoid starting the background polling interval
vi.mock("../lib/print-worker", () => ({
  startPrintWorker: vi.fn(),
  stopPrintWorker: vi.fn(),
}));

// ── App (loaded after mocks) ──────────────────────────────────────────────────
const { default: app } = await import("../app");

// ── Shared constants ──────────────────────────────────────────────────────────
const AUTH = "Bearer test-token";

const PRINTER_COCINA = {
  id: "printer-1",
  name: "Cocina 1",
  type: "cocina",
  brand: "Epson",
  model: "TM-T88V",
  ip: "192.168.1.10",
  port: 9100,
  paperWidth: 80,
  copies: 1,
  active: true,
  isPrimary: true,
  fallbackPrinterId: null,
  lastStatus: "online",
  lastStatusAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const PRINTER_BARRA = {
  ...PRINTER_COCINA,
  id: "printer-2",
  name: "Barra",
  type: "barra",
  ip: "192.168.1.11",
};

const JOB_PENDING = {
  id: "job-1",
  printerId: "printer-1",
  printerName: "Cocina 1",
  orderId: null,
  documentType: "test_ticket",
  content: "test content",
  status: "pending",
  attempts: 0,
  lastError: null,
  sentAt: null,
  printedAt: null,
  actorName: "sistema",
  createdAt: new Date().toISOString(),
};

const JOB_ERROR = {
  ...JOB_PENDING,
  id: "job-2",
  status: "error",
  attempts: 3,
  lastError: "Connection refused",
};

const JOB_PRINTED = { ...JOB_PENDING, id: "job-3", status: "printed", printedAt: new Date().toISOString() };

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  process.env["SESSION_SECRET"] = "test-secret";
  mockDb.select.mockImplementation(() => makeChain([]));
  mockDb.insert.mockImplementation(() => makeChain([]));
  mockDb.update.mockImplementation(() => makeChain([]));
  mockDb.delete.mockImplementation(() => makeChain([]));
  mockDb.transaction.mockImplementation(async (cb: Function) =>
    cb({
      insert: vi.fn().mockReturnValue(makeChain([])),
      update: vi.fn().mockReturnValue(makeChain([])),
    })
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// UNIT TESTS — ticket-builder (no DB, no HTTP)
// ═════════════════════════════════════════════════════════════════════════════

// ── 1. Kitchen ticket ─────────────────────────────────────────────────────────
describe("1. Kitchen ticket builder", () => {
  it("includes table, waiter, guest count and items", () => {
    const content = buildKitchenTicket(
      { id: "x", tableName: "Mesa 5", zone: "Terraza", employeeName: "Carlos", guestCount: 2 },
      [{ quantity: 2, name: "Pasta", notes: "sin sal", hasAllergy: false }],
      { nombreComercial: "Piccolo", mostrarPrecios: false },
    );
    expect(content).toContain("Mesa 5");
    expect(content).toContain("Terraza");
    expect(content).toContain("Carlos");
    expect(content).toContain("2x Pasta");
    expect(content).toContain("sin sal");
    expect(content).not.toContain("€");
  });
});

// ── 2. Added ticket ───────────────────────────────────────────────────────────
describe("2. Added ticket header", () => {
  it("labels subsequent sends as AÑADIDO", () => {
    const content = buildAddedTicket(
      { id: "x", tableName: "Mesa 3" },
      [{ quantity: 1, name: "Ensalada" }],
    );
    expect(content).toContain("AÑADIDO");
    expect(content).toContain("1x Ensalada");
  });
});

// ── 3. Cancellation ticket ────────────────────────────────────────────────────
describe("3. Cancellation ticket", () => {
  it("shows ANULADO with item, reason and actor", () => {
    const content = buildCancellationTicket(
      { id: "x", tableName: "Mesa 7" },
      { quantity: 1, name: "Pizza" },
      "Cliente cambió de opinión",
      "María",
    );
    expect(content).toContain("ANULADO");
    expect(content).toContain("Pizza");
    expect(content).toContain("Cliente cambió de opinión");
    expect(content).toContain("María");
  });
});

// ── 4. Modification ticket ────────────────────────────────────────────────────
describe("4. Modification ticket", () => {
  it("shows before and after state with actor", () => {
    const content = buildModificationTicket(
      { id: "x", tableName: "Mesa 2" },
      { name: "Pizza Margherita", notes: "con cebolla" },
      { name: "Pizza Margherita", notes: "sin cebolla" },
      "Preferencia del cliente",
      "Juan",
    );
    expect(content).toContain("MODIFICACIÓN");
    expect(content).toContain("con cebolla");
    expect(content).toContain("sin cebolla");
    expect(content).toContain("Juan");
  });
});

// ── 5. Allergy header ─────────────────────────────────────────────────────────
describe("5. Allergy header in kitchen ticket", () => {
  it("inserts prominent allergy block with ASCII markers (visible without color)", () => {
    const content = buildKitchenTicket(
      { id: "x", tableName: "Mesa 1" },
      [{ quantity: 1, name: "Ensalada", hasAllergy: true, allergyNote: "Gluten" }],
    );
    expect(content).toContain("ALERGIAS");
    expect(content).toContain("Gluten");
    expect(content).toContain("***");
  });
});

// ── 6. Reprint header ─────────────────────────────────────────────────────────
describe("6. Reprint header", () => {
  it("labels reprinted documents with actor and reason", () => {
    const header = buildReprintHeader("Cliente perdió el ticket", "Admin");
    expect(header).toContain("REIMPRESIÓN");
    expect(header).toContain("Cliente perdió el ticket");
    expect(header).toContain("Admin");
  });
});

// ── 7. Test ticket ────────────────────────────────────────────────────────────
describe("7. Test ticket", () => {
  it("includes printer name and width for 80 mm printer", () => {
    const content = buildTestTicket("Cocina 1", "cocina", true);
    expect(content).toContain("PRUEBA DE IMPRESORA");
    expect(content).toContain("Cocina 1");
    expect(content).toContain("80");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// HTTP INTEGRATION TESTS (mocked DB + supertest)
// ═════════════════════════════════════════════════════════════════════════════

// ── 8. GET /admin/printers ────────────────────────────────────────────────────
describe("8. GET /api/admin/printers — list all printers", () => {
  it("returns 200 with printer list", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([PRINTER_COCINA, PRINTER_BARRA]));

    const res = await request(app).get("/api/admin/printers").set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].type).toBe("cocina");
  });
});

// ── 9. POST /admin/printers — create printer ──────────────────────────────────
describe("9. POST /api/admin/printers — create a printer", () => {
  it("creates and returns the new printer", async () => {
    mockDb.insert.mockReturnValueOnce(makeChain([PRINTER_COCINA]));

    const res = await request(app)
      .post("/api/admin/printers")
      .set("Authorization", AUTH)
      .send({ name: "Cocina 1", type: "cocina", ip: "192.168.1.10", port: 9100, paperWidth: 80 });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Cocina 1");
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/api/admin/printers")
      .set("Authorization", AUTH)
      .send({ type: "cocina" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nombre/i);
  });
});

// ── 10. PATCH /admin/printers/:id — update ────────────────────────────────────
describe("10. PATCH /api/admin/printers/:id — update printer", () => {
  it("returns updated printer on success", async () => {
    mockDb.update.mockReturnValueOnce(makeChain([{ ...PRINTER_COCINA, name: "Cocina Principal" }]));

    const res = await request(app)
      .patch("/api/admin/printers/printer-1")
      .set("Authorization", AUTH)
      .send({ name: "Cocina Principal" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Cocina Principal");
  });

  it("returns 404 when printer not found", async () => {
    mockDb.update.mockReturnValueOnce(makeChain([]));

    const res = await request(app)
      .patch("/api/admin/printers/nonexistent")
      .set("Authorization", AUTH)
      .send({ name: "X" });

    expect(res.status).toBe(404);
  });
});

// ── 11. DELETE /admin/printers/:id — soft delete ─────────────────────────────
describe("11. DELETE /api/admin/printers/:id — soft delete (active=false)", () => {
  it("deactivates printer and returns ok", async () => {
    mockDb.update.mockReturnValueOnce(makeChain([{ ...PRINTER_COCINA, active: false }]));

    const res = await request(app)
      .delete("/api/admin/printers/printer-1")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ── 12. POST /admin/printers/:id/test — test print ───────────────────────────
describe("12. POST /api/admin/printers/:id/test — enqueue test job", () => {
  it("enqueues a test ticket and returns jobId", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([PRINTER_COCINA])); // load printer
    mockDb.insert.mockReturnValueOnce(makeChain([{ id: "job-test-1" }])); // insert job
    mockDb.insert.mockReturnValueOnce(makeChain([])); // audit

    const res = await request(app)
      .post("/api/admin/printers/printer-1/test")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.jobId).toBe("job-test-1");
  });

  it("returns 404 for unknown printer", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([]));

    const res = await request(app)
      .post("/api/admin/printers/bad-id/test")
      .set("Authorization", AUTH);

    expect(res.status).toBe(404);
  });

  it("enqueues explicit charset and drawer certification profiles as pending physical", async () => {
    for (const profile of ["charset", "drawer"]) {
      mockDb.select.mockReturnValueOnce(makeChain([PRINTER_COCINA]));
      mockDb.insert.mockReturnValueOnce(makeChain([{ id: `job-${profile}` }]));
      mockDb.insert.mockReturnValueOnce(makeChain([]));
      const res = await request(app)
        .post("/api/admin/printers/printer-1/test")
        .set("Authorization", AUTH)
        .send({ profile });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        profile,
        physicalStatus: "PENDING_PHYSICAL_CERTIFICATION",
      });
    }
  });
});

// ── 13. GET /admin/printers/:id/status ───────────────────────────────────────
describe("13. GET /api/admin/printers/:id/status — printer status check", () => {
  it("returns simulated status and updates last_status", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([PRINTER_COCINA]));
    mockDb.update.mockReturnValueOnce(makeChain([{ ...PRINTER_COCINA, lastStatus: "online" }]));

    const res = await request(app)
      .get("/api/admin/printers/printer-1/status")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body.simulated).toBe(true);
    expect(["online", "offline", "paper_out", "cover_open", "error", "unknown"]).toContain(res.body.status);
  });
});

// ── 14. GET /admin/print-queue ────────────────────────────────────────────────
describe("14. GET /api/admin/print-queue — list queue jobs", () => {
  it("returns all jobs joined with printer name", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([JOB_PENDING, JOB_ERROR]));

    const res = await request(app)
      .get("/api/admin/print-queue")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.some((j: any) => j.status === "error")).toBe(true);
  });
});

// ── 15. POST /admin/print-queue/:id/retry ────────────────────────────────────
describe("15. POST /api/admin/print-queue/:id/retry — reset error job", () => {
  it("resets attempts to 0 and status to pending", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([JOB_ERROR]));
    mockDb.update.mockReturnValueOnce(makeChain([{ ...JOB_ERROR, status: "pending", attempts: 0, lastError: null }]));
    mockDb.insert.mockReturnValueOnce(makeChain([])); // audit

    const res = await request(app)
      .post("/api/admin/print-queue/job-2/retry")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
    expect(res.body.attempts).toBe(0);
  });
});

// ── 16. DELETE /admin/print-queue/:id — cancel ───────────────────────────────
describe("16. DELETE /api/admin/print-queue/:id — cancel pending job", () => {
  it("cancels a pending job", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([JOB_PENDING]));
    mockDb.update.mockReturnValueOnce(makeChain([{ ...JOB_PENDING, status: "cancelled" }]));
    mockDb.insert.mockReturnValueOnce(makeChain([])); // audit

    const res = await request(app)
      .delete("/api/admin/print-queue/job-1")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
  });

  it("returns 409 when trying to cancel an already-printed job", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([JOB_PRINTED]));

    const res = await request(app)
      .delete("/api/admin/print-queue/job-3")
      .set("Authorization", AUTH);

    expect(res.status).toBe(409);
  });
});

// ── 17. POST /admin/print-queue/:id/reprint ──────────────────────────────────
describe("17. POST /api/admin/print-queue/:id/reprint — reprint with reason", () => {
  it("creates a new reprint job with REIMPRESIÓN header", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([JOB_PRINTED]));
    mockDb.select.mockReturnValueOnce(makeChain([PRINTER_COCINA]));
    mockDb.insert
      .mockReturnValueOnce(makeChain([{ id: "job-reprint-1", documentType: "reprint", status: "pending" }]))
      .mockReturnValueOnce(makeChain([])); // audit

    const res = await request(app)
      .post("/api/admin/print-queue/job-3/reprint")
      .set("Authorization", AUTH)
      .send({ reason: "Cliente perdió el ticket" });

    expect(res.status).toBe(201);
    expect(res.body.documentType).toBe("reprint");
  });

  it("allows an optional reason and still creates a marked reprint", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([JOB_PRINTED]));
    mockDb.select.mockReturnValueOnce(makeChain([PRINTER_COCINA]));
    mockDb.insert
      .mockReturnValueOnce(makeChain([{ id: "job-reprint-2", documentType: "reprint", status: "pending" }]))
      .mockReturnValueOnce(makeChain([]));
    const res = await request(app)
      .post("/api/admin/print-queue/job-3/reprint")
      .set("Authorization", AUTH)
      .send({});

    expect(res.status).toBe(201);
  });
});

// ── 18. PATCH /admin/print-config — print mode ───────────────────────────────
describe("18. PATCH /api/admin/print-config — change print mode", () => {
  it("saves kds_only mode and returns ok", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([{ id: "cfg-1" }]));
    mockDb.update.mockReturnValueOnce(makeChain([]));

    const res = await request(app)
      .patch("/api/admin/print-config")
      .set("Authorization", AUTH)
      .send({ printMode: "kds_only" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 400 for invalid mode", async () => {
    const res = await request(app)
      .patch("/api/admin/print-config")
      .set("Authorization", AUTH)
      .send({ printMode: "invalid_mode" });

    expect(res.status).toBe(400);
  });
});

// ── 19. Role enforcement: non-manager/admin gets 403 on all admin print routes ─
describe("19. Role enforcement — non-manager users cannot access admin print routes", () => {
  beforeEach(() => {
    // Override JWT to return a waiter (role: "waiter"), who has no manager/admin access
    mockJwtVerify.mockImplementation(() => ({
      id: "waiter-1",
      name: "Camarero Test",
      role: "waiter",
    }));
  });

  afterEach(() => {
    // Restore manager role for remaining tests
    mockJwtVerify.mockImplementation(() => ({
      id: "user-1",
      name: "Test Manager",
      role: "manager",
    }));
  });

  it("returns 403 for waiter on GET /admin/printers", async () => {
    const res = await request(app).get("/api/admin/printers").set("Authorization", AUTH);
    expect(res.status).toBe(403);
  });

  it("returns 403 for waiter on POST /admin/printers", async () => {
    const res = await request(app)
      .post("/api/admin/printers")
      .set("Authorization", AUTH)
      .send({ name: "Evil Printer" });
    expect(res.status).toBe(403);
  });

  it("returns 403 for waiter on GET /admin/print-queue", async () => {
    const res = await request(app).get("/api/admin/print-queue").set("Authorization", AUTH);
    expect(res.status).toBe(403);
  });

  it("returns 403 for waiter on PATCH /admin/print-config", async () => {
    const res = await request(app)
      .patch("/api/admin/print-config")
      .set("Authorization", AUTH)
      .send({ printMode: "both" });
    expect(res.status).toBe(403);
  });

  it("returns 403 for waiter on GET /admin/print-audit", async () => {
    const res = await request(app).get("/api/admin/print-audit").set("Authorization", AUTH);
    expect(res.status).toBe(403);
  });

  it("manager role is still allowed (sanity check)", async () => {
    // Temporarily restore manager
    mockJwtVerify.mockImplementationOnce(() => ({
      id: "mgr-1",
      name: "Manager",
      role: "manager",
    }));
    mockDb.select.mockReturnValueOnce(makeChain([PRINTER_COCINA, PRINTER_BARRA]));
    const res = await request(app).get("/api/admin/printers").set("Authorization", AUTH);
    expect(res.status).toBe(200);
  });
});

// ── 20. isAdded logic: first send is always a standard kitchen ticket ─────────
describe("20. First send vs subsequent send classification", () => {
  it("first kitchen send uses standard ticket (isAdded=false)", () => {
    // buildAddedTicket always includes "AÑADIDO" header;
    // buildKitchenTicket does NOT include it unless a headerLabel is passed.
    // This verifies the builders produce distinct output so the isAdded flag matters.
    const firstSend = buildKitchenTicket(
      { id: "x", tableName: "Mesa 1" },
      [{ quantity: 1, name: "Pasta" }],
    );
    const addedSend = buildAddedTicket(
      { id: "x", tableName: "Mesa 1" },
      [{ quantity: 1, name: "Pasta" }],
    );
    // Standard kitchen ticket must NOT contain "AÑADIDO"
    expect(firstSend).not.toContain("AÑADIDO");
    // Added ticket MUST contain "AÑADIDO"
    expect(addedSend).toContain("AÑADIDO");
  });

  it("subsequent send uses added ticket (isAdded=true) — distinct from first send", () => {
    const firstSend = buildKitchenTicket(
      { id: "x", tableName: "Mesa 1" },
      [{ quantity: 2, name: "Pizza" }],
    );
    const addedSend = buildAddedTicket(
      { id: "x", tableName: "Mesa 1" },
      [{ quantity: 2, name: "Pizza" }],
    );
    // Both contain the item name
    expect(firstSend).toContain("2x Pizza");
    expect(addedSend).toContain("2x Pizza");
    // Only the added send has the AÑADIDO header
    expect(addedSend).toContain("AÑADIDO");
    expect(firstSend).not.toContain("AÑADIDO");
  });
});
