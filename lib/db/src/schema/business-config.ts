import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const businessConfigTable = pgTable("business_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombreComercial: text("nombre_comercial").notNull().default(""),
  razonSocial: text("razon_social").notNull().default(""),
  nif: text("nif").notNull().default(""),
  direccionFiscal: text("direccion_fiscal").notNull().default(""),
  codigoPostal: text("codigo_postal").notNull().default(""),
  poblacion: text("poblacion").notNull().default(""),
  provincia: text("provincia").notNull().default(""),
  pais: text("pais").notNull().default("España"),
  telefono: text("telefono").notNull().default(""),
  email: text("email").notNull().default(""),
  web: text("web").notNull().default(""),
  logoUrl: text("logo_url").notNull().default(""),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BusinessConfig = typeof businessConfigTable.$inferSelect;
