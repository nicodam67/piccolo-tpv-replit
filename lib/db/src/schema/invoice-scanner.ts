import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  boolean,
  integer,
  pgEnum,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { suppliersTable } from "./suppliers";
import { supplierInvoicesTable } from "./suppliers";
import { purchaseOrdersTable } from "./suppliers";
import { goodsReceiptsTable } from "./suppliers";
import { ingredientsTable } from "./stock";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const scanDocumentStatusEnum = pgEnum("scan_document_status", [
  "uploaded",
  "processing",
  "pending_review",
  "reviewed",
  "reconciled",
  "with_differences",
  "confirmed",
  "duplicate",
  "rejected",
  "error",
]);

export const confidenceLevelEnum = pgEnum("confidence_level", [
  "high",   // ≥ 0.85
  "medium", // 0.60 – 0.84
  "low",    // < 0.60
]);

export const extractionFieldStatusEnum = pgEnum("extraction_field_status", [
  "auto",        // extracted automatically
  "confirmed",   // user confirmed
  "corrected",   // user corrected
  "undetected",  // field not found
]);

// ─── Scanned invoice documents ────────────────────────────────────────────────

export const scannedInvoiceDocumentsTable = pgTable(
  "scanned_invoice_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // File metadata
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(), // application/pdf | image/jpeg | image/png
    fileSize: integer("file_size").notNull(), // bytes
    filePath: text("file_path").notNull(),   // server-side path or storage key
    fileHash: text("file_hash").notNull(),   // SHA-256 hex for dedup

    // Status
    status: scanDocumentStatusEnum("status").notNull().default("uploaded"),
    processingError: text("processing_error"),

    // Links (filled after review/confirmation)
    supplierId: uuid("supplier_id").references(() => suppliersTable.id),
    supplierInvoiceId: uuid("supplier_invoice_id").references(() => supplierInvoicesTable.id),

    // Duplicate detection
    isDuplicate: boolean("is_duplicate").notNull().default(false),
    duplicateOfId: uuid("duplicate_of_id"), // self-reference set after detection

    // Audit
    uploadedBy: uuid("uploaded_by").notNull(), // employee id
    reviewedBy: uuid("reviewed_by"),
    confirmedBy: uuid("confirmed_by"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [
    index("scanned_invoice_documents_status_idx").on(t.status),
    index("scanned_invoice_documents_hash_idx").on(t.fileHash),
    index("scanned_invoice_documents_supplier_idx").on(t.supplierId),
  ]
);

// ─── Extracted header fields (one row per document) ──────────────────────────

export const invoiceExtractionsTable = pgTable(
  "invoice_extractions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => scannedInvoiceDocumentsTable.id, { onDelete: "cascade" }),

    // Each field: raw value, corrected value, confidence 0-1, status
    supplierName:           text("supplier_name"),
    supplierNameConfidence: numeric("supplier_name_confidence", { precision: 4, scale: 3 }),
    supplierNameStatus:     extractionFieldStatusEnum("supplier_name_status").default("auto"),

    legalName:           text("legal_name"),
    legalNameConfidence: numeric("legal_name_confidence", { precision: 4, scale: 3 }),
    legalNameStatus:     extractionFieldStatusEnum("legal_name_status").default("auto"),

    nif:           text("nif"),
    nifConfidence: numeric("nif_confidence", { precision: 4, scale: 3 }),
    nifStatus:     extractionFieldStatusEnum("nif_status").default("auto"),

    invoiceNumber:           text("invoice_number"),
    invoiceNumberConfidence: numeric("invoice_number_confidence", { precision: 4, scale: 3 }),
    invoiceNumberStatus:     extractionFieldStatusEnum("invoice_number_status").default("auto"),

    invoiceDate:           text("invoice_date"), // stored as ISO string
    invoiceDateConfidence: numeric("invoice_date_confidence", { precision: 4, scale: 3 }),
    invoiceDateStatus:     extractionFieldStatusEnum("invoice_date_status").default("auto"),

    dueDate:           text("due_date"),
    dueDateConfidence: numeric("due_date_confidence", { precision: 4, scale: 3 }),
    dueDateStatus:     extractionFieldStatusEnum("due_date_status").default("auto"),

    taxableBase:           numeric("taxable_base", { precision: 12, scale: 4 }),
    taxableBaseConfidence: numeric("taxable_base_confidence", { precision: 4, scale: 3 }),
    taxableBaseStatus:     extractionFieldStatusEnum("taxable_base_status").default("auto"),

    vatBreakdown:           jsonb("vat_breakdown"),           // [{ rate: 10, base: 100, amount: 10 }]
    vatBreakdownConfidence: numeric("vat_breakdown_confidence", { precision: 4, scale: 3 }),
    vatBreakdownStatus:     extractionFieldStatusEnum("vat_breakdown_status").default("auto"),

    total:           numeric("total", { precision: 12, scale: 4 }),
    totalConfidence: numeric("total_confidence", { precision: 4, scale: 3 }),
    totalStatus:     extractionFieldStatusEnum("total_status").default("auto"),

    paymentMethod:           text("payment_method"),
    paymentMethodConfidence: numeric("payment_method_confidence", { precision: 4, scale: 3 }),
    paymentMethodStatus:     extractionFieldStatusEnum("payment_method_status").default("auto"),

    relatedOrderNumber:           text("related_order_number"), // PO ref from invoice text
    relatedOrderNumberConfidence: numeric("related_order_number_confidence", { precision: 4, scale: 3 }),
    relatedOrderNumberStatus:     extractionFieldStatusEnum("related_order_number_status").default("auto"),

    relatedDeliveryNote:           text("related_delivery_note"), // albarán ref
    relatedDeliveryNoteConfidence: numeric("related_delivery_note_confidence", { precision: 4, scale: 3 }),
    relatedDeliveryNoteStatus:     extractionFieldStatusEnum("related_delivery_note_status").default("auto"),

    // Overall extraction quality
    overallConfidence: numeric("overall_confidence", { precision: 4, scale: 3 }),
    rawOcrText: text("raw_ocr_text"), // full raw OCR output for debugging

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

// ─── Extracted line items ────────────────────────────────────────────────────

export const invoiceExtractedLinesTable = pgTable(
  "invoice_extracted_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => scannedInvoiceDocumentsTable.id, { onDelete: "cascade" }),

    lineNumber: integer("line_number").notNull(),

    // Extracted from invoice
    supplierRef: text("supplier_ref"),   // proveedor's product code
    description: text("description"),   // text as it appears on invoice
    quantity:    numeric("quantity",    { precision: 12, scale: 4 }),
    unit:        text("unit"),           // as printed (caja, kg, ud, l, ...)
    unitPrice:   numeric("unit_price",  { precision: 12, scale: 4 }),
    discount:    numeric("discount",    { precision: 6, scale: 4 }),   // 0-1 fraction
    vatRate:     numeric("vat_rate",    { precision: 5, scale: 4 }),   // 0-1 fraction
    lineTotal:   numeric("line_total",  { precision: 12, scale: 4 }),

    // Confidence per line (aggregate)
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    status:     extractionFieldStatusEnum("status").default("auto"),

    // Manual mapping to internal inventory
    ingredientId: uuid("ingredient_id").references(() => ingredientsTable.id),
    conversionFactor: numeric("conversion_factor", { precision: 12, scale: 6 }), // invoice qty → internal unit
    conversionNote: text("conversion_note"), // e.g. "1 caja = 6 ud"
    mappingConfirmed: boolean("mapping_confirmed").notNull().default(false),

    isRejected: boolean("is_rejected").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("invoice_extracted_lines_doc_idx").on(t.documentId),
    index("invoice_extracted_lines_ingredient_idx").on(t.ingredientId),
  ]
);

// ─── Product reference mappings (learning layer) ─────────────────────────────

export const invoiceProductMappingsTable = pgTable(
  "invoice_product_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliersTable.id, { onDelete: "cascade" }),

    // Keys: exactly how this supplier names the product on invoices
    supplierText:    text("supplier_text").notNull(),     // description as printed
    supplierRef:     text("supplier_ref"),                // product code on invoice
    supplierUnit:    text("supplier_unit"),               // unit as printed

    // Internal mapping
    ingredientId:     uuid("ingredient_id").references(() => ingredientsTable.id),
    conversionFactor: numeric("conversion_factor", { precision: 12, scale: 6 }),
    internalUnit:     text("internal_unit"),

    timesUsed: integer("times_used").notNull().default(1),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedBy: uuid("confirmed_by").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("invoice_product_mappings_supplier_idx").on(t.supplierId),
    index("invoice_product_mappings_text_idx").on(t.supplierId, t.supplierText),
  ]
);

// ─── Document–order/receipt links ────────────────────────────────────────────

export const invoiceScanOrderLinksTable = pgTable(
  "invoice_scan_order_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => scannedInvoiceDocumentsTable.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => purchaseOrdersTable.id, { onDelete: "cascade" }),
  }
);

export const invoiceScanReceiptLinksTable = pgTable(
  "invoice_scan_receipt_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => scannedInvoiceDocumentsTable.id, { onDelete: "cascade" }),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => goodsReceiptsTable.id, { onDelete: "cascade" }),
  }
);

// ─── Scan audit log ──────────────────────────────────────────────────────────

export const invoiceScanAuditLogTable = pgTable(
  "invoice_scan_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => scannedInvoiceDocumentsTable.id, { onDelete: "cascade" }),
    action: text("action").notNull(), // "upload" | "process" | "correct" | "confirm" | "reject" | "duplicate" | "download"
    actorId: uuid("actor_id").notNull(),
    actorName: text("actor_name"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invoice_scan_audit_doc_idx").on(t.documentId)]
);
