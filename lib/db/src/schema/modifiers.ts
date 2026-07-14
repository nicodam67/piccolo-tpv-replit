import { boolean, numeric, pgTable, text, uuid, integer } from "drizzle-orm/pg-core";
import { productsTable } from "./categories";

export const modifierGroupsTable = pgTable("modifier_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  required: boolean("required").notNull().default(false),
  maxSelect: integer("max_select").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const modifiersTable = pgTable("modifiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => modifierGroupsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceDelta: numeric("price_delta", { precision: 10, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const productModifierGroupsTable = pgTable("product_modifier_groups", {
  productId: uuid("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  modifierGroupId: uuid("modifier_group_id")
    .notNull()
    .references(() => modifierGroupsTable.id, { onDelete: "cascade" }),
});

export type ModifierGroup = typeof modifierGroupsTable.$inferSelect;
export type Modifier = typeof modifiersTable.$inferSelect;
