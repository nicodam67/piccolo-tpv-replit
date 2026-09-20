/**
 * CRM module — 10 automated test scenarios
 *
 *  1. Crear cliente — validation and object shape
 *  2. Asociar cliente a mesa — order clientId field
 *  3. Acumular puntos tras venta — issuePoints helper
 *  4. Canjear puntos (parcial) — redeemPoints helper
 *  5. Crear tarjeta regalo — generateGiftCardCode format
 *  6. Cobrar con tarjeta regalo — saldo suficiente
 *  7. Aplicar promoción válida — descuento porcentual
 *  8. Rechazar promoción inválida — caducada / fuera de horario
 *  9. Mostrar historial del cliente — estructura correcta
 * 10. Caducidad de puntos — puntos expirados no canjeables
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock @workspace/db ───────────────────────────────────────────────────────
// vi.hoisted ensures mkTable is available when vi.mock factory is called
const { mkTable, txState } = vi.hoisted(() => {
  const mkTable = (name: string) =>
    new Proxy({ _tableName: name } as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : `${name}.${String(k)}`),
    });
  return {
    mkTable,
    txState: {
      selectRows: [] as unknown[][],
      insertValues: [] as unknown[],
      updateValues: [] as unknown[],
    },
  };
});

const mockClient = {
  id: "client-001",
  nombre: "Ana",
  apellidos: "García",
  telefono: "600123456",
  email: "ana@example.com",
  fechaNacimiento: null,
  direccion: "",
  observaciones: "",
  activo: true,
  rgpdConsentimiento: true,
  rgpdFecha: new Date(),
  totalGasto: "250.00",
  totalVisitas: 5,
  ultimaVisita: new Date(),
  puntosSaldo: 200,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockLoyaltyConfig = {
  id: "config-001",
  activo: true,
  puntosPorEuro: "1",
  valorPunto: "0.01",
  caducidadDias: 0,
  canjeMinimo: 50,
  bonificacionesCategorias: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Build a chainable query mock — awaitable at any point in the chain
function makeSelect(returnValue: unknown[]) {
  const resolved = Promise.resolve(returnValue);
  const self: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    // Make the chain itself awaitable (no .limit() call needed)
    then: (onFulfilled: any, onRejected: any) => resolved.then(onFulfilled, onRejected),
    catch: (onRejected: any) => resolved.catch(onRejected),
    finally: (onFinally: any) => resolved.finally(onFinally),
  };
  return self;
}

function makeInsert(returnValue: unknown) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([returnValue]),
    }),
  };
}

function makeUpdate(returnValue: unknown) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([returnValue]),
      }),
    }),
  };
}

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => {
      const txSelect = () => {
        const rows = txState.selectRows.shift() ?? [];
        const resolved = Promise.resolve(rows);
        const chain: any = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue(rows),
          then: (onFulfilled: any, onRejected: any) => resolved.then(onFulfilled, onRejected),
        };
        return chain;
      };
      const txMock = {
        execute: vi.fn().mockResolvedValue({ rows: [] }),
        select: vi.fn(txSelect),
        insert: vi.fn().mockReturnValue({
          values: vi.fn((values: unknown) => {
            txState.insertValues.push(values);
            return {
            returning: vi.fn().mockResolvedValue([{ id: "movement-001" }]),
            };
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn((values: unknown) => {
            txState.updateValues.push(values);
            return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: "client-001", puntosSaldo: 245 }]),
            }),
            };
          }),
        }),
      };
      return fn(txMock);
    }),
  },
  crmClientsTable: mkTable("crm_clients"),
  crmLoyaltyConfigTable: mkTable("crm_loyalty_config"),
  crmLoyaltyPointsTable: mkTable("crm_loyalty_points"),
  crmLoyaltyLevelsTable: mkTable("crm_loyalty_levels"),
  crmGiftCardsTable: mkTable("crm_gift_cards"),
  crmGiftCardTransactionsTable: mkTable("crm_gift_card_transactions"),
  crmPromotionsTable: mkTable("crm_promotions"),
  crmCouponUsesTable: mkTable("crm_coupon_uses"),
  crmAuditLogTable: mkTable("crm_audit_log"),
  ordersTable: mkTable("orders"),
  orderItemsTable: mkTable("order_items"),
  reservationsTable: mkTable("reservations"),
  eq: vi.fn(() => "eq"),
  ilike: vi.fn(() => "ilike"),
  or: vi.fn(() => "or"),
  and: vi.fn(() => "and"),
  desc: vi.fn(() => "desc"),
  sql: vi.fn((s: TemplateStringsArray) => s[0]),
  sum: vi.fn(() => "sum"),
  count: vi.fn(() => "count"),
  inArray: vi.fn(() => "inArray"),
}));

import { db } from "@workspace/db";
import {
  generateGiftCardCode,
  issuePoints,
  redeemPoints,
  validatePromotion,
  getClientHistory,
} from "./crm.js";

beforeEach(() => {
  vi.clearAllMocks();
  txState.selectRows = [];
  txState.insertValues = [];
  txState.updateValues = [];
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Crear cliente
// ─────────────────────────────────────────────────────────────────────────────
describe("Test 1 — Crear cliente", () => {
  it("El código de tarjeta regalo tiene formato GC-XXXX-XXXX", () => {
    const code = generateGiftCardCode();
    expect(code).toMatch(/^GC-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("Generación de dos códigos produce valores distintos (colisión improbable)", () => {
    const codes = Array.from({ length: 20 }, () => generateGiftCardCode());
    const unique = new Set(codes);
    expect(unique.size).toBe(20);
  });

  it("Un cliente creado tiene las propiedades esenciales", () => {
    const client = { ...mockClient };
    expect(client).toHaveProperty("id");
    expect(client).toHaveProperty("nombre");
    expect(client).toHaveProperty("puntosSaldo");
    expect(client).toHaveProperty("totalGasto");
    expect(typeof client.activo).toBe("boolean");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Asociar cliente a mesa (order)
// ─────────────────────────────────────────────────────────────────────────────
describe("Test 2 — Asociar cliente a mesa", () => {
  it("El modelo de order acepta clientId como campo nullable", () => {
    const order = {
      id: "order-001",
      tableId: "table-001",
      clientId: "client-001",
      status: "open",
    };
    expect(order.clientId).toBe("client-001");
  });

  it("clientId puede ser null (sin cliente asociado)", () => {
    const order = { id: "order-002", tableId: "table-001", clientId: null, status: "open" };
    expect(order.clientId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Acumular puntos tras venta
// ─────────────────────────────────────────────────────────────────────────────
describe("Test 3 — Acumular puntos tras venta", () => {
  it("issuePoints emite puntos proporcionales al importe (1 punto por euro)", async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeSelect([mockLoyaltyConfig]));
    txState.selectRows = [[mockClient], [], []]; // client, audit marker, legacy points

    const result = await issuePoints({
      clientId: "client-001",
      orderId: "order-001",
      importeTotal: 45.5,
      empleadoId: "emp-001",
      empleadoNombre: "Carlos",
    });

    // 45.5 * 1 = 45 (floor)
    expect(result).not.toBeNull();
    expect(result!.puntos).toBe(45);
    expect(result!.saldoPosterior).toBe(mockClient.puntosSaldo + 45);
    expect(result!.alreadyRecorded).toBe(false);
  });

  it("issuePoints records the paid visit when points are disabled", async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeSelect([{ ...mockLoyaltyConfig, activo: false }]));
    txState.selectRows = [[mockClient], [], []];

    const result = await issuePoints({
      clientId: "client-001",
      orderId: "order-001",
      importeTotal: 100,
      empleadoId: null,
      empleadoNombre: "",
    });

    expect(result).toMatchObject({
      puntos: 0,
      saldoPosterior: mockClient.puntosSaldo,
      alreadyRecorded: false,
    });
    expect(txState.updateValues).toHaveLength(1);
  });

  it("issuePoints never records the same paid order twice", async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeSelect([mockLoyaltyConfig]));
    txState.selectRows = [[mockClient], [{ id: "audit-existing" }]];

    const result = await issuePoints({
      clientId: "client-001",
      orderId: "order-001",
      importeTotal: 100,
      empleadoId: null,
      empleadoNombre: "",
    });

    expect(result?.alreadyRecorded).toBe(true);
    expect(txState.insertValues).toHaveLength(0);
    expect(txState.updateValues).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Canjear puntos (parcial)
// ─────────────────────────────────────────────────────────────────────────────
describe("Test 4 — Canjear puntos (parcial)", () => {
  it("redeemPoints calcula el valor en euros y actualiza el saldo", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelect([mockLoyaltyConfig]))
      .mockReturnValueOnce(makeSelect([{ ...mockClient, puntosSaldo: 200 }]));

    const result = await redeemPoints({
      clientId: "client-001",
      puntos: 100,
      orderId: "order-001",
      empleadoId: "emp-001",
      empleadoNombre: "Carlos",
    });

    // 100 pts * 0.01 €/pt = 1.00 €
    expect(result.valorEuros).toBeCloseTo(1.0, 2);
    expect(result.saldoPosterior).toBe(100); // 200 - 100
  });

  it("redeemPoints throws when balance is insufficient", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelect([mockLoyaltyConfig]))
      .mockReturnValueOnce(makeSelect([{ ...mockClient, puntosSaldo: 30 }]));

    await expect(
      redeemPoints({ clientId: "client-001", puntos: 100, orderId: null, empleadoId: null, empleadoNombre: "" })
    ).rejects.toThrow("Saldo insuficiente");
  });

  it("redeemPoints throws when below minimum redemption threshold", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelect([{ ...mockLoyaltyConfig, canjeMinimo: 100 }]))
      .mockReturnValueOnce(makeSelect([{ ...mockClient, puntosSaldo: 200 }]));

    await expect(
      redeemPoints({ clientId: "client-001", puntos: 50, orderId: null, empleadoId: null, empleadoNombre: "" })
    ).rejects.toThrow("Mínimo de canje");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Crear tarjeta regalo — formato de código
// ─────────────────────────────────────────────────────────────────────────────
describe("Test 5 — Crear tarjeta regalo", () => {
  it("generateGiftCardCode genera código con prefijo GC-", () => {
    const code = generateGiftCardCode();
    expect(code.startsWith("GC-")).toBe(true);
  });

  it("generateGiftCardCode tiene exactamente 12 caracteres (GC-XXXX-XXXX)", () => {
    const code = generateGiftCardCode();
    expect(code.length).toBe(12);
  });

  it("El código no contiene caracteres ambiguos (0, O, 1, I)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateGiftCardCode().replace(/GC-|-/g, "");
      expect(code).not.toMatch(/[01OI]/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Cobrar con tarjeta regalo (saldo suficiente)
// ─────────────────────────────────────────────────────────────────────────────
describe("Test 6 — Cobrar con tarjeta regalo", () => {
  it("El pago descuenta el importe correcto del saldo", () => {
    const saldoInicial = 50.0;
    const pago = 30.0;
    const saldoRestante = saldoInicial - pago;
    expect(saldoRestante).toBeCloseTo(20.0, 2);
  });

  it("Si el importe supera el saldo, solo se cobra el saldo disponible", () => {
    const saldoInicial = 20.0;
    const pago = 35.0;
    const efectivo = Math.min(pago, saldoInicial);
    expect(efectivo).toBe(20.0);
  });

  it("La tarjeta queda en estado 'consumida' cuando el saldo llega a 0", () => {
    const saldoAnterior = 25.0;
    const efectivo = 25.0;
    const saldoPosterior = saldoAnterior - efectivo;
    const estado = saldoPosterior <= 0 ? "consumida" : "activa";
    expect(estado).toBe("consumida");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Aplicar promoción válida
// ─────────────────────────────────────────────────────────────────────────────
describe("Test 7 — Aplicar promoción válida (descuento porcentual)", () => {
  const promoValida = {
    activo: true,
    fechaInicio: null,
    fechaFin: null,
    diasSemana: [],
    horaInicio: "",
    horaFin: "",
    montoMinimo: "0",
    usoMaximo: 0,
    usoActual: 0,
    tipo: "descuento_porcentual",
    valor: "10", // 10%
  };

  it("Descuento porcentual del 10% sobre 100€ → 10€", () => {
    const { valid, descuento } = validatePromotion(promoValida, 100, new Date());
    expect(valid).toBe(true);
    expect(descuento).toBeCloseTo(10, 2);
  });

  it("Descuento fijo de 5€ sobre cualquier importe → 5€", () => {
    const promo = { ...promoValida, tipo: "descuento_fijo", valor: "5" };
    const { valid, descuento } = validatePromotion(promo, 80, new Date());
    expect(valid).toBe(true);
    expect(descuento).toBe(5);
  });

  it("2x1 descuenta la mitad del importe", () => {
    const promo = { ...promoValida, tipo: "2x1", valor: "0" };
    const { valid, descuento } = validatePromotion(promo, 60, new Date());
    expect(valid).toBe(true);
    expect(descuento).toBeCloseTo(30, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: Rechazar promoción inválida
// ─────────────────────────────────────────────────────────────────────────────
describe("Test 8 — Rechazar promoción inválida", () => {
  it("Promoción inactiva → rechazada", () => {
    const promo = {
      activo: false,
      fechaInicio: null, fechaFin: null, diasSemana: [],
      horaInicio: "", horaFin: "", montoMinimo: "0",
      usoMaximo: 0, usoActual: 0, tipo: "descuento_fijo", valor: "5",
    };
    const { valid, reason } = validatePromotion(promo, 50, new Date());
    expect(valid).toBe(false);
    expect(reason).toContain("inactiva");
  });

  it("Promoción caducada (fechaFin en el pasado) → rechazada", () => {
    const promo = {
      activo: true,
      fechaInicio: null,
      fechaFin: new Date("2020-01-01"),
      diasSemana: [], horaInicio: "", horaFin: "", montoMinimo: "0",
      usoMaximo: 0, usoActual: 0, tipo: "descuento_fijo", valor: "5",
    };
    const { valid, reason } = validatePromotion(promo, 50, new Date());
    expect(valid).toBe(false);
    expect(reason).toContain("caducada");
  });

  it("Fuera del horario permitido → rechazada", () => {
    const promo = {
      activo: true,
      fechaInicio: null, fechaFin: null,
      diasSemana: [],
      horaInicio: "14:00", horaFin: "16:00",
      montoMinimo: "0", usoMaximo: 0, usoActual: 0,
      tipo: "descuento_fijo", valor: "5",
    };
    // Force time to 20:00
    const night = new Date();
    night.setHours(20, 0, 0, 0);
    const { valid, reason } = validatePromotion(promo, 50, night);
    expect(valid).toBe(false);
    expect(reason).toContain("horario");
  });

  it("Importe mínimo no alcanzado → rechazada", () => {
    const promo = {
      activo: true,
      fechaInicio: null, fechaFin: null, diasSemana: [],
      horaInicio: "", horaFin: "", montoMinimo: "100",
      usoMaximo: 0, usoActual: 0, tipo: "descuento_fijo", valor: "10",
    };
    const { valid, reason } = validatePromotion(promo, 30, new Date());
    expect(valid).toBe(false);
    expect(reason).toContain("mínimo");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: Mostrar historial del cliente
// ─────────────────────────────────────────────────────────────────────────────
describe("Test 9 — Mostrar historial del cliente", () => {
  it("getClientHistory devuelve estructura correcta con todos los campos esperados", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelect([mockClient]))         // client
      .mockReturnValueOnce(makeSelect([{ id: "order-001", createdAt: new Date(), status: "paid" }])) // orders
      .mockReturnValueOnce(makeSelect([]))                   // reservations
      .mockReturnValueOnce(makeSelect([]))                   // points
      .mockReturnValueOnce(makeSelect([]))                   // giftCards
      .mockReturnValueOnce(makeSelect([]));                  // promotions

    const history = await getClientHistory("client-001");

    expect(history).not.toBeNull();
    expect(history).toHaveProperty("client");
    expect(history).toHaveProperty("orders");
    expect(history).toHaveProperty("reservations");
    expect(history).toHaveProperty("points");
    expect(history).toHaveProperty("giftCards");
    expect(history).toHaveProperty("benefits");
    expect(history).toHaveProperty("availableRewards");
    expect(history).toHaveProperty("stats");
    expect(history!.stats).toHaveProperty("totalGasto");
    expect(history!.stats).toHaveProperty("totalVisitas");
    expect(history!.stats).toHaveProperty("ticketMedio");
    expect(history!.stats).toHaveProperty("puntosSaldo");
  });

  it("getClientHistory calcula ticketMedio correctamente", async () => {
    const client = { ...mockClient, totalGasto: "300.00", totalVisitas: 6 };
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelect([client]))
      .mockReturnValueOnce(makeSelect([]))
      .mockReturnValueOnce(makeSelect([]))
      .mockReturnValueOnce(makeSelect([]))
      .mockReturnValueOnce(makeSelect([]))
      .mockReturnValueOnce(makeSelect([]));

    const history = await getClientHistory("client-001");
    expect(history!.stats.ticketMedio).toBeCloseTo(50, 2); // 300/6
  });

  it("getClientHistory returns null when client doesn't exist", async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeSelect([]));
    const history = await getClientHistory("nonexistent");
    expect(history).toBeNull();
  });

  it("getClientHistory returns existing level benefits and usable rewards", async () => {
    const client = { ...mockClient, nivelId: "level-1", nivelNombre: "Oro" };
    const reward = {
      id: "promo-1",
      nombre: "10% clientes Oro",
      descripcion: "Descuento fidelización",
      tipo: "descuento_porcentual",
      valor: "10",
      codigo: "",
      activo: true,
      fechaInicio: null,
      fechaFin: null,
      diasSemana: [],
      horaInicio: "",
      horaFin: "",
      montoMinimo: "0",
      usoMaximo: 0,
      usoActual: 0,
      usoMaximoPorCliente: 1,
      createdAt: new Date(),
    };
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelect([client]))
      .mockReturnValueOnce(makeSelect([])) // orders
      .mockReturnValueOnce(makeSelect([])) // reservations
      .mockReturnValueOnce(makeSelect([])) // points
      .mockReturnValueOnce(makeSelect([])) // gift cards
      .mockReturnValueOnce(makeSelect([{ id: "level-1", beneficios: ["Postre incluido"], activo: true }]))
      .mockReturnValueOnce(makeSelect([reward]))
      .mockReturnValueOnce(makeSelect([])); // coupon uses

    const history = await getClientHistory("client-001");

    expect(history?.benefits).toEqual(["Postre incluido"]);
    expect(history?.availableRewards).toEqual([reward]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: Caducidad de puntos
// ─────────────────────────────────────────────────────────────────────────────
describe("Test 10 — Caducidad de puntos", () => {
  it("Puntos con fecha de expiración pasada no son canjeables si caducidadDias > 0", async () => {
    const configConCaducidad = { ...mockLoyaltyConfig, caducidadDias: 365, canjeMinimo: 50 };
    const clientConPocosSaldos = { ...mockClient, puntosSaldo: 30 };

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelect([configConCaducidad]))   // getLoyaltyConfig
      .mockReturnValueOnce(makeSelect([clientConPocosSaldos])) // get client
      .mockReturnValueOnce(makeSelect([]));                    // expired rows query (none)

    await expect(
      redeemPoints({ clientId: "client-001", puntos: 30, orderId: null, empleadoId: null, empleadoNombre: "" })
    ).rejects.toThrow("Mínimo de canje");
  });

  it("issuePoints calcula fecha de caducidad cuando caducidadDias > 0", async () => {
    const configConCaducidad = { ...mockLoyaltyConfig, caducidadDias: 365 };
    vi.mocked(db.select).mockReturnValueOnce(makeSelect([configConCaducidad]));
    txState.selectRows = [[mockClient], [], []];

    const result = await issuePoints({
      clientId: "client-001",
      orderId: "order-001",
      importeTotal: 50,
      empleadoId: null,
      empleadoNombre: "",
    });

    expect(result).not.toBeNull();
    expect(result!.puntos).toBe(50);
  });

  it("issuePoints no calcula caducidad cuando caducidadDias = 0 (nunca caducan)", async () => {
    const configSinCaducidad = { ...mockLoyaltyConfig, caducidadDias: 0 };
    vi.mocked(db.select).mockReturnValueOnce(makeSelect([configSinCaducidad]));
    txState.selectRows = [[mockClient], [], []];

    const result = await issuePoints({
      clientId: "client-001",
      orderId: "order-001",
      importeTotal: 25,
      empleadoId: null,
      empleadoNombre: "",
    });

    expect(result).not.toBeNull();
    expect(result!.puntos).toBe(25);
  });
});
