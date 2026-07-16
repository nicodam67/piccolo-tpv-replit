import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

export const setupWizardSessionsTable = pgTable("setup_wizard_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  mode: text("mode").notNull().default("full"),
  currentStep: text("current_step").notNull().default("identidad"),
  completedSteps: jsonb("completed_steps").$type<string[]>().notNull().default([]),
  skippedSteps: jsonb("skipped_steps").$type<string[]>().notNull().default([]),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  startedBy: uuid("started_by").references(() => employeesTable.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  resumedAt: timestamp("resumed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  goLiveAt: timestamp("go_live_at", { withTimezone: true }),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const setupAuditLogTable = pgTable("setup_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => setupWizardSessionsTable.id, { onDelete: "set null" }),
  step: text("step").notNull(),
  action: text("action").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  performedBy: uuid("performed_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SetupWizardSession = typeof setupWizardSessionsTable.$inferSelect;
export type InsertSetupWizardSession = typeof setupWizardSessionsTable.$inferInsert;
export type SetupAuditLog = typeof setupAuditLogTable.$inferSelect;
