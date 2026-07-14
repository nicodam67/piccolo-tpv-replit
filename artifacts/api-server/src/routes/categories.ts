import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  categoriesTable,
  productsTable,
  productFormatsTable,
  productModifierGroupsTable,
} from "@workspace/db";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/categories", requireAuth, async (_req, res): Promise<void> => {
  const categories = await db
    .select({ id: categoriesTable.id, name: categoriesTable.name, sortOrder: categoriesTable.sortOrder })
    .from(categoriesTable)
    .where(eq(categoriesTable.active, true))
    .orderBy(asc(categoriesTable.sortOrder));
  res.json(categories);
});

router.get("/categories/:categoryId/products", requireAuth, async (req, res): Promise<void> => {
  const categoryId = req.params.categoryId as string;

  // Base products — only active + tpvVisible
  const products = await db
    .select({
      id: productsTable.id,
      categoryId: productsTable.categoryId,
      name: productsTable.name,
      price: productsTable.price,
      prepZone: productsTable.prepZone,
      tpvVisible: productsTable.tpvVisible,
      outOfStock: productsTable.outOfStock,
      allergens: productsTable.allergens,
    })
    .from(productsTable)
    .where(and(
      eq(productsTable.categoryId, categoryId),
      eq(productsTable.active, true),
      eq(productsTable.tpvVisible, true),
    ))
    .orderBy(asc(productsTable.name));

  if (!products.length) { res.json([]); return; }

  const productIds = products.map((p) => p.id);

  // Batch-load active formats
  const formats = await db
    .select()
    .from(productFormatsTable)
    .where(and(inArray(productFormatsTable.productId, productIds), eq(productFormatsTable.active, true)))
    .orderBy(asc(productFormatsTable.sortOrder));

  // Batch-load modifier group counts
  const modCounts = await db
    .select({
      productId: productModifierGroupsTable.productId,
      cnt: sql<number>`count(*)`,
    })
    .from(productModifierGroupsTable)
    .where(inArray(productModifierGroupsTable.productId, productIds))
    .groupBy(productModifierGroupsTable.productId);

  const formatsByProduct = new Map<string, typeof formats>();
  for (const f of formats) {
    if (!formatsByProduct.has(f.productId)) formatsByProduct.set(f.productId, []);
    formatsByProduct.get(f.productId)!.push(f);
  }

  const modCountMap = new Map<string, number>(
    modCounts.map((r) => [r.productId, Number(r.cnt)]),
  );

  res.json(
    products.map((p) => ({
      ...p,
      hasModifiers: (modCountMap.get(p.id) ?? 0) > 0,
      formats: formatsByProduct.get(p.id) ?? [],
    })),
  );
});

export default router;
