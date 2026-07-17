import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const auditFindingsTable = pgTable("audit_findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  module: text("module").notNull(),
  severity: text("severity").notNull().default("ok"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: text("resolved_by"),
  runId: text("run_id"),
  automated: boolean("automated").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditRunsTable = pgTable("audit_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: text("run_id").notNull().unique(),
  triggeredBy: text("triggered_by"),
  modulesChecked: integer("modules_checked").notNull().default(0),
  findingsCount: integer("findings_count").notNull().default(0),
  criticalCount: integer("critical_count").notNull().default(0),
  warningCount: integer("warning_count").notNull().default(0),
  durationMs: integer("duration_ms"),
  summary: jsonb("summary").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
