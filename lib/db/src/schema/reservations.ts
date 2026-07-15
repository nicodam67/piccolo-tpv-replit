import { pgTable, text, timestamp, uuid, integer, date } from "drizzle-orm/pg-core";
import { restaurantTablesTable } from "./tables";
import { employeesTable } from "./employees";

export const reservationsTable = pgTable("reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** YYYY-MM-DD */
  fecha: date("fecha").notNull(),
  /** HH:MM (24-hour) stored as text */
  hora: text("hora").notNull(),
  nombre: text("nombre").notNull(),
  telefono: text("telefono").notNull().default(""),
  personas: integer("personas").notNull().default(2),
  /** Zone name or id, free text, optional */
  zonaPreferida: text("zona_preferida"),
  mesaId: uuid("mesa_id").references(() => restaurantTablesTable.id, { onDelete: "set null" }),
  notes: text("notes").notNull().default(""),
  /**
   * 7-value flow:
   * pendiente → confirmada → cliente_llegado → sentada → finalizada
   *                                         ↘ cancelada | no_presentado
   */
  status: text("status").notNull().default("pendiente"),
  createdBy: uuid("created_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Reservation = typeof reservationsTable.$inferSelect;
