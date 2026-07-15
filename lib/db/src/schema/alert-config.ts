import { pgTable, integer, uuid, timestamp } from "drizzle-orm/pg-core";

export const alertConfigTable = pgTable("alert_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  reservaProximaMin: integer("reserva_proxima_min").notNull().default(30),
  sinComandaMin: integer("sin_comanda_min").notNull().default(15),
  prefacturaPendienteMin: integer("prefactura_pendiente_min").notNull().default(10),
  mesaSuciaMin: integer("mesa_sucia_min").notNull().default(5),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AlertConfig = typeof alertConfigTable.$inferSelect;
