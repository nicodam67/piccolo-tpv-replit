import { pgTable, text, timestamp, uuid, integer, numeric, boolean } from "drizzle-orm/pg-core";
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
  clientId: uuid("client_id"),  // soft FK to crm_clients (no FK constraint to avoid circular)
  openedByTerminal: text("opened_by_terminal").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  // ── Online orders ───────────────────────────────────────────────────────────
  /** Channel: tpv | qr | web | phone | counter */
  channel: text("channel").notNull().default("tpv"),
  /** Delivery type: table | takeaway | delivery */
  deliveryType: text("delivery_type").notNull().default("table"),
  /** Human-readable order number for online orders, e.g. "ONL-20250716-0042" */
  orderNumber: text("order_number"),
  /** Time the customer requested (null = ASAP) */
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  /** Calculated estimated ready/delivery time */
  estimatedReadyAt: timestamp("estimated_ready_at", { withTimezone: true }),
  /** Customer phone for online orders */
  clientPhone: text("client_phone").notNull().default(""),
  /** FK to delivery_addresses (soft, no constraint to keep migrations simple) */
  deliveryAddressId: uuid("delivery_address_id"),
  /** FK to couriers */
  courierId: uuid("courier_id"),
  /** Reason provided when rejecting an online order */
  rejectionReason: text("rejection_reason"),
  /** Online payment reference (from simulator or future gateway) */
  onlinePaymentRef: text("online_payment_ref"),
  /** none | pending | paid | failed | refunded */
  onlinePaymentStatus: text("online_payment_status").notNull().default("none"),
  /** Employee who verified the packaging checklist */
  packagingCheckedBy: uuid("packaging_checked_by"),
  packagingCheckedAt: timestamp("packaging_checked_at", { withTimezone: true }),
  /** Delivery fee charged for this order */
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  /** Online v2 tip, persisted as part of the atomic order */
  tipAmount: numeric("tip_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  /** Durable key used to make public order creation idempotent */
  idempotencyKey: text("idempotency_key"),
  /** Active QR table session associated with the order */
  tableSessionId: uuid("table_session_id"),
  /** True for simulation/demo data; safe to purge without touching real records */
  isDemo: boolean("is_demo").notNull().default(false),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
