import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

// ─── Backup Records ───────────────────────────────────────────────────────────
export const backupRecordsTable = pgTable("backup_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by").references(() => employeesTable.id, {
    onDelete: "set null",
  }),
  createdByName: text("created_by_name").notNull().default(""),
  // 'manual' | 'auto' | 'pre-update' | 'pre-migration' | 'pre-restore'
  type: text("type").notNull().default("manual"),
  appVersion: text("app_version").notNull().default("1.0.0"),
  // 'pending' | 'valid' | 'incomplete' | 'corrupted'
  status: text("status").notNull().default("pending"),
  sizeBytes: integer("size_bytes"),
  // { tableName: rowCount }
  recordCounts: jsonb("record_counts")
    .$type<Record<string, number>>()
    .default({}),
  tablesIncluded: jsonb("tables_included").$type<string[]>().default([]),
  integrityHash: text("integrity_hash"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  // base64-encoded AES-256-GCM encrypted JSON dump (iv+authTag+ciphertext)
  encryptedPayload: text("encrypted_payload"),
  notes: text("notes"),
});

// ─── Backup Audit Log (immutable — no delete allowed via API) ─────────────────
export const backupAuditLogTable = pgTable("backup_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  backupId: uuid("backup_id").references(() => backupRecordsTable.id, {
    onDelete: "set null",
  }),
  // 'created' | 'downloaded' | 'verified' | 'restored' | 'deleted' | 'test_restored' | 'partial_restored'
  action: text("action").notNull(),
  employeeId: uuid("employee_id").references(() => employeesTable.id, {
    onDelete: "set null",
  }),
  employeeName: text("employee_name").notNull().default(""),
  performedAt: timestamp("performed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // 'ok' | 'error'
  result: text("result").notNull().default("ok"),
  details: jsonb("details").$type<Record<string, unknown>>().default({}),
});

export type BackupRecord = typeof backupRecordsTable.$inferSelect;
export type NewBackupRecord = typeof backupRecordsTable.$inferInsert;
export type BackupAuditLog = typeof backupAuditLogTable.$inferSelect;
