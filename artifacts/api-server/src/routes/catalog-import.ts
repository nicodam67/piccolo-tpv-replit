import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import {
  categoriesTable,
  productsTable,
  techEventsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requirePermission } from "../middlewares/auth";
import { idempotency } from "../middlewares/idempotency";
import { PERMISSIONS } from "../lib/permissions";
import { loadProductionDepartments } from "../lib/production-departments";
import { logDocumentAction } from "../lib/document-audit";
import { emitToFunction } from "../lib/socket";
import {
  catalogImportFileHash,
  createCatalogImportSession,
  normalizeCatalogRow,
  normalizeCatalogText,
  parseCatalogFile,
  readCatalogImportSession,
  validateCatalogRows,
  writeCatalogImportSession,
  type CatalogImportDraft,
  type CatalogImportManifest,
} from "../lib/catalog-import";

const router = Router();
const guard = [requireAuth, requirePermission(PERMISSIONS.products.manage)];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
const uploadLimit = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: true });

async function validationContext(allowOverwrite: boolean) {
  const [categories, products, departments] = await Promise.all([
    db.select().from(categoriesTable),
    db.select({
      id: productsTable.id,
      internalCode: productsTable.internalCode,
      name: productsTable.name,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
    }).from(productsTable).leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id)),
    loadProductionDepartments(),
  ]);
  const productsByCode = new Map<string, { id: string }>();
  const productsByNameCategory = new Map<string, { id: string }[]>();
  for (const product of products) {
    if (product.internalCode) productsByCode.set(normalizeCatalogText(product.internalCode), { id: product.id });
    const key = `${normalizeCatalogText(product.categoryName)}:${normalizeCatalogText(product.name)}`;
    productsByNameCategory.set(key, [...(productsByNameCategory.get(key) ?? []), { id: product.id }]);
  }
  return {
    categoryNames: new Set(categories.map((entry) => normalizeCatalogText(entry.name))),
    productsByCode,
    productsByNameCategory,
    departmentCodes: new Set(
      departments.filter((entry) => entry.assignableToProducts).map((entry) => entry.code),
    ),
    allowOverwrite,
  };
}

function assertSessionOwner(manifest: CatalogImportManifest, userId: string, role: string) {
  if (manifest.createdById !== userId && role !== "admin") throw new Error("IMPORT_SESSION_FORBIDDEN");
}

function summary(manifest: CatalogImportManifest) {
  return {
    total: manifest.rows.length,
    valid: manifest.rows.filter((entry) => entry.severity !== "error").length,
    errors: manifest.rows.filter((entry) => entry.severity === "error").length,
    warnings: manifest.rows.filter((entry) => entry.severity === "warning").length,
    creates: manifest.rows.filter((entry) => entry.action === "create").length,
    updates: manifest.rows.filter((entry) => entry.action === "update").length,
    skips: manifest.rows.filter((entry) => entry.action === "skip").length,
  };
}

router.post(
  "/admin/catalog-import/sessions",
  ...guard,
  uploadLimit,
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "Selecciona un archivo CSV, XLSX o JSON de QR Menú" });
      return;
    }
    try {
      const { format, drafts } = await parseCatalogFile(req.file.buffer, req.file.originalname);
      const rows = validateCatalogRows(drafts, await validationContext(false));
      const manifest = createCatalogImportSession({
        status: rows.some((entry) => entry.severity === "error") ? "preview_ready" : "ready",
        createdById: req.user!.id,
        createdByName: req.user!.name,
        filename: req.file.originalname.slice(0, 255),
        fileHash: catalogImportFileHash(req.file.buffer),
        sourceFormat: format,
        rows,
      });
      await logDocumentAction({
        action: "catalog_import_upload",
        documentType: "catalog_import",
        documentId: manifest.sessionId,
        employeeId: req.user!.id,
        employeeName: req.user!.name,
        details: JSON.stringify({ filename: manifest.filename, format, ...summary(manifest) }),
      });
      res.status(201).json({ ...manifest, summary: summary(manifest) });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "No se pudo analizar el archivo",
      });
    }
  },
);

router.get("/admin/catalog-import/sessions/:id", ...guard, async (req, res): Promise<void> => {
  try {
    const manifest = readCatalogImportSession(req.params.id as string);
    assertSessionOwner(manifest, req.user!.id, req.user!.role);
    res.json({ ...manifest, summary: summary(manifest) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    res.status(message === "IMPORT_SESSION_FORBIDDEN" ? 403 : 404).json({ error: "Sesión no disponible" });
  }
});

const EDITABLE_FIELDS = new Set<keyof CatalogImportDraft>([
  "name", "internalCode", "category", "categoryTranslations", "price", "cost", "taxRate",
  "prepZone", "allergens", "description", "tpvVisible", "qrVisible", "deliveryVisible",
  "active", "outOfStock", "halfPortionPrice", "quantity", "isVegetariano", "isVegano",
  "isSinGluten", "isPicante", "imageUrl", "translations",
]);

router.patch("/admin/catalog-import/sessions/:id/rows", ...guard, async (req, res): Promise<void> => {
  try {
    const manifest = readCatalogImportSession(req.params.id as string);
    assertSessionOwner(manifest, req.user!.id, req.user!.role);
    if (manifest.status === "confirmed" || manifest.status === "rejected") {
      res.status(409).json({ error: "La sesión ya está cerrada" });
      return;
    }
    const corrections = Array.isArray(req.body?.corrections) ? req.body.corrections : [];
    if (!corrections.length || corrections.length > 100) {
      res.status(400).json({ error: "Envía entre 1 y 100 correcciones" });
      return;
    }
    const drafts = manifest.rows.map((entry) => ({ ...entry.draft }));
    for (const correction of corrections) {
      const target = manifest.rows.findIndex((entry) => entry.rowIndex === Number(correction.rowIndex));
      if (target < 0 || !correction.changes || typeof correction.changes !== "object") continue;
      for (const [key, value] of Object.entries(correction.changes)) {
        if (EDITABLE_FIELDS.has(key as keyof CatalogImportDraft)) {
          (drafts[target] as Record<string, unknown>)[key] = value;
        }
      }
      drafts[target] = normalizeCatalogRow(drafts[target] as unknown as Record<string, unknown>);
    }
    const allowOverwrite = req.body?.allowOverwrite === true && req.user!.role === "admin";
    manifest.rows = validateCatalogRows(drafts, await validationContext(allowOverwrite));
    manifest.status = manifest.rows.some((entry) => entry.severity === "error") ? "preview_ready" : "ready";
    writeCatalogImportSession(manifest);
    res.json({ ...manifest, summary: summary(manifest) });
  } catch {
    res.status(404).json({ error: "Sesión no disponible" });
  }
});

router.post("/admin/catalog-import/sessions/:id/validate", ...guard, async (req, res): Promise<void> => {
  try {
    const manifest = readCatalogImportSession(req.params.id as string);
    assertSessionOwner(manifest, req.user!.id, req.user!.role);
    const requestedOverwrite = req.body?.allowOverwrite === true;
    if (requestedOverwrite && req.user!.role !== "admin") {
      res.status(403).json({ error: "Solo un administrador puede autorizar sobrescrituras" });
      return;
    }
    manifest.rows = validateCatalogRows(
      manifest.rows.map((entry) => entry.draft),
      await validationContext(requestedOverwrite),
    );
    manifest.status = manifest.rows.some((entry) => entry.severity === "error") ? "preview_ready" : "ready";
    writeCatalogImportSession(manifest);
    await logDocumentAction({
      action: "catalog_import_validate",
      documentType: "catalog_import",
      documentId: manifest.sessionId,
      employeeId: req.user!.id,
      employeeName: req.user!.name,
      details: JSON.stringify(summary(manifest)),
    });
    res.json({ ...manifest, summary: summary(manifest) });
  } catch {
    res.status(404).json({ error: "Sesión no disponible" });
  }
});

router.post(
  "/admin/catalog-import/sessions/:id/confirm",
  ...guard,
  idempotency,
  async (req, res): Promise<void> => {
    try {
      const manifest = readCatalogImportSession(req.params.id as string);
      assertSessionOwner(manifest, req.user!.id, req.user!.role);
      if (manifest.status === "confirmed") {
        res.status(409).json({ error: "La importación ya fue confirmada" });
        return;
      }
      const allowOverwrite = req.body?.allowOverwrite === true;
      if (allowOverwrite && req.user!.role !== "admin") {
        res.status(403).json({ error: "Solo un administrador puede autorizar sobrescrituras" });
        return;
      }
      const rows = validateCatalogRows(
        manifest.rows.map((entry) => entry.draft),
        await validationContext(allowOverwrite),
      );
      if (rows.some((entry) => entry.severity === "error")) {
        manifest.rows = rows;
        manifest.status = "preview_ready";
        writeCatalogImportSession(manifest);
        res.status(422).json({ error: "Corrige los errores antes de confirmar", rows });
        return;
      }

      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('catalog-import-confirm'))`);
        const categories = await tx.select().from(categoriesTable);
        const currentProducts = await tx.select({
          id: productsTable.id,
          internalCode: productsTable.internalCode,
          name: productsTable.name,
          categoryId: productsTable.categoryId,
        }).from(productsTable);
        const byName = new Map(categories.map((entry) => [normalizeCatalogText(entry.name), entry]));
        const currentByCode = new Map(currentProducts
          .filter((entry) => entry.internalCode)
          .map((entry) => [normalizeCatalogText(entry.internalCode), entry]));
        const currentByNameCategory = new Map(currentProducts.map((entry) => [
          `${entry.categoryId}:${normalizeCatalogText(entry.name)}`,
          entry,
        ]));
        let createdCategories = 0;
        let imported = 0;
        let updated = 0;
        let skipped = 0;
        for (const row of rows) {
          let category = byName.get(normalizeCatalogText(row.draft.category));
          if (!category) {
            [category] = await tx.insert(categoriesTable).values({
              name: row.draft.category,
              translations: row.draft.categoryTranslations,
            }).returning();
            byName.set(normalizeCatalogText(category.name), category);
            createdCategories++;
          }
          const existing = (
            row.draft.internalCode
              ? currentByCode.get(normalizeCatalogText(row.draft.internalCode))
              : currentByNameCategory.get(`${category.id}:${normalizeCatalogText(row.draft.name)}`)
          );
          if (existing && !allowOverwrite) { skipped++; continue; }
          const values = {
            categoryId: category.id,
            name: row.draft.name,
            internalCode: row.draft.internalCode || null,
            description: row.draft.description || null,
            price: row.draft.price!.toFixed(2),
            cost: row.draft.cost?.toFixed(2) ?? null,
            taxRate: row.draft.taxRate,
            prepZone: row.draft.prepZone,
            allergens: row.draft.allergens.join(","),
            tpvVisible: row.draft.tpvVisible,
            qrVisible: row.draft.qrVisible,
            deliveryVisible: row.draft.deliveryVisible,
            active: row.draft.active,
            outOfStock: row.draft.outOfStock,
            halfPortionPrice: row.draft.halfPortionPrice?.toFixed(2) ?? null,
            quantity: row.draft.quantity || null,
            isVegetariano: row.draft.isVegetariano,
            isVegano: row.draft.isVegano,
            isSinGluten: row.draft.isSinGluten,
            isPicante: row.draft.isPicante,
            imageUrl: row.draft.imageUrl || null,
            translations: row.draft.translations,
          };
          if (existing && allowOverwrite) {
            await tx.update(productsTable).set(values).where(eq(productsTable.id, existing.id));
            updated++;
          } else {
            const [created] = await tx.insert(productsTable).values(values).returning({
              id: productsTable.id,
              internalCode: productsTable.internalCode,
              name: productsTable.name,
              categoryId: productsTable.categoryId,
            });
            if (created.internalCode) currentByCode.set(normalizeCatalogText(created.internalCode), created);
            currentByNameCategory.set(`${created.categoryId}:${normalizeCatalogText(created.name)}`, created);
            imported++;
          }
        }
        return { imported, updated, skipped, createdCategories };
      });

      manifest.rows = rows;
      manifest.status = "confirmed";
      manifest.report = {
        ...result,
        failed: 0,
        confirmedAt: new Date().toISOString(),
      };
      writeCatalogImportSession(manifest);
      await Promise.all([
        logDocumentAction({
          action: "catalog_import_confirm",
          documentType: "catalog_import",
          documentId: manifest.sessionId,
          employeeId: req.user!.id,
          employeeName: req.user!.name,
          details: JSON.stringify({ ...result, fileHash: manifest.fileHash }),
        }),
        db.insert(techEventsTable).values({
          level: "info",
          module: "catalog",
          message: `Carta inicial importada: ${result.imported} altas, ${result.updated} actualizaciones`,
          code: "CATALOG_IMPORT_CONFIRMED",
          data: { sessionId: manifest.sessionId, ...result },
        }),
      ]);
      try {
        emitToFunction("admin", "catalog:refresh", { reason: "initial_import" });
        emitToFunction("floor", "catalog:refresh", { reason: "initial_import" });
      } catch {
        // Socket invalidation is best-effort; public QR readers also poll PostgreSQL.
      }
      res.status(201).json({
        sessionId: manifest.sessionId,
        ...result,
        failed: 0,
        qrSync: {
          automatic: true,
          sourceOfTruth: "postgresql",
          publicEndpoint: "/api/public/menu",
          message: "TPV y QR Menú integrado leen el mismo catálogo",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "IMPORT_SESSION_FORBIDDEN") {
        res.status(403).json({ error: "Sesión no disponible" });
        return;
      }
      if (message === "INVALID_IMPORT_SESSION" || message === "IMPORT_SESSION_EXPIRED") {
        res.status(404).json({ error: "Sesión no disponible" });
        return;
      }
      console.error("[catalog-import] Confirm failed:", error);
      res.status(500).json({ error: "No se pudo confirmar la importación" });
    }
  },
);

router.get("/admin/catalog-import/sessions/:id/report", ...guard, async (req, res): Promise<void> => {
  try {
    const manifest = readCatalogImportSession(req.params.id as string);
    assertSessionOwner(manifest, req.user!.id, req.user!.role);
    res.json({
      sessionId: manifest.sessionId,
      filename: manifest.filename,
      sourceFormat: manifest.sourceFormat,
      status: manifest.status,
      summary: summary(manifest),
      report: manifest.report ?? null,
      rows: manifest.rows.map((entry) => ({
        rowIndex: entry.rowIndex,
        name: entry.draft.name,
        action: entry.action,
        severity: entry.severity,
        messages: entry.messages,
      })),
      catalogAuthority: "TPV PostgreSQL",
    });
  } catch {
    res.status(404).json({ error: "Informe no disponible" });
  }
});

router.post("/admin/catalog-import/sessions/:id/reject", ...guard, async (req, res): Promise<void> => {
  try {
    const manifest = readCatalogImportSession(req.params.id as string);
    assertSessionOwner(manifest, req.user!.id, req.user!.role);
    if (manifest.status === "confirmed") {
      res.status(409).json({ error: "No se puede descartar una importación confirmada" });
      return;
    }
    manifest.status = "rejected";
    writeCatalogImportSession(manifest);
    await logDocumentAction({
      action: "catalog_import_reject",
      documentType: "catalog_import",
      documentId: manifest.sessionId,
      employeeId: req.user!.id,
      employeeName: req.user!.name,
    });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Sesión no disponible" });
  }
});

export default router;
