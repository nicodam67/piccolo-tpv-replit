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
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

// ─── Registros de tiempo (entradas/salidas) ──────────────────────────────────
export const timeRecordsTable = pgTable("time_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "restrict" }),
  clockIn: timestamp("clock_in", { withTimezone: true }).notNull(),
  clockOut: timestamp("clock_out", { withTimezone: true }),
  source: text("source").notNull().default("pin"), // 'pin' | 'nfc' | 'manual' | 'anviz'
  isManual: boolean("is_manual").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").references(() => employeesTable.id),
});

// ─── Descansos vinculados a un registro ─────────────────────────────────────
export const breaksTable = pgTable("breaks", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordId: uuid("record_id")
    .notNull()
    .references(() => timeRecordsTable.id, { onDelete: "cascade" }),
  breakStart: timestamp("break_start", { withTimezone: true }).notNull(),
  breakEnd: timestamp("break_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Turnos planificados ─────────────────────────────────────────────────────
export const shiftsTable = pgTable("shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  shiftDate: date("shift_date").notNull(),
  startTime: text("start_time").notNull(), // HH:MM
  endTime: text("end_time").notNull(),     // HH:MM
  isSplit: boolean("is_split").notNull().default(false),
  splitStartTime: text("split_start_time"), // HH:MM — inicio turno tarde si es partido
  splitEndTime: text("split_end_time"),     // HH:MM — fin turno tarde si es partido
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").references(() => employeesTable.id),
});

// ─── Ausencias y festivos ────────────────────────────────────────────────────
export const absencesTable = pgTable("absences", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  absenceDate: date("absence_date").notNull(),
  absenceType: text("absence_type").notNull(), // 'holiday' | 'sick_leave' | 'vacation' | 'presentation' | 'other'
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
  reason: text("reason"),
  approvedBy: uuid("approved_by").references(() => employeesTable.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Correcciones de registros ───────────────────────────────────────────────
export const timeCorrectionsTable = pgTable("time_corrections", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordId: uuid("record_id")
    .notNull()
    .references(() => timeRecordsTable.id, { onDelete: "cascade" }),
  correctedBy: uuid("corrected_by")
    .notNull()
    .references(() => employeesTable.id),
  reason: text("reason").notNull(),
  beforeData: jsonb("before_data").notNull(), // snapshot del registro antes
  afterData: jsonb("after_data").notNull(),   // snapshot del registro después
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Importaciones CSV Anviz ─────────────────────────────────────────────────
export const csvImportsTable = pgTable("csv_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  rowsTotal: integer("rows_total").notNull().default(0),
  rowsImported: integer("rows_imported").notNull().default(0),
  rowsSkipped: integer("rows_skipped").notNull().default(0),
  rowsErrored: integer("rows_errored").notNull().default(0),
  errors: jsonb("errors"),   // array de {row, message}
  importedBy: uuid("imported_by")
    .notNull()
    .references(() => employeesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Auditoría de fichaje ────────────────────────────────────────────────────
export const fichajeAuditTable = pgTable("fichaje_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),       // 'clock_in' | 'clock_out' | 'break_start' | 'break_end' | 'correction' | 'import' | 'absence_approved' etc.
  employeeId: uuid("employee_id").references(() => employeesTable.id),
  performedBy: uuid("performed_by").references(() => employeesTable.id),
  entityType: text("entity_type"),        // 'time_record' | 'shift' | 'absence' | 'employee'
  entityId: uuid("entity_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Configuración del módulo de fichaje ─────────────────────────────────────
export const fichajeSettingsTable = pgTable("fichaje_settings", {
  id: integer("id").primaryKey().default(1), // single-row config
  companyName: text("company_name").notNull().default("Piccolo La Ràpita"),
  locale: text("locale").notNull().default("es-ES"),
  timezone: text("timezone").notNull().default("Europe/Madrid"),
  weekStart: text("week_start").notNull().default("monday"), // 'monday' | 'sunday'
  mobileClockEnabled: boolean("mobile_clock_enabled").notNull().default(false),
  reportEmail: text("report_email"),
  reportDayOfWeek: integer("report_day_of_week").default(1), // 1=lunes
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
