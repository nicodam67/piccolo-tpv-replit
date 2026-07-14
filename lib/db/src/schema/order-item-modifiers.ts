import { numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { orderItemsTable } from "./order-items";
import { modifiersTable } from "./modifiers";

export const orderItemModifiersTable = pgTable("order_item_modifiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderItemId: uuid("order_item_id")
    .notNull()
    .references(() => orderItemsTable.id, { onDelete: "cascade" }),
  modifierId: uuid("modifier_id").references(() => modifiersTable.id),
  modifierName: text("modifier_name").notNull(),
  priceDelta: numeric("price_delta", { precision: 10, scale: 2 }).notNull().default("0"),
});

export type OrderItemModifier = typeof orderItemModifiersTable.$inferSelect;
