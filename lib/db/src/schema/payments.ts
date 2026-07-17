import { boolean, jsonb, numeric, pgTable, text, timestamp, uuid, integer, bigserial, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  // Multi-terminal support
  terminalName: text("terminal_name").notNull().default("Caja principal"),
  blindClose: boolean("blind_close").notNull().default(false),
  notes: text("notes"),
  discrepancyReason: text("discrepancy_reason"),
  closingNotes: text("closing_notes"),
  /** Bill/coin denomination breakdown used during the arqueo: { "50": 2, "20": 3, ... } */
  denominationBreakdown: jsonb("denomination_breakdown"),
  /** True for simulation/demo data; safe to purge without touching real records */
  isDemo: boolean("is_demo").notNull().default(false),
});

export const paymentsTable = pgTable(
  "payments",
  {
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
    /** Idempotency key for cash-machine payments (cash_machine_transaction.id).
     *  NULL for all other payment methods — uniqueness is enforced only on non-null
     *  values via the partial index below, preventing cross-method collisions. */
    reference: text("reference"),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** True for simulation/demo data; safe to purge without touching real records */
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (table) => ({
    /** Partial unique index: guarantees exactly-once payment recording for
     *  cash-machine transactions while leaving NULL references unrestricted. */
    referenceUniqueIdx: uniqueIndex("payments_reference_unique")
      .on(table.reference)
      .where(sql`${table.reference} IS NOT NULL`),
  }),
);

export const ticketsTable = pgTable("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => ordersTable.id),
  ticketNumber: bigserial("ticket_number", { mode: "number" }),
  // Fiscal fields — set by backend at generation time, never editable after issuance
  serie: text("serie").notNull().default("T"),
  nifEmisor: text("nif_emisor").notNull().default(""),
  razonSocialEmisor: text("razon_social_emisor").notNull().default(""),
  direccionEmisor: text("direccion_emisor").notNull().default(""),
  formaPago: text("forma_pago").notNull().default(""),
  // VeriFactu status
  verifactuStatus: text("verifactu_status").notNull().default("pending"),
  // pending | generated | sent | accepted | rejected | retry | rectified
  verifactuResponse: text("verifactu_response"), // JSON string
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxTotal: numeric("tax_total", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  /** JSON array: [{rate:number, base:string, cuota:string}] — one entry per VAT rate */
  taxBreakdown: jsonb("tax_breakdown"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  /** The cash session that was open when this ticket was issued (null if no session was open). */
  cashSessionId: uuid("cash_session_id").references(() => cashSessionsTable.id),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id),
  /** True for simulation/demo data; safe to purge without touching real records */
  isDemo: boolean("is_demo").notNull().default(false),
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
