import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";
import { ordersTable } from "./orders";

// ---------------------------------------------------------------------------
// Document Templates
// ---------------------------------------------------------------------------

export const documentTemplatesTable = pgTable("document_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  documentType: text("document_type").notNull(), // prefactura | ticket | factura_completa | comanda | recogida | justificante
  printFormat: text("print_format").notNull().default("thermal_80mm"), // thermal_80mm | thermal_58mm | a4 | a5 | digital | email
  isDefault: boolean("is_default").notNull().default(false),
  isBuiltIn: boolean("is_built_in").notNull().default(false), // built-in seeds can be "restored"
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  config: jsonb("config").notNull().default({}), // visual settings JSON
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DocumentTemplate = typeof documentTemplatesTable.$inferSelect;

// ---------------------------------------------------------------------------
// Printer Configs
// ---------------------------------------------------------------------------

export const printerConfigsTable = pgTable("printer_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  printerType: text("printer_type").notNull().default("thermal"), // thermal | laser | inkjet
  paperWidth: integer("paper_width").notNull().default(80), // mm
  location: text("location").notNull().default(""),
  documentType: text("document_type").notNull().default("ticket"), // which document type this printer handles
  copies: integer("copies").notNull().default(1),
  autoCut: boolean("auto_cut").notNull().default(true),
  cashDrawer: boolean("cash_drawer").notNull().default(false),
  autoPrint: boolean("auto_print").notNull().default(false), // auto vs manual
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PrinterConfig = typeof printerConfigsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Invoice Series (correlative numbering with concurrency lock)
// ---------------------------------------------------------------------------

export const invoiceSeriesTable = pgTable(
  "invoice_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serie: text("serie").notNull(), // e.g. "T" (ticket), "F" (factura), "R" (rectificativa)
    documentType: text("document_type").notNull(), // ticket | factura
    currentNumber: integer("current_number").notNull().default(0),
    prefix: text("prefix").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("invoice_series_serie_doctype_uniq").on(t.serie, t.documentType)]
);

export type InvoiceSeries = typeof invoiceSeriesTable.$inferSelect;

// ---------------------------------------------------------------------------
// Invoices (full fiscal invoices)
// ---------------------------------------------------------------------------

export const invoicesTable = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  serie: text("serie").notNull().default("F"),
  invoiceNumber: integer("invoice_number").notNull().default(0),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  operationDate: timestamp("operation_date", { withTimezone: true }),
  // Emisor (copied from business_config at issuance time)
  emisorNombre: text("emisor_nombre").notNull().default(""),
  emisorNif: text("emisor_nif").notNull().default(""),
  emisorDireccion: text("emisor_direccion").notNull().default(""),
  emisorCp: text("emisor_cp").notNull().default(""),
  emisorPoblacion: text("emisor_poblacion").notNull().default(""),
  emisorProvincia: text("emisor_provincia").notNull().default(""),
  emisorPais: text("emisor_pais").notNull().default("España"),
  // Client fiscal data
  clientName: text("client_name").notNull().default(""),
  clientNif: text("client_nif").notNull().default(""),
  clientAddress: text("client_address").notNull().default(""),
  clientCp: text("client_cp").notNull().default(""),
  clientCity: text("client_city").notNull().default(""),
  clientProvince: text("client_province").notNull().default(""),
  clientCountry: text("client_country").notNull().default("España"),
  clientEmail: text("client_email").notNull().default(""),
  clientPhone: text("client_phone").notNull().default(""),
  // Order reference
  orderId: uuid("order_id").references(() => ordersTable.id),
  // Amounts
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxTotal: numeric("tax_total", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  /** JSON array: [{rate:number, base:string, cuota:string}] — one entry per VAT rate */
  taxBreakdown: jsonb("tax_breakdown"),
  paymentMethod: text("payment_method").notNull().default(""),
  notes: text("notes").notNull().default(""),
  // Status
  status: text("status").notNull().default("issued"), // draft | issued | rectified | cancelled
  // Rectificativa
  originalInvoiceId: uuid("original_invoice_id"),
  rectificationReason: text("rectification_reason").notNull().default(""),
  // VeriFactu
  verifactuStatus: text("verifactu_status").notNull().default("pending"),
  // pending | generated | sent | accepted | rejected | retry | rectified
  verifactuResponse: jsonb("verifactu_response"),
  // Employee
  employeeId: uuid("employee_id").references(() => employeesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Invoice = typeof invoicesTable.$inferSelect;

// ---------------------------------------------------------------------------
// Clients (fiscal data for full invoices)
// ---------------------------------------------------------------------------

export const clientsTable = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nif: text("nif").notNull().default(""),
  address: text("address").notNull().default(""),
  cp: text("cp").notNull().default(""),
  city: text("city").notNull().default(""),
  province: text("province").notNull().default(""),
  country: text("country").notNull().default("España"),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Client = typeof clientsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Document Audit Log (immutable)
// ---------------------------------------------------------------------------

export const documentAuditLogTable = pgTable("document_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),
  // create_template | activate_template | print_prefactura | reprint_prefactura |
  // issue_ticket | issue_invoice | reprint_document | send_email | download_pdf |
  // create_rectificativa | print_error | fiscal_error | unauthorized_attempt
  documentType: text("document_type").notNull().default(""),
  documentId: text("document_id").notNull().default(""), // uuid as string (could be ticket, invoice, etc.)
  employeeId: uuid("employee_id").references(() => employeesTable.id),
  employeeName: text("employee_name").notNull().default(""),
  terminal: text("terminal").notNull().default(""), // IP or user-agent snippet
  printCount: integer("print_count").notNull().default(1),
  amount: numeric("amount", { precision: 10, scale: 2 }),
  details: text("details").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DocumentAuditLog = typeof documentAuditLogTable.$inferSelect;

// ---------------------------------------------------------------------------
// Document Reprints
// ---------------------------------------------------------------------------

export const documentReprintsTable = pgTable("document_reprints", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: text("document_id").notNull(), // uuid as string
  documentType: text("document_type").notNull(), // ticket | invoice | prefactura
  employeeId: uuid("employee_id").references(() => employeesTable.id),
  employeeName: text("employee_name").notNull().default(""),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DocumentReprint = typeof documentReprintsTable.$inferSelect;
