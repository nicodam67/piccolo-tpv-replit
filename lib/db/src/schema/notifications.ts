import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";
import { ordersTable } from "./orders";

export const waiterNotificationsTable = pgTable("waiter_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").references(() => ordersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WaiterNotification = typeof waiterNotificationsTable.$inferSelect;
