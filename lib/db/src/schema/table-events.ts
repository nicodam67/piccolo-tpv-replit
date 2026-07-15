import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { restaurantTablesTable } from "./tables";
import { ordersTable } from "./orders";
import { employeesTable } from "./employees";

export const tableEventsTable = pgTable("table_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tableId: uuid("table_id").notNull().references(() => restaurantTablesTable.id),
  orderId: uuid("order_id").references(() => ordersTable.id),
  employeeId: uuid("employee_id").references(() => employeesTable.id),
  employeeName: text("employee_name").notNull().default(""),
  action: text("action").notNull(),
  details: text("details").notNull().default(""),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TableEvent = typeof tableEventsTable.$inferSelect;
