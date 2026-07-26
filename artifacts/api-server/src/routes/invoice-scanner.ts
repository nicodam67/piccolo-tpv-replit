import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { db } from "@workspace/db";
import {
  scannedInvoiceDocumentsTable,
  invoiceExtractionsTable,
  invoiceExtractedLinesTable,
  invoiceProductMappingsTable,
  invoiceScanOrderLinksTable,
  invoiceScanReceiptLinksTable,
  invoiceScanAuditLogTable,
  suppliersTable,
  supplierInvoicesTable,
  purchaseOrdersTable,
  purchaseOrderItemsTable,
  goodsReceiptsTable,
  goodsReceiptItemsTable,
  ingredientsTable,
} from "@workspace/db";
import { eq, and, or, ilike, desc, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getOcrProvider } from "../lib/ocr";

const router = Router();

// ─── Upload directory ─────────────────────────────────────────────────────────
const UPLOAD_DIR = process.env["PICCOLO_UPLOAD_ROOT"]
  ? path.resolve(process.env["PICCOLO_UPLOAD_ROOT"], "invoices")
  : path.join(process.cwd(), "uploads", "invoices");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function confidenceLevel(c: number | string | null): "high" | "medium" | "low" {
  const n = typeof c === "string" ? parseFloat(c) : (c ?? 0);
  if (n >= 0.85) return "high";
  if (n >= 0.60) return "medium";
  return "low";
}

async function logAudit(
  documentId: string,
  actorId: string,
  actorName: string,
  action: string,
  detail?: object
) {
  await db.insert(invoiceScanAuditLogTable).values({
    documentId,
    actorId,
    actorName,
    action,
    detail: detail ?? null,
  });
}

// ─── POST /admin/invoice-scanner/upload ──────────────────────────────────────
router.post(
  "/admin/invoice-scanner/upload",
  requireAuth,
  requireRole("admin", "manager", "warehouse"),
  // Wrap multer so file-type/size errors return 400 instead of 500
  (req: any, res: any, next: any) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) return res.status(400).json({ error: err.message ?? "Error al subir archivo" });
      next();
    });
  },
  async (req, res): Promise<void> => {
    const file = req.file;
    if (!file) { res.status(400).json({ error: "No se ha proporcionado ningún archivo" }); return; }

    const employee = req.user!;

    // Hash for dedup
    const fileHash = crypto.createHash("sha256").update(file.buffer).digest("hex");

    // Check for duplicates by file hash
    const [existingByHash] = await db
      .select({ id: scannedInvoiceDocumentsTable.id, status: scannedInvoiceDocumentsTable.status })
      .from(scannedInvoiceDocumentsTable)
      .where(eq(scannedInvoiceDocumentsTable.fileHash, fileHash))
      .limit(1);

    if (existingByHash) {
      res.status(409).json({
        error: "duplicate_file",
        message: "Este archivo ya fue subido anteriormente",
        existingDocumentId: existingByHash.id,
        existingStatus: existingByHash.status,
      });
      return;
    }

    // Save to disk
    const ext = path.extname(file.originalname) || (file.mimetype === "application/pdf" ? ".pdf" : ".jpg");
    const savedFilename = `${fileHash}${ext}`;
    const filePath = path.join(UPLOAD_DIR, savedFilename);
    fs.writeFileSync(filePath, file.buffer);

    // Create document record
    const [doc] = await db.insert(scannedInvoiceDocumentsTable).values({
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      filePath: `uploads/invoices/${savedFilename}`,
      fileHash,
      status: "uploaded",
      uploadedBy: employee.id,
    }).returning();

    await logAudit(doc.id, employee.id, employee.name, "upload", {
      filename: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    });

    res.status(201).json(doc);
  }
);

// ─── POST /admin/invoice-scanner/:id/process ─────────────────────────────────
router.post(
  "/admin/invoice-scanner/:id/process",
  requireAuth,
  requireRole("admin", "manager", "warehouse"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const employee = req.user!;

    const [doc] = await db
      .select()
      .from(scannedInvoiceDocumentsTable)
      .where(eq(scannedInvoiceDocumentsTable.id, id))
      .limit(1);

    if (!doc) { res.status(404).json({ error: "Documento no encontrado" }); return; }
    if (!["uploaded", "error"].includes(doc.status)) {
      res.status(409).json({ error: "El documento ya está siendo procesado o ha sido confirmado" });
      return;
    }

    // Mark as processing
    await db.update(scannedInvoiceDocumentsTable)
      .set({ status: "processing", processingError: null })
      .where(eq(scannedInvoiceDocumentsTable.id, id));

    const ocr = getOcrProvider();

    try {
      // Read file from disk
      const fullPath = path.join(process.cwd(), doc.filePath);
      const buffer = fs.readFileSync(fullPath);

      // Upload to OCR provider (simulator uses in-memory)
      const provId = await ocr.uploadDocument(buffer, doc.mimeType, doc.originalFilename);

      // Extract
      await ocr.extractInvoiceData(provId);

      const status = await ocr.getProcessingStatus(provId);
      if (status.status === "error") throw new Error(status.error ?? "OCR processing failed");

      const result = await ocr.getResult(provId);
      const validation = ocr.validateExtraction(result);

      // Try to match supplier
      let matchedSupplierId: string | null = null;
      if (result.nif.value) {
        const [sup] = await db
          .select({ id: suppliersTable.id })
          .from(suppliersTable)
          .where(and(
            eq(suppliersTable.active, true),
            ilike(suppliersTable.nif, result.nif.value),
          ))
          .limit(1);
        if (sup) matchedSupplierId = sup.id;
      }
      if (!matchedSupplierId && result.supplierName.value) {
        const [sup] = await db
          .select({ id: suppliersTable.id })
          .from(suppliersTable)
          .where(and(
            eq(suppliersTable.active, true),
            or(
              ilike(suppliersTable.commercialName, `%${result.supplierName.value}%`),
              ilike(suppliersTable.legalName, `%${result.supplierName.value}%`),
            ),
          ))
          .limit(1);
        if (sup) matchedSupplierId = sup.id;
      }

      // Check for content-level duplicate (same supplier + invoiceNumber + date)
      let isDuplicate = false;
      let duplicateOfId: string | null = null;
      if (result.invoiceNumber.value && matchedSupplierId) {
        const [dup] = await db
          .select({ id: scannedInvoiceDocumentsTable.id })
          .from(scannedInvoiceDocumentsTable)
          .innerJoin(invoiceExtractionsTable, eq(invoiceExtractionsTable.documentId, scannedInvoiceDocumentsTable.id))
          .where(and(
            eq(scannedInvoiceDocumentsTable.supplierId, matchedSupplierId),
            eq(invoiceExtractionsTable.invoiceNumber, result.invoiceNumber.value),
          ))
          .limit(1);
        if (dup && dup.id !== id) {
          isDuplicate = true;
          duplicateOfId = dup.id;
        }
      }

      await db.transaction(async (tx) => {
        // Save extraction header
        await tx.insert(invoiceExtractionsTable).values({
          documentId: id,
          supplierName:           result.supplierName.value,
          supplierNameConfidence: String(result.supplierName.confidence),
          supplierNameStatus:     "auto",
          legalName:              result.legalName.value,
          legalNameConfidence:    String(result.legalName.confidence),
          legalNameStatus:        "auto",
          nif:                    result.nif.value,
          nifConfidence:          String(result.nif.confidence),
          nifStatus:              "auto",
          invoiceNumber:          result.invoiceNumber.value,
          invoiceNumberConfidence: String(result.invoiceNumber.confidence),
          invoiceNumberStatus:    "auto",
          invoiceDate:            result.invoiceDate.value,
          invoiceDateConfidence:  String(result.invoiceDate.confidence),
          invoiceDateStatus:      "auto",
          dueDate:                result.dueDate.value,
          dueDateConfidence:      String(result.dueDate.confidence),
          dueDateStatus:          "auto",
          taxableBase:            result.taxableBase.value ? String(result.taxableBase.value) : null,
          taxableBaseConfidence:  String(result.taxableBase.confidence),
          taxableBaseStatus:      "auto",
          vatBreakdown:           result.vatBreakdown.value,
          vatBreakdownConfidence: String(result.vatBreakdown.confidence),
          vatBreakdownStatus:     "auto",
          total:                  result.total.value ? String(result.total.value) : null,
          totalConfidence:        String(result.total.confidence),
          totalStatus:            "auto",
          paymentMethod:          result.paymentMethod.value,
          paymentMethodConfidence: String(result.paymentMethod.confidence),
          paymentMethodStatus:    "auto",
          relatedOrderNumber:     result.relatedOrderNumber.value,
          relatedOrderNumberConfidence: String(result.relatedOrderNumber.confidence),
          relatedOrderNumberStatus: "auto",
          relatedDeliveryNote:    result.relatedDeliveryNote.value,
          relatedDeliveryNoteConfidence: String(result.relatedDeliveryNote.confidence),
          relatedDeliveryNoteStatus: "auto",
          overallConfidence:      String(result.overallConfidence),
          rawOcrText:             result.rawText,
        });

        // Save line items
        if (result.lines.length > 0) {
          await tx.insert(invoiceExtractedLinesTable).values(
            result.lines.map((l) => ({
              documentId: id,
              lineNumber: l.lineNumber,
              supplierRef: l.supplierRef,
              description: l.description,
              quantity: l.quantity !== null ? String(l.quantity) : null,
              unit: l.unit,
              unitPrice: l.unitPrice !== null ? String(l.unitPrice) : null,
              discount: l.discount !== null ? String(l.discount) : null,
              vatRate: l.vatRate !== null ? String(l.vatRate) : null,
              lineTotal: l.lineTotal !== null ? String(l.lineTotal) : null,
              confidence: String(l.confidence),
              status: "auto" as const,
            }))
          );
        }

        // Update document status
        await tx.update(scannedInvoiceDocumentsTable)
          .set({
            status: isDuplicate ? "duplicate" : "pending_review",
            supplierId: matchedSupplierId ?? undefined,
            isDuplicate,
            duplicateOfId: duplicateOfId ?? undefined,
            processedAt: new Date(),
          })
          .where(eq(scannedInvoiceDocumentsTable.id, id));
      });

      await logAudit(id, employee.id, employee.name, "process", {
        overallConfidence: result.overallConfidence,
        linesExtracted: result.lines.length,
        supplierMatched: !!matchedSupplierId,
        isDuplicate,
        validationIssues: validation.issues.length,
      });

      // Return updated document with extraction
      const [updatedDoc] = await db
        .select()
        .from(scannedInvoiceDocumentsTable)
        .where(eq(scannedInvoiceDocumentsTable.id, id))
        .limit(1);

      const [extraction] = await db
        .select()
        .from(invoiceExtractionsTable)
        .where(eq(invoiceExtractionsTable.documentId, id))
        .limit(1);

      const lines = await db
        .select()
        .from(invoiceExtractedLinesTable)
        .where(eq(invoiceExtractedLinesTable.documentId, id))
        .orderBy(invoiceExtractedLinesTable.lineNumber);

      res.json({ document: updatedDoc, extraction, lines, validation });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de OCR desconocido";
      await db.update(scannedInvoiceDocumentsTable)
        .set({ status: "error", processingError: msg })
        .where(eq(scannedInvoiceDocumentsTable.id, id));
      await logAudit(id, employee.id, employee.name, "error", { error: msg });
      res.status(500).json({ error: "ocr_error", message: msg });
    }
  }
);

// ─── GET /admin/invoice-scanner ───────────────────────────────────────────────
router.get(
  "/admin/invoice-scanner",
  requireAuth,
  requireRole("admin", "manager", "warehouse"),
  async (req, res): Promise<void> => {
    const { status, supplierId, limit = "50" } = req.query as Record<string, string>;

    let query = db
      .select({
        id: scannedInvoiceDocumentsTable.id,
        originalFilename: scannedInvoiceDocumentsTable.originalFilename,
        mimeType: scannedInvoiceDocumentsTable.mimeType,
        fileSize: scannedInvoiceDocumentsTable.fileSize,
        status: scannedInvoiceDocumentsTable.status,
        supplierId: scannedInvoiceDocumentsTable.supplierId,
        supplierName: suppliersTable.commercialName,
        isDuplicate: scannedInvoiceDocumentsTable.isDuplicate,
        uploadedAt: scannedInvoiceDocumentsTable.uploadedAt,
        processedAt: scannedInvoiceDocumentsTable.processedAt,
        confirmedAt: scannedInvoiceDocumentsTable.confirmedAt,
        // extracted summary
        invoiceNumber: invoiceExtractionsTable.invoiceNumber,
        invoiceDate: invoiceExtractionsTable.invoiceDate,
        total: invoiceExtractionsTable.total,
        overallConfidence: invoiceExtractionsTable.overallConfidence,
      })
      .from(scannedInvoiceDocumentsTable)
      .leftJoin(suppliersTable, eq(scannedInvoiceDocumentsTable.supplierId, suppliersTable.id))
      .leftJoin(invoiceExtractionsTable, eq(invoiceExtractionsTable.documentId, scannedInvoiceDocumentsTable.id))
      .$dynamic();

    const conditions = [];
    if (status) conditions.push(eq(scannedInvoiceDocumentsTable.status, status as any));
    if (supplierId) conditions.push(eq(scannedInvoiceDocumentsTable.supplierId, supplierId));
    if (conditions.length) query = query.where(and(...conditions)) as any;

    const docs = await (query as any)
      .orderBy(desc(scannedInvoiceDocumentsTable.uploadedAt))
      .limit(Math.min(parseInt(limit), 200));

    res.json(docs);
  }
);

// ─── GET /admin/invoice-scanner/:id ──────────────────────────────────────────
router.get(
  "/admin/invoice-scanner/:id",
  requireAuth,
  requireRole("admin", "manager", "warehouse"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;

    const [doc] = await db
      .select()
      .from(scannedInvoiceDocumentsTable)
      .where(eq(scannedInvoiceDocumentsTable.id, id))
      .limit(1);

    if (!doc) { res.status(404).json({ error: "Documento no encontrado" }); return; }

    const [extraction] = await db
      .select()
      .from(invoiceExtractionsTable)
      .where(eq(invoiceExtractionsTable.documentId, id))
      .limit(1);

    const lines = await db
      .select({
        id: invoiceExtractedLinesTable.id,
        lineNumber: invoiceExtractedLinesTable.lineNumber,
        supplierRef: invoiceExtractedLinesTable.supplierRef,
        description: invoiceExtractedLinesTable.description,
        quantity: invoiceExtractedLinesTable.quantity,
        unit: invoiceExtractedLinesTable.unit,
        unitPrice: invoiceExtractedLinesTable.unitPrice,
        discount: invoiceExtractedLinesTable.discount,
        vatRate: invoiceExtractedLinesTable.vatRate,
        lineTotal: invoiceExtractedLinesTable.lineTotal,
        confidence: invoiceExtractedLinesTable.confidence,
        status: invoiceExtractedLinesTable.status,
        ingredientId: invoiceExtractedLinesTable.ingredientId,
        ingredientName: ingredientsTable.name,
        ingredientUnit: ingredientsTable.unit,
        conversionFactor: invoiceExtractedLinesTable.conversionFactor,
        conversionNote: invoiceExtractedLinesTable.conversionNote,
        mappingConfirmed: invoiceExtractedLinesTable.mappingConfirmed,
        isRejected: invoiceExtractedLinesTable.isRejected,
      })
      .from(invoiceExtractedLinesTable)
      .leftJoin(ingredientsTable, eq(invoiceExtractedLinesTable.ingredientId, ingredientsTable.id))
      .where(eq(invoiceExtractedLinesTable.documentId, id))
      .orderBy(invoiceExtractedLinesTable.lineNumber);

    // Supplier detail
    let supplier = null;
    if (doc.supplierId) {
      const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, doc.supplierId)).limit(1);
      supplier = s ?? null;
    }

    // Learned mappings for this supplier
    let mappings: any[] = [];
    if (doc.supplierId) {
      mappings = await db
        .select()
        .from(invoiceProductMappingsTable)
        .where(eq(invoiceProductMappingsTable.supplierId, doc.supplierId));
    }

    // Enrich lines with confidence levels
    const enrichedLines = lines.map((l) => ({
      ...l,
      confidenceLevel: confidenceLevel(l.confidence),
    }));

    // Validation if extraction exists
    let validation = null;
    if (extraction) {
      const ocr = getOcrProvider();
      // Reconstruct minimal result for validation
      const vatBreakdown = (extraction.vatBreakdown as any[]) ?? [];
      validation = ocr.validateExtraction({
        rawText: extraction.rawOcrText ?? "",
        overallConfidence: parseFloat(extraction.overallConfidence ?? "0"),
        supplierName: { value: extraction.supplierName, confidence: parseFloat(extraction.supplierNameConfidence ?? "0") },
        legalName: { value: extraction.legalName, confidence: parseFloat(extraction.legalNameConfidence ?? "0") },
        nif: { value: extraction.nif, confidence: parseFloat(extraction.nifConfidence ?? "0") },
        invoiceNumber: { value: extraction.invoiceNumber, confidence: parseFloat(extraction.invoiceNumberConfidence ?? "0") },
        invoiceDate: { value: extraction.invoiceDate, confidence: parseFloat(extraction.invoiceDateConfidence ?? "0") },
        dueDate: { value: extraction.dueDate, confidence: parseFloat(extraction.dueDateConfidence ?? "0") },
        taxableBase: { value: extraction.taxableBase, confidence: parseFloat(extraction.taxableBaseConfidence ?? "0") },
        vatBreakdown: { value: vatBreakdown, confidence: parseFloat(extraction.vatBreakdownConfidence ?? "0") },
        total: { value: extraction.total, confidence: parseFloat(extraction.totalConfidence ?? "0") },
        paymentMethod: { value: extraction.paymentMethod, confidence: parseFloat(extraction.paymentMethodConfidence ?? "0") },
        relatedOrderNumber: { value: extraction.relatedOrderNumber, confidence: parseFloat(extraction.relatedOrderNumberConfidence ?? "0") },
        relatedDeliveryNote: { value: extraction.relatedDeliveryNote, confidence: parseFloat(extraction.relatedDeliveryNoteConfidence ?? "0") },
        lines: [],
      });
    }

    res.json({ document: doc, extraction, lines: enrichedLines, supplier, mappings, validation });
  }
);

// ─── PATCH /admin/invoice-scanner/:id/extraction ─────────────────────────────
// Save manual corrections to header fields and lines
router.patch(
  "/admin/invoice-scanner/:id/extraction",
  requireAuth,
  requireRole("admin", "manager", "warehouse"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const employee = req.user!;
    const { header, lines: lineUpdates, supplierId } = req.body;

    const [doc] = await db.select({ id: scannedInvoiceDocumentsTable.id, status: scannedInvoiceDocumentsTable.status })
      .from(scannedInvoiceDocumentsTable).where(eq(scannedInvoiceDocumentsTable.id, id)).limit(1);

    if (!doc) { res.status(404).json({ error: "Documento no encontrado" }); return; }
    if (doc.status === "confirmed") { res.status(409).json({ error: "La factura ya está confirmada" }); return; }

    await db.transaction(async (tx) => {
      // Update header fields
      if (header && Object.keys(header).length > 0) {
        const patch: Record<string, any> = { updatedAt: new Date() };
        const fieldMap: Record<string, string> = {
          supplierName: "supplierName", legalName: "legalName", nif: "nif",
          invoiceNumber: "invoiceNumber", invoiceDate: "invoiceDate", dueDate: "dueDate",
          taxableBase: "taxableBase", total: "total", paymentMethod: "paymentMethod",
          relatedOrderNumber: "relatedOrderNumber", relatedDeliveryNote: "relatedDeliveryNote",
        };
        for (const [k, v] of Object.entries(header)) {
          if (fieldMap[k]) {
            patch[fieldMap[k]] = v as string;
            patch[`${fieldMap[k]}Status`] = "corrected";
          }
        }
        await tx.update(invoiceExtractionsTable).set(patch)
          .where(eq(invoiceExtractionsTable.documentId, id));
      }

      // Update line corrections
      if (lineUpdates && Array.isArray(lineUpdates)) {
        for (const lu of lineUpdates as any[]) {
          if (!lu.id) continue;
          const linePatch: Record<string, any> = { updatedAt: new Date(), status: "corrected" };
          if ("quantity" in lu) linePatch.quantity = String(lu.quantity);
          if ("unitPrice" in lu) linePatch.unitPrice = String(lu.unitPrice);
          if ("discount" in lu) linePatch.discount = String(lu.discount);
          if ("vatRate" in lu) linePatch.vatRate = String(lu.vatRate);
          if ("lineTotal" in lu) linePatch.lineTotal = String(lu.lineTotal);
          if ("description" in lu) linePatch.description = lu.description;
          if ("unit" in lu) linePatch.unit = lu.unit;
          if ("ingredientId" in lu) linePatch.ingredientId = lu.ingredientId;
          if ("conversionFactor" in lu) linePatch.conversionFactor = String(lu.conversionFactor);
          if ("conversionNote" in lu) linePatch.conversionNote = lu.conversionNote;
          if ("mappingConfirmed" in lu) linePatch.mappingConfirmed = lu.mappingConfirmed;
          if ("isRejected" in lu) linePatch.isRejected = lu.isRejected;
          await tx.update(invoiceExtractedLinesTable).set(linePatch)
            .where(eq(invoiceExtractedLinesTable.id, lu.id));
        }
      }

      // Update supplier link if provided
      const docPatch: Record<string, any> = { status: "reviewed", reviewedAt: new Date(), reviewedBy: employee.id };
      if (supplierId) docPatch.supplierId = supplierId;
      await tx.update(scannedInvoiceDocumentsTable).set(docPatch)
        .where(eq(scannedInvoiceDocumentsTable.id, id));
    });

    await logAudit(id, employee.id, employee.name, "correct", { header, lineCount: (lineUpdates as any[])?.length });

    res.json({ ok: true });
  }
);

// ─── POST /admin/invoice-scanner/:id/map-line ─────────────────────────────────
// Confirm a supplier text → ingredient mapping (saves to learned mappings)
router.post(
  "/admin/invoice-scanner/:id/map-line",
  requireAuth,
  requireRole("admin", "manager"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const employee = req.user!;
    const { lineId, ingredientId, conversionFactor, conversionNote, supplierRef, supplierText, supplierUnit } = req.body;

    const [doc] = await db.select({ supplierId: scannedInvoiceDocumentsTable.supplierId })
      .from(scannedInvoiceDocumentsTable).where(eq(scannedInvoiceDocumentsTable.id, id)).limit(1);
    if (!doc) { res.status(404).json({ error: "Documento no encontrado" }); return; }

    await db.transaction(async (tx) => {
      // Update the line
      await tx.update(invoiceExtractedLinesTable)
        .set({
          ingredientId,
          conversionFactor: conversionFactor ? String(conversionFactor) : null,
          conversionNote: conversionNote ?? null,
          mappingConfirmed: true,
          status: "confirmed",
          updatedAt: new Date(),
        })
        .where(eq(invoiceExtractedLinesTable.id, lineId));

      // Save learned mapping for future use
      if (doc.supplierId && supplierText) {
        const [existing] = await tx.select({ id: invoiceProductMappingsTable.id, timesUsed: invoiceProductMappingsTable.timesUsed })
          .from(invoiceProductMappingsTable)
          .where(and(
            eq(invoiceProductMappingsTable.supplierId, doc.supplierId),
            eq(invoiceProductMappingsTable.supplierText, supplierText),
          ))
          .limit(1);

        if (existing) {
          await tx.update(invoiceProductMappingsTable)
            .set({
              ingredientId,
              conversionFactor: conversionFactor ? String(conversionFactor) : null,
              internalUnit: supplierUnit ?? null,
              timesUsed: (existing.timesUsed ?? 0) + 1,
              lastUsedAt: new Date(),
              confirmedBy: employee.id,
              updatedAt: new Date(),
            })
            .where(eq(invoiceProductMappingsTable.id, existing.id));
        } else {
          await tx.insert(invoiceProductMappingsTable).values({
            supplierId: doc.supplierId,
            supplierText,
            supplierRef: supplierRef ?? null,
            supplierUnit: supplierUnit ?? null,
            ingredientId,
            conversionFactor: conversionFactor ? String(conversionFactor) : null,
            internalUnit: supplierUnit ?? null,
            timesUsed: 1,
            confirmedBy: employee.id,
          });
        }
      }
    });

    await logAudit(id, employee.id, employee.name, "map_line", { lineId, ingredientId, conversionFactor });

    res.json({ ok: true });
  }
);

// ─── GET /admin/invoice-scanner/:id/reconciliation ───────────────────────────
router.get(
  "/admin/invoice-scanner/:id/reconciliation",
  requireAuth,
  requireRole("admin", "manager"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;

    const [doc] = await db.select().from(scannedInvoiceDocumentsTable)
      .where(eq(scannedInvoiceDocumentsTable.id, id)).limit(1);
    if (!doc) { res.status(404).json({ error: "Documento no encontrado" }); return; }

    const [extraction] = await db.select().from(invoiceExtractionsTable)
      .where(eq(invoiceExtractionsTable.documentId, id)).limit(1);

    const invoiceLines = await db.select({
      id: invoiceExtractedLinesTable.id,
      lineNumber: invoiceExtractedLinesTable.lineNumber,
      description: invoiceExtractedLinesTable.description,
      ingredientId: invoiceExtractedLinesTable.ingredientId,
      ingredientName: ingredientsTable.name,
      quantity: invoiceExtractedLinesTable.quantity,
      unit: invoiceExtractedLinesTable.unit,
      unitPrice: invoiceExtractedLinesTable.unitPrice,
      lineTotal: invoiceExtractedLinesTable.lineTotal,
      isRejected: invoiceExtractedLinesTable.isRejected,
    })
      .from(invoiceExtractedLinesTable)
      .leftJoin(ingredientsTable, eq(invoiceExtractedLinesTable.ingredientId, ingredientsTable.id))
      .where(eq(invoiceExtractedLinesTable.documentId, id))
      .orderBy(invoiceExtractedLinesTable.lineNumber);

    // Linked purchase orders
    const orderLinks = await db.select({ orderId: invoiceScanOrderLinksTable.orderId })
      .from(invoiceScanOrderLinksTable)
      .where(eq(invoiceScanOrderLinksTable.documentId, id));

    let orderItems: any[] = [];
    if (orderLinks.length > 0) {
      orderItems = await db.select({
        ingredientId: purchaseOrderItemsTable.ingredientId,
        ingredientName: ingredientsTable.name,
        quantity: purchaseOrderItemsTable.quantity,
        unit: purchaseOrderItemsTable.unit,
        unitPrice: purchaseOrderItemsTable.unitPrice,
      })
        .from(purchaseOrderItemsTable)
        .innerJoin(ingredientsTable, eq(purchaseOrderItemsTable.ingredientId, ingredientsTable.id))
        .where(inArray(purchaseOrderItemsTable.orderId, orderLinks.map((l) => l.orderId)));
    }

    // Linked receipts
    const receiptLinks = await db.select({ receiptId: invoiceScanReceiptLinksTable.receiptId })
      .from(invoiceScanReceiptLinksTable)
      .where(eq(invoiceScanReceiptLinksTable.documentId, id));

    let receiptItems: any[] = [];
    if (receiptLinks.length > 0) {
      receiptItems = await db.select({
        ingredientId: goodsReceiptItemsTable.ingredientId,
        ingredientName: ingredientsTable.name,
        qtyReceived: goodsReceiptItemsTable.qtyReceived,
        unitPrice: goodsReceiptItemsTable.unitPrice,
      })
        .from(goodsReceiptItemsTable)
        .innerJoin(goodsReceiptsTable, eq(goodsReceiptItemsTable.receiptId, goodsReceiptsTable.id))
        .innerJoin(ingredientsTable, eq(goodsReceiptItemsTable.ingredientId, ingredientsTable.id))
        .where(inArray(goodsReceiptItemsTable.receiptId, receiptLinks.map((l) => l.receiptId)));
    }

    // Build diff report
    const invoiceMap = new Map(invoiceLines.map((l) => [l.ingredientId ?? l.description, l]));
    const receiptMap = new Map(receiptItems.map((r) => [r.ingredientId, r]));
    const orderMap = new Map(orderItems.map((o) => [o.ingredientId, o]));

    const allKeys = new Set([...invoiceMap.keys(), ...receiptMap.keys(), ...orderMap.keys()]);
    const diffs = [...allKeys].map((key) => {
      const inv = invoiceMap.get(key);
      const rec = receiptMap.get(key);
      const ord = orderMap.get(key);
      const invQty = parseFloat(inv?.quantity ?? "0");
      const recQty = parseFloat(rec?.qtyReceived ?? "0");
      const invPrice = parseFloat(inv?.unitPrice ?? "0");
      const recPrice = parseFloat(rec?.unitPrice ?? "0");
      const ordPrice = parseFloat(ord?.unitPrice ?? "0");
      return {
        key,
        name: inv?.ingredientName ?? rec?.ingredientName ?? ord?.ingredientName ?? String(key),
        invoiceQty: invQty,
        receiptQty: recQty,
        qtyDiff: invQty - recQty,
        invoicePrice: invPrice,
        receiptPrice: recPrice,
        orderedPrice: ordPrice,
        priceDiff: invPrice - recPrice,
        inInvoice: !!inv && !inv.isRejected,
        inReceipt: !!rec,
        inOrder: !!ord,
      };
    });

    const vatBreakdown = (extraction?.vatBreakdown as any[]) ?? [];
    const invoiceTotal = parseFloat(extraction?.total ?? "0");
    const receiptTotal = receiptItems.reduce((s, r) => s + parseFloat(r.unitPrice ?? "0") * parseFloat(r.qtyReceived ?? "0"), 0);

    res.json({
      document: { id: doc.id, status: doc.status, originalFilename: doc.originalFilename },
      summary: {
        invoiceTotal: extraction?.total ?? "0",
        receiptTotal: receiptTotal.toFixed(4),
        totalDiff: (invoiceTotal - receiptTotal).toFixed(4),
        invoiceNumber: extraction?.invoiceNumber ?? null,
        invoiceDate: extraction?.invoiceDate ?? null,
        vatBreakdown,
        hasLinkedOrders: orderLinks.length > 0,
        hasLinkedReceipts: receiptLinks.length > 0,
      },
      diffs,
      invoiceLines,
      receiptItems,
      orderItems,
    });
  }
);

// ─── POST /admin/invoice-scanner/:id/link ─────────────────────────────────────
// Link document to purchase orders / receipts
router.post(
  "/admin/invoice-scanner/:id/link",
  requireAuth,
  requireRole("admin", "manager"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const { orderIds, receiptIds } = req.body as { orderIds?: string[]; receiptIds?: string[] };

    const [doc] = await db.select({ id: scannedInvoiceDocumentsTable.id })
      .from(scannedInvoiceDocumentsTable).where(eq(scannedInvoiceDocumentsTable.id, id)).limit(1);
    if (!doc) { res.status(404).json({ error: "Documento no encontrado" }); return; }

    await db.transaction(async (tx) => {
      if (orderIds?.length) {
        await tx.insert(invoiceScanOrderLinksTable)
          .values(orderIds.map((oid) => ({ documentId: id, orderId: oid })))
          .onConflictDoNothing();
      }
      if (receiptIds?.length) {
        await tx.insert(invoiceScanReceiptLinksTable)
          .values(receiptIds.map((rid) => ({ documentId: id, receiptId: rid })))
          .onConflictDoNothing();
      }
    });

    res.json({ ok: true });
  }
);

// ─── POST /admin/invoice-scanner/:id/confirm ─────────────────────────────────
router.post(
  "/admin/invoice-scanner/:id/confirm",
  requireAuth,
  requireRole("admin", "manager"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const employee = req.user!;
    const { overrideDuplicate } = req.body as { overrideDuplicate?: boolean };

    const [doc] = await db.select().from(scannedInvoiceDocumentsTable)
      .where(eq(scannedInvoiceDocumentsTable.id, id)).limit(1);
    if (!doc) { res.status(404).json({ error: "Documento no encontrado" }); return; }

    if (doc.status === "confirmed") {
      res.status(409).json({ error: "La factura ya está confirmada" }); return;
    }
    if (doc.isDuplicate && !overrideDuplicate) {
      res.status(409).json({ error: "duplicate_detected", message: "Posible duplicado detectado. Use overrideDuplicate=true para confirmar igualmente." }); return;
    }
    if (!["pending_review", "reviewed", "duplicate", "with_differences"].includes(doc.status)) {
      res.status(409).json({ error: "El documento debe estar en estado revisado antes de confirmar" }); return;
    }

    const [extraction] = await db.select().from(invoiceExtractionsTable)
      .where(eq(invoiceExtractionsTable.documentId, id)).limit(1);
    if (!extraction) { res.status(422).json({ error: "Sin datos extraídos. Procese el documento primero." }); return; }
    if (!doc.supplierId) { res.status(422).json({ error: "Debe asociar un proveedor antes de confirmar" }); return; }

    // Build the supplier invoice
    const vatBreakdown = (extraction.vatBreakdown as any[]) ?? [];
    const vatAmount = vatBreakdown.reduce((s: number, v: any) => s + (v.amount ?? 0), 0);

    const [invoice] = await db.insert(supplierInvoicesTable).values({
      supplierId: doc.supplierId,
      invoiceNumber: extraction.invoiceNumber ?? `SCN-${id.slice(0, 8)}`,
      invoiceDate: extraction.invoiceDate ?? new Date().toISOString().slice(0, 10),
      dueDate: extraction.dueDate ?? null,
      taxableBase: extraction.taxableBase ?? "0",
      vatAmount: String(vatAmount.toFixed(4)),
      total: extraction.total ?? "0",
      paymentStatus: "unpaid",
      notes: `Creada automáticamente desde escaneo de factura ${doc.originalFilename}`,
    }).returning();

    // Update document
    await db.update(scannedInvoiceDocumentsTable).set({
      status: "confirmed",
      supplierInvoiceId: invoice.id,
      confirmedBy: employee.id,
      confirmedAt: new Date(),
    }).where(eq(scannedInvoiceDocumentsTable.id, id));

    await logAudit(id, employee.id, employee.name, "confirm", {
      supplierInvoiceId: invoice.id,
      total: extraction.total,
      invoiceNumber: extraction.invoiceNumber,
    });

    res.json({ ok: true, supplierInvoiceId: invoice.id });
  }
);

// ─── POST /admin/invoice-scanner/:id/reject ───────────────────────────────────
router.post(
  "/admin/invoice-scanner/:id/reject",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const employee = req.user!;
    const { reason } = req.body as { reason?: string };

    const [doc] = await db.select({ id: scannedInvoiceDocumentsTable.id })
      .from(scannedInvoiceDocumentsTable).where(eq(scannedInvoiceDocumentsTable.id, id)).limit(1);
    if (!doc) { res.status(404).json({ error: "Documento no encontrado" }); return; }

    await db.update(scannedInvoiceDocumentsTable)
      .set({ status: "rejected", processingError: reason ?? "Rechazado manualmente" })
      .where(eq(scannedInvoiceDocumentsTable.id, id));

    await logAudit(id, employee.id, employee.name, "reject", { reason });

    res.json({ ok: true });
  }
);

// ─── GET /admin/invoice-scanner/:id/audit ────────────────────────────────────
router.get(
  "/admin/invoice-scanner/:id/audit",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const logs = await db
      .select()
      .from(invoiceScanAuditLogTable)
      .where(eq(invoiceScanAuditLogTable.documentId, id))
      .orderBy(invoiceScanAuditLogTable.createdAt);
    res.json(logs);
  }
);

// ─── GET /admin/invoice-scanner/suppliers/candidates ─────────────────────────
// Quick search for supplier matching during review
router.get(
  "/admin/invoice-scanner/suppliers/candidates",
  requireAuth,
  requireRole("admin", "manager", "warehouse"),
  async (req, res): Promise<void> => {
    const { q } = req.query as { q?: string };
    if (!q || q.length < 2) { res.json([]); return; }

    const results = await db.select({
      id: suppliersTable.id,
      commercialName: suppliersTable.commercialName,
      legalName: suppliersTable.legalName,
      nif: suppliersTable.nif,
    })
      .from(suppliersTable)
      .where(and(
        eq(suppliersTable.active, true),
        or(
          ilike(suppliersTable.commercialName, `%${q}%`),
          ilike(suppliersTable.legalName, `%${q}%`),
          ilike(suppliersTable.nif, `%${q}%`),
        ),
      ))
      .limit(10);

    res.json(results);
  }
);

export default router;
