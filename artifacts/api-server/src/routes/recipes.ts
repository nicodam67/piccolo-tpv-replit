import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  recipeItemsTable,
  ingredientsTable,
  productsTable,
  productFormatsTable,
  subrecipesTable,
  subrecipeItemsTable,
} from "@workspace/db";
import { eq, asc, and, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// Alias for subrecipeItemsTable used in allergen JOIN (avoids column ambiguity)
const subrecipeItemsTableAlias = alias(subrecipeItemsTable, "sr_items");
import { requireAuth, requireRole } from "../middlewares/auth";
import { recalculateProductAllergens } from "./allergens";

const router: IRouter = Router();

// Helper: compute cost for a single recipe line
function computeLineCost(
  unitCost: string | number,
  quantity: string,
  wastePercent: string,
): number {
  const cost = typeof unitCost === "string" ? parseFloat(unitCost) : unitCost;
  const qty = parseFloat(quantity) || 0;
  const waste = parseFloat(wastePercent) || 0;
  return (cost || 0) * qty * (1 + waste / 100);
}

// Helper: recompute and persist product/format cost from its recipe lines.
export async function syncProductCost(
  productId: string,
  formatId?: string | null,
): Promise<void> {
  const lines = await db
    .select({
      ingredientId: recipeItemsTable.ingredientId,
      subrecipeId: recipeItemsTable.subrecipeId,
      quantity: recipeItemsTable.quantity,
      wastePercent: recipeItemsTable.wastePercent,
      packagingCost: recipeItemsTable.packagingCost,
      additionalCost: recipeItemsTable.additionalCost,
      ingredientCost: ingredientsTable.purchaseCost,
      subrecipeCost: subrecipesTable.cost,
    })
    .from(recipeItemsTable)
    .leftJoin(
      ingredientsTable,
      eq(recipeItemsTable.ingredientId, ingredientsTable.id),
    )
    .leftJoin(
      subrecipesTable,
      eq(recipeItemsTable.subrecipeId, subrecipesTable.id),
    )
    .where(
      and(
        eq(recipeItemsTable.productId, productId),
        formatId ? eq(recipeItemsTable.formatId, formatId) : isNull(recipeItemsTable.formatId),
      ),
    );

  const totalCost = lines.reduce((sum, line) => {
    const unitCost = line.ingredientId
      ? parseFloat(line.ingredientCost ?? "0")
      : parseFloat(line.subrecipeCost ?? "0");
    const lineCost = computeLineCost(unitCost, line.quantity, line.wastePercent);
    return (
      sum +
      lineCost +
      parseFloat(line.packagingCost ?? "0") +
      parseFloat(line.additionalCost ?? "0")
    );
  }, 0);

  if (formatId) {
    await db
      .update(productFormatsTable)
      .set({ cost: totalCost.toFixed(4) })
      .where(eq(productFormatsTable.id, formatId));
  } else {
    await db
      .update(productsTable)
      .set({ cost: totalCost.toFixed(4) })
      .where(eq(productsTable.id, productId));
  }
}

// Helper: recompute and persist product allergens from its recipe ingredients.
async function syncProductAllergens(productId: string): Promise<void> {
  // 1) Allergens from direct ingredient lines
  const directLines = await db
    .select({ allergenTags: ingredientsTable.allergenTags })
    .from(recipeItemsTable)
    .innerJoin(
      ingredientsTable,
      eq(recipeItemsTable.ingredientId, ingredientsTable.id),
    )
    .where(
      and(
        eq(recipeItemsTable.productId, productId),
        isNull(recipeItemsTable.formatId),
      ),
    );

  // 2) Allergens from subrecipe ingredient lines (one level deep)
  const subrecipeLines = await db
    .select({ allergenTags: ingredientsTable.allergenTags })
    .from(recipeItemsTable)
    .innerJoin(
      subrecipesTable,
      eq(recipeItemsTable.subrecipeId, subrecipesTable.id),
    )
    .innerJoin(
      subrecipeItemsTableAlias,
      eq(subrecipeItemsTableAlias.subrecipeId, subrecipesTable.id),
    )
    .innerJoin(
      ingredientsTable,
      eq(subrecipeItemsTableAlias.ingredientId, ingredientsTable.id),
    )
    .where(
      and(
        eq(recipeItemsTable.productId, productId),
        isNull(recipeItemsTable.formatId),
      ),
    );

  const allergenSet = new Set<string>();
  for (const line of [...directLines, ...subrecipeLines]) {
    const tags = Array.isArray(line.allergenTags)
      ? (line.allergenTags as string[])
      : [];
    for (const tag of tags) allergenSet.add(tag);
  }

  await db
    .update(productsTable)
    .set({ allergens: Array.from(allergenSet).sort().join(",") })
    .where(eq(productsTable.id, productId));

  // Also update the structured allergen cache
  try { await recalculateProductAllergens(productId); } catch { /* non-fatal */ }
}

// Helper: build a rich line object with computed cost fields
function buildLineShape(line: {
  id: string;
  productId: string;
  formatId: string | null;
  ingredientId: string | null;
  subrecipeId: string | null;
  quantity: string;
  unit: string;
  wastePercent: string;
  packagingCost: string;
  additionalCost: string;
  ingredientName?: string | null;
  ingredientUnit?: string | null;
  ingredientCost?: string | null;
  subrecipeName?: string | null;
  subrecipeUnit?: string | null;
  subrecipeCost?: string | null;
}) {
  const isSubrecipe = !!line.subrecipeId;
  const displayName = isSubrecipe
    ? (line.subrecipeName ?? "Subreceta")
    : (line.ingredientName ?? "Ingrediente");
  const displayUnit = isSubrecipe
    ? (line.subrecipeUnit ?? "ud")
    : (line.ingredientUnit ?? "ud");
  const unitCost = isSubrecipe
    ? parseFloat(line.subrecipeCost ?? "0")
    : parseFloat(line.ingredientCost ?? "0");

  const lineCost = computeLineCost(unitCost, line.quantity, line.wastePercent);
  const totalLineCost =
    lineCost +
    parseFloat(line.packagingCost ?? "0") +
    parseFloat(line.additionalCost ?? "0");

  return {
    id: line.id,
    productId: line.productId,
    formatId: line.formatId,
    ingredientId: line.ingredientId,
    subrecipeId: line.subrecipeId,
    lineType: isSubrecipe ? "subrecipe" : "ingredient",
    ingredientName: displayName,
    ingredientUnit: displayUnit,
    ingredientCost: unitCost.toFixed(4),
    quantity: line.quantity,
    unit: line.unit,
    wastePercent: line.wastePercent,
    packagingCost: line.packagingCost,
    additionalCost: line.additionalCost,
    lineCost: lineCost.toFixed(4),
    totalLineCost: totalLineCost.toFixed(4),
  };
}

// Helper: fetch all recipe lines for a product (all formats)
async function fetchRecipeLines(productId: string) {
  return db
    .select({
      id: recipeItemsTable.id,
      productId: recipeItemsTable.productId,
      formatId: recipeItemsTable.formatId,
      ingredientId: recipeItemsTable.ingredientId,
      subrecipeId: recipeItemsTable.subrecipeId,
      quantity: recipeItemsTable.quantity,
      unit: recipeItemsTable.unit,
      wastePercent: recipeItemsTable.wastePercent,
      packagingCost: recipeItemsTable.packagingCost,
      additionalCost: recipeItemsTable.additionalCost,
      ingredientName: ingredientsTable.name,
      ingredientUnit: ingredientsTable.unit,
      ingredientCost: ingredientsTable.purchaseCost,
      subrecipeName: subrecipesTable.name,
      subrecipeUnit: subrecipesTable.unit,
      subrecipeCost: subrecipesTable.cost,
    })
    .from(recipeItemsTable)
    .leftJoin(
      ingredientsTable,
      eq(recipeItemsTable.ingredientId, ingredientsTable.id),
    )
    .leftJoin(
      subrecipesTable,
      eq(recipeItemsTable.subrecipeId, subrecipesTable.id),
    )
    .where(eq(recipeItemsTable.productId, productId))
    .orderBy(asc(recipeItemsTable.id));
}

// Helper: compute summary from a set of lines
function computeSummary(
  lines: ReturnType<typeof buildLineShape>[],
  price: string,
  taxRate: number,
) {
  const totalCost = lines.reduce(
    (s, l) => s + parseFloat(l.totalLineCost),
    0,
  );
  const pvp = parseFloat(price);
  const basePrice = pvp / (1 + taxRate / 100);
  const grossMarginBase = basePrice - totalCost;
  const marginPctBase =
    basePrice > 0 ? (grossMarginBase / basePrice) * 100 : 0;
  const foodCostPct = basePrice > 0 ? (totalCost / basePrice) * 100 : 0;
  // Legacy fields (margin against PVP)
  const grossMargin = pvp - totalCost;
  const marginPct = pvp > 0 ? (grossMargin / pvp) * 100 : 0;
  return {
    totalCost: totalCost.toFixed(4),
    grossMargin: grossMargin.toFixed(4),
    marginPct: marginPct.toFixed(2),
    basePrice: basePrice.toFixed(4),
    grossMarginBase: grossMarginBase.toFixed(4),
    marginPctBase: marginPctBase.toFixed(2),
    foodCostPct: foodCostPct.toFixed(2),
  };
}

// ── GET /admin/products/:productId/recipe ─────────────────────────────────────
// Returns baseRecipe (formatId IS NULL) and byFormat map.
// ?formatId= filters to a specific format.
router.get(
  "/admin/products/:productId/recipe",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const productId = req.params.productId as string;
    const { formatId } = req.query as { formatId?: string };

    const [product] = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        price: productsTable.price,
        taxRate: productsTable.taxRate,
      })
      .from(productsTable)
      .where(eq(productsTable.id, productId));

    if (!product) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    const allLines = await fetchRecipeLines(productId);
    const allBuilt = allLines.map(buildLineShape);

    if (formatId) {
      // Specific format recipe
      const fmtLines = allBuilt.filter((l) => l.formatId === formatId);
      const summary = computeSummary(fmtLines, product.price, product.taxRate);
      res.json({
        productId: product.id,
        productName: product.name,
        price: product.price,
        taxRate: product.taxRate,
        formatId,
        lines: fmtLines,
        ...summary,
      });
      return;
    }

    // Base recipe (formatId IS NULL) + byFormat map
    const baseLines = allBuilt.filter((l) => l.formatId === null);
    const summary = computeSummary(baseLines, product.price, product.taxRate);

    // Group by format
    const byFormat: Record<
      string,
      { lines: typeof baseLines; totalCost: string }
    > = {};
    for (const line of allBuilt.filter((l) => l.formatId !== null)) {
      if (!byFormat[line.formatId!]) byFormat[line.formatId!] = { lines: [], totalCost: "0" };
      byFormat[line.formatId!].lines.push(line);
    }
    for (const fmtId of Object.keys(byFormat)) {
      const fmtLines = byFormat[fmtId].lines;
      byFormat[fmtId].totalCost = fmtLines
        .reduce((s, l) => s + parseFloat(l.totalLineCost), 0)
        .toFixed(4);
    }

    res.json({
      productId: product.id,
      productName: product.name,
      price: product.price,
      taxRate: product.taxRate,
      lines: baseLines,
      byFormat,
      ...summary,
    });
  },
);

// ── POST /admin/products/:productId/recipe/lines ──────────────────────────────
router.post(
  "/admin/products/:productId/recipe/lines",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const productId = req.params.productId as string;
    const {
      ingredientId,
      subrecipeId,
      quantity,
      unit,
      wastePercent = "0",
      formatId,
      packagingCost = "0",
      additionalCost = "0",
    } = req.body as {
      ingredientId?: string;
      subrecipeId?: string;
      quantity: string;
      unit?: string;
      wastePercent?: string;
      formatId?: string;
      packagingCost?: string;
      additionalCost?: string;
    };

    if ((!ingredientId && !subrecipeId) || quantity == null) {
      res
        .status(400)
        .json({
          error:
            "ingredientId o subrecipeId es obligatorio, junto con quantity",
        });
      return;
    }
    if (ingredientId && subrecipeId) {
      res
        .status(400)
        .json({ error: "No se puede especificar ingredientId y subrecipeId a la vez" });
      return;
    }

    let defaultUnit = "ud";
    let lineCostResult = 0;

    if (ingredientId) {
      const [ingredient] = await db
        .select()
        .from(ingredientsTable)
        .where(eq(ingredientsTable.id, ingredientId));
      if (!ingredient) {
        res.status(404).json({ error: "Ingrediente no encontrado" });
        return;
      }
      defaultUnit = ingredient.unit;
      lineCostResult = computeLineCost(
        ingredient.purchaseCost,
        String(quantity),
        String(wastePercent),
      );
    } else if (subrecipeId) {
      const [subrecipe] = await db
        .select()
        .from(subrecipesTable)
        .where(eq(subrecipesTable.id, subrecipeId));
      if (!subrecipe) {
        res.status(404).json({ error: "Subreceta no encontrada" });
        return;
      }
      defaultUnit = subrecipe.unit;
      lineCostResult = computeLineCost(
        subrecipe.cost,
        String(quantity),
        String(wastePercent),
      );
    }

    const [line] = await db
      .insert(recipeItemsTable)
      .values({
        productId,
        formatId: formatId ?? null,
        ingredientId: ingredientId ?? null,
        subrecipeId: subrecipeId ?? null,
        quantity: String(quantity),
        unit: unit ?? defaultUnit,
        wastePercent: String(wastePercent),
        packagingCost: String(packagingCost),
        additionalCost: String(additionalCost),
      })
      .returning();

    // Sync cost + allergens (always recompute allergens for base-recipe changes)
    await syncProductCost(productId, formatId ?? null);
    if (!formatId) {
      await syncProductAllergens(productId);
    }

    // Return full line shape
    const allLines = await fetchRecipeLines(productId);
    const freshLine = allLines.find((l) => l.id === line.id);
    if (freshLine) {
      res.status(201).json(buildLineShape(freshLine));
    } else {
      res.status(201).json(line);
    }
  },
);

// ── PATCH /admin/recipe-lines/:lineId ────────────────────────────────────────
router.patch(
  "/admin/recipe-lines/:lineId",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const lineId = req.params.lineId as string;
    const {
      ingredientId,
      subrecipeId,
      quantity,
      unit,
      wastePercent,
      packagingCost,
      additionalCost,
    } = req.body as {
      ingredientId?: string;
      subrecipeId?: string;
      quantity?: string;
      unit?: string;
      wastePercent?: string;
      packagingCost?: string;
      additionalCost?: string;
    };

    const [existing] = await db
      .select()
      .from(recipeItemsTable)
      .where(eq(recipeItemsTable.id, lineId));
    if (!existing) {
      res.status(404).json({ error: "Línea de receta no encontrada" });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (ingredientId != null) {
      updates.ingredientId = ingredientId;
      updates.subrecipeId = null;
    }
    if (subrecipeId != null) {
      updates.subrecipeId = subrecipeId;
      updates.ingredientId = null;
    }
    if (quantity != null) updates.quantity = String(quantity);
    if (unit != null) updates.unit = unit;
    if (wastePercent != null) updates.wastePercent = String(wastePercent);
    if (packagingCost != null) updates.packagingCost = String(packagingCost);
    if (additionalCost != null) updates.additionalCost = String(additionalCost);

    if (!Object.keys(updates).length) {
      res.status(400).json({ error: "Sin cambios" });
      return;
    }

    await db
      .update(recipeItemsTable)
      .set(updates as any)
      .where(eq(recipeItemsTable.id, lineId));

    // Sync cost + allergens (always recompute allergens for base-recipe changes)
    await syncProductCost(existing.productId, existing.formatId);
    if (!existing.formatId) {
      await syncProductAllergens(existing.productId);
    }

    const allLines = await fetchRecipeLines(existing.productId);
    const freshLine = allLines.find((l) => l.id === lineId);
    if (freshLine) {
      res.json(buildLineShape(freshLine));
    } else {
      res.json({ ok: true });
    }
  },
);

// ── DELETE /admin/recipe-lines/:lineId ───────────────────────────────────────
router.delete(
  "/admin/recipe-lines/:lineId",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const lineId = req.params.lineId as string;

    const [line] = await db
      .select({
        productId: recipeItemsTable.productId,
        formatId: recipeItemsTable.formatId,
        ingredientId: recipeItemsTable.ingredientId,
      })
      .from(recipeItemsTable)
      .where(eq(recipeItemsTable.id, lineId));

    await db.delete(recipeItemsTable).where(eq(recipeItemsTable.id, lineId));

    if (line) {
      await syncProductCost(line.productId, line.formatId);
      // Always recompute allergens for base-recipe line deletions
      if (!line.formatId) {
        await syncProductAllergens(line.productId);
      }
    }

    res.json({ ok: true });
  },
);

// ── PUT /admin/products/:productId/recipe — replace full recipe ───────────────
// Accepts { lines: [{ingredientId?, subrecipeId?, quantity, unit?, wastePercent?, formatId?, packagingCost?, additionalCost?}] }
router.put(
  "/admin/products/:productId/recipe",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const productId = req.params.productId as string;
    const { formatId, lines = [] } = req.body as {
      formatId?: string;
      lines: {
        ingredientId?: string;
        subrecipeId?: string;
        quantity: string;
        unit?: string;
        wastePercent?: string;
        packagingCost?: string;
        additionalCost?: string;
      }[];
    };

    // Validate all lines BEFORE starting the transaction to avoid partial writes
    for (const l of lines) {
      const hasIng = !!l.ingredientId;
      const hasSr = !!l.subrecipeId;
      if ((!hasIng && !hasSr) || (hasIng && hasSr)) {
        res.status(400).json({
          error:
            "Cada línea debe tener exactamente uno de: ingredientId, subrecipeId",
        });
        return;
      }
    }

    await db.transaction(async (tx) => {
      // Delete only lines for the specified scope (base or format)
      const scope = formatId
        ? eq(recipeItemsTable.formatId, formatId)
        : isNull(recipeItemsTable.formatId);
      await tx
        .delete(recipeItemsTable)
        .where(and(eq(recipeItemsTable.productId, productId), scope));

      for (const l of lines) {
        let defaultUnit = "ud";
        if (l.ingredientId) {
          const [ing] = await tx
            .select({ unit: ingredientsTable.unit })
            .from(ingredientsTable)
            .where(eq(ingredientsTable.id, l.ingredientId));
          if (ing) defaultUnit = ing.unit;
        } else if (l.subrecipeId) {
          const [sr] = await tx
            .select({ unit: subrecipesTable.unit })
            .from(subrecipesTable)
            .where(eq(subrecipesTable.id, l.subrecipeId));
          if (sr) defaultUnit = sr.unit;
        }

        await tx.insert(recipeItemsTable).values({
          productId,
          formatId: formatId ?? null,
          ingredientId: l.ingredientId ?? null,
          subrecipeId: l.subrecipeId ?? null,
          quantity: String(l.quantity),
          unit: l.unit ?? defaultUnit,
          wastePercent: String(l.wastePercent ?? "0"),
          packagingCost: String(l.packagingCost ?? "0"),
          additionalCost: String(l.additionalCost ?? "0"),
        });
      }
    });

    await syncProductCost(productId, formatId ?? null);
    if (!formatId) {
      await syncProductAllergens(productId);
    }

    // Return the updated recipe
    const allLines = await fetchRecipeLines(productId);
    const scopedLines = allLines
      .filter((l) =>
        formatId ? l.formatId === formatId : l.formatId === null,
      )
      .map(buildLineShape);

    const [product] = await db
      .select({
        price: productsTable.price,
        taxRate: productsTable.taxRate,
      })
      .from(productsTable)
      .where(eq(productsTable.id, productId));

    const summary = computeSummary(
      scopedLines,
      product?.price ?? "0",
      product?.taxRate ?? 10,
    );

    res.json({ productId, formatId: formatId ?? null, lines: scopedLines, ...summary });
  },
);

export default router;
