import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  productFormatsTable,
  productsTable,
  categoriesTable,
  subcategoriesTable,
  productModifierGroupsTable,
  modifierGroupsTable,
} from "@workspace/db";
import { eq, and, asc, ilike, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logDocumentAction } from "../lib/document-audit";
import { isValidTaxRate } from "../lib/tax";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Public / waiter format routes
// ─────────────────────────────────────────────────────────────────────────────

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
  const { name, price, cost, prepTime, kdsDestination, sortOrder = 0, taxRate } = req.body as {
    name: string; price: string; cost?: string; prepTime?: number;
    kdsDestination?: string; sortOrder?: number; taxRate?: number;
  };
  if (!name || price == null) { res.status(400).json({ error: "name y price son requeridos" }); return; }
  if (taxRate != null && !isValidTaxRate(taxRate)) { res.status(400).json({ error: "taxRate debe ser 4, 10 o 21" }); return; }

  const [format] = await db
    .insert(productFormatsTable)
    .values({
      productId, name, price: String(price),
      cost: cost != null ? String(cost) : null,
      prepTime: prepTime ?? null,
      kdsDestination: kdsDestination ?? null,
      sortOrder: Number(sortOrder),
      taxRate: taxRate ?? null,
    })
    .returning();
  res.status(201).json(format);
});

// PATCH /products/formats/:formatId (admin)
router.patch("/products/formats/:formatId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const formatId = req.params.formatId as string;
  const { name, price, cost, prepTime, kdsDestination, sortOrder, active, taxRate } = req.body as {
    name?: string; price?: string; cost?: string | null; prepTime?: number | null;
    kdsDestination?: string | null; sortOrder?: number; active?: boolean; taxRate?: number | null;
  };

  if (taxRate != null && !isValidTaxRate(taxRate)) { res.status(400).json({ error: "taxRate debe ser 4, 10 o 21" }); return; }

  const [existing] = await db.select().from(productFormatsTable).where(eq(productFormatsTable.id, formatId));
  if (!existing) { res.status(404).json({ error: "Formato no encontrado" }); return; }

  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (price != null) updates.price = String(price);
  if (cost !== undefined) updates.cost = cost != null ? String(cost) : null;
  if (prepTime !== undefined) updates.prepTime = prepTime;
  if (kdsDestination !== undefined) updates.kdsDestination = kdsDestination;
  if (sortOrder != null) updates.sortOrder = Number(sortOrder);
  if (active != null) updates.active = active;
  if (taxRate !== undefined) updates.taxRate = taxRate;

  if (!Object.keys(updates).length) { res.status(400).json({ error: "Sin cambios" }); return; }

  if (taxRate !== undefined && taxRate !== existing.taxRate) {
    const user = (req as any).user;
    await logDocumentAction({
      action: "update_tax_rate", documentType: "product_format", documentId: formatId,
      employeeId: user?.id, employeeName: user?.name ?? "",
      details: `IVA formato "${existing.name}" cambiado de ${existing.taxRate ?? "heredado"}% a ${taxRate ?? "heredado"}%`,
    });
  }

  const [f] = await db.update(productFormatsTable).set(updates as any).where(eq(productFormatsTable.id, formatId)).returning();
  res.json(f);
});

// DELETE /products/formats/:formatId (admin)
router.delete("/products/formats/:formatId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const formatId = req.params.formatId as string;
  await db.update(productFormatsTable).set({ active: false }).where(eq(productFormatsTable.id, formatId));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin product CRUD
// ─────────────────────────────────────────────────────────────────────────────

// GET /admin/products — list with filters
router.get("/admin/products", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { categoryId, active, search } = req.query as {
    categoryId?: string; active?: string; search?: string;
  };

  let query = db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      internalCode: productsTable.internalCode,
      description: productsTable.description,
      price: productsTable.price,
      cost: productsTable.cost,
      taxRate: productsTable.taxRate,
      categoryId: productsTable.categoryId,
      subcategoryId: productsTable.subcategoryId,
      prepZone: productsTable.prepZone,
      active: productsTable.active,
      tpvVisible: productsTable.tpvVisible,
      qrVisible: productsTable.qrVisible,
      deliveryVisible: productsTable.deliveryVisible,
      outOfStock: productsTable.outOfStock,
      allergens: productsTable.allergens,
      sortOrder: productsTable.sortOrder,
      imageUrl: productsTable.imageUrl,
      videoUrl: productsTable.videoUrl,
    })
    .from(productsTable)
    .$dynamic();

  const conditions = [];
  if (categoryId) conditions.push(eq(productsTable.categoryId, categoryId));
  if (active === "true") conditions.push(eq(productsTable.active, true));
  if (active === "false") conditions.push(eq(productsTable.active, false));
  if (search) conditions.push(
    or(
      ilike(productsTable.name, `%${search}%`),
      ilike(productsTable.internalCode, `%${search}%`),
    )!
  );

  if (conditions.length) query = query.where(and(...conditions));
  const products = await query.orderBy(asc(productsTable.sortOrder), asc(productsTable.name));

  const [categories, allFormats, allModGroups] = await Promise.all([
    db.select({ id: categoriesTable.id, name: categoriesTable.name }).from(categoriesTable),
    db.select().from(productFormatsTable).orderBy(asc(productFormatsTable.sortOrder)),
    db
      .select({ productId: productModifierGroupsTable.productId, groupId: modifierGroupsTable.id, groupName: modifierGroupsTable.name, required: modifierGroupsTable.required })
      .from(productModifierGroupsTable)
      .innerJoin(modifierGroupsTable, eq(productModifierGroupsTable.modifierGroupId, modifierGroupsTable.id)),
  ]);

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  const formatsByProduct = new Map<string, typeof allFormats>();
  for (const f of allFormats) {
    if (!formatsByProduct.has(f.productId)) formatsByProduct.set(f.productId, []);
    formatsByProduct.get(f.productId)!.push(f);
  }
  const modGroupsByProduct = new Map<string, typeof allModGroups>();
  for (const m of allModGroups) {
    if (!modGroupsByProduct.has(m.productId)) modGroupsByProduct.set(m.productId, []);
    modGroupsByProduct.get(m.productId)!.push(m);
  }

  res.json(
    products.map((p) => ({
      ...p,
      categoryName: categoryMap.get(p.categoryId) ?? "",
      formats: formatsByProduct.get(p.id) ?? [],
      modifierGroups: modGroupsByProduct.get(p.id) ?? [],
    }))
  );
});

// POST /admin/products — create
router.post("/admin/products", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const {
    categoryId, subcategoryId, name, internalCode, description, price, cost,
    prepZone = "cocina", active = true, tpvVisible = true, qrVisible = true,
    deliveryVisible = false, taxRate = 10, sortOrder = 0, allergens = "",
  } = req.body as {
    categoryId: string; subcategoryId?: string; name: string; internalCode?: string;
    description?: string; price: string; cost?: string; prepZone?: string;
    active?: boolean; tpvVisible?: boolean; qrVisible?: boolean; deliveryVisible?: boolean;
    taxRate?: number; sortOrder?: number; allergens?: string;
  };

  if (!categoryId || !name?.trim() || price == null) {
    res.status(400).json({ error: "categoryId, name y price son obligatorios" }); return;
  }
  if (!isValidTaxRate(taxRate)) { res.status(400).json({ error: "taxRate debe ser 4, 10 o 21" }); return; }

  const [product] = await db
    .insert(productsTable)
    .values({
      categoryId, subcategoryId: subcategoryId ?? null,
      name: name.trim(), internalCode: internalCode ?? null,
      description: description ?? null, price: String(price),
      cost: cost != null ? String(cost) : null,
      prepZone, active, tpvVisible, qrVisible, deliveryVisible,
      taxRate, sortOrder: Number(sortOrder), allergens: allergens ?? "",
    })
    .returning();

  const user = (req as any).user;
  await logDocumentAction({
    action: "create_product", documentType: "product", documentId: product.id,
    employeeId: user?.id, employeeName: user?.name ?? "",
    details: `Producto "${product.name}" creado — precio ${product.price}€ — IVA ${product.taxRate}%`,
  });

  res.status(201).json({ ...product, categoryName: "", formats: [], modifierGroups: [] });
});

// PATCH /admin/products/:productId — update any fields
router.patch("/admin/products/:productId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const productId = req.params.productId as string;

  const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!existing) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  const {
    categoryId, subcategoryId, name, internalCode, description, price, cost,
    prepZone, active, tpvVisible, qrVisible, deliveryVisible, outOfStock,
    taxRate, sortOrder, allergens, imageUrl, videoUrl,
  } = req.body as Record<string, unknown>;

  if (taxRate != null && !isValidTaxRate(taxRate as number)) {
    res.status(400).json({ error: "taxRate debe ser 4, 10 o 21" }); return;
  }

  const updates: Record<string, unknown> = {};
  if (categoryId != null) updates.categoryId = categoryId;
  if (subcategoryId !== undefined) updates.subcategoryId = subcategoryId;
  if (name != null) updates.name = (name as string).trim();
  if (internalCode !== undefined) updates.internalCode = internalCode;
  if (description !== undefined) updates.description = description;
  if (price != null) updates.price = String(price);
  if (cost !== undefined) updates.cost = cost != null ? String(cost) : null;
  if (prepZone != null) updates.prepZone = prepZone;
  if (active != null) updates.active = active;
  if (tpvVisible != null) updates.tpvVisible = tpvVisible;
  if (qrVisible != null) updates.qrVisible = qrVisible;
  if (deliveryVisible != null) updates.deliveryVisible = deliveryVisible;
  if (outOfStock != null) updates.outOfStock = outOfStock;
  if (taxRate != null) updates.taxRate = taxRate;
  if (sortOrder != null) updates.sortOrder = Number(sortOrder);
  if (allergens !== undefined) updates.allergens = allergens;
  if (imageUrl !== undefined) updates.imageUrl = imageUrl;
  if (videoUrl !== undefined) updates.videoUrl = videoUrl;

  if (!Object.keys(updates).length) { res.status(400).json({ error: "Sin cambios" }); return; }

  const user = (req as any).user;
  const details: string[] = [];
  if (price != null && String(price) !== existing.price) details.push(`precio ${existing.price}€ → ${price}€`);
  if (taxRate != null && taxRate !== existing.taxRate) details.push(`IVA ${existing.taxRate}% → ${taxRate}%`);
  if (active != null && active !== existing.active) details.push(active ? "activado" : "archivado");

  const [updated] = await db.update(productsTable).set(updates as any).where(eq(productsTable.id, productId)).returning();
  await logDocumentAction({
    action: "update_product", documentType: "product", documentId: productId,
    employeeId: user?.id, employeeName: user?.name ?? "",
    details: `Producto "${updated.name}" actualizado${details.length ? ` — ${details.join(", ")}` : ""}`,
  });

  res.json(updated);
});

// DELETE /admin/products/:productId — soft archive
router.delete("/admin/products/:productId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const productId = req.params.productId as string;
  const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!existing) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  await db.update(productsTable).set({ active: false }).where(eq(productsTable.id, productId));

  const user = (req as any).user;
  await logDocumentAction({
    action: "archive_product", documentType: "product", documentId: productId,
    employeeId: user?.id, employeeName: user?.name ?? "",
    details: `Producto "${existing.name}" archivado`,
  });

  res.json({ ok: true });
});

// PATCH /admin/products/sort — bulk sort
router.patch("/admin/products/sort", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { order } = req.body as { order: { id: string; sortOrder: number }[] };
  if (!Array.isArray(order)) { res.status(400).json({ error: "order debe ser un array" }); return; }
  await Promise.all(
    order.map((item) => db.update(productsTable).set({ sortOrder: item.sortOrder }).where(eq(productsTable.id, item.id)))
  );
  res.json({ ok: true });
});

// ── Modifier group assignments ────────────────────────────────────────────────

// PUT /admin/products/:productId/modifier-groups — replace all group assignments
router.put("/admin/products/:productId/modifier-groups", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const productId = req.params.productId as string;
  const { modifierGroupIds } = req.body as { modifierGroupIds: string[] };
  if (!Array.isArray(modifierGroupIds)) { res.status(400).json({ error: "modifierGroupIds debe ser un array" }); return; }

  await db.delete(productModifierGroupsTable).where(eq(productModifierGroupsTable.productId, productId));
  if (modifierGroupIds.length) {
    await db.insert(productModifierGroupsTable).values(
      modifierGroupIds.map((gid) => ({ productId, modifierGroupId: gid }))
    );
  }
  res.json({ ok: true });
});

export default router;
