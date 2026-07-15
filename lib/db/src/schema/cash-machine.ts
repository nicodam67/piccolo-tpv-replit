import { boolean, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { employeesTable } from "./employees";

// ─── Cash Machine Config ──────────────────────────────────────────────────────
// One row per physical device. Currently only one device is expected per installation.
export const cashMachineConfigTable = pgTable("cash_machine_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  manufacturer: text("manufacturer").notNull().default("simulator"),
  model: text("model").notNull().default("Simulator v1"),
  host: text("host").notNull().default("localhost"),
  port: integer("port").notNull().default(8080),
  connectionType: text("connection_type").notNull().default("tcp"), // tcp | http | serial
  deviceId: text("device_id").notNull().default("device-1"),
  // Credential reference key (value lives in env/secrets, never stored here)
  credentialKey: text("credential_key"),
  timeoutMs: integer("timeout_ms").notNull().default(30000),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Cash Machine Transactions ────────────────────────────────────────────────
export const cashMachineTransactionsTable = pgTable("cash_machine_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").references(() => ordersTable.id),
  splitRef: text("split_ref"),
  transactionType: text("transaction_type").notNull(), // payment | refund | cancel
  amountRequested: numeric("amount_requested", { precision: 10, scale: 2 }).notNull(),
  amountReceived: numeric("amount_received", { precision: 10, scale: 2 }).notNull().default("0"),
  changeDispensed: numeric("change_dispensed", { precision: 10, scale: 2 }).notNull().default("0"),
  // Status values: pending | iniciando | esperando_efectivo | efectivo_parcial |
  //   devolviendo_cambio | completada | cancelada | tiempo_agotado | error | intervencion_manual
  status: text("status").notNull().default("pending"),
  deviceTransactionId: text("device_transaction_id"),
  deviceError: text("device_error"),
  employeeId: uuid("employee_id").references(() => employeesTable.id),
  terminalName: text("terminal_name").notNull().default("Caja principal"),
  deviceId: text("device_id").notNull().default("device-1"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CashMachineConfig = typeof cashMachineConfigTable.$inferSelect;
export type CashMachineTransaction = typeof cashMachineTransactionsTable.$inferSelect;
