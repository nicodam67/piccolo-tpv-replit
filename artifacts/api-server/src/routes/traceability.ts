/**
 * Lot traceability and recall management
 * Endpoints: lot search, lot trace report, block/recall, resolve
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  lotBlocksTable,
  allergenAuditLogTable,
} from "@workspace/db";
import {
  ingredientLotsTable,
  goodsReceiptsTable,
  goodsReceiptItemsTable,
  suppliersTable,
} from "@workspace/db";
import {
  ingredientsTable,
  recipeItemsTable,
  productsTable,
  subrecipesTable,
  subrecipeItemsTable,
  ordersTable,
  orderItemsTable,
  restaurantTablesTable,
  stockMovementsTable,
} from "@workspace/db";
import { eq, and, ilike, or, desc, gte, lte, isNull, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

const srItemsAlias = alias(subrecipeItemsTable, "sr_items_t");

async function logAudit(entity: string, entityId: string, action: string,
  actorId: string | undefined, actorName: string, after?: unknown) {
  try {
    await db.insert(allergenAuditLogTable).values({
      entity, entityId, action, actorId: actorId ?? null, actorName, after: after as any,
    });
  } catch { /* non-fatal */ }
}

// Helper: find products using a given ingredient (directly or via subrecipes)
async function findProductsForIngredient(ingredientId: string) {
  const direct = await db
    .select({ id: productsTable.id, name: productsTable.name })
    .from(recipeItemsTable)
    .innerJoin(productsTable, eq(recipeItemsTable.productId, productsTable.id))
    .where(and(eq(recipeItemsTable.ingredientId, ingredientId), isNull(recipeItemsTable.formatId)));

  const viaSub = await db
    .select({ id: productsTable.id, name: productsTable.name })
    .from(recipeItemsTable)
    .innerJoin(subrecipesTable, eq(recipeItemsTable.subrecipeId, subrecipesTable.id))
    .innerJoin(srItemsAlias, eq(srItemsAlias.subrecipeId, subrecipesTable.id))
    .innerJoin(productsTable, eq(recipeItemsTable.productId, productsTable.id))
    .where(and(eq(srItemsAlias.ingredientId, ingredientId), isNull(recipeItemsTable.formatId)));

  const allProds = [...direct, ...viaSub];
  const seen = new Set<string>();
  return allProds.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
}

// ─── GET /api/admin/traceability/lots?q=&ingredientId= ───────────────────────
router.get("/admin/traceability/lots", requireAuth, requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const { q, ingredientId, limit = "100" } = req.query as {
    q?: string; ingredientId?: string; limit?: string;
  };

  const baseQuery = db
    .select({
      id: ingredientLotsTable.id,
      lotNumber: ingredientLotsTable.lotNumber,
      ingredientId: ingredientLotsTable.ingredientId,
      ingredientName: ingredientsTable.name,
      supplierId: ingredientLotsTable.supplierId,
      supplierName: suppliersTable.commercialName,
      receiptId: ingredientLotsTable.receiptId,
      expiryDate: ingredientLotsTable.expiryDate,
      initialQty: ingredientLotsTable.initialQty,
      remainingQty: ingredientLotsTable.remainingQty,
      createdAt: ingredientLotsTable.createdAt,
    })
    .from(ingredientLotsTable)
    .innerJoin(ingredientsTable, eq(ingredientLotsTable.ingredientId, ingredientsTable.id))
    .leftJoin(suppliersTable, eq(ingredientLotsTable.supplierId, suppliersTable.id))
    .$dynamic();

  const conditions = [];
  if (ingredientId) conditions.push(eq(ingredientLotsTable.ingredientId, ingredientId));
  if (q) conditions.push(or(
    ilike(ingredientLotsTable.lotNumber, `%${q}%`),
    ilike(ingredientsTable.name, `%${q}%`),
    ilike(suppliersTable.commercialName, `%${q}%`)
  )!);

  const lots = await (conditions.length ? baseQuery.where(and(...conditions)) : baseQuery)
    .orderBy(desc(ingredientLotsTable.createdAt))
    .limit(Math.min(parseInt(limit), 200));

  // Attach active block status (only unresolved blocks count as active)
  const lotIds = lots.map(l => l.id);
  const activeBlocks = lotIds.length > 0
    ? await db.select().from(lotBlocksTable).where(
        and(inArray(lotBlocksTable.lotId, lotIds), isNull(lotBlocksTable.resolvedAt))
      )
    : [];

  const activeBlockByLot = new Map(activeBlocks.map(b => [b.lotId, b]));
  res.json(lots.map(lot => ({
    ...lot,
    isBlocked: activeBlockByLot.has(lot.id),
    block: activeBlockByLot.get(lot.id) ?? null,
  })));
});

// ─── GET /api/admin/traceability/lots/:lotId — full trace ────────────────────
router.get("/admin/traceability/lots/:lotId", requireAuth, requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const { lotId } = req.params;

  const [lot] = await db
    .select({
      id: ingredientLotsTable.id,
      lotNumber: ingredientLotsTable.lotNumber,
      ingredientId: ingredientLotsTable.ingredientId,
      ingredientName: ingredientsTable.name,
      supplierId: ingredientLotsTable.supplierId,
      supplierName: suppliersTable.commercialName,
      receiptId: ingredientLotsTable.receiptId,
      expiryDate: ingredientLotsTable.expiryDate,
      initialQty: ingredientLotsTable.initialQty,
      remainingQty: ingredientLotsTable.remainingQty,
      createdAt: ingredientLotsTable.createdAt,
    })
    .from(ingredientLotsTable)
    .innerJoin(ingredientsTable, eq(ingredientLotsTable.ingredientId, ingredientsTable.id))
    .leftJoin(suppliersTable, eq(ingredientLotsTable.supplierId, suppliersTable.id))
    .where(eq(ingredientLotsTable.id, lotId as string));

  if (!lot) { res.status(404).json({ error: "Lote no encontrado" }); return; }

  // Products using this ingredient
  const affectedProducts = await findProductsForIngredient(lot.ingredientId);

  // Find orders where this ingredient's products were sold (during lot's validity period)
  // Use stock movements of type "sale" for this ingredient, time-bound by lot creation → expiry
  const expiryDate = lot.expiryDate ? new Date(lot.expiryDate) : new Date(Date.now() + 365 * 86400_000);
  const movements = await db
    .select({
      orderItemId: stockMovementsTable.orderItemId,
      createdAt: stockMovementsTable.createdAt,
    })
    .from(stockMovementsTable)
    .where(and(
      eq(stockMovementsTable.ingredientId, lot.ingredientId),
      eq(stockMovementsTable.movementType, "sale"),
      gte(stockMovementsTable.createdAt, lot.createdAt),
      lte(stockMovementsTable.createdAt, expiryDate),
    ));

  const orderItemIds = movements.map(m => m.orderItemId).filter(Boolean) as string[];
  let affectedOrders: { id: string; tableId: string | null; tableNumber: string | null; date: string }[] = [];

  if (orderItemIds.length > 0) {
    const orderItemRows = await db
      .select({
        id: orderItemsTable.id,
        orderId: orderItemsTable.orderId,
      })
      .from(orderItemsTable)
      .where(inArray(orderItemsTable.id, orderItemIds.slice(0, 50)));

    const orderIds = [...new Set(orderItemRows.map(r => r.orderId))];
    if (orderIds.length > 0) {
      const orderRows = await db
        .select({
          id: ordersTable.id,
          tableId: ordersTable.tableId,
          createdAt: ordersTable.createdAt,
          tableName: restaurantTablesTable.name,
        })
        .from(ordersTable)
        .leftJoin(restaurantTablesTable, eq(ordersTable.tableId, restaurantTablesTable.id))
        .where(inArray(ordersTable.id, orderIds.slice(0, 50)));

      affectedOrders = orderRows.map(o => ({
        id: o.id,
        tableId: o.tableId,
        tableNumber: o.tableName ?? null,
        date: o.createdAt.toISOString(),
      }));
    }
  }

  // Check active block (resolvedAt IS NULL = still blocked)
  const [activeBlock] = await db
    .select()
    .from(lotBlocksTable)
    .where(and(eq(lotBlocksTable.lotId, lotId as string), isNull(lotBlocksTable.resolvedAt)))
    .limit(1);

  const isBlocked = !!activeBlock;
  res.json({
    lot: { ...lot, isBlocked, block: activeBlock ?? null },
    affectedProducts,
    affectedOrders,
    isBlocked,
    block: activeBlock ?? null,
    movementCount: movements.length,
  });
});

// ─── POST /api/admin/traceability/lots/:lotId/block — block/recall ────────────
router.post("/admin/traceability/lots/:lotId/block", requireAuth, requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const { lotId } = req.params;
  const { reason } = req.body as { reason: string };
  const user = req.user!;

  if (!reason?.trim()) { res.status(400).json({ error: "El motivo es obligatorio" }); return; }

  const [lot] = await db
    .select({
      id: ingredientLotsTable.id,
      lotNumber: ingredientLotsTable.lotNumber,
      ingredientId: ingredientLotsTable.ingredientId,
      ingredientName: ingredientsTable.name,
      createdAt: ingredientLotsTable.createdAt,
      expiryDate: ingredientLotsTable.expiryDate,
    })
    .from(ingredientLotsTable)
    .innerJoin(ingredientsTable, eq(ingredientLotsTable.ingredientId, ingredientsTable.id))
    .where(eq(ingredientLotsTable.id, lotId as string));

  if (!lot) { res.status(404).json({ error: "Lote no encontrado" }); return; }

  // Check not already blocked
  const [existing] = await db.select().from(lotBlocksTable)
    .where(and(eq(lotBlocksTable.lotId, lotId as string), isNull(lotBlocksTable.resolvedAt))).limit(1);
  if (existing) { res.status(409).json({ error: "Este lote ya está bloqueado" }); return; }

  const affectedProducts = await findProductsForIngredient(lot.ingredientId);

  // Find affected orders
  const expiryDate = lot.expiryDate ? new Date(lot.expiryDate) : new Date();
  const movements = await db
    .select({ orderItemId: stockMovementsTable.orderItemId, createdAt: stockMovementsTable.createdAt })
    .from(stockMovementsTable)
    .where(and(
      eq(stockMovementsTable.ingredientId, lot.ingredientId),
      eq(stockMovementsTable.movementType, "sale"),
      gte(stockMovementsTable.createdAt, lot.createdAt),
      lte(stockMovementsTable.createdAt, expiryDate),
    ));

  const summary = `Lote ${lot.lotNumber} bloqueado. Ingrediente: ${lot.ingredientName}. Productos afectados: ${affectedProducts.length}. Ventas afectadas estimadas: ${movements.length}`;

  const blockReport = {
    affectedIngredients: [{ id: lot.ingredientId, name: lot.ingredientName }],
    affectedProducts: affectedProducts.map(p => ({ id: p.id, name: p.name })),
    affectedOrders: movements.slice(0, 200).map(m => ({
      id: m.orderItemId ?? "",
      date: m.createdAt.toISOString(),
    })),
    summary,
  };

  const [block] = await db.insert(lotBlocksTable).values({
    lotId: lotId as string,
    lotNumber: lot.lotNumber,
    ingredientId: lot.ingredientId,
    blockedBy: user.id,
    reason,
    blockReport: blockReport as any,
  }).returning();

  await logAudit("lot_block", lotId as string, "lot_blocked", user.id, user.name, { reason, summary });
  res.status(201).json({ ...block, blockReport });
});

// ─── GET /api/admin/traceability/blocks — list all blocks ────────────────────
router.get("/admin/traceability/blocks", requireAuth, requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: lotBlocksTable.id,
      lotId: lotBlocksTable.lotId,
      lotNumber: lotBlocksTable.lotNumber,
      ingredientId: lotBlocksTable.ingredientId,
      ingredientName: ingredientsTable.name,
      blockedAt: lotBlocksTable.blockedAt,
      reason: lotBlocksTable.reason,
      blockReport: lotBlocksTable.blockReport,
      resolvedAt: lotBlocksTable.resolvedAt,
      resolveNote: lotBlocksTable.resolveNote,
    })
    .from(lotBlocksTable)
    .leftJoin(ingredientsTable, eq(lotBlocksTable.ingredientId, ingredientsTable.id))
    .orderBy(desc(lotBlocksTable.blockedAt));
  res.json(rows);
});

// ─── PATCH /api/admin/traceability/blocks/:blockId/resolve ───────────────────
router.patch("/admin/traceability/blocks/:blockId/resolve", requireAuth, requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const { blockId } = req.params;
  const { resolveNote } = req.body as { resolveNote?: string };
  const user = req.user!;

  const [block] = await db.update(lotBlocksTable)
    .set({ resolvedAt: new Date(), resolvedBy: user.id, resolveNote: resolveNote ?? null })
    .where(eq(lotBlocksTable.id, blockId as string))
    .returning();

  if (!block) { res.status(404).json({ error: "Retirada no encontrada" }); return; }

  await logAudit("lot_block", blockId as string, "lot_resolved", user.id, user.name, { resolveNote });
  res.json(block);
});

export default router;
