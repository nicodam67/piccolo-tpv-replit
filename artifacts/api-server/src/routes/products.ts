import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { productFormatsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// GET /products/:productId/formats
router.get("/products/:productId/formats", requireAuth, async (req, res): Promise<void> => {
  const productId = req.params.productId as string;
  const formats = await db
    .select()
    .from(productFormatsTable)
    .where(and(eq(productFormatsTable.productId, productId), eq(productFormatsTable.active, true)))
    .orderBy(asc(productFormatsTable.sortOrder));
  res.json(formats);
});

// POST /products/:productId/formats (admin)
router.post("/products/:productId/formats", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const productId = req.params.productId as string;
  const { name, price, sortOrder = 0 } = req.body as { name: string; price: string; sortOrder?: number };
  if (!name || price == null) {
    res.status(400).json({ error: "name y price son requeridos" });
    return;
  }
  const [format] = await db
    .insert(productFormatsTable)
    .values({ productId, name, price: String(price), sortOrder: Number(sortOrder) })
    .returning();
  res.status(201).json(format);
});

// PATCH /products/formats/:formatId (admin)
router.patch("/products/formats/:formatId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const formatId = req.params.formatId as string;
  const { name, price, sortOrder, active } = req.body as {
    name?: string; price?: string; sortOrder?: number; active?: boolean;
  };
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (price != null) updates.price = String(price);
  if (sortOrder != null) updates.sortOrder = Number(sortOrder);
  if (active != null) updates.active = active;
  if (!Object.keys(updates).length) { res.status(400).json({ error: "Sin cambios" }); return; }
  const [f] = await db
    .update(productFormatsTable)
    .set(updates as Partial<typeof productFormatsTable.$inferInsert>)
    .where(eq(productFormatsTable.id, formatId))
    .returning();
  if (!f) { res.status(404).json({ error: "Formato no encontrado" }); return; }
  res.json(f);
});

export default router;
