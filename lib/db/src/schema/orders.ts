import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { restaurantTablesTable } from "./tables";
import { employeesTable } from "./employees";

export const ordersTable = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tableId: uuid("table_id").references(() => restaurantTablesTable.id),
  employeeId: uuid("employee_id").references(() => employeesTable.id),
  orderType: text("order_type").notNull().default("table"),
  status: text("status").notNull().default("open"),
  guestCount: integer("guest_count").notNull().default(1),
  notes: text("notes").notNull().default(""),
  clientName: text("client_name").notNull().default(""),
  openedByTerminal: text("opened_by_terminal").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
