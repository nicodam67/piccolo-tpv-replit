import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  numeric,
  date,
  integer,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";
import { timeRecordsTable } from "./fichaje";

// ─── Departamentos ────────────────────────────────────────────────────────────
export const hrDepartmentsTable = pgTable("hr_departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Puestos (posiciones de trabajo) ─────────────────────────────────────────
export const hrPositionsTable = pgTable("hr_positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code").notNull().default(""),
  departmentId: uuid("department_id").references(() => hrDepartmentsTable.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Centros de trabajo ───────────────────────────────────────────────────────
export const hrWorkCentersTable = pgTable("hr_work_centers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Multi-puesto por empleado ────────────────────────────────────────────────
export const hrEmployeePositionsTable = pgTable("hr_employee_positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  positionId: uuid("position_id")
    .notNull()
    .references(() => hrPositionsTable.id, { onDelete: "cascade" }),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Identificadores externos por dispositivo ─────────────────────────────────
export const hrEmployeeExternalIdsTable = pgTable("hr_employee_external_ids", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  source: text("source").notNull(), // 'anviz'|'zkteco'|'hik'|'custom'
  externalId: text("external_id").notNull(),
  deviceId: text("device_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Plantillas de importación ────────────────────────────────────────────────
export const hrImportTemplatesTable = pgTable("hr_import_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  manufacturer: text("manufacturer").notNull().default(""),
  fileFormat: text("file_format").notNull().default("csv"), // 'csv'|'xlsx'|'xls'|'json'|'txt'
  config: jsonb("config").notNull().default({}),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Historial de importaciones ───────────────────────────────────────────────
export const hrImportHistoryTable = pgTable("hr_import_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  fileHash: text("file_hash").notNull(),
  fileFormat: text("file_format").notNull().default("csv"),
  templateId: uuid("template_id").references(() => hrImportTemplatesTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"), // 'pending'|'preview'|'confirmed'|'reverted'|'error'
  rowsTotal: integer("rows_total").notNull().default(0),
  rowsImported: integer("rows_imported").notNull().default(0),
  rowsSkipped: integer("rows_skipped").notNull().default(0),
  rowsErrors: integer("rows_errors").notNull().default(0),
  rowsPending: integer("rows_pending").notNull().default(0),
  columnMapping: jsonb("column_mapping"),
  errors: jsonb("errors"),
  parsedRows: jsonb("parsed_rows"),  // server-side parsed rows for XLSX/binary format confirm step
  importedBy: uuid("imported_by")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "restrict" }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  revertedAt: timestamp("reverted_at", { withTimezone: true }),
  revertReason: text("revert_reason"),
  revertedBy: uuid("reverted_by").references(() => employeesTable.id, { onDelete: "set null" }),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Filas de importación (trazabilidad) ─────────────────────────────────────
export const hrImportRowsTable = pgTable("hr_import_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  importId: uuid("import_id")
    .notNull()
    .references(() => hrImportHistoryTable.id, { onDelete: "cascade" }),
  rowNumber: integer("row_number").notNull(),
  employeeId: uuid("employee_id").references(() => employeesTable.id, { onDelete: "set null" }),
  externalIdentifier: text("external_identifier"),
  rawData: jsonb("raw_data").notNull().default({}),
  matchedBy: text("matched_by"), // 'anviz_id'|'nfc_id'|'external_code'|'manual'|null
  status: text("status").notNull().default("pending"), // 'imported'|'skipped'|'error'|'pending'|'reverted'
  errorMessage: text("error_message"),
  timeRecordId: uuid("time_record_id").references(() => timeRecordsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Periodos de cierre mensual ───────────────────────────────────────────────
export const hrPayPeriodsTable = pgTable("hr_pay_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 1-12
  status: text("status").notNull().default("open"), // 'open'|'closed'|'locked'
  plannedHours: numeric("planned_hours", { precision: 8, scale: 2 }),
  actualHours: numeric("actual_hours", { precision: 8, scale: 2 }),
  estimatedCost: numeric("estimated_cost", { precision: 10, scale: 2 }),
  totalSales: numeric("total_sales", { precision: 12, scale: 2 }),
  notes: text("notes"),
  closedBy: uuid("closed_by").references(() => employeesTable.id, { onDelete: "set null" }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  reopenedBy: uuid("reopened_by").references(() => employeesTable.id, { onDelete: "set null" }),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Solicitudes de empleados ─────────────────────────────────────────────────
export const hrEmployeeRequestsTable = pgTable("hr_employee_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  requestType: text("request_type").notNull(), // 'vacation'|'shift_swap'|'absence'|'correction'
  dateFrom: date("date_from").notNull(),
  dateTo: date("date_to").notNull(),
  status: text("status").notNull().default("pending"), // 'pending'|'approved'|'rejected'
  notes: text("notes"),
  reviewedBy: uuid("reviewed_by").references(() => employeesTable.id, { onDelete: "set null" }),
  reviewNotes: text("review_notes"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Notificaciones HR ────────────────────────────────────────────────────────
export const hrNotificationsTable = pgTable("hr_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'request_approved'|'request_rejected'|'shift_change'|'reminder'
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type HrDepartment = typeof hrDepartmentsTable.$inferSelect;
export type HrPosition = typeof hrPositionsTable.$inferSelect;
export type HrWorkCenter = typeof hrWorkCentersTable.$inferSelect;
export type HrImportTemplate = typeof hrImportTemplatesTable.$inferSelect;
export type HrImportHistory = typeof hrImportHistoryTable.$inferSelect;
export type HrImportRow = typeof hrImportRowsTable.$inferSelect;
export type HrPayPeriod = typeof hrPayPeriodsTable.$inferSelect;
export type HrEmployeeRequest = typeof hrEmployeeRequestsTable.$inferSelect;
