/**
 * Loyalty Extended — Levels, Wallet, Campaigns, Segmentation, Consents, Demo data
 *
 * Route prefix convention: paths match /crm/... or /admin/crm/...
 * All auth-checked; role requirements per endpoint.
 *
 * This file extends the base CRM module (crm.ts) without modifying it.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  crmClientsTable,
  crmLoyaltyLevelsTable,
  crmLoyaltyConfigTable,
  crmLoyaltyPointsTable,
  crmWalletTable,
  crmWalletTransactionsTable,
  crmCampaignsTable,
  crmCampaignSendsTable,
  crmConsentsTable,
  crmPromotionsTable,
  crmCouponUsesTable,
  crmGiftCardsTable,
  crmGiftCardTransactionsTable,
  crmAuditLogTable,
  crmDemoDataTable,
} from "@workspace/db";
import { eq, desc, and, or, lte, gte, lt, count, sum, asc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { generateGiftCardCode } from "./crm.js";

const router = Router();
const STAFF = ["waiter", "cashier", "manager", "admin"] as const;

// ─── Audit helper ─────────────────────────────────────────────────────────────
async function audit(params: {
  accion: string; clientId?: string | null; entidadTipo?: string;
  entidadId?: string | null; empleadoId?: string | null; empleadoNombre?: string; datos?: unknown;
}) {
  try {
    await db.insert(crmAuditLogTable).values({
      accion: params.accion, clientId: params.clientId ?? null,
      entidadTipo: params.entidadTipo ?? "", entidadId: params.entidadId ?? null,
      empleadoId: params.empleadoId ?? null, empleadoNombre: params.empleadoNombre ?? "",
      datos: params.datos ?? null,
    });
  } catch { /* audit failure must not break main flow */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// LOYALTY LEVELS
// ═══════════════════════════════════════════════════════════════════════════

// GET /crm/loyalty/levels
router.get("/crm/loyalty/levels", requireAuth, requireRole(...STAFF), async (_req, res): Promise<void> => {
  const rows = await db.select().from(crmLoyaltyLevelsTable).orderBy(asc(crmLoyaltyLevelsTable.orden));
  res.json(rows);
});

// POST /crm/loyalty/levels
router.post("/crm/loyalty/levels", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { nombre, descripcion, orden, requisitosGasto, requisitosVisitas, multiplicadorPuntos,
    descuentoPct, beneficios, color, icono } = req.body as Record<string, unknown>;
  if (!nombre) { res.status(400).json({ error: "nombre es obligatorio" }); return; }
  const [level] = await db.insert(crmLoyaltyLevelsTable).values({
    nombre: String(nombre), descripcion: String(descripcion ?? ""),
    orden: parseInt(String(orden ?? "0")),
    requisitosGasto: String(requisitosGasto ?? "0"),
    requisitosVisitas: parseInt(String(requisitosVisitas ?? "0")),
    multiplicadorPuntos: String(multiplicadorPuntos ?? "1.00"),
    descuentoPct: String(descuentoPct ?? "0"),
    beneficios: (beneficios as string[]) ?? [],
    color: String(color ?? "#6b7280"),
    icono: String(icono ?? "⭐"),
  }).returning();
  await audit({ accion: "crear_nivel", entidadTipo: "crm_loyalty_levels", entidadId: level.id,
    empleadoId: (req as any).user?.id, empleadoNombre: (req as any).user?.name ?? "", datos: { nombre } });
  res.status(201).json(level);
});

// PATCH /crm/loyalty/levels/:id
router.patch("/crm/loyalty/levels/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const allowed = ["nombre","descripcion","orden","requisitosGasto","requisitosVisitas",
    "multiplicadorPuntos","descuentoPct","beneficios","color","icono","activo"];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
  const [level] = await db.update(crmLoyaltyLevelsTable).set(updates as any).where(eq(crmLoyaltyLevelsTable.id, id)).returning();
  if (!level) { res.status(404).json({ error: "Nivel no encontrado" }); return; }
  res.json(level);
});

// DELETE /crm/loyalty/levels/:id
router.delete("/crm/loyalty/levels/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db.delete(crmLoyaltyLevelsTable).where(eq(crmLoyaltyLevelsTable.id, id));
  res.status(204).send();
});

// POST /crm/auto/review-levels — recalculate all clients' levels
router.post("/crm/auto/review-levels", requireAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  const levels = await db.select().from(crmLoyaltyLevelsTable)
    .where(eq(crmLoyaltyLevelsTable.activo, true))
    .orderBy(desc(crmLoyaltyLevelsTable.orden));
  if (!levels.length) { res.json({ updated: 0 }); return; }

  const clients = await db.select({ id: crmClientsTable.id, totalGasto: crmClientsTable.totalGasto,
    totalVisitas: crmClientsTable.totalVisitas }).from(crmClientsTable)
    .where(eq(crmClientsTable.activo, true));

  let updated = 0;
  for (const c of clients) {
    const gasto = parseFloat(c.totalGasto);
    const visitas = c.totalVisitas;
    let bestLevel = levels.find(l =>
      gasto >= parseFloat(l.requisitosGasto) && visitas >= l.requisitosVisitas);
    if (!bestLevel) bestLevel = undefined;
    await db.update(crmClientsTable).set({
      nivelId: bestLevel?.id ?? null,
      nivelNombre: bestLevel?.nombre ?? "",
      updatedAt: new Date(),
    }).where(eq(crmClientsTable.id, c.id));
    updated++;
  }
  res.json({ updated });
});

// ═══════════════════════════════════════════════════════════════════════════
// WALLET / MONEDERO
// ═══════════════════════════════════════════════════════════════════════════

async function getOrCreateWallet(clientId: string) {
  const [w] = await db.select().from(crmWalletTable).where(eq(crmWalletTable.clientId, clientId)).limit(1);
  if (w) return w;
  const [created] = await db.insert(crmWalletTable).values({ clientId }).returning();
  return created;
}

// GET /crm/clients/:id/wallet
router.get("/crm/clients/:id/wallet", requireAuth, requireRole(...STAFF), async (req, res): Promise<void> => {
  const clientId = req.params.id as string;
  const wallet = await getOrCreateWallet(clientId);
  const txns = await db.select().from(crmWalletTransactionsTable)
    .where(eq(crmWalletTransactionsTable.clientId, clientId))
    .orderBy(desc(crmWalletTransactionsTable.createdAt)).limit(50);
  res.json({ wallet, transactions: txns });
});

// POST /crm/clients/:id/wallet/add — add balance (manager+ only)
router.post("/crm/clients/:id/wallet/add", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const clientId = req.params.id as string;
  const { importe, subtipo = "promo", descripcion = "Recarga manual" } =
    req.body as { importe: string; subtipo?: string; descripcion?: string };
  const imp = parseFloat(importe);
  if (isNaN(imp) || imp <= 0) { res.status(400).json({ error: "Importe inválido" }); return; }

  const [client] = await db.select().from(crmClientsTable).where(eq(crmClientsTable.id, clientId));
  if (!client) { res.status(404).json({ error: "Cliente no encontrado" }); return; }

  const wallet = await getOrCreateWallet(clientId);
  const campo = subtipo === "real" ? "saldoReal" : subtipo === "compensacion" ? "saldoCompensacion" : "saldoPromo";
  const saldoAnterior = parseFloat((wallet as any)[campo] ?? "0");
  const saldoPosterior = saldoAnterior + imp;
  const newClientMonedero = parseFloat(client.saldoMonedero) + imp;

  await db.transaction(async (tx) => {
    await tx.update(crmWalletTable)
      .set({ [campo]: String(saldoPosterior), updatedAt: new Date() } as any)
      .where(eq(crmWalletTable.clientId, clientId));
    await tx.update(crmClientsTable)
      .set({ saldoMonedero: String(newClientMonedero), updatedAt: new Date() })
      .where(eq(crmClientsTable.id, clientId));
    await tx.insert(crmWalletTransactionsTable).values({
      clientId, tipo: "recarga", subtipo, importe: String(imp),
      saldoAnterior: String(saldoAnterior), saldoPosterior: String(saldoPosterior),
      descripcion, empleadoId: (req as any).user?.id, empleadoNombre: (req as any).user?.name ?? "",
    });
  });

  await audit({ accion: "recargar_monedero", clientId, empleadoId: (req as any).user?.id,
    empleadoNombre: (req as any).user?.name ?? "", datos: { importe: imp, subtipo } });
  const walletUpdated = await getOrCreateWallet(clientId);
  res.json(walletUpdated);
});

// POST /crm/clients/:id/wallet/pay — use wallet balance to pay (waiter+)
router.post("/crm/clients/:id/wallet/pay", requireAuth, requireRole(...STAFF), async (req, res): Promise<void> => {
  const clientId = req.params.id as string;
  const { importe, orderId, subtipo = "promo" } =
    req.body as { importe: string; orderId?: string; subtipo?: string };
  const imp = parseFloat(importe);
  if (isNaN(imp) || imp <= 0) { res.status(400).json({ error: "Importe inválido" }); return; }

  const wallet = await getOrCreateWallet(clientId);
  const campo = subtipo === "real" ? "saldoReal" : subtipo === "compensacion" ? "saldoCompensacion" : "saldoPromo";
  const saldoAnterior = parseFloat((wallet as any)[campo] ?? "0");
  if (saldoAnterior < imp) { res.status(409).json({ error: `Saldo ${subtipo} insuficiente: ${saldoAnterior.toFixed(2)}€` }); return; }
  const saldoPosterior = saldoAnterior - imp;

  const [client] = await db.select().from(crmClientsTable).where(eq(crmClientsTable.id, clientId));
  const newClientMonedero = Math.max(0, parseFloat(client?.saldoMonedero ?? "0") - imp);

  await db.transaction(async (tx) => {
    await tx.update(crmWalletTable)
      .set({ [campo]: String(saldoPosterior), updatedAt: new Date() } as any)
      .where(eq(crmWalletTable.clientId, clientId));
    await tx.update(crmClientsTable)
      .set({ saldoMonedero: String(newClientMonedero), updatedAt: new Date() })
      .where(eq(crmClientsTable.id, clientId));
    await tx.insert(crmWalletTransactionsTable).values({
      clientId, tipo: "pago", subtipo, importe: String(imp),
      saldoAnterior: String(saldoAnterior), saldoPosterior: String(saldoPosterior),
      descripcion: `Pago con monedero${orderId ? ` (pedido)` : ""}`,
      orderId: orderId ?? null,
      empleadoId: (req as any).user?.id, empleadoNombre: (req as any).user?.name ?? "",
    });
  });

  const walletUpdated = await getOrCreateWallet(clientId);
  res.json({ wallet: walletUpdated, pagado: imp.toFixed(2) });
});

// POST /crm/clients/:id/wallet/adjust — manual adjust (admin only)
router.post("/crm/clients/:id/wallet/adjust", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const clientId = req.params.id as string;
  const { importe, subtipo = "promo", descripcion = "Ajuste manual" } =
    req.body as { importe: string; subtipo?: string; descripcion?: string };
  const imp = parseFloat(importe); // can be negative
  if (isNaN(imp)) { res.status(400).json({ error: "Importe inválido" }); return; }

  const wallet = await getOrCreateWallet(clientId);
  const campo = subtipo === "real" ? "saldoReal" : subtipo === "compensacion" ? "saldoCompensacion" : "saldoPromo";
  const saldoAnterior = parseFloat((wallet as any)[campo] ?? "0");
  const saldoPosterior = Math.max(0, saldoAnterior + imp);

  const [client] = await db.select().from(crmClientsTable).where(eq(crmClientsTable.id, clientId));
  const newClientMonedero = Math.max(0, parseFloat(client?.saldoMonedero ?? "0") + imp);

  await db.transaction(async (tx) => {
    await tx.update(crmWalletTable)
      .set({ [campo]: String(saldoPosterior), updatedAt: new Date() } as any)
      .where(eq(crmWalletTable.clientId, clientId));
    await tx.update(crmClientsTable)
      .set({ saldoMonedero: String(newClientMonedero), updatedAt: new Date() })
      .where(eq(crmClientsTable.id, clientId));
    await tx.insert(crmWalletTransactionsTable).values({
      clientId, tipo: "ajuste", subtipo, importe: String(imp),
      saldoAnterior: String(saldoAnterior), saldoPosterior: String(saldoPosterior), descripcion,
      empleadoId: (req as any).user?.id, empleadoNombre: (req as any).user?.name ?? "",
    });
  });

  await audit({ accion: "ajuste_monedero", clientId, empleadoId: (req as any).user?.id,
    empleadoNombre: (req as any).user?.name ?? "", datos: { importe: imp, subtipo, descripcion } });
  const walletUpdated = await getOrCreateWallet(clientId);
  res.json(walletUpdated);
});

// ═══════════════════════════════════════════════════════════════════════════
// CONSENTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /crm/clients/:id/consents
router.get("/crm/clients/:id/consents", requireAuth, requireRole(...STAFF), async (req, res): Promise<void> => {
  const clientId = req.params.id as string;
  const rows = await db.select().from(crmConsentsTable)
    .where(eq(crmConsentsTable.clientId, clientId))
    .orderBy(desc(crmConsentsTable.createdAt));
  res.json(rows);
});

// POST /crm/clients/:id/consents — upsert one consent type
router.post("/crm/clients/:id/consents", requireAuth, requireRole(...STAFF), async (req, res): Promise<void> => {
  const clientId = req.params.id as string;
  const { tipo, valor, canalOrigen = "tpv", textoAceptado = "", versionLegal = "1.0" } =
    req.body as { tipo: string; valor: boolean; canalOrigen?: string; textoAceptado?: string; versionLegal?: string };

  const VALID_TIPOS = ["operativo","marketing_email","marketing_sms","marketing_whatsapp","perfilado","fidelizacion"];
  if (!VALID_TIPOS.includes(tipo)) { res.status(400).json({ error: "tipo de consentimiento inválido" }); return; }

  // Revoke previous active consent of same type
  await db.update(crmConsentsTable)
    .set({ revocadoEn: new Date() })
    .where(and(eq(crmConsentsTable.clientId, clientId), eq(crmConsentsTable.tipo, tipo),
      sql`${crmConsentsTable.revocadoEn} IS NULL`));

  const [consent] = await db.insert(crmConsentsTable).values({
    clientId, tipo, valor, canalOrigen, textoAceptado, versionLegal,
    ip: (req as any).ip ?? "",
  }).returning();

  await audit({ accion: `consentimiento_${valor ? "dado" : "revocado"}`, clientId,
    entidadTipo: "crm_consents", entidadId: consent.id,
    empleadoId: (req as any).user?.id, empleadoNombre: (req as any).user?.name ?? "",
    datos: { tipo, valor } });
  res.status(201).json(consent);
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPIRING POINTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /crm/clients/:id/expiring-points?days=7
router.get("/crm/clients/:id/expiring-points", requireAuth, requireRole(...STAFF), async (req, res): Promise<void> => {
  const clientId = req.params.id as string;
  const days = parseInt(String(req.query.days ?? "7"));
  const until = new Date(Date.now() + days * 86400_000);

  const rows = await db.select().from(crmLoyaltyPointsTable)
    .where(and(
      eq(crmLoyaltyPointsTable.clientId, clientId),
      eq(crmLoyaltyPointsTable.tipo, "emision"),
      sql`${crmLoyaltyPointsTable.expiraEn} IS NOT NULL`,
      lte(crmLoyaltyPointsTable.expiraEn, until),
      gte(crmLoyaltyPointsTable.expiraEn, new Date()),
    ))
    .orderBy(asc(crmLoyaltyPointsTable.expiraEn));

  const totalExpiring = rows.reduce((s, r) => s + r.puntos, 0);
  res.json({ rows, totalExpiring, days });
});

// POST /crm/auto/expire-points — force expiry of overdue points (cron-style)
router.post("/crm/auto/expire-points", requireAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  // Find clients with expired unprocessed emission rows
  const overdueRows = await db.select({
    clientId: crmLoyaltyPointsTable.clientId,
    puntos: crmLoyaltyPointsTable.puntos,
    id: crmLoyaltyPointsTable.id,
  }).from(crmLoyaltyPointsTable)
    .where(and(
      eq(crmLoyaltyPointsTable.tipo, "emision"),
      sql`${crmLoyaltyPointsTable.expiraEn} IS NOT NULL`,
      lt(crmLoyaltyPointsTable.expiraEn, new Date()),
    ));

  let totalExpired = 0;
  const byClient: Record<string, number> = {};
  for (const r of overdueRows) {
    byClient[r.clientId] = (byClient[r.clientId] ?? 0) + r.puntos;
  }

  for (const [clientId, puntos] of Object.entries(byClient)) {
    const [client] = await db.select().from(crmClientsTable).where(eq(crmClientsTable.id, clientId));
    if (!client) continue;
    const saldoAnterior = client.puntosSaldo;
    const saldoPosterior = Math.max(0, saldoAnterior - puntos);
    await db.transaction(async (tx) => {
      await tx.update(crmLoyaltyPointsTable)
        .set({ tipo: "expiracion" } as any)
        .where(and(
          eq(crmLoyaltyPointsTable.clientId, clientId),
          eq(crmLoyaltyPointsTable.tipo, "emision"),
          sql`${crmLoyaltyPointsTable.expiraEn} IS NOT NULL`,
          lt(crmLoyaltyPointsTable.expiraEn, new Date()),
        ));
      await tx.insert(crmLoyaltyPointsTable).values({
        clientId, tipo: "expiracion", puntos: -puntos,
        saldoAnterior, saldoPosterior,
        descripcion: `Caducidad automática: -${puntos} pts`,
      });
      await tx.update(crmClientsTable)
        .set({ puntosSaldo: saldoPosterior, updatedAt: new Date() })
        .where(eq(crmClientsTable.id, clientId));
    });
    totalExpired += puntos;
  }
  res.json({ clientesAfectados: Object.keys(byClient).length, puntosExpirados: totalExpired });
});

// ═══════════════════════════════════════════════════════════════════════════
// COUPON PER-CLIENT USE TRACKING
// ═══════════════════════════════════════════════════════════════════════════

// POST /crm/promotions/use — record a coupon use (waiter+)
router.post("/crm/promotions/use", requireAuth, requireRole(...STAFF), async (req, res): Promise<void> => {
  const { promotionId, clientId, orderId } =
    req.body as { promotionId: string; clientId?: string; orderId?: string };

  const [promo] = await db.select().from(crmPromotionsTable).where(eq(crmPromotionsTable.id, promotionId));
  if (!promo) { res.status(404).json({ error: "Promoción no encontrada" }); return; }

  // Check global usage cap
  if (promo.usoMaximo > 0 && promo.usoActual >= promo.usoMaximo) {
    res.status(409).json({ error: "Cupo de usos agotado" }); return;
  }

  // Check per-client usage cap
  if (clientId && promo.usoMaximoPorCliente > 0) {
    const [{ uses }] = await db.select({ uses: count(crmCouponUsesTable.id) })
      .from(crmCouponUsesTable)
      .where(and(eq(crmCouponUsesTable.promotionId, promotionId), eq(crmCouponUsesTable.clientId, clientId)));
    if ((uses ?? 0) >= promo.usoMaximoPorCliente) {
      res.status(409).json({ error: `Este cliente ya ha usado esta promoción ${promo.usoMaximoPorCliente} vez/veces` });
      return;
    }
  }

  // Record use
  const [use] = await db.insert(crmCouponUsesTable).values({
    promotionId, clientId: clientId ?? null, orderId: orderId ?? null,
  }).returning();

  // Increment counter atomically
  await db.update(crmPromotionsTable)
    .set({ usoActual: sql`${crmPromotionsTable.usoActual} + 1`, updatedAt: new Date() })
    .where(eq(crmPromotionsTable.id, promotionId));

  res.status(201).json(use);
});

// ═══════════════════════════════════════════════════════════════════════════
// CAMPAIGNS
// ═══════════════════════════════════════════════════════════════════════════

// GET /crm/campaigns
router.get("/crm/campaigns", requireAuth, requireRole("manager", "admin"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(crmCampaignsTable).orderBy(desc(crmCampaignsTable.createdAt));
  res.json(rows);
});

// POST /crm/campaigns
router.post("/crm/campaigns", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { nombre, descripcion, tipo, canal, asunto, contenido, segmento, fechaEnvio, promotionId } =
    req.body as Record<string, unknown>;
  if (!nombre) { res.status(400).json({ error: "nombre es obligatorio" }); return; }

  const [campaign] = await db.insert(crmCampaignsTable).values({
    nombre: String(nombre), descripcion: String(descripcion ?? ""),
    tipo: String(tipo ?? "manual"), canal: String(canal ?? "email"),
    asunto: String(asunto ?? ""), contenido: String(contenido ?? ""),
    segmento: (segmento as Record<string, unknown>) ?? {},
    fechaEnvio: fechaEnvio ? new Date(String(fechaEnvio)) : null,
    promotionId: promotionId ? String(promotionId) : null,
    empleadoId: (req as any).user?.id ?? null,
    empleadoNombre: (req as any).user?.name ?? "",
  }).returning();

  await audit({ accion: "crear_campania", entidadTipo: "crm_campaigns", entidadId: campaign.id,
    empleadoId: (req as any).user?.id, empleadoNombre: (req as any).user?.name ?? "",
    datos: { nombre } });
  res.status(201).json(campaign);
});

// PATCH /crm/campaigns/:id
router.patch("/crm/campaigns/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const allowed = ["nombre","descripcion","tipo","estado","canal","asunto","contenido","segmento",
    "fechaEnvio","fechaFin","promotionId"];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      if (k === "fechaEnvio" || k === "fechaFin") updates[k] = req.body[k] ? new Date(req.body[k]) : null;
      else updates[k] = req.body[k];
    }
  }
  const [campaign] = await db.update(crmCampaignsTable).set(updates as any)
    .where(eq(crmCampaignsTable.id, id)).returning();
  if (!campaign) { res.status(404).json({ error: "Campaña no encontrada" }); return; }
  res.json(campaign);
});

// DELETE /crm/campaigns/:id
router.delete("/crm/campaigns/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db.delete(crmCampaignSendsTable).where(eq(crmCampaignSendsTable.campaignId, id));
  await db.delete(crmCampaignsTable).where(eq(crmCampaignsTable.id, id));
  res.status(204).send();
});

// GET /crm/campaigns/:id/sends
router.get("/crm/campaigns/:id/sends", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const campaignId = req.params.id as string;
  const rows = await db.select().from(crmCampaignSendsTable)
    .where(eq(crmCampaignSendsTable.campaignId, campaignId))
    .orderBy(desc(crmCampaignSendsTable.createdAt)).limit(500);
  res.json(rows);
});

// POST /crm/campaigns/:id/send — compute recipients based on segment and create send records
router.post("/crm/campaigns/:id/send", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  if (process.env["NODE_ENV"] === "production") {
    res.status(503).json({ error: "Conector de campañas no configurado" });
    return;
  }
  const id = req.params.id as string;
  const [campaign] = await db.select().from(crmCampaignsTable).where(eq(crmCampaignsTable.id, id));
  if (!campaign) { res.status(404).json({ error: "Campaña no encontrada" }); return; }
  if (campaign.estado === "completada") { res.status(409).json({ error: "Campaña ya completada" }); return; }

  // Resolve recipients using segment criteria
  const seg = campaign.segmento as Record<string, unknown>;
  const clients = await resolveSegment(seg);

  // Mark campaign as enviando
  await db.update(crmCampaignsTable).set({
    estado: "enviando", totalDestinatarios: clients.length,
    totalEnviados: clients.length, updatedAt: new Date(),
  }).where(eq(crmCampaignsTable.id, id));

  // Create send records (simulation: mark as enviado immediately)
  if (clients.length > 0) {
    const now = new Date();
    // Insert in chunks to avoid hitting parameter limits
    for (let i = 0; i < clients.length; i += 100) {
      const chunk = clients.slice(i, i + 100);
      await db.insert(crmCampaignSendsTable).values(
        chunk.map((c: { id: string }) => ({
          campaignId: id, clientId: c.id, estado: "enviado",
          canal: campaign.canal, enviadoEn: now,
        }))
      );
    }
  }

  await db.update(crmCampaignsTable).set({ estado: "completada", updatedAt: new Date() })
    .where(eq(crmCampaignsTable.id, id));

  await audit({ accion: "enviar_campania", entidadTipo: "crm_campaigns", entidadId: id,
    empleadoId: (req as any).user?.id, empleadoNombre: (req as any).user?.name ?? "",
    datos: { destinatarios: clients.length } });
  res.json({ destinatarios: clients.length, enviados: clients.length });
});

// ═══════════════════════════════════════════════════════════════════════════
// SEGMENTATION
// ═══════════════════════════════════════════════════════════════════════════

/** Apply segment criteria and return matching clients */
async function resolveSegment(seg: Record<string, unknown>) {
  let query = db.select({ id: crmClientsTable.id, nombre: crmClientsTable.nombre,
    email: crmClientsTable.email, telefono: crmClientsTable.telefono,
    totalGasto: crmClientsTable.totalGasto, totalVisitas: crmClientsTable.totalVisitas,
    ultimaVisita: crmClientsTable.ultimaVisita, puntosSaldo: crmClientsTable.puntosSaldo,
  }).from(crmClientsTable).where(eq(crmClientsTable.activo, true));

  const conditions: ReturnType<typeof eq>[] = [];

  // Spending filters
  if (seg.gastoMinimo) conditions.push(gte(crmClientsTable.totalGasto, String(seg.gastoMinimo)));
  if (seg.gastoMaximo) conditions.push(lte(crmClientsTable.totalGasto, String(seg.gastoMaximo)));

  // Visit filters
  if (seg.visitasMinimas !== undefined)
    conditions.push(gte(crmClientsTable.totalVisitas, parseInt(String(seg.visitasMinimas))));

  // Points filter
  if (seg.puntosMinimos !== undefined)
    conditions.push(gte(crmClientsTable.puntosSaldo, parseInt(String(seg.puntosMinimos))));

  // Level filter
  if (seg.nivelId) conditions.push(eq(crmClientsTable.nivelId, String(seg.nivelId)));

  // Last visit (inactivity) filter
  if (seg.inactivoDias) {
    const cutoff = new Date(Date.now() - parseInt(String(seg.inactivoDias)) * 86400_000);
    conditions.push(
      or(
        lt(crmClientsTable.ultimaVisita, cutoff),
        sql`${crmClientsTable.ultimaVisita} IS NULL`,
      ) as ReturnType<typeof eq>
    );
  }

  // Birthday this month
  if (seg.cumpleanosEsteMes) {
    const now = new Date();
    conditions.push(
      sql`EXTRACT(MONTH FROM ${crmClientsTable.fechaNacimiento}) = ${now.getMonth() + 1}` as ReturnType<typeof eq>
    );
  }

  // Marketing consent
  if (seg.requiereConsentimientoMarketing) {
    conditions.push(eq(crmClientsTable.rgpdMarketing, true));
  }

  if (conditions.length > 0) {
    (query as any) = (query as any).where(and(...conditions));
  }

  return (query as any).limit(5000);
}

// POST /crm/segment/preview — preview how many clients match a segment
router.post("/crm/segment/preview", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const seg = req.body as Record<string, unknown>;
  try {
    const clients = await resolveSegment(seg);
    res.json({ total: clients.length, muestra: clients.slice(0, 20) });
  } catch (err) {
    res.status(400).json({ error: "Error en la segmentación: " + (err as Error).message });
  }
});

// GET /crm/segment/export?nivelId=&inactivoDias=&... — export matching client list
router.get("/crm/segment/export", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const seg: Record<string, unknown> = {};
  if (req.query.nivelId) seg.nivelId = req.query.nivelId;
  if (req.query.inactivoDias) seg.inactivoDias = req.query.inactivoDias;
  if (req.query.puntosMinimos) seg.puntosMinimos = req.query.puntosMinimos;
  if (req.query.gastoMinimo) seg.gastoMinimo = req.query.gastoMinimo;
  if (req.query.visitasMinimas) seg.visitasMinimas = req.query.visitasMinimas;
  if (req.query.cumpleanosEsteMes) seg.cumpleanosEsteMes = true;

  const clients = await resolveSegment(seg);
  res.json(clients);
});

// ═══════════════════════════════════════════════════════════════════════════
// DEMO DATA
// ═══════════════════════════════════════════════════════════════════════════

// POST /crm/demo-data — insert representative demo clients, gift cards, promos
router.post("/crm/demo-data", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const created: { tabla: string; rowId: string }[] = [];
  const user = (req as any).user;

  await db.transaction(async (tx) => {
    // Ensure loyalty config is active
    const [cfg] = await tx.select().from(crmLoyaltyConfigTable).limit(1);
    if (!cfg) {
      const [c] = await tx.insert(crmLoyaltyConfigTable).values({
        activo: true, puntosPorEuro: "1", valorPunto: "0.01",
        canjeMinimo: 50, caducidadDias: 365, puntosExtraCumpleanos: 200,
        puntosExtraPrimeraCompra: 100,
      }).returning();
      created.push({ tabla: "crm_loyalty_config", rowId: c.id });
    } else {
      await tx.update(crmLoyaltyConfigTable).set({
        activo: true, puntosExtraCumpleanos: 200, puntosExtraPrimeraCompra: 100,
        nivelesActivos: true, monederoActivo: true, updatedAt: new Date(),
      }).where(eq(crmLoyaltyConfigTable.id, cfg.id));
    }

    // Levels
    const levelData = [
      { nombre: "Bronce", orden: 1, requisitosGasto: "0", requisitosVisitas: 0, multiplicadorPuntos: "1.00", descuentoPct: "0", color: "#cd7f32", icono: "🥉" },
      { nombre: "Plata",  orden: 2, requisitosGasto: "200", requisitosVisitas: 5, multiplicadorPuntos: "1.25", descuentoPct: "5", color: "#c0c0c0", icono: "🥈" },
      { nombre: "Oro",    orden: 3, requisitosGasto: "500", requisitosVisitas: 15, multiplicadorPuntos: "1.50", descuentoPct: "10", color: "#ffd700", icono: "🥇" },
      { nombre: "VIP",    orden: 4, requisitosGasto: "1500", requisitosVisitas: 40, multiplicadorPuntos: "2.00", descuentoPct: "15", color: "#a855f7", icono: "💜" },
    ];
    for (const ld of levelData) {
      // Only create if no level with this name
      const [existing] = await tx.select({ id: crmLoyaltyLevelsTable.id })
        .from(crmLoyaltyLevelsTable).where(eq(crmLoyaltyLevelsTable.nombre, ld.nombre)).limit(1);
      if (!existing) {
        const [l] = await tx.insert(crmLoyaltyLevelsTable).values({
          ...ld, descripcion: `Nivel ${ld.nombre}`, beneficios: [`Multiplier ${ld.multiplicadorPuntos}×`],
        }).returning();
        created.push({ tabla: "crm_loyalty_levels", rowId: l.id });
      }
    }

    // Demo clients
    const demoClients = [
      { nombre: "Ana", apellidos: "García López", telefono: "600111222", email: "ana.demo@piccolo.app",
        totalGasto: "1650", totalVisitas: 45, puntosSaldo: 1650, fechaNacimiento: "1990-06-15" },
      { nombre: "Carlos", apellidos: "Martínez Ruiz", telefono: "600333444", email: "carlos.demo@piccolo.app",
        totalGasto: "320", totalVisitas: 8, puntosSaldo: 320 },
      { nombre: "María", apellidos: "Sánchez Pérez", telefono: "600555666", email: "maria.demo@piccolo.app",
        totalGasto: "25", totalVisitas: 1, puntosSaldo: 25 },
      { nombre: "Roberto", apellidos: "Fernández Gil", telefono: "600777888", email: "roberto.demo@piccolo.app",
        totalGasto: "0", totalVisitas: 0, puntosSaldo: 0, fechaNacimiento: new Date().toISOString().slice(0, 10) },
    ];

    for (const dc of demoClients) {
      const [existing] = await tx.select({ id: crmClientsTable.id })
        .from(crmClientsTable).where(eq(crmClientsTable.email, dc.email)).limit(1);
      if (!existing) {
        const qrToken = `DEMO-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
        const [c] = await tx.insert(crmClientsTable).values({
          ...dc, activo: true, rgpdConsentimiento: true, rgpdFecha: new Date(),
          rgpdMarketing: true, qrToken,
          totalGasto: dc.totalGasto,
        } as any).returning();
        created.push({ tabla: "crm_clients", rowId: c.id });
      }
    }

    // Demo promotions
    const promoData = [
      { nombre: "Cupón cumpleaños", tipo: "descuento_porcentual", valor: "10", codigo: "CUMPLE10",
        descripcion: "10% descuento en tu cumpleaños" },
      { nombre: "Primera compra", tipo: "descuento_fijo", valor: "5", codigo: "BIENVENIDA5",
        descripcion: "5€ de descuento en tu primera compra" },
      { nombre: "2×1 en postres", tipo: "2x1", valor: "0", codigo: "POSTRE2X1",
        descripcion: "Segundo postre gratis" },
    ];
    for (const pd of promoData) {
      const [existing] = await tx.select({ id: crmPromotionsTable.id })
        .from(crmPromotionsTable).where(eq(crmPromotionsTable.codigo, pd.codigo)).limit(1);
      if (!existing) {
        const [p] = await tx.insert(crmPromotionsTable).values({ ...pd, activo: true }).returning();
        created.push({ tabla: "crm_promotions", rowId: p.id });
      }
    }

    // Demo gift card
    const gcCodigo = generateGiftCardCode();
    const [existingGc] = await tx.select({ id: crmGiftCardsTable.id })
      .from(crmGiftCardsTable).where(eq(crmGiftCardsTable.notas, "DEMO")).limit(1);
    if (!existingGc) {
      const [gc] = await tx.insert(crmGiftCardsTable).values({
        codigo: gcCodigo, saldoInicial: "50", saldoActual: "50",
        notas: "DEMO", empleadoNombre: user?.name ?? "Sistema",
        beneficiarioEmail: "regalo.demo@piccolo.app",
        mensajePersonalizado: "¡Feliz cumpleaños! Con cariño.",
      }).returning();
      await tx.insert(crmGiftCardTransactionsTable).values({
        giftCardId: gc.id, tipo: "emision", importe: "50",
        saldoAnterior: "0", saldoPosterior: "50", notas: "DEMO",
        empleadoNombre: user?.name ?? "Sistema",
      });
      created.push({ tabla: "crm_gift_cards", rowId: gc.id });
    }

    // Demo campaign
    const [existingCampaign] = await tx.select({ id: crmCampaignsTable.id })
      .from(crmCampaignsTable).where(eq(crmCampaignsTable.nombre, "Campaña demo: clientes inactivos")).limit(1);
    if (!existingCampaign) {
      const [camp] = await tx.insert(crmCampaignsTable).values({
        nombre: "Campaña demo: clientes inactivos",
        tipo: "inactividad", canal: "email",
        asunto: "¡Te echamos de menos!",
        contenido: "Hace tiempo que no te vemos. ¡Vuelve y te regalamos puntos extra!",
        segmento: { inactivoDias: 90 },
        empleadoNombre: user?.name ?? "Sistema",
      }).returning();
      created.push({ tabla: "crm_campaigns", rowId: camp.id });
    }

    // Record demo markers
    if (created.length > 0) {
      await tx.insert(crmDemoDataTable).values(created.map(c => ({ tabla: c.tabla, rowId: c.rowId })));
    }
  });

  res.status(201).json({ created: created.length, items: created });
});

// DELETE /crm/demo-data — remove all demo-flagged rows
router.delete("/crm/demo-data", requireAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  const markers = await db.select().from(crmDemoDataTable);
  let deleted = 0;

  // Delete in dependency order
  const byTable = markers.reduce<Record<string, string[]>>((acc, m) => {
    (acc[m.tabla] ??= []).push(m.rowId);
    return acc;
  }, {});

  const order = ["crm_campaign_sends","crm_campaigns","crm_coupon_uses","crm_promotions",
    "crm_gift_card_transactions","crm_gift_cards","crm_wallet_transactions","crm_wallet",
    "crm_loyalty_points","crm_consents","crm_clients","crm_loyalty_levels","crm_loyalty_config"];

  for (const tabla of order) {
    const ids = byTable[tabla] ?? [];
    for (const id of ids) {
      try {
        switch (tabla) {
          case "crm_clients": await db.delete(crmClientsTable).where(eq(crmClientsTable.id, id)); break;
          case "crm_loyalty_levels": await db.delete(crmLoyaltyLevelsTable).where(eq(crmLoyaltyLevelsTable.id, id)); break;
          case "crm_promotions": await db.delete(crmPromotionsTable).where(eq(crmPromotionsTable.id, id)); break;
          case "crm_gift_cards": await db.delete(crmGiftCardsTable).where(eq(crmGiftCardsTable.id, id)); break;
          case "crm_campaigns": await db.delete(crmCampaignsTable).where(eq(crmCampaignsTable.id, id)); break;
          case "crm_campaign_sends": await db.delete(crmCampaignSendsTable).where(eq(crmCampaignSendsTable.id, id)); break;
          default: break;
        }
        deleted++;
      } catch { /* row may already be gone */ }
    }
  }

  await db.delete(crmDemoDataTable);
  res.json({ deleted });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXTENDED REPORTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /admin/crm/reports/extended
router.get("/admin/crm/reports/extended", requireAuth, requireRole("manager", "admin"), async (_req, res): Promise<void> => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);
  const sevenDaysAgo  = new Date(now.getTime() -  7 * 86400_000);

  const [levelStats] = await db
    .select({ totalNiveles: count(crmLoyaltyLevelsTable.id) })
    .from(crmLoyaltyLevelsTable)
    .where(eq(crmLoyaltyLevelsTable.activo, true));

  const levelDist = await db
    .select({ nivelNombre: crmClientsTable.nivelNombre, count: count(crmClientsTable.id) })
    .from(crmClientsTable)
    .where(eq(crmClientsTable.activo, true))
    .groupBy(crmClientsTable.nivelNombre);

  const [walletStats] = await db
    .select({
      clientesConMonedero: count(crmWalletTable.id),
      totalSaldoReal:  sum(crmWalletTable.saldoReal),
      totalSaldoPromo: sum(crmWalletTable.saldoPromo),
    })
    .from(crmWalletTable);

  const [campaignStats] = await db
    .select({
      total: count(crmCampaignsTable.id),
      enviadas: sql<number>`count(*) filter (where ${crmCampaignsTable.estado} = 'completada')::int`,
    })
    .from(crmCampaignsTable);

  const [expiringPoints] = await db
    .select({ total: sum(crmLoyaltyPointsTable.puntos) })
    .from(crmLoyaltyPointsTable)
    .where(and(
      eq(crmLoyaltyPointsTable.tipo, "emision"),
      sql`${crmLoyaltyPointsTable.expiraEn} IS NOT NULL`,
      lte(crmLoyaltyPointsTable.expiraEn, new Date(now.getTime() + 30 * 86400_000)),
      gte(crmLoyaltyPointsTable.expiraEn, now),
    ));

  const [points30d] = await db
    .select({
      emitidos: sql<number>`coalesce(sum(${crmLoyaltyPointsTable.puntos}) filter (where ${crmLoyaltyPointsTable.tipo} = 'emision'), 0)::int`,
      canjeados: sql<number>`coalesce(abs(sum(${crmLoyaltyPointsTable.puntos}) filter (where ${crmLoyaltyPointsTable.tipo} = 'canje')), 0)::int`,
      expirados: sql<number>`coalesce(abs(sum(${crmLoyaltyPointsTable.puntos}) filter (where ${crmLoyaltyPointsTable.tipo} = 'expiracion')), 0)::int`,
    })
    .from(crmLoyaltyPointsTable)
    .where(gte(crmLoyaltyPointsTable.createdAt, thirtyDaysAgo));

  res.json({
    niveles: { stats: levelStats, distribucion: levelDist },
    monedero: walletStats,
    campañas: campaignStats,
    puntosProximosACaducar30d: parseFloat(expiringPoints?.total ?? "0"),
    puntos30d: points30d,
  });
});

export default router;
