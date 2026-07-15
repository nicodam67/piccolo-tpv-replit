import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { ingredientsTable } from "./stock";
import { employeesTable } from "./employees";

// ─── Suppliers ────────────────────────────────────────────────────────────────
export const suppliersTable = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  commercialName: text("commercial_name").notNull(),
  legalName: text("legal_name"),
  nif: text("nif"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  contactPerson: text("contact_person"),
  paymentTerms: text("payment_terms"),
  deliveryDays: text("delivery_days"), // e.g. "lunes,miercoles,viernes"
  minOrder: numeric("min_order", { precision: 10, scale: 2 }).default("0"),
  leadTimeDays: integer("lead_time_days").default(1),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Supplier catalogue items ──────────────────────────────────────────────────
// Each row links one ingredient to one supplier with purchase-specific pricing.
export const supplierCatalogItemsTable = pgTable("supplier_catalog_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id").notNull().references(() => ingredientsTable.id, { onDelete: "cascade" }),
  supplierRef: text("supplier_ref"),       // supplier's SKU / code
  purchaseFormat: text("purchase_format"), // e.g. "Caja 6 kg"
  unitsPerPack: numeric("units_per_pack", { precision: 10, scale: 4 }).default("1"),
  purchaseUnit: text("purchase_unit").default("ud"),
  price: numeric("price", { precision: 10, scale: 4 }).notNull().default("0"),
  vatPct: numeric("vat_pct", { precision: 5, scale: 2 }).default("10"),
  discount: numeric("discount", { precision: 5, scale: 2 }).default("0"),   // %
  transportCost: numeric("transport_cost", { precision: 10, scale: 4 }).default("0"),
  isPreferred: boolean("is_preferred").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Purchase orders ───────────────────────────────────────────────────────────
export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliersTable.id),
  // draft | pending_approval | sent | confirmed | partially_received | received | cancelled
  status: text("status").notNull().default("draft"),
  orderDate: timestamp("order_date", { withTimezone: true }).notNull().defaultNow(),
  expectedDeliveryDate: date("expected_delivery_date"),
  notes: text("notes"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 4 }).default("0"),
  createdBy: uuid("created_by").references(() => employeesTable.id),
  approvedBy: uuid("approved_by").references(() => employeesTable.id),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Purchase order items ──────────────────────────────────────────────────────
export const purchaseOrderItemsTable = pgTable("purchase_order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => purchaseOrdersTable.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id").notNull().references(() => ingredientsTable.id),
  supplierCatalogItemId: uuid("supplier_catalog_item_id").references(() => supplierCatalogItemsTable.id),
  quantity: numeric("quantity", { precision: 10, scale: 4 }).notNull(),
  unit: text("unit").notNull().default("ud"),
  unitPrice: numeric("unit_price", { precision: 10, scale: 4 }).notNull().default("0"),
  vatPct: numeric("vat_pct", { precision: 5, scale: 2 }).default("10"),
  discount: numeric("discount", { precision: 5, scale: 2 }).default("0"),
  notes: text("notes"),
});

// ─── Goods receipts (albaranes) ────────────────────────────────────────────────
export const goodsReceiptsTable = pgTable("goods_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").references(() => purchaseOrdersTable.id),
  supplierId: uuid("supplier_id").notNull().references(() => suppliersTable.id),
  receiptNumber: text("receipt_number"),  // albarán number from supplier
  receiptDate: timestamp("receipt_date", { withTimezone: true }).notNull().defaultNow(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 4 }).default("0"),
  incidents: text("incidents"),
  attachmentUrl: text("attachment_url"),
  receivedBy: uuid("received_by").references(() => employeesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Goods receipt items ───────────────────────────────────────────────────────
export const goodsReceiptItemsTable = pgTable("goods_receipt_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  receiptId: uuid("receipt_id").notNull().references(() => goodsReceiptsTable.id, { onDelete: "cascade" }),
  orderItemId: uuid("order_item_id").references(() => purchaseOrderItemsTable.id),
  ingredientId: uuid("ingredient_id").notNull().references(() => ingredientsTable.id),
  qtyOrdered: numeric("qty_ordered", { precision: 10, scale: 4 }).default("0"),
  qtyReceived: numeric("qty_received", { precision: 10, scale: 4 }).notNull(),
  qtyRejected: numeric("qty_rejected", { precision: 10, scale: 4 }).default("0"),
  unitPrice: numeric("unit_price", { precision: 10, scale: 4 }).notNull().default("0"),
  lotNumber: text("lot_number"),
  expiryDate: date("expiry_date"),
  temperature: numeric("temperature", { precision: 5, scale: 2 }),
  incidents: text("incidents"),
  substitution: text("substitution"), // note if different ingredient received
});

// ─── Supplier invoices ─────────────────────────────────────────────────────────
// Data model only — no OCR in this phase. Manual entry only.
export const supplierInvoicesTable = pgTable("supplier_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliersTable.id),
  invoiceNumber: text("invoice_number").notNull(),
  invoiceDate: date("invoice_date").notNull(),
  taxableBase: numeric("taxable_base", { precision: 12, scale: 4 }).notNull().default("0"),
  vatAmount: numeric("vat_amount", { precision: 12, scale: 4 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 4 }).notNull().default("0"),
  dueDate: date("due_date"),
  // unpaid | paid | overdue | disputed
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Supplier invoice → receipt links ─────────────────────────────────────────
export const supplierInvoiceReceiptLinksTable = pgTable("supplier_invoice_receipt_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => supplierInvoicesTable.id, { onDelete: "cascade" }),
  receiptId: uuid("receipt_id").notNull().references(() => goodsReceiptsTable.id),
});

// ─── Supplier invoice → order links ───────────────────────────────────────────
export const supplierInvoiceOrderLinksTable = pgTable("supplier_invoice_order_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => supplierInvoicesTable.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => purchaseOrdersTable.id),
});

// ─── Ingredient lots ───────────────────────────────────────────────────────────
export const ingredientLotsTable = pgTable("ingredient_lots", {
  id: uuid("id").primaryKey().defaultRandom(),
  ingredientId: uuid("ingredient_id").notNull().references(() => ingredientsTable.id),
  lotNumber: text("lot_number").notNull(),
  expiryDate: date("expiry_date"),
  initialQty: numeric("initial_qty", { precision: 10, scale: 4 }).notNull(),
  remainingQty: numeric("remaining_qty", { precision: 10, scale: 4 }).notNull(),
  supplierId: uuid("supplier_id").references(() => suppliersTable.id),
  receiptId: uuid("receipt_id").references(() => goodsReceiptsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Purchase audit log ────────────────────────────────────────────────────────
export const purchaseAuditLogTable = pgTable("purchase_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull(), // supplier|order|receipt|invoice
  entityId: uuid("entity_id").notNull(),
  action: text("action").notNull(),         // create|update|send|cancel|receive|price_change
  employeeId: uuid("employee_id").references(() => employeesTable.id),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── TypeScript types ──────────────────────────────────────────────────────────
export type Supplier = typeof suppliersTable.$inferSelect;
export type SupplierCatalogItem = typeof supplierCatalogItemsTable.$inferSelect;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItemsTable.$inferSelect;
export type GoodsReceipt = typeof goodsReceiptsTable.$inferSelect;
export type GoodsReceiptItem = typeof goodsReceiptItemsTable.$inferSelect;
export type SupplierInvoice = typeof supplierInvoicesTable.$inferSelect;
export type IngredientLot = typeof ingredientLotsTable.$inferSelect;
export type PurchaseAuditLog = typeof purchaseAuditLogTable.$inferSelect;
