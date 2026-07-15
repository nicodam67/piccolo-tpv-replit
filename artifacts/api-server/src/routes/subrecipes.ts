import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  subrecipesTable,
  subrecipeItemsTable,
  ingredientsTable,
  recipeItemsTable,
} from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { syncProductCost } from "./recipes";

const router: IRouter = Router();

// Helper: compute line cost for a sub-recipe item
function computeSubrecipeLineCost(
  purchaseCost: string,
  quantity: string,
  wastePercent: string,
): number {
  const cost = parseFloat(purchaseCost) || 0;
  const qty = parseFloat(quantity) || 0;
  const waste = parseFloat(wastePercent) || 0;
  return cost * qty * (1 + waste / 100);
}

// Helper: propagate a subrecipe cost update to all dependent product/format costs
async function propagateSubrecipeCostToProducts(
  subrecipeId: string,
): Promise<void> {
  // Find all recipe items that reference this subrecipe
  const dependentLines = await db
    .select({
      productId: recipeItemsTable.productId,
      formatId: recipeItemsTable.formatId,
    })
    .from(recipeItemsTable)
    .where(eq(recipeItemsTable.subrecipeId, subrecipeId));

  // Unique product/format combos
  const seen = new Set<string>();
  for (const line of dependentLines) {
    const key = `${line.productId}:${line.formatId ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      await syncProductCost(line.productId, line.formatId);
    }
  }
}

// Helper: recompute and persist a sub-recipe's cost cache
async function recomputeSubrecipeCost(subrecipeId: string): Promise<number> {
  const [subrecipe] = await db
    .select({ yieldQuantity: subrecipesTable.yieldQuantity })
    .from(subrecipesTable)
    .where(eq(subrecipesTable.id, subrecipeId));

  const items = await db
    .select({
      quantity: subrecipeItemsTable.quantity,
      wastePercent: subrecipeItemsTable.wastePercent,
      purchaseCost: ingredientsTable.purchaseCost,
    })
    .from(subrecipeItemsTable)
    .innerJoin(
      ingredientsTable,
      eq(subrecipeItemsTable.ingredientId, ingredientsTable.id),
    )
    .where(eq(subrecipeItemsTable.subrecipeId, subrecipeId));

  const totalRaw = items.reduce(
    (sum, i) =>
      sum + computeSubrecipeLineCost(i.purchaseCost, i.quantity, i.wastePercent),
    0,
  );
  const yield_ = parseFloat(subrecipe?.yieldQuantity ?? "1") || 1;
  const costPerUnit = totalRaw / yield_;

  await db
    .update(subrecipesTable)
    .set({ cost: costPerUnit.toFixed(4), updatedAt: new Date() })
    .where(eq(subrecipesTable.id, subrecipeId));

  return costPerUnit;
}

// ── GET /admin/subrecipes ─────────────────────────────────────────────────────
router.get(
  "/admin/subrecipes",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(subrecipesTable)
      .orderBy(asc(subrecipesTable.name));
    res.json(rows);
  },
);

// ── POST /admin/subrecipes ────────────────────────────────────────────────────
router.post(
  "/admin/subrecipes",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const {
      name,
      unit = "ud",
      yieldQuantity = "1",
      notes,
    } = req.body as {
      name: string;
      unit?: string;
      yieldQuantity?: string;
      notes?: string;
    };

    if (!name?.trim()) {
      res.status(400).json({ error: "name es obligatorio" });
      return;
    }

    const [row] = await db
      .insert(subrecipesTable)
      .values({
        name: name.trim(),
        unit,
        yieldQuantity: String(yieldQuantity),
        notes: notes ?? null,
      })
      .returning();

    res.status(201).json(row);
  },
);

// ── GET /admin/subrecipes/:id ─────────────────────────────────────────────────
router.get(
  "/admin/subrecipes/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;

    const [subrecipe] = await db
      .select()
      .from(subrecipesTable)
      .where(eq(subrecipesTable.id, id));

    if (!subrecipe) {
      res.status(404).json({ error: "Subreceta no encontrada" });
      return;
    }

    const items = await db
      .select({
        id: subrecipeItemsTable.id,
        subrecipeId: subrecipeItemsTable.subrecipeId,
        ingredientId: subrecipeItemsTable.ingredientId,
        ingredientName: ingredientsTable.name,
        ingredientUnit: ingredientsTable.unit,
        ingredientCost: ingredientsTable.purchaseCost,
        quantity: subrecipeItemsTable.quantity,
        unit: subrecipeItemsTable.unit,
        wastePercent: subrecipeItemsTable.wastePercent,
      })
      .from(subrecipeItemsTable)
      .innerJoin(
        ingredientsTable,
        eq(subrecipeItemsTable.ingredientId, ingredientsTable.id),
      )
      .where(eq(subrecipeItemsTable.subrecipeId, id))
      .orderBy(asc(subrecipeItemsTable.id));

    const itemsWithCost = items.map((item) => ({
      ...item,
      lineCost: computeSubrecipeLineCost(
        item.ingredientCost,
        item.quantity,
        item.wastePercent,
      ).toFixed(4),
    }));

    const totalRaw = itemsWithCost.reduce(
      (s, i) => s + parseFloat(i.lineCost),
      0,
    );
    const yield_ = parseFloat(subrecipe.yieldQuantity) || 1;

    res.json({
      ...subrecipe,
      items: itemsWithCost,
      totalRawCost: totalRaw.toFixed(4),
      costPerUnit: (totalRaw / yield_).toFixed(4),
    });
  },
);

// ── PATCH /admin/subrecipes/:id ───────────────────────────────────────────────
router.patch(
  "/admin/subrecipes/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const { name, unit, yieldQuantity, notes, active } = req.body as Record<
      string,
      unknown
    >;

    const [existing] = await db
      .select()
      .from(subrecipesTable)
      .where(eq(subrecipesTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Subreceta no encontrada" });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name != null) updates.name = (name as string).trim();
    if (unit != null) updates.unit = unit;
    if (yieldQuantity != null)
      updates.yieldQuantity = String(yieldQuantity);
    if (notes !== undefined) updates.notes = notes;
    if (active != null) updates.active = active;

    const [updated] = await db
      .update(subrecipesTable)
      .set(updates as any)
      .where(eq(subrecipesTable.id, id))
      .returning();

    // Recompute cost if yield changed; propagate to dependent products
    if (yieldQuantity != null) {
      await recomputeSubrecipeCost(id);
      await propagateSubrecipeCostToProducts(id);
      const [fresh] = await db
        .select()
        .from(subrecipesTable)
        .where(eq(subrecipesTable.id, id));
      res.json(fresh);
      return;
    }

    res.json(updated);
  },
);

// ── DELETE /admin/subrecipes/:id — soft archive ───────────────────────────────
router.delete(
  "/admin/subrecipes/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    await db
      .update(subrecipesTable)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(subrecipesTable.id, id));
    res.json({ ok: true });
  },
);

// ── POST /admin/subrecipes/:id/items ─────────────────────────────────────────
router.post(
  "/admin/subrecipes/:id/items",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const subrecipeId = req.params.id as string;
    const {
      ingredientId,
      quantity,
      unit,
      wastePercent = "0",
    } = req.body as {
      ingredientId: string;
      quantity: string;
      unit?: string;
      wastePercent?: string;
    };

    if (!ingredientId || quantity == null) {
      res
        .status(400)
        .json({ error: "ingredientId y quantity son obligatorios" });
      return;
    }

    const [subrecipe] = await db
      .select()
      .from(subrecipesTable)
      .where(eq(subrecipesTable.id, subrecipeId));
    if (!subrecipe) {
      res.status(404).json({ error: "Subreceta no encontrada" });
      return;
    }

    const [ingredient] = await db
      .select()
      .from(ingredientsTable)
      .where(eq(ingredientsTable.id, ingredientId));
    if (!ingredient) {
      res.status(404).json({ error: "Ingrediente no encontrado" });
      return;
    }

    const [item] = await db
      .insert(subrecipeItemsTable)
      .values({
        subrecipeId,
        ingredientId,
        quantity: String(quantity),
        unit: unit ?? ingredient.unit,
        wastePercent: String(wastePercent),
      })
      .returning();

    await recomputeSubrecipeCost(subrecipeId);
    await propagateSubrecipeCostToProducts(subrecipeId);

    const lineCost = computeSubrecipeLineCost(
      ingredient.purchaseCost,
      item.quantity,
      item.wastePercent,
    );

    res.status(201).json({
      ...item,
      ingredientName: ingredient.name,
      ingredientUnit: ingredient.unit,
      ingredientCost: ingredient.purchaseCost,
      lineCost: lineCost.toFixed(4),
    });
  },
);

// ── PATCH /admin/subrecipe-items/:itemId ──────────────────────────────────────
router.patch(
  "/admin/subrecipe-items/:itemId",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const itemId = req.params.itemId as string;
    const { quantity, unit, wastePercent } = req.body as {
      quantity?: string;
      unit?: string;
      wastePercent?: string;
    };

    const [existing] = await db
      .select()
      .from(subrecipeItemsTable)
      .where(eq(subrecipeItemsTable.id, itemId));
    if (!existing) {
      res.status(404).json({ error: "Línea de subreceta no encontrada" });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (quantity != null) updates.quantity = String(quantity);
    if (unit != null) updates.unit = unit;
    if (wastePercent != null) updates.wastePercent = String(wastePercent);

    if (!Object.keys(updates).length) {
      res.status(400).json({ error: "Sin cambios" });
      return;
    }

    const [updated] = await db
      .update(subrecipeItemsTable)
      .set(updates as any)
      .where(eq(subrecipeItemsTable.id, itemId))
      .returning();

    await recomputeSubrecipeCost(existing.subrecipeId);
    await propagateSubrecipeCostToProducts(existing.subrecipeId);

    const [ingredient] = await db
      .select()
      .from(ingredientsTable)
      .where(eq(ingredientsTable.id, existing.ingredientId));
    const lineCost = computeSubrecipeLineCost(
      ingredient.purchaseCost,
      updated.quantity,
      updated.wastePercent,
    );

    res.json({
      ...updated,
      ingredientName: ingredient.name,
      ingredientUnit: ingredient.unit,
      ingredientCost: ingredient.purchaseCost,
      lineCost: lineCost.toFixed(4),
    });
  },
);

// ── DELETE /admin/subrecipe-items/:itemId ─────────────────────────────────────
router.delete(
  "/admin/subrecipe-items/:itemId",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const itemId = req.params.itemId as string;

    const [existing] = await db
      .select({ subrecipeId: subrecipeItemsTable.subrecipeId })
      .from(subrecipeItemsTable)
      .where(eq(subrecipeItemsTable.id, itemId));

    await db
      .delete(subrecipeItemsTable)
      .where(eq(subrecipeItemsTable.id, itemId));

    if (existing) {
      await recomputeSubrecipeCost(existing.subrecipeId);
      await propagateSubrecipeCostToProducts(existing.subrecipeId);
    }

    res.json({ ok: true });
  },
);

export default router;
export { recomputeSubrecipeCost };
