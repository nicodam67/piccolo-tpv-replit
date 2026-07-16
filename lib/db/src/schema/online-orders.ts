import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ── Delivery Addresses ────────────────────────────────────────────────────────
export const deliveryAddressesTable = pgTable("delivery_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id"),
  name: text("name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  street: text("street").notNull().default(""),
  number: text("number").notNull().default(""),
  floor: text("floor").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  city: text("city").notNull().default(""),
  notes: text("notes").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type DeliveryAddress = typeof deliveryAddressesTable.$inferSelect;

// ── Online Orders Config ──────────────────────────────────────────────────────
export const onlineOrdersConfigTable = pgTable("online_orders_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  takeawayEnabled: boolean("takeaway_enabled").notNull().default(false),
  deliveryEnabled: boolean("delivery_enabled").notNull().default(false),
  /**
   * Opening hours for online orders per weekday.
   * { mon: { open: "10:00", close: "14:00", open2?: "19:00", close2?: "22:00" }, ... }
   * Omitted key means closed that day.
   */
  schedule: jsonb("schedule").$type<Record<string, { open: string; close: string; open2?: string; close2?: string }>>(),
  prepTimeMinutes: integer("prep_time_minutes").notNull().default(30),
  minOrder: numeric("min_order", { precision: 10, scale: 2 }).notNull().default("0"),
  minOrderDelivery: numeric("min_order_delivery", { precision: 10, scale: 2 }).notNull().default("15"),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).notNull().default("3"),
  freeDeliveryFrom: numeric("free_delivery_from", { precision: 10, scale: 2 }),
  maxAdvanceHours: integer("max_advance_hours").notNull().default(48),
  maxOrdersPerSlot: integer("max_orders_per_slot").notNull().default(10),
  paused: boolean("paused").notNull().default(false),
  pauseReason: text("pause_reason").notNull().default(""),
  // v2 additions (migration 0007_online_v2)
  tipEnabled: boolean("tip_enabled").notNull().default(false),
  tipPercentages: jsonb("tip_percentages").$type<number[]>().notNull().default([5, 10, 15, 20]),
  tableOrderingEnabled: boolean("table_ordering_enabled").notNull().default(false),
  stripePublishableKey: text("stripe_publishable_key").notNull().default(""),
  stripeSecretKey: text("stripe_secret_key").notNull().default(""),
  stripeWebhookSecret: text("stripe_webhook_secret").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type OnlineOrdersConfig = typeof onlineOrdersConfigTable.$inferSelect;

// ── Delivery Zones ─────────────────────────────────────────────────────────────
export const deliveryZonesTable = pgTable("delivery_zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Type of zone: postal_code | city | radius */
  type: text("type").notNull().default("postal_code"),
  /** Zone data: { postalCodes: string[] } | { cities: string[] } | { lat, lng, radiusKm } */
  value: jsonb("value").notNull().default({}),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  minOrder: numeric("min_order", { precision: 10, scale: 2 }).notNull().default("0"),
  estimatedMinutes: integer("estimated_minutes").notNull().default(45),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type DeliveryZone = typeof deliveryZonesTable.$inferSelect;

// ── Couriers ──────────────────────────────────────────────────────────────────
export const couriersTable = pgTable("couriers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  /** Status: available | busy | off | pause */
  status: text("status").notNull().default("available"),
  active: boolean("active").notNull().default(true),
  /** Per-courier auth token for the driver view — treated as a bearer credential */
  token: text("token").notNull().$defaultFn(() => crypto.randomUUID()),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // ── Extended profile (migration 0006) ──────────────────────────────────────
  /** moto | car | bike | walking */
  vehicleType: text("vehicle_type").notNull().default("moto"),
  plate: text("plate").notNull().default(""),
  zonaHabitual: text("zona_habitual").notNull().default(""),
  turno: text("turno").notNull().default(""),
  earnedCashPending: numeric("earned_cash_pending", { precision: 10, scale: 2 }).notNull().default("0"),
  earnedCardPending: numeric("earned_card_pending", { precision: 10, scale: 2 }).notNull().default("0"),
  totalDeliveries: integer("total_deliveries").notNull().default(0),
  avgDeliveryMinutes: integer("avg_delivery_minutes").notNull().default(0),
});
export type Courier = typeof couriersTable.$inferSelect;

// ── Delivery Order Status History ─────────────────────────────────────────────
export const deliveryOrderStatusHistoryTable = pgTable("delivery_order_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedBy: uuid("changed_by"),
  changedByName: text("changed_by_name").notNull().default(""),
  device: text("device").notNull().default(""),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type DeliveryOrderStatusHistory = typeof deliveryOrderStatusHistoryTable.$inferSelect;

// ── Courier Settlements ────────────────────────────────────────────────────────
export const courierSettlementsTable = pgTable("courier_settlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  courierId: uuid("courier_id").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  ordersCount: integer("orders_count").notNull().default(0),
  totalCash: numeric("total_cash", { precision: 10, scale: 2 }).notNull().default("0"),
  totalCard: numeric("total_card", { precision: 10, scale: 2 }).notNull().default("0"),
  totalOnline: numeric("total_online", { precision: 10, scale: 2 }).notNull().default("0"),
  tips: numeric("tips", { precision: 10, scale: 2 }).notNull().default("0"),
  expenses: numeric("expenses", { precision: 10, scale: 2 }).notNull().default("0"),
  differences: numeric("differences", { precision: 10, scale: 2 }).notNull().default("0"),
  closedBy: uuid("closed_by"),
  closedByName: text("closed_by_name").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CourierSettlement = typeof courierSettlementsTable.$inferSelect;

// ── Online Order Audit ────────────────────────────────────────────────────────
export const onlineOrderAuditTable = pgTable("online_order_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  event: text("event").notNull(),
  userId: uuid("user_id"),
  userName: text("user_name").notNull().default(""),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type OnlineOrderAudit = typeof onlineOrderAuditTable.$inferSelect;

// ── Notification Log ──────────────────────────────────────────────────────────
export const notificationLogTable = pgTable("notification_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id"),
  type: text("type").notNull(),
  recipient: text("recipient").notNull().default(""),
  payload: jsonb("payload"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  simulated: boolean("simulated").notNull().default(true),
});
export type NotificationLog = typeof notificationLogTable.$inferSelect;

// ── Table Sessions (v2) ───────────────────────────────────────────────────────
/** Created when a customer scans a QR code at a dine-in table. */
export const tableSessionsTable = pgTable("table_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Optional FK to tables — nullable to survive table deletions */
  tableId: uuid("table_id"),
  zoneId: uuid("zone_id"),
  tableLabel: text("table_label").notNull().default(""),
  zoneLabel: text("zone_label").notNull().default(""),
  /** Unguessable token embedded in the QR code URL */
  token: text("token").notNull(),
  /** open | closed | expired */
  status: text("status").notNull().default("open"),
  guestName: text("guest_name").notNull().default(""),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type TableSession = typeof tableSessionsTable.$inferSelect;

// ── Online Carts (v2) ─────────────────────────────────────────────────────────
/** Server-side cart so customers can resume their order after a page reload. */
export const onlineCartsTable = pgTable("online_carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Matches table_sessions.token or a guest cookie UUID */
  sessionToken: text("session_token").notNull(),
  deliveryType: text("delivery_type").notNull().default("takeaway"),
  items: jsonb("items").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type OnlineCart = typeof onlineCartsTable.$inferSelect;

// ── Payment Attempts (v2) ─────────────────────────────────────────────────────
/** Tracks every payment-gateway interaction (Stripe or simulator). */
export const paymentAttemptsTable = pgTable("payment_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id"),
  /** stripe | simulator */
  provider: text("provider").notNull().default("stripe"),
  /** Stripe PaymentIntent id or SIM-{timestamp} */
  externalId: text("external_id").notNull().default(""),
  /** pending | succeeded | failed | refunded */
  status: text("status").notNull().default("pending"),
  amountCents: integer("amount_cents").notNull().default(0),
  currency: text("currency").notNull().default("eur"),
  errorMessage: text("error_message").notNull().default(""),
  rawResponse: jsonb("raw_response"),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  refundRef: text("refund_ref").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type PaymentAttempt = typeof paymentAttemptsTable.$inferSelect;

// ── Product Availability Rules (v2) ──────────────────────────────────────────
/** Restrict product/category visibility on the public menu by time and day. */
export const productAvailabilityRulesTable = pgTable("product_availability_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id"),
  categoryId: uuid("category_id"),
  label: text("label").notNull().default(""),
  /** Array of day-of-week numbers: 0=Sun … 6=Sat */
  daysOfWeek: jsonb("days_of_week").notNull().default([0, 1, 2, 3, 4, 5, 6]),
  timeFrom: text("time_from").notNull().default("00:00"),
  timeTo: text("time_to").notNull().default("23:59"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ProductAvailabilityRule = typeof productAvailabilityRulesTable.$inferSelect;
