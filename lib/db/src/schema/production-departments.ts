import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const DEPARTMENT_OUTPUT_MODES = ["none", "kds", "printer", "both"] as const;
export type DepartmentOutputMode = typeof DEPARTMENT_OUTPUT_MODES[number];

export const DEPARTMENT_WORKFLOW_PROFILES = ["standard", "pizza", "bar", "pase", "none"] as const;
export type DepartmentWorkflowProfile = typeof DEPARTMENT_WORKFLOW_PROFILES[number];

export const productionDepartmentsTable = pgTable("production_departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  outputMode: text("output_mode").notNull().default("none").$type<DepartmentOutputMode>(),
  workflowProfile: text("workflow_profile").notNull().default("standard").$type<DepartmentWorkflowProfile>(),
  printerIds: jsonb("printer_ids").notNull().$type<string[]>().default([]),
  showInKdsNav: boolean("show_in_kds_nav").notNull().default(true),
  assignableToProducts: boolean("assignable_to_products").notNull().default(true),
  isPaseAggregator: boolean("is_pase_aggregator").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProductionDepartment = typeof productionDepartmentsTable.$inferSelect;
