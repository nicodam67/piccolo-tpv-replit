import { boolean, numeric, pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { orderItemsTable } from "./order-items";
import { paymentsTable } from "./payments";
import { employeesTable } from "./employees";
import { cashSessionsTable } from "./payments";

// ─── Discounts ────────────────────────────────────────────────────────────────
// Applied at order level (orderItemId NULL) or per line item
export const discountsTable = pgTable("discounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  orderItemId: uuid("order_item_id").references(() => orderItemsTable.id, {
    onDelete: "cascade",
  }),
  type: text("type").notNull(), // 'percentage' | 'fixed' | 'invitation'
  value: numeric("value", { precision: 10, scale: 2 }).notNull(), // % or €
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  authorizedBy: uuid("authorized_by").references(() => employeesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Tips ─────────────────────────────────────────────────────────────────────
export const tipsTable = pgTable("tips", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => paymentsTable.id, { onDelete: "cascade" }),
  orderId: uuid("order_id")
    .notNull()
    .references(() => ordersTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").notNull().default("cash"), // 'cash' | 'card'
  cashSessionId: uuid("cash_session_id").references(() => cashSessionsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Split Groups ─────────────────────────────────────────────────────────────
// When a table splits their bill into sub-accounts
export const splitGroupsTable = pgTable("split_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(), // "Comensal 1", "Parte A", etc.
  status: text("status").notNull().default("open"), // 'open' | 'paid'
  total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Items assigned to each split group
export const splitGroupItemsTable = pgTable("split_group_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  splitGroupId: uuid("split_group_id")
    .notNull()
    .references(() => splitGroupsTable.id, { onDelete: "cascade" }),
  orderItemId: uuid("order_item_id")
    .notNull()
    .references(() => orderItemsTable.id),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
});

// Payments linked to a split group
export const splitGroupPaymentsTable = pgTable("split_group_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  splitGroupId: uuid("split_group_id")
    .notNull()
    .references(() => splitGroupsTable.id, { onDelete: "cascade" }),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => paymentsTable.id),
});

// ─── Payment Voids ─────────────────────────────────────────────────────────────
export const paymentVoidsTable = pgTable("payment_voids", {
  id: uuid("id").primaryKey().defaultRandom(),
  originalPaymentId: uuid("original_payment_id")
    .notNull()
    .references(() => paymentsTable.id),
  reason: text("reason").notNull(),
  authorizedBy: uuid("authorized_by")
    .notNull()
    .references(() => employeesTable.id),
  cashSessionId: uuid("cash_session_id").references(() => cashSessionsTable.id),
  counterMovementId: uuid("counter_movement_id"), // reference to cash_movements if cash
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type Discount = typeof discountsTable.$inferSelect;
export type Tip = typeof tipsTable.$inferSelect;
export type SplitGroup = typeof splitGroupsTable.$inferSelect;
export type SplitGroupItem = typeof splitGroupItemsTable.$inferSelect;
export type SplitGroupPayment = typeof splitGroupPaymentsTable.$inferSelect;
export type PaymentVoid = typeof paymentVoidsTable.$inferSelect;
