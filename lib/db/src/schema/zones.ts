import { pgTable, text, boolean, integer, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roomZonesTable = pgTable("room_zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull().default("dining"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  color: text("color"),
  icon: text("icon"),
  activeLayout: text("active_layout").notNull().default("normal"),
});

export const insertRoomZoneSchema = createInsertSchema(roomZonesTable).omit({ id: true });
export type InsertRoomZone = z.infer<typeof insertRoomZoneSchema>;
export type RoomZone = typeof roomZonesTable.$inferSelect;
