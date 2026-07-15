/**
 * Invoice Scanner module tests (T1–T15)
 * Uses vi.hoisted + vi.mock pattern matching the rest of the test suite.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── Thenable chain (same as suppliers.test.ts pattern) ──────────────────────
function makeChain(value: unknown) {
  const chain: Record<string, unknown> & { then: any } = {
    then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject),
  };
  for (const m of [
    "select", "from", "where", "orderBy", "insert", "update", "set", "values",
    "returning", "delete", "innerJoin", "leftJoin", "limit", "groupBy",
    "$dynamic", "asc", "desc", "onConflictDoNothing",
  ]) {
    chain[m] = () => chain;
  }
  return chain;
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_DOC = {
  id: "doc-001", originalFilename: "factura-garcia.pdf", mimeType: "application/pdf",
  fileSize: 102400, filePath: "uploads/invoices/abc.pdf", fileHash: "abc123",
  status: "uploaded", supplierId: null, supplierInvoiceId: null,
  isDuplicate: false, duplicateOfId: null, uploadedBy: "emp-001",
  reviewedBy: null, confirmedBy: null, uploadedAt: new Date().toISOString(),
  processedAt: null, reviewedAt: null, confirmedAt: null, processingError: null,
};

const MOCK_EXTRACTION = {
  id: "ext-001", documentId: "doc-001",
  supplierName: "Hortalizas García SL", supplierNameConfidence: "0.91", supplierNameStatus: "auto",
  legalName: "Hortalizas García SL", legalNameConfidence: "0.87", legalNameStatus: "auto",
  nif: "B12345678", nifConfidence: "0.94", nifStatus: "auto",
  invoiceNumber: "123-2024-0042", invoiceNumberConfidence: "0.93", invoiceNumberStatus: "auto",
  invoiceDate: "2024-03-15", invoiceDateConfidence: "0.91", invoiceDateStatus: "auto",
  dueDate: "2024-04-14", dueDateConfidence: "0.88", dueDateStatus: "auto",
  taxableBase: "84.0000", taxableBaseConfidence: "0.88", taxableBaseStatus: "auto",
  vatBreakdown: [{ rate: 0.04, base: 84, amount: 3.36 }],
  vatBreakdownConfidence: "0.84", vatBreakdownStatus: "auto",
  total: "87.3600", totalConfidence: "0.95", totalStatus: "auto",
  paymentMethod: "Transferencia bancaria", paymentMethodConfidence: "0.75", paymentMethodStatus: "auto",
  relatedOrderNumber: null, relatedOrderNumberConfidence: "0", relatedOrderNumberStatus: "auto",
  relatedDeliveryNote: null, relatedDeliveryNoteConfidence: "0", relatedDeliveryNoteStatus: "auto",
  overallConfidence: "0.88",
  rawOcrText: "Hortalizas García SL\nNIF: B12345678",
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

const MOCK_LINE = {
  id: "line-001", documentId: "doc-001", lineNumber: 1,
  supplierRef: "TOM-CHE-01", description: "Tomate cherry kg",
  quantity: "10.0000", unit: "kg", unitPrice: "2.8000",
  discount: "0.0000", vatRate: "0.0400", lineTotal: "28.0000",
  confidence: "0.85", status: "auto",
  ingredientId: "ing-001", ingredientName: "Tomate cherry", ingredientUnit: "kg",
  conversionFactor: null, conversionNote: null, mappingConfirmed: false, isRejected: false,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

const MOCK_SUPPLIER = {
  id: "sup-001", commercialName: "Hortalizas García SL",
  legalName: "Hortalizas García SL", nif: "B12345678",
  active: true, leadTimeDays: 3,
};

// ─── Hoisted DB mock ──────────────────────────────────────────────────────────
const mockDb = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
  transaction: vi.fn(), execute: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});

vi.mock("jsonwebtoken", () => ({
  default: { verify: vi.fn(() => ({ id: "emp-001", name: "Test Manager", role: "admin" })) },
}));

vi.mock("drizzle-orm", async (importOriginal) => importOriginal());
vi.mock("../lib/socket", () => ({ getIO: vi.fn(() => ({ emit: vi.fn() })), initSocket: vi.fn() }));

// OCR simulator mock
vi.mock("../lib/ocr", () => ({
  getOcrProvider: vi.fn(() => ({
    uploadDocument:    vi.fn().mockResolvedValue("sim-abc123"),
    extractInvoiceData: vi.fn().mockResolvedValue(undefined),
    getProcessingStatus: vi.fn().mockResolvedValue({ documentId: "sim-abc123", status: "done", progress: 100 }),
    getResult: vi.fn().mockResolvedValue({
      rawText: "Hortalizas García SL\nNIF: B12345678",
      overallConfidence: 0.88,
      supplierName:        { value: "Hortalizas García SL",   confidence: 0.91 },
      legalName:           { value: "Hortalizas García SL",   confidence: 0.87 },
      nif:                 { value: "B12345678",              confidence: 0.94 },
      invoiceNumber:       { value: "123-2024-0042",          confidence: 0.93 },
      invoiceDate:         { value: "2024-03-15",             confidence: 0.91 },
      dueDate:             { value: "2024-04-14",             confidence: 0.88 },
      taxableBase:         { value: "84.0000",                confidence: 0.88 },
      vatBreakdown:        { value: [{ rate: 0.04, base: 84, amount: 3.36 }], confidence: 0.84 },
      total:               { value: "87.3600",                confidence: 0.95 },
      paymentMethod:       { value: "Transferencia bancaria", confidence: 0.75 },
      relatedOrderNumber:  { value: null,                     confidence: 0 },
      relatedDeliveryNote: { value: null,                     confidence: 0 },
      lines: [
        { lineNumber: 1, supplierRef: "TOM-CHE-01", description: "Tomate cherry kg",
          quantity: 10, unit: "kg", unitPrice: 2.80, discount: 0, vatRate: 0.04,
          lineTotal: 28.00, confidence: 0.85 },
        { lineNumber: 2, supplierRef: "LEC-ROM-02", description: "Lechuga romana ud",
          quantity: 20, unit: "ud", unitPrice: 0.65, discount: 0, vatRate: 0.04,
          lineTotal: 13.00, confidence: 0.82 },
      ],
    }),
    validateExtraction: vi.fn().mockReturnValue({ valid: true, issues: [] }),
  })),
}));

// fs mock — prevent real disk operations
vi.mock("fs", async () => {
  return {
    default: {
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn().mockReturnValue(Buffer.from("fake-pdf-content")),
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(Buffer.from("fake-pdf-content")),
  };
});

// ─── Import app ───────────────────────────────────────────────────────────────
const { default: app } = await import("../app");
const AUTH = "Bearer test-token";

// ─── beforeEach defaults ──────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockDb.transaction.mockImplementation(async (fn: any) => fn(mockDb));
  mockDb.execute.mockResolvedValue([]);

  // Default chains
  mockDb.select.mockReturnValue(makeChain([MOCK_DOC]));
  mockDb.insert.mockReturnValue(makeChain([MOCK_DOC]));
  mockDb.update.mockReturnValue(makeChain([]));
  mockDb.delete.mockReturnValue(makeChain([]));
});

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Invoice Scanner routes (T1–T15)", () => {

  // T1 — List documents returns array
  it("T1: GET /admin/invoice-scanner returns 200 with array", async () => {
    mockDb.select.mockReturnValue(makeChain([]));

    const res = await request(app)
      .get("/api/admin/invoice-scanner")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T2 — Single document 404 when not found
  it("T2: GET /admin/invoice-scanner/:id returns 404 when not found", async () => {
    mockDb.select.mockReturnValue(makeChain([]));

    const res = await request(app)
      .get("/api/admin/invoice-scanner/nonexistent-id")
      .set("Authorization", AUTH);

    expect(res.status).toBe(404);
  });

  // T3 — Upload rejects invalid MIME type → 400
  it("T3: POST /admin/invoice-scanner/upload rejects invalid file type", async () => {
    const res = await request(app)
      .post("/api/admin/invoice-scanner/upload")
      .set("Authorization", AUTH)
      .attach("file", Buffer.from("fake content"), {
        filename: "virus.exe",
        contentType: "application/octet-stream",
      });

    expect(res.status).toBe(400);
  });

  // T4 — Upload PDF is accepted → 201
  it("T4: POST /admin/invoice-scanner/upload accepts PDF", async () => {
    // hash check → no duplicate; insert → doc
    mockDb.select
      .mockReturnValueOnce(makeChain([]))       // dedup hash check
      .mockReturnValue(makeChain([MOCK_DOC]));
    mockDb.insert
      .mockReturnValueOnce(makeChain([MOCK_DOC])) // insert doc
      .mockReturnValue(makeChain([]));             // audit log

    const res = await request(app)
      .post("/api/admin/invoice-scanner/upload")
      .set("Authorization", AUTH)
      .attach("file", Buffer.from("%PDF-1.4 fake pdf content"), {
        filename: "factura.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
  });

  // T5 — Upload JPEG photo is accepted → 201
  it("T5: POST /admin/invoice-scanner/upload accepts JPEG (photo from mobile)", async () => {
    const photoDoc = { ...MOCK_DOC, mimeType: "image/jpeg", originalFilename: "foto.jpg" };
    mockDb.select
      .mockReturnValueOnce(makeChain([]))         // dedup
      .mockReturnValue(makeChain([photoDoc]));
    mockDb.insert
      .mockReturnValueOnce(makeChain([photoDoc])) // insert
      .mockReturnValue(makeChain([]));            // audit

    const res = await request(app)
      .post("/api/admin/invoice-scanner/upload")
      .set("Authorization", AUTH)
      .attach("file", Buffer.from("fake jpeg data\xff\xd8\xff"), {
        filename: "foto-factura.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(201);
    expect(res.body.mimeType).toBe("image/jpeg");
  });

  // T6 — Duplicate file (same hash) → 409
  it("T6: POST /admin/invoice-scanner/upload returns 409 for duplicate file hash", async () => {
    mockDb.select.mockReturnValue(makeChain([{ id: "doc-existing", status: "confirmed" }]));

    const res = await request(app)
      .post("/api/admin/invoice-scanner/upload")
      .set("Authorization", AUTH)
      .attach("file", Buffer.from("duplicate content"), {
        filename: "dup.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("duplicate_file");
    expect(res.body).toHaveProperty("existingDocumentId");
  });

  // T7 — Process document runs OCR and returns extraction + validation
  it("T7: POST /admin/invoice-scanner/:id/process runs OCR and persists extraction", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([{ ...MOCK_DOC, status: "uploaded" }])) // get doc
      .mockReturnValueOnce(makeChain([]))                                     // supplier by NIF
      .mockReturnValueOnce(makeChain([]))                                     // supplier by name
      .mockReturnValueOnce(makeChain([]))                                     // duplicate check
      .mockReturnValueOnce(makeChain([{ ...MOCK_DOC, status: "pending_review" }])) // updated doc
      .mockReturnValueOnce(makeChain([MOCK_EXTRACTION]))                      // extraction
      .mockReturnValue(makeChain([MOCK_LINE]));                               // lines

    mockDb.insert.mockReturnValue(makeChain([]));
    mockDb.update.mockReturnValue(makeChain([]));

    const res = await request(app)
      .post("/api/admin/invoice-scanner/doc-001/process")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("extraction");
    expect(res.body).toHaveProperty("validation");
    expect(res.body).toHaveProperty("lines");
  });

  // T8 — Process already-confirmed document → 409
  it("T8: POST /admin/invoice-scanner/:id/process rejects confirmed document", async () => {
    mockDb.select.mockReturnValue(makeChain([{ ...MOCK_DOC, status: "confirmed" }]));

    const res = await request(app)
      .post("/api/admin/invoice-scanner/doc-001/process")
      .set("Authorization", AUTH);

    expect(res.status).toBe(409);
  });

  // T9 — Supplier candidate search returns matches
  it("T9: GET /admin/invoice-scanner/suppliers/candidates returns matching suppliers", async () => {
    mockDb.select.mockReturnValue(makeChain([MOCK_SUPPLIER]));

    const res = await request(app)
      .get("/api/admin/invoice-scanner/suppliers/candidates?q=Hortalizas")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T10 — Query too short → empty array, no DB call
  it("T10: GET /admin/invoice-scanner/suppliers/candidates returns [] for q shorter than 2 chars", async () => {
    const res = await request(app)
      .get("/api/admin/invoice-scanner/suppliers/candidates?q=x")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // T11 — Save manual corrections to header and lines
  it("T11: PATCH /admin/invoice-scanner/:id/extraction saves corrections and marks reviewed", async () => {
    mockDb.select.mockReturnValue(makeChain([{ ...MOCK_DOC, status: "pending_review" }]));
    mockDb.update.mockReturnValue(makeChain([]));
    mockDb.insert.mockReturnValue(makeChain([]));

    const res = await request(app)
      .patch("/api/admin/invoice-scanner/doc-001/extraction")
      .set("Authorization", AUTH)
      .send({
        header: { invoiceNumber: "FAC-CORRECTED-001", total: "90.00" },
        lines:  [{ id: "line-001", quantity: "5", unitPrice: "3.50", isRejected: false }],
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockDb.update).toHaveBeenCalled();
  });

  // T12 — Confirm already-confirmed → 409
  it("T12: POST /admin/invoice-scanner/:id/confirm returns 409 if already confirmed", async () => {
    mockDb.select.mockReturnValue(makeChain([{ ...MOCK_DOC, status: "confirmed", isDuplicate: false }]));

    const res = await request(app)
      .post("/api/admin/invoice-scanner/doc-001/confirm")
      .set("Authorization", AUTH)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("La factura ya está confirmada");
  });

  // T13 — Duplicate flag blocks confirmation (without manager override)
  it("T13: POST /admin/invoice-scanner/:id/confirm blocks duplicate without overrideDuplicate", async () => {
    mockDb.select.mockReturnValue(makeChain([{
      ...MOCK_DOC, status: "pending_review", isDuplicate: true, supplierId: "sup-001",
    }]));

    const res = await request(app)
      .post("/api/admin/invoice-scanner/doc-001/confirm")
      .set("Authorization", AUTH)
      .send({ overrideDuplicate: false });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("duplicate_detected");
  });

  // T14 — Reconciliation returns diff report
  it("T14: GET /admin/invoice-scanner/:id/reconciliation returns summary and diffs", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([{ ...MOCK_DOC, status: "reviewed" }]))
      .mockReturnValueOnce(makeChain([MOCK_EXTRACTION]))
      .mockReturnValueOnce(makeChain([MOCK_LINE]))  // invoice lines
      .mockReturnValueOnce(makeChain([]))           // order links
      .mockReturnValue(makeChain([]));              // receipt links / further

    const res = await request(app)
      .get("/api/admin/invoice-scanner/doc-001/reconciliation")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("diffs");
    expect(res.body).toHaveProperty("summary");
    expect(res.body.summary).toHaveProperty("invoiceTotal");
    expect(Array.isArray(res.body.diffs)).toBe(true);
  });

  // T15 — Reject document
  it("T15: POST /admin/invoice-scanner/:id/reject sets status to rejected", async () => {
    mockDb.select.mockReturnValue(makeChain([MOCK_DOC]));
    mockDb.update.mockReturnValue(makeChain([]));
    mockDb.insert.mockReturnValue(makeChain([]));

    const res = await request(app)
      .post("/api/admin/invoice-scanner/doc-001/reject")
      .set("Authorization", AUTH)
      .send({ reason: "Factura errónea — proveedor incorrecto" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockDb.update).toHaveBeenCalled();
  });
});
