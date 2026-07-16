/**
 * CRM module — Clientes, Fidelización, Tarjetas Regalo, Promociones, Informes
 *
 * Route prefix: all paths are WITHOUT /api (Express strips the prefix).
 *
 * Permission model:
 *  - camarero / waiter: read clients, associate client to order, pay with gift card, redeem points
 *  - encargado / manager: + promotions CRUD, gift card create/recharge/block, issue points
 *  - admin: everything + delete promotions, reports, audit
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  crmClientsTable,
  crmLoyaltyConfigTable,
  crmLoyaltyPointsTable,
  crmGiftCardsTable,
  crmGiftCardTransactionsTable,
  crmPromotionsTable,
  crmAuditLogTable,
  ordersTable,
  orderItemsTable,
  reservationsTable,
} from "@workspace/db";
import { eq, ilike, or, desc, and, sql, sum, count } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Generate a human-readable gift card code: GC-XXXX-XXXX */
export function generateGiftCardCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `GC-${seg(4)}-${seg(4)}`;
}

/** Get or create the loyalty config row (singleton) */
async function getLoyaltyConfig() {
  const rows = await db.select().from(crmLoyaltyConfigTable).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db.insert(crmLoyaltyConfigTable).values({}).returning();
  return created;
}

/**
 * Issue loyalty points to a client for a sale.
 * Returns the points movement row, or null if loyalty is disabled.
 */
export async function issuePoints(params: {
  clientId: string;
  orderId: string;
  importeTotal: number;
  empleadoId: string | null;
  empleadoNombre: string;
}): Promise<{ puntos: number; saldoPosterior: number } | null> {
  const config = await getLoyaltyConfig();
  if (!config.activo) return null;

  const puntosPorEuro = parseFloat(config.puntosPorEuro);
  const puntos = Math.floor(params.importeTotal * puntosPorEuro);
  if (puntos <= 0) return null;

  const [client] = await db.select().from(crmClientsTable).where(eq(crmClientsTable.id, params.clientId));
  if (!client) return null;

  const saldoAnterior = client.puntosSaldo;
  const saldoPosterior = saldoAnterior + puntos;

  const expiraEn: Date | null =
    config.caducidadDias > 0
      ? new Date(Date.now() + config.caducidadDias * 86400 * 1000)
      : null;

  await db.transaction(async (tx) => {
    await tx.insert(crmLoyaltyPointsTable).values({
      clientId: params.clientId,
      tipo: "emision",
      puntos,
      saldoAnterior,
      saldoPosterior,
      descripcion: `Venta: +${puntos} pts`,
      orderId: params.orderId,
      empleadoId: params.empleadoId,
      empleadoNombre: params.empleadoNombre,
      expiraEn,
    });
    await tx
      .update(crmClientsTable)
      .set({
        puntosSaldo: saldoPosterior,
        totalVisitas: sql`${crmClientsTable.totalVisitas} + 1`,
        ultimaVisita: new Date(),
        totalGasto: sql`${crmClientsTable.totalGasto} + ${params.importeTotal}`,
        updatedAt: new Date(),
      })
      .where(eq(crmClientsTable.id, params.clientId));
  });

  return { puntos, saldoPosterior };
}

/**
 * Redeem loyalty points from a client.
 * Returns the monetary value redeemed, or throws on insufficient balance.
 */
export async function redeemPoints(params: {
  clientId: string;
  puntos: number;
  orderId: string | null;
  empleadoId: string | null;
  empleadoNombre: string;
}): Promise<{ valorEuros: number; saldoPosterior: number }> {
  const config = await getLoyaltyConfig();
  const valorPunto = parseFloat(config.valorPunto);

  const [client] = await db.select().from(crmClientsTable).where(eq(crmClientsTable.id, params.clientId));
  if (!client) throw new Error("Cliente no encontrado");

  // Step 1: Atomically expire overdue point movements and recalculate the
  // effective spendable balance BEFORE doing any threshold checks. This
  // prevents expired points from remaining redeemable via the stored counter.
  let effectiveSaldo = client.puntosSaldo;
  if (config.caducidadDias > 0) {
    const expiredRows = await db
      .select({ id: crmLoyaltyPointsTable.id, puntos: crmLoyaltyPointsTable.puntos })
      .from(crmLoyaltyPointsTable)
      .where(
        and(
          eq(crmLoyaltyPointsTable.clientId, params.clientId),
          eq(crmLoyaltyPointsTable.tipo, "emision"),
          sql`${crmLoyaltyPointsTable.expiraEn} IS NOT NULL AND ${crmLoyaltyPointsTable.expiraEn} < NOW()`,
        ),
      );

    if (expiredRows.length > 0) {
      const expiredPuntos = expiredRows.reduce((s, r) => s + r.puntos, 0);
      effectiveSaldo = Math.max(0, client.puntosSaldo - expiredPuntos);
      await db.transaction(async (tx) => {
        await tx
          .update(crmLoyaltyPointsTable)
          .set({ tipo: "expiracion" } as any)
          .where(
            and(
              eq(crmLoyaltyPointsTable.clientId, params.clientId),
              eq(crmLoyaltyPointsTable.tipo, "emision"),
              sql`${crmLoyaltyPointsTable.expiraEn} IS NOT NULL AND ${crmLoyaltyPointsTable.expiraEn} < NOW()`,
            ),
          );
        await tx
          .update(crmClientsTable)
          .set({ puntosSaldo: effectiveSaldo, updatedAt: new Date() })
          .where(eq(crmClientsTable.id, params.clientId));
      });
    }
  }

  // Step 2: Validate minimum and balance against effective (non-expired) saldo
  if (params.puntos < config.canjeMinimo)
    throw new Error(`Mínimo de canje: ${config.canjeMinimo} puntos`);

  if (effectiveSaldo < params.puntos)
    throw new Error(`Saldo insuficiente: ${effectiveSaldo} pts disponibles`);

  const saldoAnterior = effectiveSaldo;
  const saldoPosterior = saldoAnterior - params.puntos;
  const valorEuros = parseFloat((params.puntos * valorPunto).toFixed(2));

  await db.transaction(async (tx) => {
    await tx.insert(crmLoyaltyPointsTable).values({
      clientId: params.clientId,
      tipo: "canje",
      puntos: -params.puntos,
      saldoAnterior,
      saldoPosterior,
      descripcion: `Canje: -${params.puntos} pts (${valorEuros}€)`,
      orderId: params.orderId,
      empleadoId: params.empleadoId,
      empleadoNombre: params.empleadoNombre,
    });
    await tx
      .update(crmClientsTable)
      .set({ puntosSaldo: saldoPosterior, updatedAt: new Date() })
      .where(eq(crmClientsTable.id, params.clientId));
  });

  return { valorEuros, saldoPosterior };
}

/**
 * Validate whether a promotion is currently applicable.
 * Returns { valid, reason, descuento }
 */
export function validatePromotion(
  promo: { activo: boolean; fechaInicio: Date | null; fechaFin: Date | null; diasSemana: unknown; horaInicio: string; horaFin: string; montoMinimo: string; usoMaximo: number; usoActual: number; tipo: string; valor: string },
  orderAmount: number,
  now: Date = new Date(),
): { valid: boolean; reason?: string; descuento: number } {
  if (!promo.activo) return { valid: false, reason: "Promoción inactiva", descuento: 0 };

  if (promo.fechaInicio && now < promo.fechaInicio)
    return { valid: false, reason: "Promoción no iniciada", descuento: 0 };

  if (promo.fechaFin && now > promo.fechaFin)
    return { valid: false, reason: "Promoción caducada", descuento: 0 };

  const dias = (promo.diasSemana as number[] | null) ?? [];
  if (dias.length > 0 && !dias.includes(now.getDay()))
    return { valid: false, reason: "Fuera del horario de días permitidos", descuento: 0 };

  if (promo.horaInicio && promo.horaFin) {
    const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const current = hhmm(now);
    if (current < promo.horaInicio || current > promo.horaFin)
      return { valid: false, reason: "Fuera del horario permitido", descuento: 0 };
  }

  if (orderAmount < parseFloat(promo.montoMinimo))
    return { valid: false, reason: `Importe mínimo requerido: ${promo.montoMinimo}€`, descuento: 0 };

  if (promo.usoMaximo > 0 && promo.usoActual >= promo.usoMaximo)
    return { valid: false, reason: "Cupo de usos agotado", descuento: 0 };

  let descuento = 0;
  if (promo.tipo === "descuento_fijo") descuento = parseFloat(promo.valor);
  else if (promo.tipo === "descuento_porcentual") descuento = parseFloat(((orderAmount * parseFloat(promo.valor)) / 100).toFixed(2));
  else if (promo.tipo === "2x1") descuento = parseFloat((orderAmount / 2).toFixed(2));

  return { valid: true, descuento };
}

/** Get aggregated client history */
export async function getClientHistory(clientId: string) {
  const [client] = await db.select().from(crmClientsTable).where(eq(crmClientsTable.id, clientId));
  if (!client) return null;

  const orders = await db
    .select({
      id: ordersTable.id,
      createdAt: ordersTable.createdAt,
      status: ordersTable.status,
    })
    .from(ordersTable)
    .where(and(eq(ordersTable.clientId, clientId), eq(ordersTable.status, "paid")))
    .orderBy(desc(ordersTable.createdAt))
    .limit(20);

  const reservations = await db
    .select()
    .from(reservationsTable)
    .where(eq(reservationsTable.telefono, client.telefono || "__no_phone__"))
    .orderBy(desc(reservationsTable.createdAt))
    .limit(10);

  const points = await db
    .select()
    .from(crmLoyaltyPointsTable)
    .where(eq(crmLoyaltyPointsTable.clientId, clientId))
    .orderBy(desc(crmLoyaltyPointsTable.createdAt))
    .limit(20);

  const giftCards = await db
    .select()
    .from(crmGiftCardsTable)
    .where(eq(crmGiftCardsTable.clientId, clientId))
    .orderBy(desc(crmGiftCardsTable.createdAt))
    .limit(10);

  const ticketMedio =
    client.totalVisitas > 0
      ? parseFloat((parseFloat(client.totalGasto) / client.totalVisitas).toFixed(2))
      : 0;

  return {
    client,
    orders,
    reservations,
    points,
    giftCards,
    stats: {
      totalGasto: parseFloat(client.totalGasto),
      totalVisitas: client.totalVisitas,
      ticketMedio,
      puntosSaldo: client.puntosSaldo,
      ultimaVisita: client.ultimaVisita,
    },
  };
}

// ─── CRM Audit Helper ────────────────────────────────────────────────────────

async function logCrmAudit(params: {
  accion: string;
  clientId?: string | null;
  entidadTipo?: string;
  entidadId?: string | null;
  empleadoId?: string | null;
  empleadoNombre?: string;
  terminal?: string;
  datos?: unknown;
}) {
  try {
    await db.insert(crmAuditLogTable).values({
      accion: params.accion,
      clientId: params.clientId ?? null,
      entidadTipo: params.entidadTipo ?? "",
      entidadId: params.entidadId ?? null,
      empleadoId: params.empleadoId ?? null,
      empleadoNombre: params.empleadoNombre ?? "",
      terminal: params.terminal ?? "",
      datos: params.datos ?? null,
    });
  } catch { /* audit failure must not break main operation */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════════════

// Roles that can access any CRM customer data or point-of-sale operations
const CRM_STAFF = ["waiter", "cashier", "manager", "admin"] as const;

// GET /crm/clients?q=...
router.get("/crm/clients", requireAuth, requireRole(...CRM_STAFF), async (req, res): Promise<void> => {
  const q = (req.query.q as string | undefined)?.trim() ?? "";
  const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);

  const rows = q
    ? await db
        .select()
        .from(crmClientsTable)
        .where(
          and(
            eq(crmClientsTable.activo, true),
            or(
              ilike(crmClientsTable.nombre, `%${q}%`),
              ilike(crmClientsTable.apellidos, `%${q}%`),
              ilike(crmClientsTable.telefono, `%${q}%`),
              ilike(crmClientsTable.email, `%${q}%`),
            ),
          ),
        )
        .orderBy(crmClientsTable.nombre)
        .limit(limit)
    : await db
        .select()
        .from(crmClientsTable)
        .orderBy(desc(crmClientsTable.updatedAt))
        .limit(limit);

  res.json(rows);
});

// POST /crm/clients
router.post("/crm/clients", requireAuth, requireRole(...CRM_STAFF), async (req, res): Promise<void> => {
  const { nombre, apellidos, telefono, email, fechaNacimiento, direccion, observaciones, rgpdConsentimiento } =
    req.body as Record<string, string | boolean | undefined>;

  if (!nombre || String(nombre).trim() === "") {
    res.status(400).json({ error: "El nombre es obligatorio" });
    return;
  }

  // Duplicate check by phone or email
  const tel = String(telefono ?? "").trim();
  const mail = String(email ?? "").trim();
  if (tel || mail) {
    const dupeConditions = [];
    if (tel) dupeConditions.push(eq(crmClientsTable.telefono, tel));
    if (mail) dupeConditions.push(eq(crmClientsTable.email, mail));
    const [dupe] = await db
      .select({ id: crmClientsTable.id, nombre: crmClientsTable.nombre })
      .from(crmClientsTable)
      .where(or(...dupeConditions))
      .limit(1);
    if (dupe) {
      res.status(409).json({ error: `Ya existe un cliente con ese teléfono o email (${dupe.nombre})`, clienteExistente: dupe });
      return;
    }
  }

  // Generate unique QR token
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const qrToken = `CL-${seg(4)}-${seg(4)}`;

  // Get next customer number from sequence
  const seqResult = await db.execute(sql`SELECT nextval('crm_num_cliente_seq') as n`);
  const numCliente = Number(seqResult.rows[0]?.n ?? 1000);

  const [client] = await db
    .insert(crmClientsTable)
    .values({
      nombre: String(nombre).trim(),
      apellidos: String(apellidos ?? ""),
      telefono: tel,
      email: mail,
      fechaNacimiento: fechaNacimiento ? String(fechaNacimiento) : null,
      direccion: String(direccion ?? ""),
      observaciones: String(observaciones ?? ""),
      rgpdConsentimiento: Boolean(rgpdConsentimiento),
      rgpdFecha: rgpdConsentimiento ? new Date() : null,
      qrToken,
      numCliente,
    })
    .returning();

  await logCrmAudit({
    accion: "crear_cliente",
    clientId: client.id,
    entidadTipo: "crm_clients",
    entidadId: client.id,
    empleadoId: (req as any).user?.id,
    empleadoNombre: (req as any).user?.name ?? "",
    datos: { nombre: client.nombre },
  });

  res.status(201).json(client);
});

// GET /crm/clients/:id
router.get("/crm/clients/:id", requireAuth, requireRole(...CRM_STAFF), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [client] = await db.select().from(crmClientsTable).where(eq(crmClientsTable.id, id));
  if (!client) { res.status(404).json({ error: "Cliente no encontrado" }); return; }
  res.json(client);
});

// PATCH /crm/clients/:id
router.patch("/crm/clients/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const allowed = ["nombre", "apellidos", "telefono", "email", "fechaNacimiento", "direccion", "observaciones", "activo", "rgpdConsentimiento"];
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (req.body.rgpdConsentimiento === true && !req.body.rgpdFecha) {
    updates.rgpdFecha = new Date();
  }

  const [client] = await db
    .update(crmClientsTable)
    .set(updates as any)
    .where(eq(crmClientsTable.id, id))
    .returning();

  if (!client) { res.status(404).json({ error: "Cliente no encontrado" }); return; }

  await logCrmAudit({
    accion: "actualizar_cliente",
    clientId: id,
    entidadTipo: "crm_clients",
    entidadId: id,
    empleadoId: (req as any).user?.id,
    empleadoNombre: (req as any).user?.name ?? "",
    datos: updates,
  });

  res.json(client);
});

// GET /crm/clients/:id/history
router.get("/crm/clients/:id/history", requireAuth, requireRole(...CRM_STAFF), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const history = await getClientHistory(id);
  if (!history) { res.status(404).json({ error: "Cliente no encontrado" }); return; }
  res.json(history);
});

// PATCH /orders/:orderId/client — associate a client to an order
router.patch("/orders/:orderId/client", requireAuth, requireRole(...CRM_STAFF), async (req, res): Promise<void> => {
  const orderId = req.params.orderId as string;
  const { clientId } = req.body as { clientId: string | null };

  const [order] = await db
    .update(ordersTable)
    .set({ clientId: clientId ?? null } as any)
    .where(eq(ordersTable.id, orderId))
    .returning();

  if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }

  res.json({ orderId: order.id, clientId: order.clientId });
});

// ═══════════════════════════════════════════════════════════════════════════
// LOYALTY CONFIG
// ═══════════════════════════════════════════════════════════════════════════

// GET /crm/loyalty/config
router.get("/crm/loyalty/config", requireAuth, requireRole("manager", "admin"), async (_req, res): Promise<void> => {
  const config = await getLoyaltyConfig();
  res.json(config);
});

// PUT /crm/loyalty/config
router.put("/crm/loyalty/config", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const config = await getLoyaltyConfig();
  const allowed = ["activo", "puntosPorEuro", "valorPunto", "caducidadDias", "canjeMinimo", "bonificacionesCategorias"];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const [updated] = await db
    .update(crmLoyaltyConfigTable)
    .set(updates as any)
    .where(eq(crmLoyaltyConfigTable.id, config.id))
    .returning();
  res.json(updated);
});

// ═══════════════════════════════════════════════════════════════════════════
// LOYALTY POINTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /crm/clients/:id/points
router.get("/crm/clients/:id/points", requireAuth, requireRole(...CRM_STAFF), async (req, res): Promise<void> => {
  const clientId = req.params.id as string;
  const rows = await db
    .select()
    .from(crmLoyaltyPointsTable)
    .where(eq(crmLoyaltyPointsTable.clientId, clientId))
    .orderBy(desc(crmLoyaltyPointsTable.createdAt))
    .limit(100);
  res.json(rows);
});

// POST /crm/clients/:id/points/issue  — manual positive adjustment
router.post("/crm/clients/:id/points/issue", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const clientId = req.params.id as string;
  const { puntos, descripcion } = req.body as { puntos: number; descripcion?: string };

  if (!puntos || puntos <= 0) { res.status(400).json({ error: "Puntos debe ser positivo" }); return; }

  const [client] = await db.select().from(crmClientsTable).where(eq(crmClientsTable.id, clientId));
  if (!client) { res.status(404).json({ error: "Cliente no encontrado" }); return; }

  const saldoAnterior = client.puntosSaldo;
  const saldoPosterior = saldoAnterior + Math.floor(puntos);

  const [movement] = await db.transaction(async (tx) => {
    const [m] = await tx.insert(crmLoyaltyPointsTable).values({
      clientId,
      tipo: "ajuste_positivo",
      puntos: Math.floor(puntos),
      saldoAnterior,
      saldoPosterior,
      descripcion: descripcion ?? "Ajuste manual",
      empleadoId: (req as any).user?.id ?? null,
      empleadoNombre: (req as any).user?.name ?? "",
    }).returning();
    await tx.update(crmClientsTable).set({ puntosSaldo: saldoPosterior, updatedAt: new Date() }).where(eq(crmClientsTable.id, clientId));
    return [m];
  });

  await logCrmAudit({ accion: "emitir_puntos", clientId, entidadTipo: "crm_loyalty_points", entidadId: movement.id, empleadoId: (req as any).user?.id, empleadoNombre: (req as any).user?.name ?? "", datos: { puntos } });
  res.status(201).json(movement);
});

// POST /crm/clients/:id/points/redeem
router.post("/crm/clients/:id/points/redeem", requireAuth, requireRole(...CRM_STAFF), async (req, res): Promise<void> => {
  const clientId = req.params.id as string;
  const { puntos, orderId } = req.body as { puntos: number; orderId?: string };

  if (!puntos || puntos <= 0) { res.status(400).json({ error: "Puntos debe ser positivo" }); return; }

  try {
    const result = await redeemPoints({
      clientId,
      puntos: Math.floor(puntos),
      orderId: orderId ?? null,
      empleadoId: (req as any).user?.id ?? null,
      empleadoNombre: (req as any).user?.name ?? "",
    });
    await logCrmAudit({ accion: "canjear_puntos", clientId, empleadoId: (req as any).user?.id, empleadoNombre: (req as any).user?.name ?? "", datos: { puntos, valorEuros: result.valorEuros } });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GIFT CARDS
// ═══════════════════════════════════════════════════════════════════════════

// GET /crm/gift-cards?q=...
router.get("/crm/gift-cards", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const q = (req.query.q as string | undefined)?.trim();
  const rows = q
    ? await db.select().from(crmGiftCardsTable).where(ilike(crmGiftCardsTable.codigo, `%${q}%`)).orderBy(desc(crmGiftCardsTable.createdAt)).limit(50)
    : await db.select().from(crmGiftCardsTable).orderBy(desc(crmGiftCardsTable.createdAt)).limit(100);
  res.json(rows);
});

// POST /crm/gift-cards — create
router.post("/crm/gift-cards", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { saldo, clientId, fechaCaducidad, notas } = req.body as {
    saldo: string; clientId?: string; fechaCaducidad?: string; notas?: string;
  };
  const saldoNum = parseFloat(saldo);
  if (isNaN(saldoNum) || saldoNum <= 0) { res.status(400).json({ error: "Saldo inválido" }); return; }

  // Generate unique code
  let codigo = generateGiftCardCode();
  let attempts = 0;
  while (attempts < 10) {
    const [existing] = await db.select({ id: crmGiftCardsTable.id }).from(crmGiftCardsTable).where(eq(crmGiftCardsTable.codigo, codigo)).limit(1);
    if (!existing) break;
    codigo = generateGiftCardCode();
    attempts++;
  }

  const [card] = await db.transaction(async (tx) => {
    const [c] = await tx.insert(crmGiftCardsTable).values({
      codigo,
      saldoInicial: String(saldoNum),
      saldoActual: String(saldoNum),
      clientId: clientId ?? null,
      fechaCaducidad: fechaCaducidad ? new Date(fechaCaducidad) : null,
      notas: notas ?? "",
      empleadoId: (req as any).user?.id ?? null,
      empleadoNombre: (req as any).user?.name ?? "",
    }).returning();

    await tx.insert(crmGiftCardTransactionsTable).values({
      giftCardId: c.id,
      tipo: "emision",
      importe: String(saldoNum),
      saldoAnterior: "0",
      saldoPosterior: String(saldoNum),
      empleadoId: (req as any).user?.id ?? null,
      empleadoNombre: (req as any).user?.name ?? "",
    });
    return [c];
  });

  await logCrmAudit({ accion: "crear_tarjeta_regalo", clientId: clientId ?? null, entidadTipo: "crm_gift_cards", entidadId: card.id, empleadoId: (req as any).user?.id, empleadoNombre: (req as any).user?.name ?? "", datos: { codigo, saldo: saldoNum } });
  res.status(201).json(card);
});

// GET /crm/gift-cards/lookup?codigo=...  — check balance (waiter+ at POS)
router.get("/crm/gift-cards/lookup", requireAuth, requireRole(...CRM_STAFF), async (req, res): Promise<void> => {
  const codigo = (req.query.codigo as string | undefined)?.trim().toUpperCase();
  if (!codigo) { res.status(400).json({ error: "Código requerido" }); return; }
  const [card] = await db.select().from(crmGiftCardsTable).where(eq(crmGiftCardsTable.codigo, codigo)).limit(1);
  if (!card) { res.status(404).json({ error: "Tarjeta no encontrada" }); return; }
  res.json(card);
});

// GET /crm/gift-cards/:id
router.get("/crm/gift-cards/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [card] = await db.select().from(crmGiftCardsTable).where(eq(crmGiftCardsTable.id, id));
  if (!card) { res.status(404).json({ error: "Tarjeta no encontrada" }); return; }
  const txns = await db.select().from(crmGiftCardTransactionsTable).where(eq(crmGiftCardTransactionsTable.giftCardId, id)).orderBy(desc(crmGiftCardTransactionsTable.createdAt)).limit(50);
  res.json({ card, transactions: txns });
});

// POST /crm/gift-cards/:id/recharge
router.post("/crm/gift-cards/:id/recharge", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { importe } = req.body as { importe: string };
  const importeNum = parseFloat(importe);
  if (isNaN(importeNum) || importeNum <= 0) { res.status(400).json({ error: "Importe inválido" }); return; }

  const [card] = await db.select().from(crmGiftCardsTable).where(eq(crmGiftCardsTable.id, id));
  if (!card) { res.status(404).json({ error: "Tarjeta no encontrada" }); return; }
  if (card.estado === "bloqueada") { res.status(409).json({ error: "Tarjeta bloqueada" }); return; }

  const saldoAnterior = parseFloat(card.saldoActual);
  const saldoPosterior = saldoAnterior + importeNum;

  const [updated] = await db.transaction(async (tx) => {
    const [u] = await tx.update(crmGiftCardsTable)
      .set({ saldoActual: String(saldoPosterior), updatedAt: new Date() })
      .where(eq(crmGiftCardsTable.id, id))
      .returning();
    await tx.insert(crmGiftCardTransactionsTable).values({
      giftCardId: id,
      tipo: "recarga",
      importe: String(importeNum),
      saldoAnterior: String(saldoAnterior),
      saldoPosterior: String(saldoPosterior),
      empleadoId: (req as any).user?.id ?? null,
      empleadoNombre: (req as any).user?.name ?? "",
    });
    return [u];
  });

  await logCrmAudit({ accion: "recargar_tarjeta_regalo", entidadTipo: "crm_gift_cards", entidadId: id, empleadoId: (req as any).user?.id, empleadoNombre: (req as any).user?.name ?? "", datos: { importe: importeNum } });
  res.json(updated);
});

// POST /crm/gift-cards/pay — pay with gift card (waiter+ at POS)
router.post("/crm/gift-cards/pay", requireAuth, requireRole(...CRM_STAFF), async (req, res): Promise<void> => {
  const { codigo, importe, orderId } = req.body as { codigo: string; importe: string; orderId?: string };
  const importeNum = parseFloat(importe);
  if (isNaN(importeNum) || importeNum <= 0) { res.status(400).json({ error: "Importe inválido" }); return; }

  const [card] = await db.select().from(crmGiftCardsTable).where(eq(crmGiftCardsTable.codigo, codigo.toUpperCase().trim())).limit(1);
  if (!card) { res.status(404).json({ error: "Tarjeta no encontrada" }); return; }
  if (card.estado !== "activa") { res.status(409).json({ error: `Tarjeta ${card.estado}` }); return; }

  if (card.fechaCaducidad && new Date() > card.fechaCaducidad) {
    await db.update(crmGiftCardsTable).set({ estado: "caducada", updatedAt: new Date() }).where(eq(crmGiftCardsTable.id, card.id));
    res.status(409).json({ error: "Tarjeta caducada" });
    return;
  }

  const saldoAnterior = parseFloat(card.saldoActual);
  const efectivo = Math.min(importeNum, saldoAnterior);
  const saldoPosterior = saldoAnterior - efectivo;
  const nuevoEstado = saldoPosterior <= 0 ? "consumida" : "activa";

  const [updated] = await db.transaction(async (tx) => {
    const [u] = await tx.update(crmGiftCardsTable)
      .set({ saldoActual: String(saldoPosterior), estado: nuevoEstado, updatedAt: new Date() })
      .where(eq(crmGiftCardsTable.id, card.id))
      .returning();
    await tx.insert(crmGiftCardTransactionsTable).values({
      giftCardId: card.id,
      orderId: orderId ?? null,
      tipo: "pago",
      importe: String(efectivo),
      saldoAnterior: String(saldoAnterior),
      saldoPosterior: String(saldoPosterior),
      empleadoId: (req as any).user?.id ?? null,
      empleadoNombre: (req as any).user?.name ?? "",
    });
    return [u];
  });

  await logCrmAudit({ accion: "pago_tarjeta_regalo", entidadTipo: "crm_gift_cards", entidadId: card.id, empleadoId: (req as any).user?.id, empleadoNombre: (req as any).user?.name ?? "", datos: { efectivo, orderId } });
  res.json({ card: updated, pagado: efectivo.toFixed(2), saldoRestante: saldoPosterior.toFixed(2) });
});

// POST /crm/gift-cards/:id/block — toggle block/unblock
router.post("/crm/gift-cards/:id/block", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [card] = await db.select().from(crmGiftCardsTable).where(eq(crmGiftCardsTable.id, id));
  if (!card) { res.status(404).json({ error: "Tarjeta no encontrada" }); return; }

  const newEstado = card.estado === "bloqueada" ? "activa" : "bloqueada";
  const tipo = newEstado === "bloqueada" ? "bloqueo" : "desbloqueo";

  const [updated] = await db.transaction(async (tx) => {
    const [u] = await tx.update(crmGiftCardsTable)
      .set({ estado: newEstado, updatedAt: new Date() })
      .where(eq(crmGiftCardsTable.id, id))
      .returning();
    await tx.insert(crmGiftCardTransactionsTable).values({
      giftCardId: id,
      tipo,
      importe: "0",
      saldoAnterior: card.saldoActual,
      saldoPosterior: card.saldoActual,
      empleadoId: (req as any).user?.id ?? null,
      empleadoNombre: (req as any).user?.name ?? "",
    });
    return [u];
  });

  await logCrmAudit({ accion: tipo + "_tarjeta_regalo", entidadTipo: "crm_gift_cards", entidadId: id, empleadoId: (req as any).user?.id, empleadoNombre: (req as any).user?.name ?? "" });
  res.json(updated);
});

// ═══════════════════════════════════════════════════════════════════════════
// PROMOTIONS
// ═══════════════════════════════════════════════════════════════════════════

// GET /crm/promotions (waiter needs to read promos to apply at POS)
router.get("/crm/promotions", requireAuth, requireRole(...CRM_STAFF), async (_req, res): Promise<void> => {
  const rows = await db.select().from(crmPromotionsTable).orderBy(desc(crmPromotionsTable.createdAt));
  res.json(rows);
});

// POST /crm/promotions
router.post("/crm/promotions", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { nombre, tipo, valor, ...rest } = req.body as Record<string, unknown>;
  if (!nombre || !tipo) { res.status(400).json({ error: "nombre y tipo son obligatorios" }); return; }

  const [promo] = await db.insert(crmPromotionsTable).values({
    nombre: String(nombre),
    tipo: String(tipo),
    valor: String(valor ?? "0"),
    descripcion: String(rest.descripcion ?? ""),
    codigo: String(rest.codigo ?? ""),
    activo: Boolean(rest.activo ?? true),
    fechaInicio: rest.fechaInicio ? new Date(String(rest.fechaInicio)) : null,
    fechaFin: rest.fechaFin ? new Date(String(rest.fechaFin)) : null,
    diasSemana: (rest.diasSemana as any) ?? [],
    horaInicio: String(rest.horaInicio ?? ""),
    horaFin: String(rest.horaFin ?? ""),
    categoriaIds: (rest.categoriaIds as any) ?? [],
    productIds: (rest.productIds as any) ?? [],
    montoMinimo: String(rest.montoMinimo ?? "0"),
    usoMaximo: parseInt(String(rest.usoMaximo ?? "0")),
  }).returning();

  await logCrmAudit({ accion: "crear_promocion", entidadTipo: "crm_promotions", entidadId: promo.id, empleadoId: (req as any).user?.id, empleadoNombre: (req as any).user?.name ?? "", datos: { nombre: promo.nombre } });
  res.status(201).json(promo);
});

// PATCH /crm/promotions/:id
router.patch("/crm/promotions/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const allowed = ["nombre", "descripcion", "tipo", "valor", "codigo", "activo", "fechaInicio", "fechaFin", "diasSemana", "horaInicio", "horaFin", "categoriaIds", "productIds", "montoMinimo", "usoMaximo"];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if (key === "fechaInicio" || key === "fechaFin") updates[key] = req.body[key] ? new Date(req.body[key]) : null;
      else updates[key] = req.body[key];
    }
  }
  const [promo] = await db.update(crmPromotionsTable).set(updates as any).where(eq(crmPromotionsTable.id, id)).returning();
  if (!promo) { res.status(404).json({ error: "Promoción no encontrada" }); return; }
  res.json(promo);
});

// DELETE /crm/promotions/:id
router.delete("/crm/promotions/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db.delete(crmPromotionsTable).where(eq(crmPromotionsTable.id, id));
  res.status(204).send();
});

// POST /crm/promotions/validate — check if a promotion applies (waiter+ at POS)
router.post("/crm/promotions/validate", requireAuth, requireRole(...CRM_STAFF), async (req, res): Promise<void> => {
  const { promoId, codigo, orderAmount } = req.body as { promoId?: string; codigo?: string; orderAmount: number };
  if (!orderAmount || orderAmount <= 0) { res.status(400).json({ error: "orderAmount requerido" }); return; }

  let promo;
  if (promoId) {
    [promo] = await db.select().from(crmPromotionsTable).where(eq(crmPromotionsTable.id, promoId));
  } else if (codigo) {
    [promo] = await db.select().from(crmPromotionsTable).where(eq(crmPromotionsTable.codigo, codigo));
  }

  if (!promo) { res.status(404).json({ error: "Promoción no encontrada" }); return; }

  const result = validatePromotion(promo as any, orderAmount);
  res.json({ ...result, promo });
});

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS (admin only)
// ═══════════════════════════════════════════════════════════════════════════

// GET /admin/crm/reports
router.get("/admin/crm/reports", requireAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400 * 1000);

  const [totales] = await db
    .select({
      totalClientes: count(crmClientsTable.id),
      clientesActivos: sql<number>`count(*) filter (where ${crmClientsTable.activo} = true)::int`,
      gastoTotal: sum(crmClientsTable.totalGasto),
    })
    .from(crmClientsTable);

  const nuevos30d = await db
    .select({ count: count(crmClientsTable.id) })
    .from(crmClientsTable)
    .where(sql`${crmClientsTable.createdAt} >= ${thirtyDaysAgo}`);

  const inactivos90d = await db
    .select({ count: count(crmClientsTable.id) })
    .from(crmClientsTable)
    .where(sql`${crmClientsTable.ultimaVisita} < ${ninetyDaysAgo} or ${crmClientsTable.ultimaVisita} is null`);

  const topClientes = await db
    .select({
      id: crmClientsTable.id,
      nombre: crmClientsTable.nombre,
      apellidos: crmClientsTable.apellidos,
      totalGasto: crmClientsTable.totalGasto,
      totalVisitas: crmClientsTable.totalVisitas,
      puntosSaldo: crmClientsTable.puntosSaldo,
    })
    .from(crmClientsTable)
    .where(eq(crmClientsTable.activo, true))
    .orderBy(desc(crmClientsTable.totalGasto))
    .limit(10);

  const [puntosStats] = await db
    .select({
      totalEmitidos: sql<number>`coalesce(sum(${crmLoyaltyPointsTable.puntos}) filter (where ${crmLoyaltyPointsTable.tipo} = 'emision'), 0)::int`,
      totalCanjeados: sql<number>`coalesce(abs(sum(${crmLoyaltyPointsTable.puntos}) filter (where ${crmLoyaltyPointsTable.tipo} = 'canje')), 0)::int`,
    })
    .from(crmLoyaltyPointsTable);

  const [giftCardStats] = await db
    .select({
      totalActivas: sql<number>`count(*) filter (where ${crmGiftCardsTable.estado} = 'activa')::int`,
      totalConsumidas: sql<number>`count(*) filter (where ${crmGiftCardsTable.estado} = 'consumida')::int`,
      saldoTotal: sum(crmGiftCardsTable.saldoActual),
    })
    .from(crmGiftCardsTable);

  const [promoStats] = await db
    .select({
      totalPromociones: count(crmPromotionsTable.id),
      activas: sql<number>`count(*) filter (where ${crmPromotionsTable.activo} = true)::int`,
      totalUsos: sum(crmPromotionsTable.usoActual),
    })
    .from(crmPromotionsTable);

  res.json({
    clientes: {
      total: totales?.totalClientes ?? 0,
      activos: totales?.clientesActivos ?? 0,
      nuevos30d: nuevos30d[0]?.count ?? 0,
      inactivos90d: inactivos90d[0]?.count ?? 0,
      gastoTotal: parseFloat(totales?.gastoTotal ?? "0"),
    },
    topClientes,
    puntos: puntosStats,
    tarjetasRegalo: giftCardStats,
    promociones: promoStats,
  });
});

// GET /admin/crm/audit
router.get("/admin/crm/audit", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100")), 500);
  const clientId = req.query.clientId as string | undefined;

  const rows = clientId
    ? await db.select().from(crmAuditLogTable).where(eq(crmAuditLogTable.clientId, clientId)).orderBy(desc(crmAuditLogTable.createdAt)).limit(limit)
    : await db.select().from(crmAuditLogTable).orderBy(desc(crmAuditLogTable.createdAt)).limit(limit);

  res.json(rows);
});

export default router;
