import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  ingredientsTable,
  recipeItemsTable,
  stockMovementsTable,
  productsTable,
} from "@workspace/db";
import { eq, and, ilike, or, desc, asc, gt, lte, sum, gte, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// ── GET /admin/ingredients ────────────────────────────────────────────────────
router.get("/admin/ingredients", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { search, active } = req.query as { search?: string; active?: string };

  let query = db.select().from(ingredientsTable).$dynamic();
  const conditions = [];
  if (active === "true") conditions.push(eq(ingredientsTable.active, true));
  if (active === "false") conditions.push(eq(ingredientsTable.active, false));
  if (search) conditions.push(
    or(
      ilike(ingredientsTable.name, `%${search}%`),
      ilike(ingredientsTable.internalCode, `%${search}%`),
    )!
  );
  if (conditions.length) query = query.where(and(...conditions));
  const rows = await query.orderBy(asc(ingredientsTable.name));
  res.json(rows);
});

// ── POST /admin/ingredients ───────────────────────────────────────────────────
router.post("/admin/ingredients", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const {
    name, internalCode, unit = "ud", purchaseCost = "0",
    currentStock = "0", minStock = "0", optimalStock = "0", supplierName, allergenTags = [],
  } = req.body as {
    name: string; internalCode?: string; unit?: string;
    purchaseCost?: string; currentStock?: string; minStock?: string;
    optimalStock?: string; supplierName?: string; allergenTags?: string[];
  };

  if (!name?.trim()) { res.status(400).json({ error: "name es obligatorio" }); return; }

  const [ingredient] = await db.insert(ingredientsTable).values({
    name: name.trim(), internalCode: internalCode ?? null,
    unit, purchaseCost: String(purchaseCost),
    currentStock: String(currentStock), minStock: String(minStock),
    optimalStock: String(optimalStock),
    supplierName: supplierName ?? null,
    allergenTags: allergenTags,
  }).returning();

  // If initial stock > 0, record a purchase movement
  if (parseFloat(String(currentStock)) > 0) {
    const user = (req as any).user;
    await db.insert(stockMovementsTable).values({
      ingredientId: ingredient.id,
      movementType: "purchase",
      quantity: String(currentStock),
      unitCost: String(purchaseCost),
      reason: "Stock inicial",
      employeeId: user?.id ?? null,
    });
  }

  res.status(201).json(ingredient);
});

// ── PATCH /admin/ingredients/:id ──────────────────────────────────────────────
router.patch("/admin/ingredients/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const {
    name, internalCode, unit, purchaseCost,
    currentStock, minStock, optimalStock, supplierName, allergenTags, active,
  } = req.body as Record<string, unknown>;

  const [existing] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Ingrediente no encontrado" }); return; }

  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = (name as string).trim();
  if (internalCode !== undefined) updates.internalCode = internalCode;
  if (unit != null) updates.unit = unit;
  if (purchaseCost !== undefined) updates.purchaseCost = String(purchaseCost);
  if (minStock !== undefined) updates.minStock = String(minStock);
  if (optimalStock !== undefined) updates.optimalStock = String(optimalStock);
  if (supplierName !== undefined) updates.supplierName = supplierName;
  if (allergenTags !== undefined) updates.allergenTags = allergenTags;
  if (active != null) updates.active = active;
  updates.updatedAt = new Date();

  // If currentStock is being set directly (inventory adjustment)
  if (currentStock !== undefined) {
    const prev = parseFloat(String(existing.currentStock));
    const next = parseFloat(String(currentStock));
    const diff = next - prev;
    updates.currentStock = String(next);

    if (diff !== 0) {
      const user = (req as any).user;
      await db.insert(stockMovementsTable).values({
        ingredientId: id,
        movementType: "adjustment",
        quantity: String(diff),
        unitCost: String(purchaseCost ?? existing.purchaseCost),
        reason: "Ajuste de inventario",
        employeeId: user?.id ?? null,
      });
    }
  }

  if (!Object.keys(updates).length) { res.status(400).json({ error: "Sin cambios" }); return; }
  const [updated] = await db.update(ingredientsTable).set(updates as any).where(eq(ingredientsTable.id, id)).returning();
  res.json(updated);
});

// ── DELETE /admin/ingredients/:id — soft archive ──────────────────────────────
router.delete("/admin/ingredients/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db.update(ingredientsTable).set({ active: false, updatedAt: new Date() }).where(eq(ingredientsTable.id, id));
  res.json({ ok: true });
});

// ── POST /admin/ingredients/:id/stock-in ─────────────────────────────────────
// Manual stock entry (purchase receipt)
router.post("/admin/ingredients/:id/stock-in", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { quantity, unitCost, reason = "Entrada de mercancía" } = req.body as {
    quantity: string; unitCost?: string; reason?: string;
  };

  if (!quantity || parseFloat(String(quantity)) <= 0) {
    res.status(400).json({ error: "quantity debe ser mayor que 0" }); return;
  }

  const [ingredient] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, id));
  if (!ingredient) { res.status(404).json({ error: "Ingrediente no encontrado" }); return; }

  const user = (req as any).user;
  const newStock = parseFloat(String(ingredient.currentStock)) + parseFloat(String(quantity));
  const costToUse = unitCost ?? ingredient.purchaseCost;

  await db.transaction(async (tx) => {
    await tx.update(ingredientsTable)
      .set({ currentStock: String(newStock), updatedAt: new Date() })
      .where(eq(ingredientsTable.id, id));
    await tx.insert(stockMovementsTable).values({
      ingredientId: id,
      movementType: "purchase",
      quantity: String(quantity),
      unitCost: String(costToUse),
      reason,
      employeeId: user?.id ?? null,
    });
    // Update purchaseCost if a new one was provided
    if (unitCost) {
      await tx.update(ingredientsTable)
        .set({ purchaseCost: String(unitCost), updatedAt: new Date() })
        .where(eq(ingredientsTable.id, id));
    }
  });

  const [updated] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, id));
  res.json(updated);
});

// ── GET /admin/stock/alerts ───────────────────────────────────────────────────
router.get("/admin/stock/alerts", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const alerts = await db
    .select()
    .from(ingredientsTable)
    .where(and(
      eq(ingredientsTable.active, true),
      gt(ingredientsTable.minStock, ingredientsTable.currentStock),
    ))
    .orderBy(asc(ingredientsTable.name));
  res.json(alerts);
});

// ── GET /admin/stock/movements ────────────────────────────────────────────────
router.get("/admin/stock/movements", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { ingredientId, movementType, limit = "100" } = req.query as {
    ingredientId?: string; movementType?: string; limit?: string;
  };

  let query = db
    .select({
      id: stockMovementsTable.id,
      ingredientId: stockMovementsTable.ingredientId,
      ingredientName: ingredientsTable.name,
      ingredientUnit: ingredientsTable.unit,
      movementType: stockMovementsTable.movementType,
      quantity: stockMovementsTable.quantity,
      unitCost: stockMovementsTable.unitCost,
      reason: stockMovementsTable.reason,
      employeeId: stockMovementsTable.employeeId,
      orderItemId: stockMovementsTable.orderItemId,
      createdAt: stockMovementsTable.createdAt,
    })
    .from(stockMovementsTable)
    .innerJoin(ingredientsTable, eq(stockMovementsTable.ingredientId, ingredientsTable.id))
    .$dynamic();

  const conditions = [];
  if (ingredientId) conditions.push(eq(stockMovementsTable.ingredientId, ingredientId));
  if (movementType) conditions.push(eq(stockMovementsTable.movementType, movementType));
  if (conditions.length) query = query.where(and(...conditions));

  const rows = await query
    .orderBy(desc(stockMovementsTable.createdAt))
    .limit(Math.min(parseInt(limit), 500));

  res.json(rows);
});

// ── POST /admin/stock/movements — manual waste/adjustment ─────────────────────
router.post("/admin/stock/movements", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { ingredientId, movementType, quantity, unitCost, reason = "" } = req.body as {
    ingredientId: string; movementType: string; quantity: string;
    unitCost?: string; reason?: string;
  };

  const VALID_TYPES = ["purchase", "adjustment", "waste", "inventory"];
  if (!ingredientId || !movementType || quantity == null) {
    res.status(400).json({ error: "ingredientId, movementType y quantity son obligatorios" }); return;
  }
  if (!VALID_TYPES.includes(movementType)) {
    res.status(400).json({ error: `movementType debe ser: ${VALID_TYPES.join(", ")}` }); return;
  }

  const [ingredient] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, ingredientId));
  if (!ingredient) { res.status(404).json({ error: "Ingrediente no encontrado" }); return; }

  const user = (req as any).user;
  const qty = parseFloat(String(quantity));
  const newStock = parseFloat(String(ingredient.currentStock)) + qty;

  await db.transaction(async (tx) => {
    await tx.update(ingredientsTable)
      .set({ currentStock: String(Math.max(0, newStock)), updatedAt: new Date() })
      .where(eq(ingredientsTable.id, ingredientId));
    await tx.insert(stockMovementsTable).values({
      ingredientId,
      movementType,
      quantity: String(qty),
      unitCost: unitCost ? String(unitCost) : null,
      reason,
      employeeId: user?.id ?? null,
    });
  });

  res.status(201).json({ ok: true });
});

// ── POST /admin/stock/inventory-count ─────────────────────────────────────────
// Guided physical count: accepts actual quantities, generates 'inventory' movements.
router.post("/admin/stock/inventory-count", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { lines } = req.body as {
    lines: { ingredientId: string; actualQty: string; note?: string }[];
  };
  if (!Array.isArray(lines) || lines.length === 0) {
    res.status(400).json({ error: "lines is required and must be non-empty" }); return;
  }

  const user = (req as any).user;
  const results: { ingredientId: string; name: string; before: number; after: number; diff: number }[] = [];

  await db.transaction(async (tx) => {
    for (const line of lines) {
      const [ing] = await tx.select().from(ingredientsTable).where(eq(ingredientsTable.id, line.ingredientId));
      if (!ing) continue;
      const before = parseFloat(String(ing.currentStock));
      const after = parseFloat(String(line.actualQty));
      if (isNaN(after)) continue;
      const diff = after - before;
      if (Math.abs(diff) < 0.001) continue; // no meaningful change

      await tx.update(ingredientsTable)
        .set({ currentStock: String(after), updatedAt: new Date() })
        .where(eq(ingredientsTable.id, line.ingredientId));

      await tx.insert(stockMovementsTable).values({
        ingredientId: line.ingredientId,
        movementType: "inventory",
        quantity: String(diff),
        unitCost: String(ing.purchaseCost),
        reason: line.note ?? "Inventario físico",
        employeeId: user?.id ?? null,
      });

      results.push({ ingredientId: ing.id, name: ing.name, before, after, diff });
    }
  });

  res.status(201).json({ ok: true, adjusted: results.length, results });
});

// ── GET /admin/stock/product-availability ─────────────────────────────────────
// Returns each product's stock availability (all recipe ingredients > 0).
router.get("/admin/stock/product-availability", requireAuth, async (req, res): Promise<void> => {
  // Fetch all recipe ingredient requirements joined with current stock
  const recipeRows = await db
    .select({
      productId: recipeItemsTable.productId,
      ingredientId: ingredientsTable.id,
      ingredientName: ingredientsTable.name,
      currentStock: ingredientsTable.currentStock,
      quantity: recipeItemsTable.quantity,
    })
    .from(recipeItemsTable)
    .innerJoin(ingredientsTable, eq(recipeItemsTable.ingredientId, ingredientsTable.id));

  // Group by product
  const map = new Map<string, { hasLowStock: boolean; zeroIngredients: string[] }>();
  for (const row of recipeRows) {
    const cur = parseFloat(String(row.currentStock));
    const existing = map.get(row.productId) ?? { hasLowStock: false, zeroIngredients: [] };
    if (cur <= 0) {
      existing.hasLowStock = true;
      existing.zeroIngredients.push(row.ingredientName);
    }
    map.set(row.productId, existing);
  }

  const result: { productId: string; hasRecipe: boolean; lowStock: boolean; zeroIngredients: string[] }[] = [];
  for (const [productId, info] of map.entries()) {
    result.push({ productId, hasRecipe: true, lowStock: info.hasLowStock, zeroIngredients: info.zeroIngredients });
  }

  res.json(result);
});

// ── GET /admin/stock/reports ──────────────────────────────────────────────────
// Returns stock value, daily consumption, and waste totals for the given period.
router.get("/admin/stock/reports", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { from, to } = req.query as { from?: string; to?: string };
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400_000);
  const periodDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400_000));

  // All active ingredients
  const ingredients = await db
    .select()
    .from(ingredientsTable)
    .where(eq(ingredientsTable.active, true))
    .orderBy(asc(ingredientsTable.name));

  // Aggregate sale and waste movements in the period per ingredient
  const movRows = await db
    .select({
      ingredientId: stockMovementsTable.ingredientId,
      movementType: stockMovementsTable.movementType,
      totalQty: sum(stockMovementsTable.quantity).mapWith(Number),
    })
    .from(stockMovementsTable)
    .where(
      and(
        gte(stockMovementsTable.createdAt, fromDate),
        lte(stockMovementsTable.createdAt, toDate),
      ),
    )
    .groupBy(stockMovementsTable.ingredientId, stockMovementsTable.movementType);

  // Build maps
  const saleMap = new Map<string, number>();
  const wasteMap = new Map<string, number>();
  for (const row of movRows) {
    if (row.movementType === "sale") {
      saleMap.set(row.ingredientId, Math.abs(row.totalQty ?? 0));
    } else if (row.movementType === "waste") {
      wasteMap.set(row.ingredientId, Math.abs(row.totalQty ?? 0));
    }
  }

  let warehouseValue = 0;
  const ingredientReports = ingredients.map((ing) => {
    const cur = parseFloat(String(ing.currentStock));
    const cost = parseFloat(String(ing.purchaseCost));
    const stockValue = cur * cost;
    warehouseValue += stockValue;
    const saleTotal = saleMap.get(ing.id) ?? 0;
    const dailyConsumption = saleTotal / periodDays;
    const wasteTotal = wasteMap.get(ing.id) ?? 0;
    const daysRemaining = dailyConsumption > 0 ? Math.floor(cur / dailyConsumption) : null;
    return {
      id: ing.id,
      name: ing.name,
      unit: ing.unit,
      currentStock: ing.currentStock,
      minStock: ing.minStock,
      optimalStock: (ing as any).optimalStock ?? "0",
      purchaseCost: ing.purchaseCost,
      stockValue,
      dailyConsumption,
      wasteTotal,
      daysRemaining,
    };
  });

  res.json({
    warehouseValue,
    currency: "EUR",
    ingredients: ingredientReports,
    periodDays,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
  });
});

export default router;
