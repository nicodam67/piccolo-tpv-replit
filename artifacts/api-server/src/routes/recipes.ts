import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  recipeItemsTable,
  ingredientsTable,
  productsTable,
} from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// Helper: compute recipe cost for a list of lines (with ingredient data)
function computeLineCost(
  purchaseCost: string,
  quantity: string,
  wastePercent: string,
): number {
  const cost = parseFloat(purchaseCost) || 0;
  const qty = parseFloat(quantity) || 0;
  const waste = parseFloat(wastePercent) || 0;
  return cost * qty * (1 + waste / 100);
}

// ── GET /admin/products/:productId/recipe ─────────────────────────────────────
router.get("/admin/products/:productId/recipe", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const productId = req.params.productId as string;

  const [product] = await db
    .select({ id: productsTable.id, name: productsTable.name, price: productsTable.price })
    .from(productsTable)
    .where(eq(productsTable.id, productId));

  if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  const lines = await db
    .select({
      id: recipeItemsTable.id,
      productId: recipeItemsTable.productId,
      ingredientId: recipeItemsTable.ingredientId,
      ingredientName: ingredientsTable.name,
      ingredientUnit: ingredientsTable.unit,
      ingredientCost: ingredientsTable.purchaseCost,
      quantity: recipeItemsTable.quantity,
      unit: recipeItemsTable.unit,
      wastePercent: recipeItemsTable.wastePercent,
    })
    .from(recipeItemsTable)
    .innerJoin(ingredientsTable, eq(recipeItemsTable.ingredientId, ingredientsTable.id))
    .where(eq(recipeItemsTable.productId, productId))
    .orderBy(asc(recipeItemsTable.id));

  const linesWithCost = lines.map((line) => {
    const lineCost = computeLineCost(line.ingredientCost, line.quantity, line.wastePercent);
    return { ...line, lineCost: lineCost.toFixed(4) };
  });

  const totalCost = linesWithCost.reduce((sum, l) => sum + parseFloat(l.lineCost), 0);
  const price = parseFloat(product.price);
  const grossMargin = price - totalCost;
  const marginPct = price > 0 ? (grossMargin / price) * 100 : 0;

  res.json({
    productId: product.id,
    productName: product.name,
    price: product.price,
    lines: linesWithCost,
    totalCost: totalCost.toFixed(4),
    grossMargin: grossMargin.toFixed(4),
    marginPct: marginPct.toFixed(2),
  });
});

// ── POST /admin/products/:productId/recipe/lines ──────────────────────────────
router.post("/admin/products/:productId/recipe/lines", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const productId = req.params.productId as string;
  const { ingredientId, quantity, unit, wastePercent = "0" } = req.body as {
    ingredientId: string; quantity: string; unit?: string; wastePercent?: string;
  };

  if (!ingredientId || quantity == null) {
    res.status(400).json({ error: "ingredientId y quantity son obligatorios" }); return;
  }

  const [ingredient] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, ingredientId));
  if (!ingredient) { res.status(404).json({ error: "Ingrediente no encontrado" }); return; }

  const [line] = await db.insert(recipeItemsTable).values({
    productId,
    ingredientId,
    quantity: String(quantity),
    unit: unit ?? ingredient.unit,
    wastePercent: String(wastePercent),
  }).returning();

  const lineCost = computeLineCost(ingredient.purchaseCost, line.quantity, line.wastePercent);
  res.status(201).json({
    ...line,
    ingredientName: ingredient.name,
    ingredientUnit: ingredient.unit,
    ingredientCost: ingredient.purchaseCost,
    lineCost: lineCost.toFixed(4),
  });
});

// ── PATCH /admin/recipe-lines/:lineId ────────────────────────────────────────
router.patch("/admin/recipe-lines/:lineId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const lineId = req.params.lineId as string;
  const { ingredientId, quantity, unit, wastePercent } = req.body as {
    ingredientId?: string; quantity?: string; unit?: string; wastePercent?: string;
  };

  const [existing] = await db.select().from(recipeItemsTable).where(eq(recipeItemsTable.id, lineId));
  if (!existing) { res.status(404).json({ error: "Línea de receta no encontrada" }); return; }

  const updates: Record<string, unknown> = {};
  if (ingredientId != null) updates.ingredientId = ingredientId;
  if (quantity != null) updates.quantity = String(quantity);
  if (unit != null) updates.unit = unit;
  if (wastePercent != null) updates.wastePercent = String(wastePercent);

  if (!Object.keys(updates).length) { res.status(400).json({ error: "Sin cambios" }); return; }

  const [updated] = await db.update(recipeItemsTable).set(updates as any).where(eq(recipeItemsTable.id, lineId)).returning();

  const effectiveIngredientId = (updates.ingredientId as string) ?? existing.ingredientId;
  const [ingredient] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, effectiveIngredientId));
  const lineCost = computeLineCost(ingredient.purchaseCost, updated.quantity, updated.wastePercent);

  res.json({
    ...updated,
    ingredientName: ingredient.name,
    ingredientUnit: ingredient.unit,
    ingredientCost: ingredient.purchaseCost,
    lineCost: lineCost.toFixed(4),
  });
});

// ── DELETE /admin/recipe-lines/:lineId ───────────────────────────────────────
router.delete("/admin/recipe-lines/:lineId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const lineId = req.params.lineId as string;
  await db.delete(recipeItemsTable).where(eq(recipeItemsTable.id, lineId));
  res.json({ ok: true });
});

// ── PUT /admin/products/:productId/recipe — replace full recipe ───────────────
// Accepts { lines: [{ingredientId, quantity, unit, wastePercent}] }
router.put("/admin/products/:productId/recipe", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const productId = req.params.productId as string;
  const { lines = [] } = req.body as {
    lines: { ingredientId: string; quantity: string; unit?: string; wastePercent?: string }[];
  };

  await db.transaction(async (tx) => {
    await tx.delete(recipeItemsTable).where(eq(recipeItemsTable.productId, productId));
    if (lines.length) {
      for (const l of lines) {
        const [ingredient] = await tx.select().from(ingredientsTable).where(eq(ingredientsTable.id, l.ingredientId));
        if (!ingredient) continue;
        await tx.insert(recipeItemsTable).values({
          productId,
          ingredientId: l.ingredientId,
          quantity: String(l.quantity),
          unit: l.unit ?? ingredient.unit,
          wastePercent: String(l.wastePercent ?? "0"),
        });
      }
    }
  });

  // Return the full recipe after replacement
  const lines2 = await db
    .select({
      id: recipeItemsTable.id,
      productId: recipeItemsTable.productId,
      ingredientId: recipeItemsTable.ingredientId,
      ingredientName: ingredientsTable.name,
      ingredientUnit: ingredientsTable.unit,
      ingredientCost: ingredientsTable.purchaseCost,
      quantity: recipeItemsTable.quantity,
      unit: recipeItemsTable.unit,
      wastePercent: recipeItemsTable.wastePercent,
    })
    .from(recipeItemsTable)
    .innerJoin(ingredientsTable, eq(recipeItemsTable.ingredientId, ingredientsTable.id))
    .where(eq(recipeItemsTable.productId, productId))
    .orderBy(asc(recipeItemsTable.id));

  const linesWithCost = lines2.map((line) => ({
    ...line,
    lineCost: computeLineCost(line.ingredientCost, line.quantity, line.wastePercent).toFixed(4),
  }));

  const totalCost = linesWithCost.reduce((sum, l) => sum + parseFloat(l.lineCost), 0);
  const [product] = await db.select({ price: productsTable.price }).from(productsTable).where(eq(productsTable.id, productId));
  const price = parseFloat(product?.price ?? "0");
  const grossMargin = price - totalCost;
  const marginPct = price > 0 ? (grossMargin / price) * 100 : 0;

  res.json({
    productId,
    lines: linesWithCost,
    totalCost: totalCost.toFixed(4),
    grossMargin: grossMargin.toFixed(4),
    marginPct: marginPct.toFixed(2),
  });
});

export default router;
