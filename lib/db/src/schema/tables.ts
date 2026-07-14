import { pgTable, text, boolean, integer, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { roomZonesTable } from "./zones";

export const restaurantTablesTable = pgTable("restaurant_tables", {
  id: uuid("id").primaryKey().defaultRandom(),
  zoneId: uuid("zone_id").notNull().references(() => roomZonesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull().default(4),
  status: text("status").notNull().default("free"),
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  width: integer("width").notNull().default(80),
  height: integer("height").notNull().default(80),
  shape: text("shape").notNull().default("square"),
  mergeGroup: text("merge_group"),
  active: boolean("active").notNull().default(true),
});

export const insertRestaurantTableSchema = createInsertSchema(restaurantTablesTable).omit({ id: true });
export type InsertRestaurantTable = z.infer<typeof insertRestaurantTableSchema>;
export type RestaurantTable = typeof restaurantTablesTable.$inferSelect;
