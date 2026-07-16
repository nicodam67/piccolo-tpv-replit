import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ── Printer types ─────────────────────────────────────────────────────────────
// cocina | pizza | ensalada | barra | postres | caja | respaldo
export const PRINTER_TYPES = ["cocina", "pizza", "ensalada", "barra", "postres", "caja", "respaldo"] as const;
export type PrinterType = typeof PRINTER_TYPES[number];

// ── print_queue statuses ──────────────────────────────────────────────────────
export const PRINT_QUEUE_STATUSES = ["pending", "sending", "printed", "error", "retrying", "reprinted", "cancelled"] as const;
export type PrintQueueStatus = typeof PRINT_QUEUE_STATUSES[number];

// ── Document types ────────────────────────────────────────────────────────────
export const PRINT_DOCUMENT_TYPES = [
  "kitchen_ticket",      // comanda de cocina
  "added_ticket",        // AÑADIDO — solo líneas nuevas
  "cancellation_ticket", // ANULADO
  "modification_ticket", // MODIFICACIÓN
  "test_ticket",         // prueba de impresora
  "prefactura",
  "factura_simplificada",
  "factura_completa",
  "factura_rectificativa",
  "informe_x",
  "informe_z",
  "reprint",             // reimpresión de cualquier documento
] as const;
export type PrintDocumentType = typeof PRINT_DOCUMENT_TYPES[number];

// ── printers ──────────────────────────────────────────────────────────────────
export const printersTable = pgTable("printers", {
  id:               uuid("id").primaryKey().defaultRandom(),
  name:             text("name").notNull(),
  type:             text("type").notNull().default("cocina"), // PrinterType
  brand:            text("brand").notNull().default(""),
  model:            text("model").notNull().default(""),
  ip:               text("ip").notNull().default(""),
  port:             integer("port").notNull().default(9100),
  paperWidth:       integer("paper_width").notNull().default(80), // 58 | 80 mm
  copies:           integer("copies").notNull().default(1),
  active:           boolean("active").notNull().default(true),
  isPrimary:        boolean("is_primary").notNull().default(true),
  /** UUID of fallback printer — null if no fallback configured */
  fallbackPrinterId: uuid("fallback_printer_id"),
  /** Simulated status returned by the print connector */
  lastStatus:       text("last_status").notNull().default("unknown"),
  lastStatusAt:     timestamp("last_status_at", { withTimezone: true }),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── print_queue ───────────────────────────────────────────────────────────────
export const printQueueTable = pgTable("print_queue", {
  id:            uuid("id").primaryKey().defaultRandom(),
  printerId:     uuid("printer_id").notNull().references(() => printersTable.id),
  /** Nullable — test tickets and fiscal documents may not have an orderId */
  orderId:       uuid("order_id"),
  documentType:  text("document_type").notNull(), // PrintDocumentType
  /** Text content of the ticket (ESC/POS commands as text for the simulator) */
  content:       text("content").notNull(),
  status:        text("status").notNull().default("pending"), // PrintQueueStatus
  attempts:      integer("attempts").notNull().default(0),
  lastError:     text("last_error"),
  /** Set when the job is sent (or first attempted) */
  sentAt:        timestamp("sent_at", { withTimezone: true }),
  /** Set when successfully printed */
  printedAt:     timestamp("printed_at", { withTimezone: true }),
  /** Actor who triggered this print (userId | 'system') */
  actorId:       text("actor_id"),
  actorName:     text("actor_name"),
  /** Metadata: reprint reason, original job id, etc. */
  meta:          jsonb("meta"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── print_routing ─────────────────────────────────────────────────────────────
// Maps entity (category|product) → list of printer IDs that should receive prints.
// When empty, falls back to matching by prepZone → printer.type.
export const printRoutingTable = pgTable("print_routing", {
  id:          uuid("id").primaryKey().defaultRandom(),
  /** 'category' | 'product' */
  entityType:  text("entity_type").notNull(),
  entityId:    uuid("entity_id").notNull(),
  /** Array of printer UUIDs */
  printerIds:  jsonb("printer_ids").notNull().$type<string[]>().default([]),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── print_audit ───────────────────────────────────────────────────────────────
// Immutable log — no DELETE or UPDATE allowed by convention.
export const printAuditTable = pgTable("print_audit", {
  id:           uuid("id").primaryKey().defaultRandom(),
  printQueueId: uuid("print_queue_id"),
  /** sent | retried | fallback | cancelled | reprinted | failed | test | routing_changed */
  action:       text("action").notNull(),
  actorId:      text("actor_id"),
  actorName:    text("actor_name").notNull().default("sistema"),
  detail:       jsonb("detail"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── print_template_config (stored in business_config via jsonb) ───────────────
export interface PrintTemplateConfig {
  logoUrl: string;
  nombreComercial: string;
  datosFiscales: string;
  piePagina: string;
  mensajeAgradecimiento: string;
  mostrarPrecios: boolean;     // in kitchen tickets (defaults false)
  headerExtra: string;
}

export const DEFAULT_PRINT_TEMPLATE: PrintTemplateConfig = {
  logoUrl: "",
  nombreComercial: "",
  datosFiscales: "",
  piePagina: "",
  mensajeAgradecimiento: "¡Gracias por su visita!",
  mostrarPrecios: false,
  headerExtra: "",
};

export type Printer = typeof printersTable.$inferSelect;
export type PrintQueue = typeof printQueueTable.$inferSelect;
export type PrintRouting = typeof printRoutingTable.$inferSelect;
export type PrintAudit = typeof printAuditTable.$inferSelect;
