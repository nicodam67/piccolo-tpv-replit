import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { categoriesTable, productsTable } from "./categories";
import { employeesTable } from "./employees";

export const profitabilitySettingsTable = pgTable("profitability_settings", {
  id: text("id").primaryKey().default("global"),
  defaultTargetMarginPct: numeric("default_target_margin_pct", { precision: 5, scale: 2 }).notNull().default("65"),
  warningGapPct: numeric("warning_gap_pct", { precision: 5, scale: 2 }).notNull().default("10"),
  allocationMethod: text("allocation_method").notNull().default("none"),
  updatedBy: uuid("updated_by").references(() => employeesTable.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const operatingExpensesTable = pgTable("operating_expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  costType: text("cost_type").notNull().default("fixed"),
  frequency: text("frequency").notNull().default("monthly"),
  periodMonths: integer("period_months").notNull().default(1),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const channelCommissionsTable = pgTable("channel_commissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  channel: text("channel").notNull(),
  name: text("name").notNull(),
  percent: numeric("percent", { precision: 5, scale: 2 }).notNull().default("0"),
  fixedAmount: numeric("fixed_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  active: boolean("active").notNull().default(true),
  updatedBy: uuid("updated_by").references(() => employeesTable.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("channel_commissions_channel_unique").on(table.channel),
]);

export const profitabilityTargetsTable = pgTable("profitability_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  scopeType: text("scope_type").notNull().default("global"),
  categoryId: uuid("category_id").references(() => categoriesTable.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => productsTable.id, { onDelete: "cascade" }),
  channel: text("channel"),
  targetMarginPct: numeric("target_margin_pct", { precision: 5, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
  updatedBy: uuid("updated_by").references(() => employeesTable.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const priceChangeProposalsTable = pgTable("price_change_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => productsTable.id),
  oldPrice: numeric("old_price", { precision: 10, scale: 2 }).notNull(),
  proposedPrice: numeric("proposed_price", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  requestedBy: uuid("requested_by").references(() => employeesTable.id, { onDelete: "set null" }),
  reviewedBy: uuid("reviewed_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
});

export type ProfitabilitySettings = typeof profitabilitySettingsTable.$inferSelect;
export type OperatingExpense = typeof operatingExpensesTable.$inferSelect;
export type ChannelCommission = typeof channelCommissionsTable.$inferSelect;
export type ProfitabilityTarget = typeof profitabilityTargetsTable.$inferSelect;
export type PriceChangeProposal = typeof priceChangeProposalsTable.$inferSelect;
