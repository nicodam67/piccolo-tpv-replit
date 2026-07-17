import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const KDS_ZONE_TYPES = ["cocina", "pizza", "ensalada", "barra", "pase", "sin_partida"] as const;
export type KdsZoneType = typeof KDS_ZONE_TYPES[number];

export const kdsStationsTable = pgTable("kds_stations", {
  id:          uuid("id").primaryKey().defaultRandom(),
  name:        text("name").notNull(),
  zoneType:    text("zone_type").notNull().default("cocina"),
  ip:          text("ip").notNull().default(""),
  displayUrl:  text("display_url"),
  notes:       text("notes"),
  lastPingAt:  timestamp("last_ping_at", { withTimezone: true }),
  active:      boolean("active").notNull().default(true),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const printTestResultsTable = pgTable("print_test_results", {
  id:        uuid("id").primaryKey().defaultRandom(),
  printerId: uuid("printer_id").notNull(),
  stepKey:   text("step_key").notNull(),
  stepLabel: text("step_label").notNull(),
  result:    text("result").notNull().default("pending"), // pending | pass | fail
  notes:     text("notes"),
  testedBy:  text("tested_by"),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type KdsStation = typeof kdsStationsTable.$inferSelect;
export type PrintTestResult = typeof printTestResultsTable.$inferSelect;
