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
  /** Status: available | busy | off */
  status: text("status").notNull().default("available"),
  active: boolean("active").notNull().default(true),
  /** Per-courier auth token for the driver view — treated as a bearer credential */
  token: text("token").notNull().$defaultFn(() => crypto.randomUUID()),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Courier = typeof couriersTable.$inferSelect;

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
