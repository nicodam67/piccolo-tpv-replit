import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

// ─── Backup Schedules ─────────────────────────────────────────────────────────
export const backupSchedulesTable = pgTable("backup_schedules", {
  id:           uuid("id").primaryKey().defaultRandom(),
  name:         text("name").notNull(),
  frequency:    text("frequency").notNull().default("daily"), // 'hourly'|'daily'|'weekly'|'monthly'
  hour:         integer("hour").notNull().default(3),
  dayOfWeek:    integer("day_of_week"),
  dayOfMonth:   integer("day_of_month"),
  backupType:   text("backup_type").notNull().default("full"),
  retention:    integer("retention").notNull().default(7),
  destinationId: uuid("destination_id"),
  active:       boolean("active").notNull().default(true),
  lastRunAt:    timestamp("last_run_at", { withTimezone: true }),
  nextRunAt:    timestamp("next_run_at", { withTimezone: true }),
  lastStatus:   text("last_status").notNull().default("pending"),
  lastError:    text("last_error"),
  createdBy:    uuid("created_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Backup Destinations ──────────────────────────────────────────────────────
export const backupDestinationsTable = pgTable("backup_destinations", {
  id:         uuid("id").primaryKey().defaultRandom(),
  name:       text("name").notNull(),
  destType:   text("dest_type").notNull().default("internal"), // 'internal'|'download'|'sftp'
  config:     jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  active:     boolean("active").notNull().default(true),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Offline Devices ──────────────────────────────────────────────────────────
export const offlineDevicesTable = pgTable("offline_devices", {
  id:           uuid("id").primaryKey().defaultRandom(),
  name:         text("name").notNull(),
  deviceType:   text("device_type").notNull().default("tpv"),
  fingerprint:  text("fingerprint").notNull().unique(),
  employeeId:   uuid("employee_id").references(() => employeesTable.id, { onDelete: "set null" }),
  status:       text("status").notNull().default("offline"), // 'online'|'offline'|'syncing'|'blocked'|'revoked'
  offlinePerms: jsonb("offline_perms").$type<string[]>().notNull().default([]),
  lastSeenAt:   timestamp("last_seen_at", { withTimezone: true }),
  lastSyncAt:   timestamp("last_sync_at", { withTimezone: true }),
  pendingOps:   integer("pending_ops").notNull().default(0),
  isDemo:       boolean("is_demo").notNull().default(false),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Offline Queue ────────────────────────────────────────────────────────────
export const offlineQueueTable = pgTable("offline_queue", {
  id:              uuid("id").primaryKey().defaultRandom(),
  deviceId:        uuid("device_id").references(() => offlineDevicesTable.id, { onDelete: "set null" }),
  employeeId:      uuid("employee_id").references(() => employeesTable.id, { onDelete: "set null" }),
  operationType:   text("operation_type").notNull(),
  idempotencyKey:  text("idempotency_key").notNull().unique(),
  payload:         jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status:          text("status").notNull().default("pending"), // 'pending'|'sending'|'synced'|'conflict'|'failed'|'skipped'
  attempts:        integer("attempts").notNull().default(0),
  lastError:       text("last_error"),
  resultPayload:   jsonb("result_payload").$type<Record<string, unknown>>(),
  isDemo:          boolean("is_demo").notNull().default(false),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  syncedAt:        timestamp("synced_at", { withTimezone: true }),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Tech Events ──────────────────────────────────────────────────────────────
export const techEventsTable = pgTable("tech_events", {
  id:         uuid("id").primaryKey().defaultRandom(),
  level:      text("level").notNull().default("info"), // 'info'|'warning'|'error'|'critical'
  module:     text("module").notNull().default("system"),
  deviceId:   uuid("device_id").references(() => offlineDevicesTable.id, { onDelete: "set null" }),
  message:    text("message").notNull(),
  code:       text("code"),
  data:       jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  resolved:   boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  isDemo:     boolean("is_demo").notNull().default(false),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BackupSchedule = typeof backupSchedulesTable.$inferSelect;
export type BackupDestination = typeof backupDestinationsTable.$inferSelect;
export type OfflineDevice = typeof offlineDevicesTable.$inferSelect;
export type OfflineQueueItem = typeof offlineQueueTable.$inferSelect;
export type TechEvent = typeof techEventsTable.$inferSelect;
