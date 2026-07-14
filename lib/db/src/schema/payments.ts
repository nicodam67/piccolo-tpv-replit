import { boolean, numeric, pgTable, text, timestamp, uuid, integer, bigserial } from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";
import { ordersTable } from "./orders";

export const paymentMethodsTable = pgTable("payment_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const cashSessionsTable = pgTable("cash_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  openingFloat: numeric("opening_float", { precision: 10, scale: 2 }).notNull().default("0"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  expectedCash: numeric("expected_cash", { precision: 10, scale: 2 }),
  countedCash: numeric("counted_cash", { precision: 10, scale: 2 }),
  difference: numeric("difference", { precision: 10, scale: 2 }),
  status: text("status").notNull().default("open"),
});

export const paymentsTable = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => ordersTable.id),
  cashSessionId: uuid("cash_session_id").references(() => cashSessionsTable.id),
  paymentMethodId: uuid("payment_method_id")
    .notNull()
    .references(() => paymentMethodsTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("completed"),
  reference: text("reference"),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ticketsTable = pgTable("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => ordersTable.id),
  ticketNumber: bigserial("ticket_number", { mode: "number" }),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxTotal: numeric("tax_total", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id),
});

export const cashMovementsTable = pgTable("cash_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  cashSessionId: uuid("cash_session_id")
    .notNull()
    .references(() => cashSessionsTable.id, { onDelete: "cascade" }),
  movementType: text("movement_type").notNull(), // 'in' | 'out'
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PaymentMethod = typeof paymentMethodsTable.$inferSelect;
export type CashSession = typeof cashSessionsTable.$inferSelect;
export type Payment = typeof paymentsTable.$inferSelect;
export type Ticket = typeof ticketsTable.$inferSelect;
export type CashMovement = typeof cashMovementsTable.$inferSelect;
