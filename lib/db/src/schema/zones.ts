import { pgTable, text, boolean, integer, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roomZonesTable = pgTable("room_zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull().default("dining"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const insertRoomZoneSchema = createInsertSchema(roomZonesTable).omit({ id: true });
export type InsertRoomZone = z.infer<typeof insertRoomZoneSchema>;
export type RoomZone = typeof roomZonesTable.$inferSelect;
