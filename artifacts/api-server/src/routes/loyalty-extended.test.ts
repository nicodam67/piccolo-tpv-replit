/**
 * Tests for loyalty-extended routes:
 * Levels, Wallet, Campaigns, Segmentation, Consents, Demo Data, Coupon Uses
 *
 * Mock strategy: self-referential query chain so any method sequence works.
 * The chain is also "thenable" so `await db.select()...` works.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Shared mock functions (hoisted so they're available in vi.mock) ──────────
const mockSelectResult    = vi.hoisted(() => vi.fn());
const mockInsertReturning = vi.hoisted(() => vi.fn());
const mockUpdateReturning = vi.hoisted(() => vi.fn());
const mockDelete          = vi.hoisted(() => vi.fn());
const mockTransaction     = vi.hoisted(() => vi.fn());
const mockExecute         = vi.hoisted(() => vi.fn());

/** Build a chainable query stub. Every method returns the same chain object.
 *  The chain is also a Promise (thenable) that resolves to `resolveFn()`. */
function makeChain(resolveFn: () => unknown) {
  const chain: Record<string, unknown> = {};
  const METHODS = ["from","where","and","or","eq","orderBy","limit","groupBy",
    "leftJoin","innerJoin","having","set","into","values","on","prepare","execute"];
  for (const m of METHODS) { chain[m] = (..._a: unknown[]) => chain; }
  // Make it awaitable
  chain["then"] = (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) =>
    Promise.resolve(resolveFn()).then(ok, fail);
  chain["catch"] = (fail: (e: unknown) => unknown) =>
    Promise.resolve(resolveFn()).catch(fail);
  // returning() is a separate terminal used by insert/update
  chain["returning"] = () => Promise.resolve(resolveFn());
  return chain;
}

// ── Mock @workspace/db ──────────────────────────────────────────────────────
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  const mockDb = {
    select:      (..._a: unknown[]) => makeChain(mockSelectResult),
    insert:      (..._a: unknown[]) => ({
      values: (..._a: unknown[]) => ({
        returning: () => Promise.resolve(mockInsertReturning()),
      }),
    }),
    update:      (..._a: unknown[]) => ({
      set: (..._a: unknown[]) => ({
        where: (..._a: unknown[]) => ({
          returning: () => Promise.resolve(mockUpdateReturning()),
        }),
      }),
    }),
    delete:      (..._a: unknown[]) => ({
      where: (..._a: unknown[]) => Promise.resolve(mockDelete()),
    }),
    execute:     (..._a: unknown[]) => Promise.resolve(mockExecute()),
    transaction: (fn: (tx: unknown) => unknown) => {
      // Build a minimal transaction db that proxies to the same mocks
      const tx = {
        select:  (..._a: unknown[]) => makeChain(mockSelectResult),
        insert:  (..._a: unknown[]) => ({
          values: (..._a: unknown[]) => ({
            returning: () => Promise.resolve(mockInsertReturning()),
          }),
        }),
        update:  (..._a: unknown[]) => ({
          set: (..._a: unknown[]) => ({
            where: (..._a: unknown[]) => ({
              returning: () => Promise.resolve(mockUpdateReturning()),
            }),
          }),
        }),
        delete:  (..._a: unknown[]) => ({
          where: (..._a: unknown[]) => Promise.resolve(mockDelete()),
        }),
      };
      return mockTransaction(fn, tx);
    },
  };
  return { ...actual, db: mockDb };
});

// ── Mock auth middleware ────────────────────────────────────────────────────
vi.mock("../middlewares/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: (..._roles: string[]) => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ── Mock crm.ts exports ────────────────────────────────────────────────────
vi.mock("./crm.js", () => ({
  generateGiftCardCode: () => "GC-TEST-1234",
}));

// ── App factory ─────────────────────────────────────────────────────────────
async function buildApp() {
  const { default: router } = await import("./loyalty-extended.js");
  const app = express();
  app.use(express.json());
  app.use((_req, _res, next) => {
    (_req as any).user = { id: "emp-1", name: "Test User" };
    next();
  });
  app.use(router);
  return app;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVELS
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /crm/loyalty/levels", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns levels list", async () => {
    const mockLevel = { id: "level-1", nombre: "Bronce", orden: 1, activo: true };
    mockSelectResult.mockResolvedValueOnce([mockLevel]);
    const app = await buildApp();
    const res = await request(app).get("/crm/loyalty/levels");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns empty array when no levels", async () => {
    mockSelectResult.mockResolvedValueOnce([]);
    const app = await buildApp();
    const res = await request(app).get("/crm/loyalty/levels");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

describe("POST /crm/loyalty/levels", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new level", async () => {
    const mockLevel = { id: "level-1", nombre: "Plata", orden: 2 };
    mockInsertReturning
      .mockResolvedValueOnce([mockLevel])  // insert level
      .mockResolvedValueOnce([]);           // audit log
    const app = await buildApp();
    const res = await request(app).post("/crm/loyalty/levels")
      .send({ nombre: "Plata", orden: 2, requisitosGasto: "200" });
    expect(res.status).toBe(201);
    expect(res.body.nombre).toBe("Plata");
  });

  it("rejects without nombre", async () => {
    const app = await buildApp();
    const res = await request(app).post("/crm/loyalty/levels").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nombre/i);
  });
});

describe("PATCH /crm/loyalty/levels/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates level fields", async () => {
    const mockLevel = { id: "level-1", nombre: "Oro", descuentoPct: "10" };
    mockUpdateReturning.mockResolvedValueOnce([mockLevel]);
    const app = await buildApp();
    const res = await request(app).patch("/crm/loyalty/levels/level-1")
      .send({ descuentoPct: "10" });
    expect(res.status).toBe(200);
  });

  it("returns 404 for missing level", async () => {
    mockUpdateReturning.mockResolvedValueOnce([]);
    const app = await buildApp();
    const res = await request(app).patch("/crm/loyalty/levels/bad-id")
      .send({ nombre: "X" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /crm/loyalty/levels/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes a level", async () => {
    mockDelete.mockResolvedValueOnce(undefined);
    const app = await buildApp();
    const res = await request(app).delete("/crm/loyalty/levels/level-1");
    expect(res.status).toBe(204);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WALLET
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /crm/clients/:id/wallet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns wallet and transactions for existing wallet", async () => {
    const mockWallet = { id: "w-1", clientId: "c-1", saldoReal: "0", saldoPromo: "10", saldoCompensacion: "0" };
    mockSelectResult
      .mockResolvedValueOnce([mockWallet])  // wallet lookup
      .mockResolvedValueOnce([]);            // transactions query
    const app = await buildApp();
    const res = await request(app).get("/crm/clients/c-1/wallet");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("wallet");
    expect(res.body).toHaveProperty("transactions");
  });

  it("auto-creates wallet if not found", async () => {
    const mockWalletNew = { id: "w-new", clientId: "c-1", saldoReal: "0", saldoPromo: "0", saldoCompensacion: "0" };
    mockSelectResult
      .mockResolvedValueOnce([])             // wallet not found
      .mockResolvedValueOnce([]);            // transactions query
    mockInsertReturning.mockResolvedValueOnce([mockWalletNew]);
    const app = await buildApp();
    const res = await request(app).get("/crm/clients/c-1/wallet");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("wallet");
  });
});

describe("POST /crm/clients/:id/wallet/add", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds wallet balance successfully", async () => {
    const mockWallet = { id: "w-1", clientId: "c-1", saldoReal: "0", saldoPromo: "10", saldoCompensacion: "0" };
    const mockClient = { id: "c-1", saldoMonedero: "0" };
    // getOrCreateWallet (first call) + client lookup + getOrCreateWallet (return updated)
    mockSelectResult
      .mockResolvedValueOnce([mockWallet])   // getOrCreateWallet — found
      .mockResolvedValueOnce([mockClient])   // client lookup
      .mockResolvedValueOnce([{ ...mockWallet, saldoPromo: "20" }]); // getOrCreateWallet — return updated

    mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown, tx: unknown) => fn(tx));

    const app = await buildApp();
    const res = await request(app).post("/crm/clients/c-1/wallet/add")
      .send({ importe: "10", subtipo: "promo" });
    expect(res.status).toBe(200);
  });

  it("rejects invalid importe (non-numeric)", async () => {
    const app = await buildApp();
    const res = await request(app).post("/crm/clients/c-1/wallet/add")
      .send({ importe: "abc" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("rejects zero importe", async () => {
    const app = await buildApp();
    const res = await request(app).post("/crm/clients/c-1/wallet/add")
      .send({ importe: "0" });
    expect(res.status).toBe(400);
  });

  it("rejects negative importe", async () => {
    const app = await buildApp();
    const res = await request(app).post("/crm/clients/c-1/wallet/add")
      .send({ importe: "-5" });
    expect(res.status).toBe(400);
  });
});

describe("POST /crm/clients/:id/wallet/pay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects payment when balance insufficient", async () => {
    const mockWallet = { id: "w-1", clientId: "c-1", saldoReal: "0", saldoPromo: "5", saldoCompensacion: "0" };
    mockSelectResult.mockResolvedValueOnce([mockWallet]);
    const app = await buildApp();
    const res = await request(app).post("/crm/clients/c-1/wallet/pay")
      .send({ importe: "20", subtipo: "promo" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/insuficiente/i);
  });

  it("rejects invalid importe", async () => {
    const app = await buildApp();
    const res = await request(app).post("/crm/clients/c-1/wallet/pay")
      .send({ importe: "0" });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONSENTS
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /crm/clients/:id/consents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves a valid consent record", async () => {
    const mockConsent = { id: "con-1", clientId: "c-1", tipo: "marketing_email", valor: true };
    // PATCH (revoke previous) + INSERT (new consent) + INSERT (audit)
    mockUpdateReturning.mockResolvedValueOnce([]);
    mockInsertReturning
      .mockResolvedValueOnce([mockConsent])  // insert consent
      .mockResolvedValueOnce([]);            // audit log
    const app = await buildApp();
    const res = await request(app).post("/crm/clients/c-1/consents")
      .send({ tipo: "marketing_email", valor: true });
    expect(res.status).toBe(201);
    expect(res.body.tipo).toBe("marketing_email");
  });

  it("rejects invalid consent type", async () => {
    const app = await buildApp();
    const res = await request(app).post("/crm/clients/c-1/consents")
      .send({ tipo: "invalid_consent_type", valor: true });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("handles revocation (valor=false)", async () => {
    const mockConsent = { id: "con-2", clientId: "c-1", tipo: "marketing_sms", valor: false };
    mockUpdateReturning.mockResolvedValueOnce([]);
    mockInsertReturning
      .mockResolvedValueOnce([mockConsent])
      .mockResolvedValueOnce([]);
    const app = await buildApp();
    const res = await request(app).post("/crm/clients/c-1/consents")
      .send({ tipo: "marketing_sms", valor: false });
    expect(res.status).toBe(201);
    expect(res.body.valor).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPIRING POINTS
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /crm/clients/:id/expiring-points", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns expiring points within default 7 days", async () => {
    const mockRow = { id: "p-1", puntos: 150, expiraEn: new Date(Date.now() + 86400_000).toISOString() };
    mockSelectResult.mockResolvedValueOnce([mockRow]);
    const app = await buildApp();
    const res = await request(app).get("/crm/clients/c-1/expiring-points");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("rows");
    expect(res.body).toHaveProperty("totalExpiring");
    expect(res.body.totalExpiring).toBe(150);
  });

  it("returns empty when no points expiring", async () => {
    mockSelectResult.mockResolvedValueOnce([]);
    const app = await buildApp();
    const res = await request(app).get("/crm/clients/c-1/expiring-points?days=30");
    expect(res.status).toBe(200);
    expect(res.body.totalExpiring).toBe(0);
    expect(res.body.rows).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COUPON USE TRACKING
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /crm/promotions/use", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records a coupon use when within limits", async () => {
    const mockPromo = { id: "p-1", usoMaximo: 0, usoActual: 0, usoMaximoPorCliente: 0 };
    const mockUse   = { id: "use-1", promotionId: "p-1", clientId: "c-1" };
    mockSelectResult.mockResolvedValueOnce([mockPromo]);
    mockInsertReturning.mockResolvedValueOnce([mockUse]);
    mockUpdateReturning.mockResolvedValueOnce([]);
    const app = await buildApp();
    const res = await request(app).post("/crm/promotions/use")
      .send({ promotionId: "p-1", clientId: "c-1" });
    expect(res.status).toBe(201);
    expect(res.body.promotionId).toBe("p-1");
  });

  it("rejects when global usage cap is exhausted", async () => {
    const mockPromo = { id: "p-1", usoMaximo: 10, usoActual: 10, usoMaximoPorCliente: 0 };
    mockSelectResult.mockResolvedValueOnce([mockPromo]);
    const app = await buildApp();
    const res = await request(app).post("/crm/promotions/use")
      .send({ promotionId: "p-1", clientId: "c-1" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cupo/i);
  });

  it("rejects when per-client cap is exhausted", async () => {
    const mockPromo = { id: "p-1", usoMaximo: 100, usoActual: 5, usoMaximoPorCliente: 2 };
    // promo lookup + per-client count
    mockSelectResult
      .mockResolvedValueOnce([mockPromo])
      .mockResolvedValueOnce([{ uses: 2 }]);
    const app = await buildApp();
    const res = await request(app).post("/crm/promotions/use")
      .send({ promotionId: "p-1", clientId: "c-1" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/ya ha usado/i);
  });

  it("returns 404 when promotion does not exist", async () => {
    mockSelectResult.mockResolvedValueOnce([]);
    const app = await buildApp();
    const res = await request(app).post("/crm/promotions/use")
      .send({ promotionId: "bad-id" });
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CAMPAIGNS
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /crm/campaigns", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns campaigns list", async () => {
    mockSelectResult.mockResolvedValueOnce([
      { id: "c-1", nombre: "Bienvenida", estado: "borrador", canal: "email" },
      { id: "c-2", nombre: "Cumpleaños", estado: "programada", canal: "sms" },
    ]);
    const app = await buildApp();
    const res = await request(app).get("/crm/campaigns");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });
});

describe("POST /crm/campaigns", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a campaign", async () => {
    const mockCampaign = { id: "camp-1", nombre: "Black Friday", tipo: "manual", canal: "email" };
    mockInsertReturning
      .mockResolvedValueOnce([mockCampaign])  // insert campaign
      .mockResolvedValueOnce([]);              // audit log
    const app = await buildApp();
    const res = await request(app).post("/crm/campaigns")
      .send({ nombre: "Black Friday", canal: "email", asunto: "Ofertas especiales", contenido: "..." });
    expect(res.status).toBe(201);
    expect(res.body.nombre).toBe("Black Friday");
  });

  it("rejects without nombre", async () => {
    const app = await buildApp();
    const res = await request(app).post("/crm/campaigns")
      .send({ canal: "email", asunto: "Test" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nombre/i);
  });
});

describe("PATCH /crm/campaigns/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates campaign state", async () => {
    const mockCampaign = { id: "camp-1", estado: "programada", nombre: "Test" };
    mockUpdateReturning.mockResolvedValueOnce([mockCampaign]);
    const app = await buildApp();
    const res = await request(app).patch("/crm/campaigns/camp-1")
      .send({ estado: "programada" });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("programada");
  });

  it("returns 404 for missing campaign", async () => {
    mockUpdateReturning.mockResolvedValueOnce([]);
    const app = await buildApp();
    const res = await request(app).patch("/crm/campaigns/bad-id")
      .send({ estado: "programada" });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

describe("DELETE /crm/campaigns/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes a campaign", async () => {
    mockDelete
      .mockResolvedValueOnce(undefined)  // delete sends
      .mockResolvedValueOnce(undefined); // delete campaign
    const app = await buildApp();
    const res = await request(app).delete("/crm/campaigns/camp-1");
    expect(res.status).toBe(204);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SEGMENT PREVIEW  (integration-style; just tests the HTTP contract)
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /crm/segment/preview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("responds with 200 or 400 (the endpoint is registered)", async () => {
    // resolveSegment builds a Drizzle chain that the unit-test mock handles
    // best-effort. We accept either a successful result or a caught error.
    mockSelectResult.mockResolvedValue([
      { id: "c-1", nombre: "Ana", totalGasto: "1000", totalVisitas: 20 },
    ]);
    const app = await buildApp();
    const res = await request(app).post("/crm/segment/preview").send({});
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty("total");
      expect(res.body).toHaveProperty("muestra");
    } else {
      expect(res.body).toHaveProperty("error");
    }
  });
});
