/**
 * Allergens module — EU Regulation 1169/2011
 * Endpoints: catalog, ingredient allergens, product cache, overrides, technical sheets, audit
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  allergensCatalogTable,
  ingredientAllergensTable,
  ingredientAllergenVersionsTable,
  productAllergenCacheTable,
  productAllergenOverridesTable,
  productTechnicalSheetsTable,
  allergenAuditLogTable,
} from "@workspace/db";
import {
  ingredientsTable,
  productsTable,
  recipeItemsTable,
  subrecipesTable,
  subrecipeItemsTable,
} from "@workspace/db";
import { eq, and, isNull, desc, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

const srItemsAlias = alias(subrecipeItemsTable, "sr_items_a");

// ── Allergen priority: contains > traces > cross_contamination ─────────────────
const TYPE_PRIORITY: Record<string, number> = {
  contains: 3,
  traces: 2,
  cross_contamination: 1,
};

function mostRestrictiveType(a: string, b: string): string {
  return (TYPE_PRIORITY[a] ?? 0) >= (TYPE_PRIORITY[b] ?? 0) ? a : b;
}

// ── Audit helper ───────────────────────────────────────────────────────────────
async function logAudit(
  entity: string, entityId: string, action: string,
  actorId: string | undefined, actorName: string,
  before?: unknown, after?: unknown
) {
  try {
    await db.insert(allergenAuditLogTable).values({
      entity, entityId, action,
      actorId: actorId ?? null, actorName,
      before: before as any, after: after as any,
    });
  } catch { /* non-fatal */ }
}

// ── Core recalculation function (exported for use by recipes.ts) ───────────────
export async function recalculateProductAllergens(productId: string): Promise<void> {
  // 1) Gather allergens from direct ingredient lines (base recipe, formatId IS NULL)
  const directLines = await db
    .select({
      ingredientId: ingredientsTable.id,
      allergenTags: ingredientsTable.allergenTags,
    })
    .from(recipeItemsTable)
    .innerJoin(ingredientsTable, eq(recipeItemsTable.ingredientId, ingredientsTable.id))
    .where(and(eq(recipeItemsTable.productId, productId), isNull(recipeItemsTable.formatId)));

  // 2) Allergens from subrecipe ingredient lines (one level deep)
  const subrecipeLines = await db
    .select({ ingredientId: ingredientsTable.id, allergenTags: ingredientsTable.allergenTags })
    .from(recipeItemsTable)
    .innerJoin(subrecipesTable, eq(recipeItemsTable.subrecipeId, subrecipesTable.id))
    .innerJoin(srItemsAlias, eq(srItemsAlias.subrecipeId, subrecipesTable.id))
    .innerJoin(ingredientsTable, eq(srItemsAlias.ingredientId, ingredientsTable.id))
    .where(and(eq(recipeItemsTable.productId, productId), isNull(recipeItemsTable.formatId)));

  const allIngredientIds = [
    ...directLines.map(l => l.ingredientId),
    ...subrecipeLines.map(l => l.ingredientId),
  ].filter(Boolean) as string[];

  // 3) Fetch structured allergen data from ingredient_allergens (preferred)
  const structuredMap = new Map<string, string>(); // allergenCode → type
  if (allIngredientIds.length > 0) {
    const structured = await db
      .select({ allergenCode: ingredientAllergensTable.allergenCode, type: ingredientAllergensTable.type })
      .from(ingredientAllergensTable)
      .where(inArray(ingredientAllergensTable.ingredientId, allIngredientIds));
    for (const row of structured) {
      const existing = structuredMap.get(row.allergenCode);
      structuredMap.set(row.allergenCode, existing ? mostRestrictiveType(existing, row.type) : row.type);
    }
  }

  // 4) Fallback: allergenTags jsonb — treat all as "contains" if not in structured data
  const fallbackSet = new Set<string>();
  for (const line of [...directLines, ...subrecipeLines]) {
    const tags = Array.isArray(line.allergenTags) ? (line.allergenTags as string[]) : [];
    for (const tag of tags) {
      if (!structuredMap.has(tag)) fallbackSet.add(tag);
    }
  }
  for (const tag of fallbackSet) structuredMap.set(tag, "contains");

  // 5) Fetch manual overrides
  const overrides = await db
    .select({ allergenCode: productAllergenOverridesTable.allergenCode, type: productAllergenOverridesTable.type })
    .from(productAllergenOverridesTable)
    .where(eq(productAllergenOverridesTable.productId, productId));
  for (const ov of overrides) {
    const existing = structuredMap.get(ov.allergenCode);
    structuredMap.set(ov.allergenCode, existing ? mostRestrictiveType(existing, ov.type) : ov.type);
  }

  // 6) Upsert into product_allergen_cache
  await db.delete(productAllergenCacheTable).where(eq(productAllergenCacheTable.productId, productId));
  if (structuredMap.size > 0) {
    await db.insert(productAllergenCacheTable).values(
      Array.from(structuredMap.entries()).map(([allergenCode, type]) => ({
        productId,
        allergenCode,
        type,
        source: overrides.some(o => o.allergenCode === allergenCode) ? "manual" : "ingredient",
        needsReview: false,
        calculatedAt: new Date(),
      }))
    );
  }

  // 7) Keep productsTable.allergens in sync (backward compat)
  await db.update(productsTable)
    .set({ allergens: Array.from(structuredMap.keys()).sort().join(",") })
    .where(eq(productsTable.id, productId));
}

// ── Mark all products using this ingredient as needs_review ──────────────────
export async function markProductsNeedingReview(ingredientId: string): Promise<void> {
  // Find all products that use this ingredient (directly or via subrecipes)
  const directProducts = await db
    .select({ productId: recipeItemsTable.productId })
    .from(recipeItemsTable)
    .where(and(eq(recipeItemsTable.ingredientId, ingredientId), isNull(recipeItemsTable.formatId)));

  const subrecipeProducts = await db
    .select({ productId: recipeItemsTable.productId })
    .from(recipeItemsTable)
    .innerJoin(subrecipesTable, eq(recipeItemsTable.subrecipeId, subrecipesTable.id))
    .innerJoin(srItemsAlias, eq(srItemsAlias.subrecipeId, subrecipesTable.id))
    .where(eq(srItemsAlias.ingredientId, ingredientId));

  const productIds = [
    ...directProducts.map(r => r.productId),
    ...subrecipeProducts.map(r => r.productId),
  ];

  if (productIds.length > 0) {
    for (const productId of new Set(productIds)) {
      await db.update(productAllergenCacheTable)
        .set({ needsReview: true })
        .where(eq(productAllergenCacheTable.productId, productId));
    }
  }
}

// ─── GET /api/admin/allergens — list catalogue ────────────────────────────────
router.get("/admin/allergens", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(allergensCatalogTable).orderBy(allergensCatalogTable.sortOrder);
  res.json(rows);
});

// ─── GET /api/admin/allergens/:code — single allergen ────────────────────────
router.get("/admin/allergens/:code", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(allergensCatalogTable)
    .where(eq(allergensCatalogTable.code, req.params.code as string));
  if (!row) { res.status(404).json({ error: "Alérgeno no encontrado" }); return; }
  res.json(row);
});

// ─── GET /api/admin/ingredients/:id/allergens ────────────────────────────────
router.get("/admin/ingredients/:id/allergens", requireAuth, requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const rows = await db
    .select({
      id: ingredientAllergensTable.id,
      allergenCode: ingredientAllergensTable.allergenCode,
      type: ingredientAllergensTable.type,
      manufacturerInfo: ingredientAllergensTable.manufacturerInfo,
      technicalDocUrl: ingredientAllergensTable.technicalDocUrl,
      lastReviewedAt: ingredientAllergensTable.lastReviewedAt,
      reviewedBy: ingredientAllergensTable.reviewedBy,
      allergenName: allergensCatalogTable.nameEs,
      iconSlug: allergensCatalogTable.iconSlug,
    })
    .from(ingredientAllergensTable)
    .innerJoin(allergensCatalogTable, eq(ingredientAllergensTable.allergenCode, allergensCatalogTable.code))
    .where(eq(ingredientAllergensTable.ingredientId, id));
  res.json(rows);
});

// ─── PUT /api/admin/ingredients/:id/allergens — replace all allergens ─────────
router.put("/admin/ingredients/:id/allergens", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { allergens = [], reviewNote } = req.body as {
    allergens: { allergenCode: string; type: string; manufacturerInfo?: string; technicalDocUrl?: string }[];
    reviewNote?: string;
  };
  const user = req.user!;

  // Snapshot before
  const before = await db
    .select({ allergenCode: ingredientAllergensTable.allergenCode, type: ingredientAllergensTable.type })
    .from(ingredientAllergensTable)
    .where(eq(ingredientAllergensTable.ingredientId, id));

  // Close the currently-open version BEFORE inserting the new one,
  // so the insert doesn't immediately invalidate itself.
  await db.update(ingredientAllergenVersionsTable)
    .set({ validTo: new Date() })
    .where(and(
      eq(ingredientAllergenVersionsTable.ingredientId, id),
      isNull(ingredientAllergenVersionsTable.validTo),
    ));
  // Now record the new version (snapshot = new allergen list; validFrom = now; validTo = null = open)
  await db.insert(ingredientAllergenVersionsTable).values({
    ingredientId: id,
    snapshot: allergens as any,
    changedBy: user.id,
    changeReason: reviewNote ?? null,
    validFrom: new Date(),
  });

  // Replace allergens
  await db.delete(ingredientAllergensTable).where(eq(ingredientAllergensTable.ingredientId, id));
  if (allergens.length > 0) {
    await db.insert(ingredientAllergensTable).values(
      allergens.map(a => ({
        ingredientId: id,
        allergenCode: a.allergenCode,
        type: a.type,
        manufacturerInfo: a.manufacturerInfo ?? null,
        technicalDocUrl: a.technicalDocUrl ?? null,
        lastReviewedAt: new Date(),
        reviewedBy: user.id,
      }))
    );
  }

  // Also update allergenTags jsonb for backward compat (contains only)
  const containsTags = allergens.filter(a => a.type === "contains").map(a => a.allergenCode);
  await db.update(ingredientsTable)
    .set({ allergenTags: containsTags, updatedAt: new Date() })
    .where(eq(ingredientsTable.id, id));

  // Mark affected products for review and re-run their allergen cache
  await markProductsNeedingReview(id);

  // Recalculate allergens for all affected products (direct + via subrecipes)
  const directProducts = await db
    .select({ productId: recipeItemsTable.productId })
    .from(recipeItemsTable)
    .where(and(eq(recipeItemsTable.ingredientId, id), isNull(recipeItemsTable.formatId)));
  const subrecipeProducts = await db
    .select({ productId: recipeItemsTable.productId })
    .from(recipeItemsTable)
    .innerJoin(subrecipesTable, eq(recipeItemsTable.subrecipeId, subrecipesTable.id))
    .innerJoin(srItemsAlias, eq(srItemsAlias.subrecipeId, subrecipesTable.id))
    .where(eq(srItemsAlias.ingredientId, id));
  const seenProductIds = new Set<string>();
  for (const { productId } of [...directProducts, ...subrecipeProducts]) {
    if (!seenProductIds.has(productId)) {
      seenProductIds.add(productId);
      try { await recalculateProductAllergens(productId); } catch { /* non-fatal */ }
    }
  }

  await logAudit("ingredient_allergen", id, "update_allergens", user.id, user.name, before, allergens);
  res.json({ ok: true });
});

// ─── GET /api/admin/products/:id/allergens — product allergen cache ───────────
router.get("/admin/products/:id/allergens", requireAuth, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const rows = await db
    .select({
      allergenCode: productAllergenCacheTable.allergenCode,
      type: productAllergenCacheTable.type,
      source: productAllergenCacheTable.source,
      needsReview: productAllergenCacheTable.needsReview,
      calculatedAt: productAllergenCacheTable.calculatedAt,
      allergenName: allergensCatalogTable.nameEs,
      allergenNameEn: allergensCatalogTable.nameEn,
      iconSlug: allergensCatalogTable.iconSlug,
    })
    .from(productAllergenCacheTable)
    .innerJoin(allergensCatalogTable, eq(productAllergenCacheTable.allergenCode, allergensCatalogTable.code))
    .where(eq(productAllergenCacheTable.productId, id));

  // Also include overrides not already in cache
  const overrides = await db
    .select({
      allergenCode: productAllergenOverridesTable.allergenCode,
      type: productAllergenOverridesTable.type,
      allergenName: allergensCatalogTable.nameEs,
      iconSlug: allergensCatalogTable.iconSlug,
    })
    .from(productAllergenOverridesTable)
    .innerJoin(allergensCatalogTable, eq(productAllergenOverridesTable.allergenCode, allergensCatalogTable.code))
    .where(eq(productAllergenOverridesTable.productId, id));

  res.json({ cache: rows, overrides, needsReview: rows.some(r => r.needsReview) });
});

// ─── POST /api/admin/products/:id/allergens/recalculate ──────────────────────
router.post("/admin/products/:id/allergens/recalculate", requireAuth, requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await recalculateProductAllergens(id);
  await logAudit("product_allergen", id, "recalculate", req.user?.id, req.user?.name ?? "");
  res.json({ ok: true });
});

// ─── POST /api/admin/products/:id/allergens/override — add manual warning ─────
router.post("/admin/products/:id/allergens/override", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { allergenCode, type, note } = req.body as { allergenCode: string; type: string; note?: string };
  const user = req.user!;

  await db.insert(productAllergenOverridesTable)
    .values({ productId: id, allergenCode, type, note: note ?? null, addedBy: user.id })
    .onConflictDoNothing();

  await recalculateProductAllergens(id);
  await logAudit("product_allergen", id, "add_override", user.id, user.name, null, { allergenCode, type, note });
  res.json({ ok: true });
});

// ─── DELETE /api/admin/products/:id/allergens/override/:code ─────────────────
router.delete("/admin/products/:id/allergens/override/:code", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { id, code } = req.params as { id: string; code: string };
  await db.delete(productAllergenOverridesTable).where(
    and(eq(productAllergenOverridesTable.productId, id), eq(productAllergenOverridesTable.allergenCode, code))
  );
  await recalculateProductAllergens(id);
  res.json({ ok: true });
});

// ─── GET /api/admin/products/:id/technical-sheet ─────────────────────────────
router.get("/admin/products/:id/technical-sheet", requireAuth, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [sheet] = await db
    .select()
    .from(productTechnicalSheetsTable)
    .where(and(eq(productTechnicalSheetsTable.productId, id), isNull(productTechnicalSheetsTable.validTo)))
    .orderBy(desc(productTechnicalSheetsTable.validFrom))
    .limit(1);
  if (!sheet) { res.status(404).json({ error: "Ficha técnica no encontrada" }); return; }
  res.json(sheet);
});

// ─── GET /api/admin/products/:id/technical-sheet/history?at= ─────────────────
router.get("/admin/products/:id/technical-sheet/history", requireAuth, requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { at } = req.query as { at?: string };

  if (at) {
    const atDate = new Date(at);
    const [sheet] = await db
      .select()
      .from(productTechnicalSheetsTable)
      .where(eq(productTechnicalSheetsTable.productId, id))
      .orderBy(desc(productTechnicalSheetsTable.validFrom))
      .limit(50);
    // Find the version valid at 'at' date
    const allSheets = await db
      .select()
      .from(productTechnicalSheetsTable)
      .where(eq(productTechnicalSheetsTable.productId, id))
      .orderBy(desc(productTechnicalSheetsTable.validFrom));
    const valid = allSheets.find(s => {
      const from = new Date(s.validFrom);
      const to = s.validTo ? new Date(s.validTo) : new Date();
      return atDate >= from && atDate <= to;
    });
    res.json(valid ?? null);
    return;
  }

  const sheets = await db
    .select()
    .from(productTechnicalSheetsTable)
    .where(eq(productTechnicalSheetsTable.productId, id))
    .orderBy(desc(productTechnicalSheetsTable.validFrom))
    .limit(20);
  res.json(sheets);
});

// ─── POST /api/admin/products/:id/technical-sheet — generate & save sheet ─────
router.post("/admin/products/:id/technical-sheet", requireAuth, requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const user = req.user!;

  // Build content from product + recipe + allergen cache
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  const allergenCache = await db
    .select({
      allergenCode: productAllergenCacheTable.allergenCode,
      type: productAllergenCacheTable.type,
      source: productAllergenCacheTable.source,
      allergenName: allergensCatalogTable.nameEs,
    })
    .from(productAllergenCacheTable)
    .innerJoin(allergensCatalogTable, eq(productAllergenCacheTable.allergenCode, allergensCatalogTable.code))
    .where(eq(productAllergenCacheTable.productId, id));

  const recipeIngredients = await db
    .select({
      ingredientId: ingredientsTable.id,
      ingredientName: ingredientsTable.name,
      allergenTags: ingredientsTable.allergenTags,
    })
    .from(recipeItemsTable)
    .innerJoin(ingredientsTable, eq(recipeItemsTable.ingredientId, ingredientsTable.id))
    .where(and(eq(recipeItemsTable.productId, id), isNull(recipeItemsTable.formatId)));

  const ingAllergens = await db
    .select({ ingredientId: ingredientAllergensTable.ingredientId, allergenCode: ingredientAllergensTable.allergenCode, type: ingredientAllergensTable.type })
    .from(ingredientAllergensTable)
    .where(inArray(ingredientAllergensTable.ingredientId, recipeIngredients.map(r => r.ingredientId)));

  const crossRisks = allergenCache.filter(a => a.type === "cross_contamination").map(a => a.allergenName ?? a.allergenCode);

  const content = {
    productName: product.name,
    ingredients: recipeIngredients.map(ing => ({
      name: ing.ingredientName,
      allergens: ingAllergens.filter(a => a.ingredientId === ing.ingredientId).map(a => ({ code: a.allergenCode, type: a.type })),
    })),
    allergens: allergenCache.map(a => ({ code: a.allergenCode, type: a.type, source: a.source })),
    crossContaminationRisks: crossRisks,
    notes: (req.body as any).notes ?? "",
  };

  // Close previous version
  const now = new Date();
  await db.update(productTechnicalSheetsTable)
    .set({ validTo: now })
    .where(and(eq(productTechnicalSheetsTable.productId, id), isNull(productTechnicalSheetsTable.validTo)));

  const sheets = await db
    .select({ version: productTechnicalSheetsTable.version })
    .from(productTechnicalSheetsTable)
    .where(eq(productTechnicalSheetsTable.productId, id))
    .orderBy(desc(productTechnicalSheetsTable.validFrom))
    .limit(1);
  const nextVersion = String((parseInt(sheets[0]?.version ?? "0") + 1));

  const [sheet] = await db.insert(productTechnicalSheetsTable).values({
    productId: id,
    version: nextVersion,
    content: content as any,
    validFrom: now,
    validTo: null,
    createdBy: user.id,
  }).returning();

  // Mark cache as reviewed
  await db.update(productAllergenCacheTable)
    .set({ needsReview: false })
    .where(eq(productAllergenCacheTable.productId, id));

  await logAudit("technical_sheet", id, "generate", user.id, user.name, null, { version: nextVersion });
  res.status(201).json(sheet);
});

// ─── GET /api/admin/allergens/audit ──────────────────────────────────────────
router.get("/admin/allergens/audit", requireAuth, requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const { entity, entityId, limit = "100" } = req.query as { entity?: string; entityId?: string; limit?: string };
  let query = db.select().from(allergenAuditLogTable).$dynamic();
  if (entity) query = query.where(eq(allergenAuditLogTable.entity, entity));
  const rows = await query.orderBy(desc(allergenAuditLogTable.timestamp)).limit(Math.min(parseInt(limit), 500));
  res.json(rows);
});

// ─── Public menu endpoint: GET /api/menu/products (adds allergenCache) ─────────
router.get("/menu/products", async (_req, res): Promise<void> => {
  const products = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      description: productsTable.description,
      price: productsTable.price,
      allergens: productsTable.allergens,
      categoryId: productsTable.categoryId,
      imageUrl: productsTable.imageUrl,
      outOfStock: productsTable.outOfStock,
    })
    .from(productsTable)
    .where(and(eq(productsTable.active, true), eq(productsTable.qrVisible, true)));

  const productIds = products.map(p => p.id);
  const cacheRows = productIds.length > 0
    ? await db
        .select({
          productId: productAllergenCacheTable.productId,
          allergenCode: productAllergenCacheTable.allergenCode,
          type: productAllergenCacheTable.type,
          allergenName: allergensCatalogTable.nameEs,
          iconSlug: allergensCatalogTable.iconSlug,
        })
        .from(productAllergenCacheTable)
        .innerJoin(allergensCatalogTable, eq(productAllergenCacheTable.allergenCode, allergensCatalogTable.code))
        .where(inArray(productAllergenCacheTable.productId, productIds))
    : [];

  const cacheByProduct = new Map<string, typeof cacheRows>();
  for (const row of cacheRows) {
    if (!cacheByProduct.has(row.productId)) cacheByProduct.set(row.productId, []);
    cacheByProduct.get(row.productId)!.push(row);
  }

  res.json(products.map(p => ({
    ...p,
    allergenCache: cacheByProduct.get(p.id) ?? [],
  })));
});

export default router;
