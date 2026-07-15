import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  productsTable,
  productFormatsTable,
  categoriesTable,
  recipeItemsTable,
  ingredientsTable,
  subrecipesTable,
  stockMovementsTable,
  ingredientCostHistoryTable,
} from "@workspace/db";
import {
  eq,
  asc,
  desc,
  and,
  isNull,
  isNotNull,
  gte,
  lte,
  sum,
  sql,
} from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_FOOD_COST_ALERT = 35; // % above which food cost triggers alert
const DEFAULT_MARGIN_ALERT = 20; // % below which margin triggers alert

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute cost for a single recipe line (ingredient or sub-recipe). */
function computeLineCost(
  unitCost: number,
  quantity: string,
  wastePercent: string,
): number {
  const qty = parseFloat(quantity) || 0;
  const waste = parseFloat(wastePercent) || 0;
  return unitCost * qty * (1 + waste / 100);
}

/** Compute all recipe lines for a product (base recipe, formatId IS NULL). */
async function computeProductCost(
  productId: string,
  formatId: string | null = null,
): Promise<{
  theoreticalCost: number;
  packagingCost: number;
  additionalCost: number;
  totalCost: number;
}> {
  // Fetch base recipe items (formatId IS NULL unless a specific format is requested)
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

  let theoreticalCost = 0;
  let packagingCostTotal = 0;
  let additionalCostTotal = 0;

  for (const line of lines) {
    const unitCost = line.ingredientId
      ? parseFloat(line.ingredientCost ?? "0")
      : parseFloat(line.subrecipeCost ?? "0");

    theoreticalCost += computeLineCost(unitCost, line.quantity, line.wastePercent);
    packagingCostTotal += parseFloat(line.packagingCost ?? "0");
    additionalCostTotal += parseFloat(line.additionalCost ?? "0");
  }

  const totalCost = theoreticalCost + packagingCostTotal + additionalCostTotal;
  return { theoreticalCost, packagingCost: packagingCostTotal, additionalCost: additionalCostTotal, totalCost };
}

/** Compute profitability metrics given price, taxRate, and cost. */
function computeMetrics(
  price: string,
  taxRate: number,
  totalCost: number,
): {
  pvp: number;
  basePrice: number;
  grossMargin: number;
  marginPct: number;
  foodCostPct: number;
} {
  const pvp = parseFloat(price);
  const basePrice = pvp / (1 + taxRate / 100);
  const grossMargin = basePrice - totalCost;
  const marginPct = basePrice > 0 ? (grossMargin / basePrice) * 100 : 0;
  const foodCostPct = basePrice > 0 ? (totalCost / basePrice) * 100 : 0;
  return { pvp, basePrice, grossMargin, marginPct, foodCostPct };
}

// ── GET /admin/profitability ──────────────────────────────────────────────────
router.get(
  "/admin/profitability",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        price: productsTable.price,
        taxRate: productsTable.taxRate,
        cost: productsTable.cost,
        categoryId: productsTable.categoryId,
        categoryName: categoriesTable.name,
        active: productsTable.active,
      })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(eq(productsTable.active, true))
      .orderBy(asc(productsTable.name));

    const result = await Promise.all(
      products.map(async (p) => {
        const { theoreticalCost, packagingCost, additionalCost, totalCost } =
          await computeProductCost(p.id);
        const { pvp, basePrice, grossMargin, marginPct, foodCostPct } =
          computeMetrics(p.price, p.taxRate, totalCost);

        const recordedCost = p.cost ? parseFloat(p.cost) : null;
        const costDeviation =
          recordedCost !== null ? theoreticalCost - recordedCost : null;

        const alertFoodCost = foodCostPct > DEFAULT_FOOD_COST_ALERT;
        const alertMargin = basePrice > 0 && marginPct < DEFAULT_MARGIN_ALERT;

        return {
          id: p.id,
          name: p.name,
          categoryId: p.categoryId,
          categoryName: p.categoryName,
          pvp: pvp.toFixed(2),
          basePrice: basePrice.toFixed(4),
          theoreticalCost: theoreticalCost.toFixed(4),
          packagingCost: packagingCost.toFixed(4),
          additionalCost: additionalCost.toFixed(4),
          totalCost: totalCost.toFixed(4),
          recordedCost: recordedCost !== null ? recordedCost.toFixed(4) : null,
          grossMargin: grossMargin.toFixed(4),
          marginPct: marginPct.toFixed(2),
          foodCostPct: foodCostPct.toFixed(2),
          costDeviation:
            costDeviation !== null ? costDeviation.toFixed(4) : null,
          alert: alertFoodCost
            ? "food_cost_high"
            : alertMargin
            ? "margin_low"
            : null,
          taxRate: p.taxRate,
        };
      }),
    );

    res.json(result);
  },
);

// ── GET /admin/profitability/by-category ─────────────────────────────────────
router.get(
  "/admin/profitability/by-category",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        price: productsTable.price,
        taxRate: productsTable.taxRate,
        cost: productsTable.cost,
        categoryId: productsTable.categoryId,
        categoryName: categoriesTable.name,
      })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(eq(productsTable.active, true))
      .orderBy(asc(categoriesTable.name), asc(productsTable.name));

    const byCategory = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        products: any[];
        totalCost: number;
        totalBase: number;
      }
    >();

    for (const p of products) {
      const { totalCost } = await computeProductCost(p.id);
      const { basePrice, grossMargin, marginPct, foodCostPct } = computeMetrics(
        p.price,
        p.taxRate,
        totalCost,
      );

      if (!byCategory.has(p.categoryId)) {
        byCategory.set(p.categoryId, {
          categoryId: p.categoryId,
          categoryName: p.categoryName,
          products: [],
          totalCost: 0,
          totalBase: 0,
        });
      }
      const cat = byCategory.get(p.categoryId)!;
      cat.products.push({
        id: p.id,
        name: p.name,
        pvp: parseFloat(p.price).toFixed(2),
        basePrice: basePrice.toFixed(4),
        totalCost: totalCost.toFixed(4),
        grossMargin: grossMargin.toFixed(4),
        marginPct: marginPct.toFixed(2),
        foodCostPct: foodCostPct.toFixed(2),
      });
      cat.totalCost += totalCost;
      cat.totalBase += basePrice;
    }

    const result = Array.from(byCategory.values()).map((cat) => ({
      categoryId: cat.categoryId,
      categoryName: cat.categoryName,
      avgFoodCostPct:
        cat.totalBase > 0
          ? ((cat.totalCost / cat.totalBase) * 100).toFixed(2)
          : "0.00",
      products: cat.products,
    }));

    res.json(result);
  },
);

// ── GET /admin/profitability/reports ─────────────────────────────────────────
router.get(
  "/admin/profitability/reports",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const { from, to } = req.query as { from?: string; to?: string };
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 86400_000);

    // All active products with their recipe costs
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        price: productsTable.price,
        taxRate: productsTable.taxRate,
        categoryName: categoriesTable.name,
      })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(eq(productsTable.active, true))
      .orderBy(asc(productsTable.name));

    const ranked = await Promise.all(
      products.map(async (p) => {
        const { totalCost } = await computeProductCost(p.id);
        const { basePrice, marginPct, foodCostPct } = computeMetrics(
          p.price,
          p.taxRate,
          totalCost,
        );
        return {
          id: p.id,
          name: p.name,
          categoryName: p.categoryName,
          pvp: parseFloat(p.price).toFixed(2),
          totalCost: totalCost.toFixed(4),
          basePrice: basePrice.toFixed(4),
          marginPct: parseFloat(marginPct.toFixed(2)),
          foodCostPct: parseFloat(foodCostPct.toFixed(2)),
        };
      }),
    );

    // Top/bottom 5
    const sorted = [...ranked].sort((a, b) => b.marginPct - a.marginPct);
    const mostProfitable = sorted.slice(0, 5);
    const leastProfitable = [...sorted].reverse().slice(0, 5);

    // High food cost
    const highFoodCost = ranked
      .filter((p) => p.foodCostPct > DEFAULT_FOOD_COST_ALERT)
      .sort((a, b) => b.foodCostPct - a.foodCostPct);

    // Sales movements in period for actual consumption
    const salesMovements = await db
      .select({
        ingredientId: stockMovementsTable.ingredientId,
        totalQty: sum(stockMovementsTable.quantity).mapWith(Number),
      })
      .from(stockMovementsTable)
      .where(
        and(
          eq(stockMovementsTable.movementType, "sale"),
          gte(stockMovementsTable.createdAt, fromDate),
          lte(stockMovementsTable.createdAt, toDate),
        ),
      )
      .groupBy(stockMovementsTable.ingredientId);

    const consumedByIngredient: Record<string, number> = {};
    for (const row of salesMovements) {
      consumedByIngredient[row.ingredientId] = Math.abs(row.totalQty ?? 0);
    }

    const avgFoodCostPct =
      ranked.length > 0
        ? ranked.reduce((s, p) => s + p.foodCostPct, 0) / ranked.length
        : 0;
    const avgMarginPct =
      ranked.length > 0
        ? ranked.reduce((s, p) => s + p.marginPct, 0) / ranked.length
        : 0;

    res.json({
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      avgFoodCostPct: avgFoodCostPct.toFixed(2),
      avgMarginPct: avgMarginPct.toFixed(2),
      mostProfitable,
      leastProfitable,
      highFoodCost,
      consumedByIngredient,
    });
  },
);

// ── GET /admin/cost-history ───────────────────────────────────────────────────
router.get(
  "/admin/cost-history",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const {
      ingredientId,
      limit = "50",
    } = req.query as { ingredientId?: string; limit?: string };

    let query = db
      .select({
        id: ingredientCostHistoryTable.id,
        ingredientId: ingredientCostHistoryTable.ingredientId,
        ingredientName: ingredientsTable.name,
        previousCost: ingredientCostHistoryTable.previousCost,
        newCost: ingredientCostHistoryTable.newCost,
        supplierName: ingredientCostHistoryTable.supplierName,
        reason: ingredientCostHistoryTable.reason,
        employeeId: ingredientCostHistoryTable.employeeId,
        createdAt: ingredientCostHistoryTable.createdAt,
      })
      .from(ingredientCostHistoryTable)
      .innerJoin(
        ingredientsTable,
        eq(ingredientCostHistoryTable.ingredientId, ingredientsTable.id),
      )
      .$dynamic();

    if (ingredientId) {
      query = query.where(
        eq(ingredientCostHistoryTable.ingredientId, ingredientId),
      );
    }

    const rows = await query
      .orderBy(desc(ingredientCostHistoryTable.createdAt))
      .limit(Math.min(parseInt(limit), 500));

    res.json(rows);
  },
);

// ── GET /admin/cost-alerts ────────────────────────────────────────────────────
router.get(
  "/admin/cost-alerts",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        price: productsTable.price,
        taxRate: productsTable.taxRate,
        categoryName: categoriesTable.name,
      })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(eq(productsTable.active, true));

    const alerts: any[] = [];

    for (const p of products) {
      const { totalCost } = await computeProductCost(p.id);
      const { basePrice, marginPct, foodCostPct } = computeMetrics(
        p.price,
        p.taxRate,
        totalCost,
      );
      if (basePrice === 0) continue;

      if (foodCostPct > DEFAULT_FOOD_COST_ALERT) {
        alerts.push({
          type: "food_cost_high",
          productId: p.id,
          productName: p.name,
          categoryName: p.categoryName,
          metric: "foodCostPct",
          value: foodCostPct.toFixed(2),
          threshold: DEFAULT_FOOD_COST_ALERT,
          pvp: parseFloat(p.price).toFixed(2),
          totalCost: totalCost.toFixed(4),
        });
      } else if (marginPct < DEFAULT_MARGIN_ALERT) {
        alerts.push({
          type: "margin_low",
          productId: p.id,
          productName: p.name,
          categoryName: p.categoryName,
          metric: "marginPct",
          value: marginPct.toFixed(2),
          threshold: DEFAULT_MARGIN_ALERT,
          pvp: parseFloat(p.price).toFixed(2),
          totalCost: totalCost.toFixed(4),
        });
      }
    }

    res.json(alerts);
  },
);

// ── POST /admin/price-simulator ───────────────────────────────────────────────
router.post(
  "/admin/price-simulator",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const {
      productId,
      targetMarginPct,
      maxFoodCostPct,
      roundTo = 0.05,
    } = req.body as {
      productId: string;
      targetMarginPct?: number;
      maxFoodCostPct?: number;
      roundTo?: number;
    };

    if (!productId) {
      res.status(400).json({ error: "productId es obligatorio" });
      return;
    }

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

    const { totalCost } = await computeProductCost(productId);
    const { pvp, basePrice, marginPct, foodCostPct } = computeMetrics(
      product.price,
      product.taxRate,
      totalCost,
    );

    const vatMultiplier = 1 + product.taxRate / 100;
    let recommendedBase: number | null = null;

    // Compute recommended base price from desired margin
    if (targetMarginPct != null && targetMarginPct > 0 && targetMarginPct < 100) {
      recommendedBase = totalCost / (1 - targetMarginPct / 100);
    }
    // Compute recommended base price from max food cost %
    else if (maxFoodCostPct != null && maxFoodCostPct > 0 && maxFoodCostPct < 100) {
      recommendedBase = totalCost / (maxFoodCostPct / 100);
    }

    let recommendedPvp: number | null = null;
    let roundedOptions: { price: string; marginPct: string; foodCostPct: string }[] = [];

    if (recommendedBase !== null) {
      recommendedPvp = recommendedBase * vatMultiplier;

      // Generate rounded options around the recommended price
      const step = roundTo > 0 ? roundTo : 0.05;
      const candidates = [-2, -1, 0, 1, 2].map((offset) => {
        const rounded = Math.ceil(recommendedPvp! / step + offset) * step;
        const roundedBase = rounded / vatMultiplier;
        const rGrossMargin = roundedBase - totalCost;
        const rMarginPct = roundedBase > 0 ? (rGrossMargin / roundedBase) * 100 : 0;
        const rFoodCostPct = roundedBase > 0 ? (totalCost / roundedBase) * 100 : 0;
        return {
          price: rounded.toFixed(2),
          marginPct: rMarginPct.toFixed(2),
          foodCostPct: rFoodCostPct.toFixed(2),
        };
      });
      // Deduplicate
      roundedOptions = candidates.filter(
        (c, i, arr) => arr.findIndex((x) => x.price === c.price) === i,
      );
    }

    res.json({
      productId: product.id,
      productName: product.name,
      taxRate: product.taxRate,
      currentPrice: pvp.toFixed(2),
      currentBasePrice: basePrice.toFixed(4),
      currentTotalCost: totalCost.toFixed(4),
      currentMarginPct: marginPct.toFixed(2),
      currentFoodCostPct: foodCostPct.toFixed(2),
      recommendedPrice: recommendedPvp ? recommendedPvp.toFixed(2) : null,
      recommendedBase: recommendedBase ? recommendedBase.toFixed(4) : null,
      roundedOptions,
      inputTargetMarginPct: targetMarginPct ?? null,
      inputMaxFoodCostPct: maxFoodCostPct ?? null,
    });
  },
);

export default router;
export { computeProductCost, computeMetrics };
