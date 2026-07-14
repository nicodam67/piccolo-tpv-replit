import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { categoriesTable, productsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
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
  const categoryId = req.params.categoryId;
  const products = await db
    .select({
      id: productsTable.id,
      categoryId: productsTable.categoryId,
      name: productsTable.name,
      price: productsTable.price,
      prepZone: productsTable.prepZone,
    })
    .from(productsTable)
    .where(and(eq(productsTable.categoryId, categoryId), eq(productsTable.active, true)))
    .orderBy(asc(productsTable.name));
  res.json(products);
});

export default router;
