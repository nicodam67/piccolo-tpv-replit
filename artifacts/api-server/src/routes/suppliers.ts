import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  suppliersTable,
  supplierCatalogItemsTable,
  ingredientsTable,
  purchaseAuditLogTable,
} from "@workspace/db";
import { eq, and, ilike, asc, desc, avg, max, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// ─── Helper: write audit log ────────────────────────────────────────────────────
async function auditLog(
  entityType: string,
  entityId: string,
  action: string,
  employeeId: string | null,
  details?: string,
) {
  await db.insert(purchaseAuditLogTable).values({
    entityType,
    entityId,
    action,
    employeeId: employeeId ?? null,
    details: details ?? null,
  });
}

// ─── GET /admin/suppliers ───────────────────────────────────────────────────────
router.get("/admin/suppliers", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { search, active } = req.query as { search?: string; active?: string };
  let query = db.select().from(suppliersTable).$dynamic();
  const conds: any[] = [];
  if (active === "true") conds.push(eq(suppliersTable.active, true));
  if (active === "false") conds.push(eq(suppliersTable.active, false));
  if (search) conds.push(ilike(suppliersTable.commercialName, `%${search}%`));
  if (conds.length) query = query.where(and(...conds));
  const rows = await query.orderBy(asc(suppliersTable.commercialName));
  res.json(rows);
});

// ─── POST /admin/suppliers ──────────────────────────────────────────────────────
router.post("/admin/suppliers", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const {
    commercialName, legalName, nif, address, phone, email, contactPerson,
    paymentTerms, deliveryDays, minOrder, leadTimeDays, notes,
  } = req.body as Record<string, unknown>;

  if (!commercialName || !(commercialName as string).trim()) {
    res.status(400).json({ error: "commercialName es obligatorio" }); return;
  }
  const user = (req as any).user;
  const [row] = await db.insert(suppliersTable).values({
    commercialName: (commercialName as string).trim(),
    legalName: (legalName as string | undefined) ?? null,
    nif: (nif as string | undefined) ?? null,
    address: (address as string | undefined) ?? null,
    phone: (phone as string | undefined) ?? null,
    email: (email as string | undefined) ?? null,
    contactPerson: (contactPerson as string | undefined) ?? null,
    paymentTerms: (paymentTerms as string | undefined) ?? null,
    deliveryDays: (deliveryDays as string | undefined) ?? null,
    minOrder: minOrder != null ? String(minOrder) : "0",
    leadTimeDays: leadTimeDays != null ? Number(leadTimeDays) : 1,
    notes: (notes as string | undefined) ?? null,
  }).returning();
  await auditLog("supplier", row.id, "create", user?.id ?? null, `Created: ${row.commercialName}`);
  res.status(201).json(row);
});

// ─── GET /admin/suppliers/:id ───────────────────────────────────────────────────
router.get("/admin/suppliers/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [row] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!row) { res.status(404).json({ error: "Proveedor no encontrado" }); return; }
  // Include catalogue count
  const catalogue = await db.select({
    id: supplierCatalogItemsTable.id,
    ingredientId: supplierCatalogItemsTable.ingredientId,
    ingredientName: ingredientsTable.name,
    ingredientUnit: ingredientsTable.unit,
    supplierRef: supplierCatalogItemsTable.supplierRef,
    purchaseFormat: supplierCatalogItemsTable.purchaseFormat,
    unitsPerPack: supplierCatalogItemsTable.unitsPerPack,
    purchaseUnit: supplierCatalogItemsTable.purchaseUnit,
    price: supplierCatalogItemsTable.price,
    vatPct: supplierCatalogItemsTable.vatPct,
    discount: supplierCatalogItemsTable.discount,
    transportCost: supplierCatalogItemsTable.transportCost,
    isPreferred: supplierCatalogItemsTable.isPreferred,
    updatedAt: supplierCatalogItemsTable.updatedAt,
  })
    .from(supplierCatalogItemsTable)
    .innerJoin(ingredientsTable, eq(supplierCatalogItemsTable.ingredientId, ingredientsTable.id))
    .where(eq(supplierCatalogItemsTable.supplierId, id))
    .orderBy(asc(ingredientsTable.name));
  res.json({ ...row, catalogue });
});

// ─── PATCH /admin/suppliers/:id ─────────────────────────────────────────────────
router.patch("/admin/suppliers/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [existing] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Proveedor no encontrado" }); return; }

  const fields = ["commercialName","legalName","nif","address","phone","email",
    "contactPerson","paymentTerms","deliveryDays","minOrder","leadTimeDays","notes","active"] as const;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  const [updated] = await db.update(suppliersTable).set(updates as any).where(eq(suppliersTable.id, id)).returning();
  const user = (req as any).user;
  await auditLog("supplier", id, "update", user?.id ?? null, JSON.stringify(Object.keys(updates)));
  res.json(updated);
});

// ─── DELETE /admin/suppliers/:id (soft) ────────────────────────────────────────
router.delete("/admin/suppliers/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db.update(suppliersTable).set({ active: false, updatedAt: new Date() }).where(eq(suppliersTable.id, id));
  const user = (req as any).user;
  await auditLog("supplier", id, "deactivate", user?.id ?? null);
  res.json({ ok: true });
});

// ─── GET /admin/suppliers/:id/catalogue ────────────────────────────────────────
router.get("/admin/suppliers/:id/catalogue", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const supplierId = req.params.id as string;
  const rows = await db.select({
    id: supplierCatalogItemsTable.id,
    supplierId: supplierCatalogItemsTable.supplierId,
    ingredientId: supplierCatalogItemsTable.ingredientId,
    ingredientName: ingredientsTable.name,
    ingredientUnit: ingredientsTable.unit,
    supplierRef: supplierCatalogItemsTable.supplierRef,
    purchaseFormat: supplierCatalogItemsTable.purchaseFormat,
    unitsPerPack: supplierCatalogItemsTable.unitsPerPack,
    purchaseUnit: supplierCatalogItemsTable.purchaseUnit,
    price: supplierCatalogItemsTable.price,
    vatPct: supplierCatalogItemsTable.vatPct,
    discount: supplierCatalogItemsTable.discount,
    transportCost: supplierCatalogItemsTable.transportCost,
    isPreferred: supplierCatalogItemsTable.isPreferred,
    updatedAt: supplierCatalogItemsTable.updatedAt,
  })
    .from(supplierCatalogItemsTable)
    .innerJoin(ingredientsTable, eq(supplierCatalogItemsTable.ingredientId, ingredientsTable.id))
    .where(eq(supplierCatalogItemsTable.supplierId, supplierId))
    .orderBy(asc(ingredientsTable.name));
  res.json(rows);
});

// ─── POST /admin/suppliers/:id/catalogue ───────────────────────────────────────
router.post("/admin/suppliers/:id/catalogue", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const supplierId = req.params.id as string;
  const {
    ingredientId, supplierRef, purchaseFormat, unitsPerPack = "1",
    purchaseUnit = "ud", price = "0", vatPct = "10", discount = "0",
    transportCost = "0", isPreferred = false,
  } = req.body as Record<string, unknown>;

  if (!ingredientId) { res.status(400).json({ error: "ingredientId es obligatorio" }); return; }
  const [row] = await db.insert(supplierCatalogItemsTable).values({
    supplierId,
    ingredientId: ingredientId as string,
    supplierRef: (supplierRef as string | undefined) ?? null,
    purchaseFormat: (purchaseFormat as string | undefined) ?? null,
    unitsPerPack: String(unitsPerPack),
    purchaseUnit: String(purchaseUnit),
    price: String(price),
    vatPct: String(vatPct),
    discount: String(discount),
    transportCost: String(transportCost),
    isPreferred: Boolean(isPreferred),
  }).returning();
  res.status(201).json(row);
});

// ─── PATCH /admin/supplier-catalogue/:itemId ───────────────────────────────────
router.patch("/admin/supplier-catalogue/:itemId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const itemId = req.params.itemId as string;
  const [existing] = await db.select().from(supplierCatalogItemsTable).where(eq(supplierCatalogItemsTable.id, itemId));
  if (!existing) { res.status(404).json({ error: "Ítem de catálogo no encontrado" }); return; }

  const fields = ["supplierRef","purchaseFormat","unitsPerPack","purchaseUnit","price","vatPct","discount","transportCost","isPreferred"] as const;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  const [updated] = await db.update(supplierCatalogItemsTable).set(updates as any).where(eq(supplierCatalogItemsTable.id, itemId)).returning();
  res.json(updated);
});

// ─── DELETE /admin/supplier-catalogue/:itemId ──────────────────────────────────
router.delete("/admin/supplier-catalogue/:itemId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const itemId = req.params.itemId as string;
  await db.delete(supplierCatalogItemsTable).where(eq(supplierCatalogItemsTable.id, itemId));
  res.json({ ok: true });
});

// ─── PATCH /admin/supplier-catalogue/:itemId/set-preferred ────────────────────
// Sets this catalog item as preferred and clears preferred on other items for the same ingredient+supplier
router.patch("/admin/supplier-catalogue/:itemId/set-preferred", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const itemId = req.params.itemId as string;
  const [item] = await db.select().from(supplierCatalogItemsTable).where(eq(supplierCatalogItemsTable.id, itemId));
  if (!item) { res.status(404).json({ error: "Ítem no encontrado" }); return; }

  // Clear preferred for all catalog items of this ingredient
  await db.update(supplierCatalogItemsTable)
    .set({ isPreferred: false, updatedAt: new Date() })
    .where(eq(supplierCatalogItemsTable.ingredientId, item.ingredientId));

  const [updated] = await db.update(supplierCatalogItemsTable)
    .set({ isPreferred: true, updatedAt: new Date() })
    .where(eq(supplierCatalogItemsTable.id, itemId))
    .returning();
  res.json(updated);
});

// ─── GET /admin/price-comparison ───────────────────────────────────────────────
// Compare prices across all suppliers for a given ingredient
router.get("/admin/price-comparison", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { ingredientId } = req.query as { ingredientId?: string };

  if (!ingredientId) {
    // Return list of ingredients that have at least 2 supplier entries
    const rows = await db.select({
      ingredientId: supplierCatalogItemsTable.ingredientId,
      ingredientName: ingredientsTable.name,
      ingredientUnit: ingredientsTable.unit,
      supplierCount: sql<number>`count(distinct ${supplierCatalogItemsTable.supplierId})`.mapWith(Number),
    })
      .from(supplierCatalogItemsTable)
      .innerJoin(ingredientsTable, eq(supplierCatalogItemsTable.ingredientId, ingredientsTable.id))
      .groupBy(supplierCatalogItemsTable.ingredientId, ingredientsTable.name, ingredientsTable.unit)
      .orderBy(asc(ingredientsTable.name));
    res.json(rows);
    return;
  }

  const [ingredient] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, ingredientId));
  if (!ingredient) { res.status(404).json({ error: "Ingrediente no encontrado" }); return; }

  const entries = await db.select({
    catalogItemId: supplierCatalogItemsTable.id,
    supplierId: supplierCatalogItemsTable.supplierId,
    supplierName: suppliersTable.commercialName,
    leadTimeDays: suppliersTable.leadTimeDays,
    minOrder: suppliersTable.minOrder,
    supplierRef: supplierCatalogItemsTable.supplierRef,
    purchaseFormat: supplierCatalogItemsTable.purchaseFormat,
    unitsPerPack: supplierCatalogItemsTable.unitsPerPack,
    purchaseUnit: supplierCatalogItemsTable.purchaseUnit,
    price: supplierCatalogItemsTable.price,
    vatPct: supplierCatalogItemsTable.vatPct,
    discount: supplierCatalogItemsTable.discount,
    transportCost: supplierCatalogItemsTable.transportCost,
    isPreferred: supplierCatalogItemsTable.isPreferred,
    updatedAt: supplierCatalogItemsTable.updatedAt,
  })
    .from(supplierCatalogItemsTable)
    .innerJoin(suppliersTable, eq(supplierCatalogItemsTable.supplierId, suppliersTable.id))
    .where(and(
      eq(supplierCatalogItemsTable.ingredientId, ingredientId),
      eq(suppliersTable.active, true),
    ))
    .orderBy(asc(supplierCatalogItemsTable.price));

  // Compute unit prices (price / unitsPerPack) and statistics
  const unitPrices = entries.map((e) => {
    const rawPrice = parseFloat(e.price ?? "0");
    const disc = parseFloat(e.discount ?? "0");
    const tc = parseFloat(e.transportCost ?? "0");
    const units = parseFloat(e.unitsPerPack ?? "1") || 1;
    const effectivePrice = rawPrice * (1 - disc / 100) + tc;
    const unitPrice = effectivePrice / units;
    return { ...e, unitPrice: unitPrice.toFixed(4), effectivePrice: effectivePrice.toFixed(4) };
  });

  const allPrices = unitPrices.map((e) => parseFloat(e.unitPrice));
  const avgPrice = allPrices.length > 0 ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length : 0;
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;

  const result = unitPrices.map((e) => {
    const up = parseFloat(e.unitPrice);
    const pctVsAvg = avgPrice > 0 ? ((up - avgPrice) / avgPrice) * 100 : 0;
    const pctVsMin = minPrice > 0 ? ((up - minPrice) / minPrice) * 100 : 0;
    return { ...e, pctVsAvg: pctVsAvg.toFixed(2), pctVsMin: pctVsMin.toFixed(2) };
  });

  res.json({
    ingredientId,
    ingredientName: ingredient.name,
    ingredientUnit: ingredient.unit,
    avgUnitPrice: avgPrice.toFixed(4),
    minUnitPrice: minPrice.toFixed(4),
    suppliers: result,
  });
});

export default router;
