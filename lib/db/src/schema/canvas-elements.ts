import { pgTable, text, boolean, integer, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { roomZonesTable } from "./zones";

export const canvasElementsTable = pgTable("canvas_elements", {
  id: uuid("id").primaryKey().defaultRandom(),
  zoneId: uuid("zone_id").notNull().references(() => roomZonesTable.id, { onDelete: "cascade" }),
  layout: text("layout").notNull().default("normal"),
  type: text("type").notNull(), // wall | door | bar | column
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  width: integer("width").notNull().default(120),
  height: integer("height").notNull().default(20),
  rotation: integer("rotation").notNull().default(0),
  color: text("color"),
  label: text("label"),
  active: boolean("active").notNull().default(true),
});

export const insertCanvasElementSchema = createInsertSchema(canvasElementsTable).omit({ id: true });
export type InsertCanvasElement = z.infer<typeof insertCanvasElementSchema>;
export type CanvasElement = typeof canvasElementsTable.$inferSelect;
