import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  ingredientsTable,
  recipeItemsTable,
  stockMovementsTable,
} from "@workspace/db";
import { eq, and, ilike, or, desc, asc, gt, lte } from "drizzle-orm";
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
    currentStock = "0", minStock = "0", supplierName, allergenTags = [],
  } = req.body as {
    name: string; internalCode?: string; unit?: string;
    purchaseCost?: string; currentStock?: string; minStock?: string;
    supplierName?: string; allergenTags?: string[];
  };

  if (!name?.trim()) { res.status(400).json({ error: "name es obligatorio" }); return; }

  const [ingredient] = await db.insert(ingredientsTable).values({
    name: name.trim(), internalCode: internalCode ?? null,
    unit, purchaseCost: String(purchaseCost),
    currentStock: String(currentStock), minStock: String(minStock),
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
    currentStock, minStock, supplierName, allergenTags, active,
  } = req.body as Record<string, unknown>;

  const [existing] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Ingrediente no encontrado" }); return; }

  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = (name as string).trim();
  if (internalCode !== undefined) updates.internalCode = internalCode;
  if (unit != null) updates.unit = unit;
  if (purchaseCost !== undefined) updates.purchaseCost = String(purchaseCost);
  if (minStock !== undefined) updates.minStock = String(minStock);
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

  const VALID_TYPES = ["purchase", "adjustment", "waste"];
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

export default router;
