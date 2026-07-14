import { boolean, numeric, pgTable, text, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { productsTable, productFormatsTable } from "./categories";

export const orderItemsTable = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => productsTable.id),
  formatId: uuid("format_id").references(() => productFormatsTable.id),
  formatName: text("format_name"),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("draft"),
  notes: text("notes").notNull().default(""),
  allergyNote: text("allergy_note").notNull().default(""),
  hasAllergy: boolean("has_allergy").notNull().default(false),
  isInvitation: boolean("is_invitation").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kitchenTasksTable = pgTable("kitchen_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  orderItemId: uuid("order_item_id")
    .notNull()
    .references(() => orderItemsTable.id, { onDelete: "cascade" }),
  prepZone: text("prep_zone").notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  status: text("status").notNull().default("new"),
  allergyNote: text("allergy_note").notNull().default(""),
  hasAllergy: boolean("has_allergy").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  collectedAt: timestamp("collected_at", { withTimezone: true }),
  servedAt: timestamp("served_at", { withTimezone: true }),
});

export type OrderItem = typeof orderItemsTable.$inferSelect;
export type KitchenTask = typeof kitchenTasksTable.$inferSelect;
