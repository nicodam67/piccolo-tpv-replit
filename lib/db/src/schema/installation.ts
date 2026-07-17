import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { printersTable } from "./printers";

// ─── Installation Devices ─────────────────────────────────────────────────────
// Extended hardware inventory beyond the lightweight offline_devices tracker.
// Covers the main computer, all tablets, KDS screens, and critical peripherals.

export const installationDevicesTable = pgTable("installation_devices", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Identity
  name: text("name").notNull(),
  tabletNumber: integer("tablet_number"),            // 1-5 for tablets, null for others
  deviceCategory: text("device_category").notNull().default("tablet"),
  // 'main_computer' | 'tablet' | 'kds' | 'printer' | 'cash_drawer' | 'other'

  // Hardware spec
  brand: text("brand").notNull().default(""),
  model: text("model").notNull().default(""),
  os: text("os").notNull().default(""),
  browser: text("browser").notNull().default(""),
  ram: text("ram").notNull().default(""),
  processor: text("processor").notNull().default(""),
  diskSpace: text("disk_space").notNull().default(""),
  appVersion: text("app_version").notNull().default(""),

  // Network
  ipLocal: text("ip_local").notNull().default(""),
  connectionType: text("connection_type").notNull().default("wifi"), // 'cable' | 'wifi'

  // Assignment
  usualEmployeeName: text("usual_employee_name").notNull().default(""),
  usualZone: text("usual_zone").notNull().default(""),

  // Permissions
  paymentAllowed: boolean("payment_allowed").notNull().default(false),
  offlineAuthorized: boolean("offline_authorized").notNull().default(true),

  // Associations
  defaultPrinterId: uuid("default_printer_id").references(() => printersTable.id, { onDelete: "set null" }),
  mainPrinterAssociated: text("main_printer_associated").notNull().default(""),
  cashAssociated: text("cash_associated").notNull().default(""),

  // Status
  status: text("status").notNull().default("pending"),
  // 'ready' | 'warning' | 'error' | 'pending' | 'offline'

  notes: text("notes").notNull().default(""),

  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Network Registry ─────────────────────────────────────────────────────────
// Fixed IP or DHCP-reserved address book for all critical LAN devices.

export const networkRegistryTable = pgTable("network_registry", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ip: text("ip").notNull(),
  mac: text("mac").notNull().default(""),
  deviceType: text("device_type").notNull().default("other"),
  // 'computer' | 'tablet' | 'printer' | 'kds' | 'router' | 'cash_drawer' | 'other'
  zone: text("zone").notNull().default(""),
  status: text("status").notNull().default("unknown"),
  // 'ok' | 'conflict' | 'unknown' | 'unreachable'
  lastConnectionAt: timestamp("last_connection_at", { withTimezone: true }),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Installation Test Results ─────────────────────────────────────────────────
// Records the outcome of each guided test (printer, offline, simulation, etc.)

export const installationTestsTable = pgTable("installation_tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  testType: text("test_type").notNull(),
  // 'printer_ticket' | 'printer_cocina' | 'printer_pizza' | 'printer_ensalada' | 'printer_barra'
  // | 'printer_reparto' | 'printer_chars' | 'printer_cut' | 'printer_drawer' | 'printer_fallback'
  // | 'offline_internet' | 'offline_wifi' | 'sync_tablets' | 'payment_cash' | 'payment_card'
  // | 'payment_mixed' | 'full_simulation'
  deviceId: uuid("device_id"),               // nullable — some tests are not device-specific
  deviceName: text("device_name").notNull().default(""),
  result: text("result").notNull().default("pending"),
  // 'ok' | 'warning' | 'error' | 'pending' | 'skipped'
  notes: text("notes").notNull().default(""),
  performedBy: text("performed_by").notNull().default(""),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  performedAt: timestamp("performed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Manuals ──────────────────────────────────────────────────────────────────
// Operational checklists stored in the DB so admins can edit steps.

import { employeesTable } from "./employees";

export const manualsTable = pgTable("manuals", {
  id:           uuid("id").primaryKey().defaultRandom(),
  type:         text("type").notNull().unique(), // 'apertura' | 'cierre' | 'emergencia'
  title:        text("title").notNull().default(""),
  steps:        jsonb("steps").$type<Array<Record<string, unknown>>>().notNull().default([]),
  supportPhone: text("support_phone").notNull().default(""),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy:    uuid("updated_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InstallationDevice = typeof installationDevicesTable.$inferSelect;
export type NetworkRegistryEntry = typeof networkRegistryTable.$inferSelect;
export type InstallationTest = typeof installationTestsTable.$inferSelect;
export type Manual = typeof manualsTable.$inferSelect;
