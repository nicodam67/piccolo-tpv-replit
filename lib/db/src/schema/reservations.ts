import {
  pgTable, text, timestamp, uuid, integer, date, boolean, jsonb, numeric,
} from "drizzle-orm/pg-core";
import { restaurantTablesTable } from "./tables";
import { employeesTable } from "./employees";
import { crmClientsTable } from "./crm";

// ── service_shifts ─────────────────────────────────────────────────────────────
export const serviceShiftsTable = pgTable("service_shifts", {
  id:               uuid("id").primaryKey().defaultRandom(),
  nombre:           text("nombre").notNull(),
  tipo:             text("tipo").notNull().default("comida"),
  horaInicio:       text("hora_inicio").notNull(),
  horaFin:          text("hora_fin").notNull(),
  intervaloMinutos: integer("intervalo_minutos").notNull().default(15),
  capacidadMax:     integer("capacidad_max").notNull().default(50),
  maxReservas:      integer("max_reservas").notNull().default(20),
  maxComensales:    integer("max_comensales").notNull().default(50),
  duracionDefault:  integer("duracion_default").notNull().default(90),
  diasActivos:      jsonb("dias_activos").notNull().default([0,1,2,3,4,5,6]),
  activo:           boolean("activo").notNull().default(true),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ServiceShift = typeof serviceShiftsTable.$inferSelect;

// ── reservations ───────────────────────────────────────────────────────────────
export const reservationsTable = pgTable("reservations", {
  id:           uuid("id").primaryKey().defaultRandom(),
  /** YYYY-MM-DD */
  fecha:        date("fecha").notNull(),
  /** HH:MM (24h) */
  hora:         text("hora").notNull(),
  nombre:       text("nombre").notNull(),
  telefono:     text("telefono").notNull().default(""),
  email:        text("email").notNull().default(""),
  personas:     integer("personas").notNull().default(2),
  /** Link to CRM client (optional) */
  clientId:     uuid("client_id").references(() => crmClientsTable.id, { onDelete: "set null" }),
  /** Link to service shift (optional) */
  shiftId:      uuid("shift_id").references(() => serviceShiftsTable.id, { onDelete: "set null" }),
  /** Zone name or id, free text */
  zonaPreferida: text("zona_preferida"),
  mesaId:       uuid("mesa_id").references(() => restaurantTablesTable.id, { onDelete: "set null" }),
  duracionMinutos: integer("duracion_minutos").notNull().default(90),
  idioma:       text("idioma").notNull().default("es"),
  alergias:     text("alergias").notNull().default(""),
  trona:        boolean("trona").notNull().default(false),
  accesibilidad: boolean("accesibilidad").notNull().default(false),
  mascota:      boolean("mascota").notNull().default(false),
  /** birthday | anniversary | business | communion | group | private */
  ocasion:      text("ocasion"),
  /** phone | web | email | walkin | google | social */
  canal:        text("canal").notNull().default("phone"),
  recordatorioEnviado:   boolean("recordatorio_enviado").notNull().default(false),
  confirmacionRequerida: boolean("confirmacion_requerida").notNull().default(false),
  notes:        text("notes").notNull().default(""),
  notasInternas: text("notas_internas").notNull().default(""),
  /**
   * Full status flow:
   * pendiente → confirmada → recordatorio_enviado → cliente_avisado → cliente_llegado
   *          → sentada → finalizada
   *          → cancelada_cliente | cancelada_restaurante | no_presentado | en_espera
   */
  status:       text("status").notNull().default("pendiente"),
  createdBy:    uuid("created_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  /** True for simulation/demo data; safe to purge without touching real records */
  isDemo:       boolean("is_demo").notNull().default(false),
});
export type Reservation = typeof reservationsTable.$inferSelect;

// ── reservation_status_history ─────────────────────────────────────────────────
export const reservationStatusHistoryTable = pgTable("reservation_status_history", {
  id:            uuid("id").primaryKey().defaultRandom(),
  reservationId: uuid("reservation_id").notNull().references(() => reservationsTable.id, { onDelete: "cascade" }),
  statusFrom:    text("status_from").notNull(),
  statusTo:      text("status_to").notNull(),
  changedBy:     uuid("changed_by").references(() => employeesTable.id, { onDelete: "set null" }),
  changedAt:     timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  notes:         text("notes").notNull().default(""),
});
export type ReservationStatusHistory = typeof reservationStatusHistoryTable.$inferSelect;

// ── waiting_list ───────────────────────────────────────────────────────────────
export const waitingListTable = pgTable("waiting_list", {
  id:              uuid("id").primaryKey().defaultRandom(),
  nombre:          text("nombre").notNull(),
  telefono:        text("telefono").notNull().default(""),
  personas:        integer("personas").notNull().default(2),
  horaLlegada:     timestamp("hora_llegada", { withTimezone: true }).notNull().defaultNow(),
  zonaPreferida:   text("zona_preferida"),
  tiempoEstimado:  integer("tiempo_estimado"),
  /** esperando | avisado | sentado | cancelado | no_localizado */
  status:          text("status").notNull().default("esperando"),
  observaciones:   text("observaciones").notNull().default(""),
  createdBy:       uuid("created_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type WaitingListEntry = typeof waitingListTable.$inferSelect;

// ── reservation_deposits ───────────────────────────────────────────────────────
export const reservationDepositsTable = pgTable("reservation_deposits", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  reservationId:      uuid("reservation_id").notNull().references(() => reservationsTable.id, { onDelete: "cascade" }),
  importeSolicitado:  numeric("importe_solicitado", { precision: 10, scale: 2 }).notNull().default("0"),
  importePagado:      numeric("importe_pagado", { precision: 10, scale: 2 }).notNull().default("0"),
  formaPago:          text("forma_pago"),
  /** pendiente | pagado | devuelto | parcial */
  status:             text("status").notNull().default("pendiente"),
  devolucionMotivo:   text("devolucion_motivo"),
  devolucionFecha:    timestamp("devolucion_fecha", { withTimezone: true }),
  createdBy:          uuid("created_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ReservationDeposit = typeof reservationDepositsTable.$inferSelect;
