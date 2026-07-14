import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { employeesTable } from "./employees";

export const auditLogTable = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").references(() => ordersTable.id),
  employeeId: uuid("employee_id").references(() => employeesTable.id),
  employeeName: text("employee_name").notNull().default(""),
  action: text("action").notNull(),   // e.g. "open_table", "add_item", "send_kds", "bill_request", "cancel_item"
  details: text("details").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLogTable.$inferSelect;
