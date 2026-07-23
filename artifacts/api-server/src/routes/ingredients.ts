import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  ingredientsTable,
  recipeItemsTable,
  stockMovementsTable,
  productsTable,
  ingredientCostHistoryTable,
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
    name, internalCode,
    unit = "ud", purchaseUnit = "ud", consumptionUnit = "ud", conversionFactor = "1",
    purchaseCost = "0", averageCost,
    currentStock = "0", minStock = "0", optimalStock = "0", maxStock = "0",
    supplierName, allergenTags = [],
    categoryId, locationId,
  } = req.body as Record<string, unknown>;

  if (!name || !(name as string).trim()) { res.status(400).json({ error: "name es obligatorio" }); return; }

  const resolvedAvgCost = averageCost ?? purchaseCost ?? "0";

  const [ingredient] = await db.insert(ingredientsTable).values({
    name: (name as string).trim(),
    internalCode: (internalCode as string | undefined) ?? null,
    unit: String(unit),
    purchaseUnit: String(purchaseUnit),
    consumptionUnit: String(consumptionUnit),
    conversionFactor: String(conversionFactor),
    purchaseCost: String(purchaseCost),
    averageCost: String(resolvedAvgCost),
    lastPurchaseCost: String(purchaseCost),
    currentStock: String(currentStock),
    minStock: String(minStock),
    optimalStock: String(optimalStock),
    maxStock: String(maxStock),
    supplierName: (supplierName as string | undefined) ?? null,
    allergenTags: (allergenTags as string[]),
    categoryId: (categoryId as string | undefined) ?? null,
    locationId: (locationId as string | undefined) ?? null,
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
    name, internalCode, unit,
    purchaseUnit, consumptionUnit, conversionFactor,
    purchaseCost, averageCost,
    currentStock, minStock, optimalStock, maxStock,
    supplierName, allergenTags, active,
    categoryId, locationId,
    reason,
  } = req.body as Record<string, unknown>;

  const [existing] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Ingrediente no encontrado" }); return; }
  if (currentStock !== undefined) {
    res.status(400).json({ error: "Use los endpoints de movimiento o inventario para cambiar stock" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = (name as string).trim();
  if (internalCode !== undefined) updates.internalCode = internalCode;
  if (unit != null) updates.unit = unit;
  if (purchaseUnit != null) updates.purchaseUnit = purchaseUnit;
  if (consumptionUnit != null) updates.consumptionUnit = consumptionUnit;
  if (conversionFactor != null) updates.conversionFactor = String(conversionFactor);
  if (purchaseCost !== undefined) updates.purchaseCost = String(purchaseCost);
  if (averageCost !== undefined) updates.averageCost = String(averageCost);
  if (minStock !== undefined) updates.minStock = String(minStock);
  if (optimalStock !== undefined) updates.optimalStock = String(optimalStock);
  if (maxStock !== undefined) updates.maxStock = String(maxStock);
  if (supplierName !== undefined) updates.supplierName = supplierName;
  if (allergenTags !== undefined) updates.allergenTags = allergenTags;
  if (active != null) updates.active = active;
  if (categoryId !== undefined) updates.categoryId = categoryId ?? null;
  if (locationId !== undefined) updates.locationId = locationId ?? null;
  updates.updatedAt = new Date();

  if (!Object.keys(updates).length) { res.status(400).json({ error: "Sin cambios" }); return; }
  const [updated] = await db.update(ingredientsTable).set(updates as any).where(eq(ingredientsTable.id, id)).returning();

  // Log purchaseCost change to history
  if (
    purchaseCost !== undefined &&
    String(purchaseCost) !== String(existing.purchaseCost)
  ) {
    const user = (req as any).user;
    await db.insert(ingredientCostHistoryTable).values({
      ingredientId: id,
      previousCost: String(existing.purchaseCost),
      newCost: String(purchaseCost),
      supplierName: (supplierName as string | undefined) ?? existing.supplierName ?? null,
      reason: (reason as string | undefined) ?? null,
      employeeId: user?.id ?? null,
    });
  }

  res.json(updated);
});

// ── DELETE /admin/ingredients/:id — soft archive ──────────────────────────────
router.delete("/admin/ingredients/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db.update(ingredientsTable).set({ active: false, updatedAt: new Date() }).where(eq(ingredientsTable.id, id));
  res.json({ ok: true });
});

// ── POST /admin/ingredients/:id/stock-in ─────────────────────────────────────
// Manual stock entry — updates stock and computes weighted average cost.
router.post("/admin/ingredients/:id/stock-in", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const {
    quantity, unitCost, reason = "Entrada de mercancía",
  } = req.body as {
    quantity: string; unitCost?: string; reason?: string;
  };

  if (!quantity || parseFloat(String(quantity)) <= 0) {
    res.status(400).json({ error: "quantity debe ser mayor que 0" }); return;
  }

  const [ingredient] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, id));
  if (!ingredient) { res.status(404).json({ error: "Ingrediente no encontrado" }); return; }

  const user = (req as any).user;
  const inQty = parseFloat(String(quantity));

  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(ingredientsTable)
      .where(eq(ingredientsTable.id, id))
      .for("update");
    if (!locked) throw new Error("Ingrediente no encontrado");
    const prevStock = parseFloat(String(locked.currentStock));
    const newStock = prevStock + inQty;
    const costToUse = unitCost ? parseFloat(String(unitCost)) : parseFloat(String(locked.purchaseCost));
    const prevCost = locked.purchaseCost;
    const prevAvg = parseFloat(String(locked.averageCost ?? locked.purchaseCost ?? "0"));
    const newAvg = newStock > 0
      ? (prevStock * prevAvg + inQty * costToUse) / newStock
      : costToUse;
    await tx.update(ingredientsTable)
      .set({
        currentStock: String(newStock),
        averageCost: String(newAvg.toFixed(4)),
        lastPurchaseCost: String(costToUse),
        ...(unitCost ? { purchaseCost: String(unitCost) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(ingredientsTable.id, id));

    await tx.insert(stockMovementsTable).values({
      ingredientId: id,
      movementType: "purchase",
      quantity: String(inQty),
      unitCost: String(costToUse),
      reason,
      employeeId: user?.id ?? null,
    });

    // Log cost history if price changed
    if (unitCost && String(costToUse) !== String(prevCost)) {
      await tx.insert(ingredientCostHistoryTable).values({
        ingredientId: id,
        previousCost: prevCost,
        newCost: String(costToUse),
        supplierName: locked.supplierName ?? null,
        reason: `Stock-in: ${reason}`,
        employeeId: user?.id ?? null,
      });
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
  await db.transaction(async (tx) => {
    await tx.select({ id: ingredientsTable.id }).from(ingredientsTable)
      .where(eq(ingredientsTable.id, ingredientId))
      .for("update");
    await tx.update(ingredientsTable)
      .set({
        currentStock: sql`GREATEST(0, (${ingredientsTable.currentStock})::numeric + ${qty}::numeric)`,
        updatedAt: new Date(),
      })
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
      const [ing] = await tx.select().from(ingredientsTable)
        .where(eq(ingredientsTable.id, line.ingredientId))
        .for("update");
      if (!ing) continue;
      const before = parseFloat(String(ing.currentStock));
      const after = parseFloat(String(line.actualQty));
      if (isNaN(after)) continue;
      const diff = after - before;
      if (Math.abs(diff) < 0.001) continue;

      await tx.update(ingredientsTable)
        .set({ currentStock: String(after), updatedAt: new Date() })
        .where(eq(ingredientsTable.id, line.ingredientId));

      await tx.insert(stockMovementsTable).values({
        ingredientId: line.ingredientId,
        movementType: "inventory",
        quantity: String(diff),
        unitCost: String(ing.averageCost ?? ing.purchaseCost),
        reason: line.note ?? "Inventario físico",
        employeeId: user?.id ?? null,
      });

      results.push({ ingredientId: ing.id, name: ing.name, before, after, diff });
    }
  });

  res.status(201).json({ ok: true, adjusted: results.length, results });
});

// ── GET /admin/stock/product-availability ─────────────────────────────────────
router.get("/admin/stock/product-availability", requireAuth, requireRole("admin", "manager", "encargado"), async (req, res): Promise<void> => {
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
router.get("/admin/stock/reports", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { from, to } = req.query as { from?: string; to?: string };
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400_000);
  const periodDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400_000));

  const ingredients = await db
    .select()
    .from(ingredientsTable)
    .where(eq(ingredientsTable.active, true))
    .orderBy(asc(ingredientsTable.name));

  const movRows = await db
    .select({
      ingredientId: stockMovementsTable.ingredientId,
      movementType: stockMovementsTable.movementType,
      totalQty: sum(stockMovementsTable.quantity).mapWith(Number),
    })
    .from(stockMovementsTable)
    .where(and(
      gte(stockMovementsTable.createdAt, fromDate),
      lte(stockMovementsTable.createdAt, toDate),
    ))
    .groupBy(stockMovementsTable.ingredientId, stockMovementsTable.movementType);

  const saleMap = new Map<string, number>();
  const wasteMap = new Map<string, number>();
  for (const row of movRows) {
    if (row.movementType === "sale") saleMap.set(row.ingredientId, Math.abs(row.totalQty ?? 0));
    else if (row.movementType === "waste") wasteMap.set(row.ingredientId, Math.abs(row.totalQty ?? 0));
  }

  let warehouseValue = 0;
  const ingredientReports = ingredients.map((ing) => {
    const cur = parseFloat(String(ing.currentStock));
    // Use average_cost for warehouse valuation
    const cost = parseFloat(String(ing.averageCost ?? ing.purchaseCost));
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
      optimalStock: ing.optimalStock,
      maxStock: ing.maxStock,
      purchaseCost: ing.purchaseCost,
      averageCost: ing.averageCost,
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
