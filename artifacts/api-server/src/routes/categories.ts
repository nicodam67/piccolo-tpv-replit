import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  categoriesTable,
  subcategoriesTable,
  productsTable,
  productFormatsTable,
  productModifierGroupsTable,
} from "@workspace/db";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logDocumentAction } from "../lib/document-audit";

const router: IRouter = Router();

// ── Public / waiter routes ────────────────────────────────────────────────────

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

  const products = await db
    .select({
      id: productsTable.id,
      categoryId: productsTable.categoryId,
      subcategoryId: productsTable.subcategoryId,
      name: productsTable.name,
      price: productsTable.price,
      taxRate: productsTable.taxRate,
      prepZone: productsTable.prepZone,
      tpvVisible: productsTable.tpvVisible,
      outOfStock: productsTable.outOfStock,
      allergens: productsTable.allergens,
      imageUrl: productsTable.imageUrl,
    })
    .from(productsTable)
    .where(and(
      eq(productsTable.categoryId, categoryId),
      eq(productsTable.active, true),
      eq(productsTable.tpvVisible, true),
    ))
    .orderBy(asc(productsTable.sortOrder), asc(productsTable.name));

  if (!products.length) { res.json([]); return; }

  const productIds = products.map((p) => p.id);

  const formats = await db
    .select()
    .from(productFormatsTable)
    .where(and(inArray(productFormatsTable.productId, productIds), eq(productFormatsTable.active, true)))
    .orderBy(asc(productFormatsTable.sortOrder));

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

// ── Admin category routes ─────────────────────────────────────────────────────

// GET /admin/categories — all categories with subcategories
router.get("/admin/categories", requireAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  const categories = await db
    .select()
    .from(categoriesTable)
    .orderBy(asc(categoriesTable.sortOrder));

  const subcats = await db
    .select()
    .from(subcategoriesTable)
    .orderBy(asc(subcategoriesTable.sortOrder));

  const subcatsByCategory = new Map<string, typeof subcats>();
  for (const s of subcats) {
    if (!subcatsByCategory.has(s.categoryId)) subcatsByCategory.set(s.categoryId, []);
    subcatsByCategory.get(s.categoryId)!.push(s);
  }

  res.json(categories.map((c) => ({
    ...c,
    subcategories: subcatsByCategory.get(c.id) ?? [],
  })));
});

// POST /admin/categories — create category
router.post("/admin/categories", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { name, color, icon, sortOrder = 0 } = req.body as {
    name: string; color?: string; icon?: string; sortOrder?: number;
  };
  if (!name?.trim()) { res.status(400).json({ error: "name es obligatorio" }); return; }

  const [cat] = await db
    .insert(categoriesTable)
    .values({ name: name.trim(), color: color ?? null, icon: icon ?? null, sortOrder: Number(sortOrder) })
    .returning();

  const user = (req as any).user;
  await logDocumentAction({ action: "create_category", documentType: "category", documentId: cat.id, employeeId: user?.id, employeeName: user?.name ?? "", details: `Categoría "${cat.name}" creada` });

  res.status(201).json({ ...cat, subcategories: [] });
});

// PATCH /admin/categories/:id — update category
router.patch("/admin/categories/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { name, color, icon, active, sortOrder } = req.body as {
    name?: string; color?: string | null; icon?: string | null; active?: boolean; sortOrder?: number;
  };

  const [existing] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Categoría no encontrada" }); return; }

  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name.trim();
  if (color !== undefined) updates.color = color;
  if (icon !== undefined) updates.icon = icon;
  if (active != null) updates.active = active;
  if (sortOrder != null) updates.sortOrder = Number(sortOrder);

  if (!Object.keys(updates).length) { res.status(400).json({ error: "Sin cambios" }); return; }

  const [updated] = await db.update(categoriesTable).set(updates as any).where(eq(categoriesTable.id, id)).returning();
  const user = (req as any).user;
  await logDocumentAction({ action: "update_category", documentType: "category", documentId: id, employeeId: user?.id, employeeName: user?.name ?? "", details: `Categoría "${updated.name}" actualizada` });

  res.json(updated);
});

// DELETE /admin/categories/:id — soft-archive
router.delete("/admin/categories/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [existing] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Categoría no encontrada" }); return; }

  await db.update(categoriesTable).set({ active: false }).where(eq(categoriesTable.id, id));
  const user = (req as any).user;
  await logDocumentAction({ action: "archive_category", documentType: "category", documentId: id, employeeId: user?.id, employeeName: user?.name ?? "", details: `Categoría "${existing.name}" archivada` });

  res.json({ ok: true });
});

// PATCH /admin/categories/sort — bulk sort order update
router.patch("/admin/categories/sort", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { order } = req.body as { order: { id: string; sortOrder: number }[] };
  if (!Array.isArray(order)) { res.status(400).json({ error: "order debe ser un array" }); return; }

  await Promise.all(
    order.map((item) =>
      db.update(categoriesTable).set({ sortOrder: item.sortOrder }).where(eq(categoriesTable.id, item.id))
    )
  );
  res.json({ ok: true });
});

// ── Admin subcategory routes ──────────────────────────────────────────────────

// POST /admin/subcategories
router.post("/admin/subcategories", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { categoryId, name, sortOrder = 0 } = req.body as {
    categoryId: string; name: string; sortOrder?: number;
  };
  if (!categoryId || !name?.trim()) { res.status(400).json({ error: "categoryId y name son obligatorios" }); return; }

  const [sub] = await db
    .insert(subcategoriesTable)
    .values({ categoryId, name: name.trim(), sortOrder: Number(sortOrder) })
    .returning();
  res.status(201).json(sub);
});

// PATCH /admin/subcategories/:id
router.patch("/admin/subcategories/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { name, active, sortOrder } = req.body as { name?: string; active?: boolean; sortOrder?: number };

  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name.trim();
  if (active != null) updates.active = active;
  if (sortOrder != null) updates.sortOrder = Number(sortOrder);

  if (!Object.keys(updates).length) { res.status(400).json({ error: "Sin cambios" }); return; }

  const [updated] = await db.update(subcategoriesTable).set(updates as any).where(eq(subcategoriesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Subcategoría no encontrada" }); return; }
  res.json(updated);
});

// DELETE /admin/subcategories/:id
router.delete("/admin/subcategories/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db.update(subcategoriesTable).set({ active: false }).where(eq(subcategoriesTable.id, id));
  res.json({ ok: true });
});

// PATCH /admin/subcategories/sort
router.patch("/admin/subcategories/sort", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { order } = req.body as { order: { id: string; sortOrder: number }[] };
  if (!Array.isArray(order)) { res.status(400).json({ error: "order debe ser un array" }); return; }
  await Promise.all(
    order.map((item) =>
      db.update(subcategoriesTable).set({ sortOrder: item.sortOrder }).where(eq(subcategoriesTable.id, item.id))
    )
  );
  res.json({ ok: true });
});

export default router;
