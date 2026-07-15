import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { productFormatsTable, productsTable, categoriesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logDocumentAction } from "../lib/document-audit";
import { isValidTaxRate } from "../lib/tax";

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
  const { name, price, sortOrder = 0, taxRate } = req.body as {
    name: string; price: string; sortOrder?: number; taxRate?: number;
  };
  if (!name || price == null) {
    res.status(400).json({ error: "name y price son requeridos" });
    return;
  }
  if (taxRate != null && !isValidTaxRate(taxRate)) {
    res.status(400).json({ error: "taxRate debe ser 4, 10 o 21" });
    return;
  }
  const [format] = await db
    .insert(productFormatsTable)
    .values({ productId, name, price: String(price), sortOrder: Number(sortOrder), taxRate: taxRate ?? null })
    .returning();
  res.status(201).json(format);
});

// PATCH /products/formats/:formatId (admin)
router.patch("/products/formats/:formatId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const formatId = req.params.formatId as string;
  const { name, price, sortOrder, active, taxRate } = req.body as {
    name?: string; price?: string; sortOrder?: number; active?: boolean; taxRate?: number | null;
  };

  if (taxRate != null && !isValidTaxRate(taxRate)) {
    res.status(400).json({ error: "taxRate debe ser 4, 10 o 21" });
    return;
  }

  const [existing] = await db.select().from(productFormatsTable).where(eq(productFormatsTable.id, formatId));
  if (!existing) { res.status(404).json({ error: "Formato no encontrado" }); return; }

  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (price != null) updates.price = String(price);
  if (sortOrder != null) updates.sortOrder = Number(sortOrder);
  if (active != null) updates.active = active;
  if (taxRate !== undefined) updates.taxRate = taxRate; // allow null to reset to product default

  if (!Object.keys(updates).length) { res.status(400).json({ error: "Sin cambios" }); return; }

  // Audit log tax rate changes
  if (taxRate !== undefined && taxRate !== existing.taxRate) {
    const user = (req as any).user;
    await logDocumentAction({
      action: "update_tax_rate",
      documentType: "product_format",
      documentId: formatId,
      employeeId: user?.id,
      employeeName: user?.name ?? "",
      terminal: (req.headers["x-forwarded-for"] as string) ?? req.socket?.remoteAddress ?? "",
      details: `IVA formato "${existing.name}" cambiado de ${existing.taxRate ?? "heredado"}% a ${taxRate ?? "heredado"}%`,
    });
  }

  const [f] = await db
    .update(productFormatsTable)
    .set(updates as Partial<typeof productFormatsTable.$inferInsert>)
    .where(eq(productFormatsTable.id, formatId))
    .returning();
  res.json(f);
});

// ── Admin product routes for taxRate management ───────────────────────────────

// GET /admin/products — list all products with formats and taxRate (admin only)
router.get("/admin/products", requireAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  const products = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      price: productsTable.price,
      taxRate: productsTable.taxRate,
      categoryId: productsTable.categoryId,
      active: productsTable.active,
      tpvVisible: productsTable.tpvVisible,
    })
    .from(productsTable)
    .orderBy(asc(productsTable.name));

  const categories = await db
    .select({ id: categoriesTable.id, name: categoriesTable.name })
    .from(categoriesTable);

  const formats = await db
    .select()
    .from(productFormatsTable)
    .orderBy(asc(productFormatsTable.sortOrder));

  const formatsByProduct = new Map<string, typeof formats>();
  for (const f of formats) {
    if (!formatsByProduct.has(f.productId)) formatsByProduct.set(f.productId, []);
    formatsByProduct.get(f.productId)!.push(f);
  }
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  res.json(
    products.map((p) => ({
      ...p,
      categoryName: categoryMap.get(p.categoryId) ?? "",
      formats: formatsByProduct.get(p.id) ?? [],
    }))
  );
});

// PATCH /admin/products/:productId — update product taxRate (admin only)
router.patch("/admin/products/:productId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const productId = req.params.productId as string;
  const { taxRate } = req.body as { taxRate?: number };

  if (taxRate == null) {
    res.status(400).json({ error: "taxRate es obligatorio" });
    return;
  }
  if (!isValidTaxRate(taxRate)) {
    res.status(400).json({ error: "taxRate debe ser 4, 10 o 21" });
    return;
  }

  const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!existing) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  const user = (req as any).user;
  if (taxRate !== existing.taxRate) {
    await logDocumentAction({
      action: "update_tax_rate",
      documentType: "product",
      documentId: productId,
      employeeId: user?.id,
      employeeName: user?.name ?? "",
      terminal: (req.headers["x-forwarded-for"] as string) ?? req.socket?.remoteAddress ?? "",
      details: `IVA producto "${existing.name}" cambiado de ${existing.taxRate}% a ${taxRate}%`,
    });
  }

  const [updated] = await db
    .update(productsTable)
    .set({ taxRate })
    .where(eq(productsTable.id, productId))
    .returning();
  res.json(updated);
});

export default router;
