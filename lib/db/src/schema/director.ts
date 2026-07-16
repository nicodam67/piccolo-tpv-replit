import { pgTable, uuid, text, numeric, boolean, date, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

// ─── Objetivos configurables ──────────────────────────────────────────────────
export const directorGoalsTable = pgTable("director_goals", {
  id:           uuid("id").primaryKey().defaultRandom(),
  type:         text("type").notNull(),
  label:        text("label"),
  targetValue:  numeric("target_value", { precision: 14, scale: 4 }).notNull(),
  period:       text("period").notNull().default("monthly"),
  periodStart:  date("period_start"),
  periodEnd:    date("period_end"),
  zoneId:       uuid("zone_id"),
  channel:      text("channel"),
  notes:        text("notes"),
  active:       boolean("active").notNull().default(true),
  createdBy:    uuid("created_by").notNull().references(() => employeesTable.id, { onDelete: "restrict" }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Centro de alertas ────────────────────────────────────────────────────────
export const directorAlertsTable = pgTable("director_alerts", {
  id:           uuid("id").primaryKey().defaultRandom(),
  priority:     text("priority").notNull().default("medium"),
  source:       text("source").notNull(),
  title:        text("title").notNull(),
  detail:       text("detail"),
  status:       text("status").notNull().default("open"),
  assignedTo:   uuid("assigned_to").references(() => employeesTable.id, { onDelete: "set null" }),
  assignedAt:   timestamp("assigned_at", { withTimezone: true }),
  resolvedBy:   uuid("resolved_by").references(() => employeesTable.id, { onDelete: "set null" }),
  resolvedAt:   timestamp("resolved_at", { withTimezone: true }),
  actionTaken:  text("action_taken"),
  snoozeUntil:  timestamp("snooze_until", { withTimezone: true }),
  comments:     jsonb("comments"),
  originModule: text("origin_module"),
  originRef:    text("origin_ref"),
  isDemo:       boolean("is_demo").notNull().default(false),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("director_alerts_status_idx").on(t.status),
  index("director_alerts_priority_idx").on(t.priority),
  index("director_alerts_created_idx").on(t.createdAt),
]);

// ─── Costes overhead configurables ───────────────────────────────────────────
export const directorCostsTable = pgTable("director_costs", {
  id:            uuid("id").primaryKey().defaultRandom(),
  category:      text("category").notNull(),
  name:          text("name").notNull(),
  amount:        numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency:      text("currency").notNull().default("EUR"),
  periodicity:   text("periodicity").notNull().default("monthly"),
  effectiveDate: date("effective_date").notNull(),
  endDate:       date("end_date"),
  provider:      text("provider"),
  costCenter:    text("cost_center"),
  documentRef:   text("document_ref"),
  notes:         text("notes"),
  paidStatus:    text("paid_status").notNull().default("pending"),
  paymentDate:   date("payment_date"),
  isDemo:        boolean("is_demo").notNull().default(false),
  createdBy:     uuid("created_by").notNull().references(() => employeesTable.id, { onDelete: "restrict" }),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Snapshots diarios pre-agregados ─────────────────────────────────────────
export const directorDailySnapshotsTable = pgTable("director_daily_snapshots", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  snapshotDate:       date("snapshot_date").notNull().unique(),
  salesGross:         numeric("sales_gross", { precision: 14, scale: 2 }).notNull().default("0"),
  salesNet:           numeric("sales_net", { precision: 14, scale: 2 }).notNull().default("0"),
  taxTotal:           numeric("tax_total", { precision: 14, scale: 2 }).notNull().default("0"),
  discountTotal:      numeric("discount_total", { precision: 14, scale: 2 }).notNull().default("0"),
  invitationTotal:    numeric("invitation_total", { precision: 14, scale: 2 }).notNull().default("0"),
  ticketCount:        integer("ticket_count").notNull().default(0),
  guestCount:         integer("guest_count").notNull().default(0),
  avgTicket:          numeric("avg_ticket", { precision: 10, scale: 2 }).notNull().default("0"),
  avgPerGuest:        numeric("avg_per_guest", { precision: 10, scale: 2 }).notNull().default("0"),
  salesDineIn:        numeric("sales_dine_in", { precision: 14, scale: 2 }).notNull().default("0"),
  salesDelivery:      numeric("sales_delivery", { precision: 14, scale: 2 }).notNull().default("0"),
  salesTakeaway:      numeric("sales_takeaway", { precision: 14, scale: 2 }).notNull().default("0"),
  salesOnline:        numeric("sales_online", { precision: 14, scale: 2 }).notNull().default("0"),
  ordersDelivery:     integer("orders_delivery").notNull().default(0),
  ordersTakeaway:     integer("orders_takeaway").notNull().default(0),
  laborCostEst:       numeric("labor_cost_est", { precision: 14, scale: 2 }).notNull().default("0"),
  cogsEst:            numeric("cogs_est", { precision: 14, scale: 2 }).notNull().default("0"),
  reservationsTotal:  integer("reservations_total").notNull().default(0),
  reservationsKept:   integer("reservations_kept").notNull().default(0),
  avgPrepMinutes:     numeric("avg_prep_minutes", { precision: 6, scale: 2 }),
  generatedAt:        timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  isPartial:          boolean("is_partial").notNull().default(false),
});

// ─── Plantillas de informes personalizados ────────────────────────────────────
export const directorCustomReportsTable = pgTable("director_custom_reports", {
  id:          uuid("id").primaryKey().defaultRandom(),
  name:        text("name").notNull(),
  description: text("description"),
  config:      jsonb("config").notNull(),
  isShared:    boolean("is_shared").notNull().default(false),
  createdBy:   uuid("created_by").notNull().references(() => employeesTable.id, { onDelete: "restrict" }),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
