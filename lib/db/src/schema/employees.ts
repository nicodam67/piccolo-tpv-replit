import { pgTable, text, boolean, timestamp, uuid, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const employeesTable = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  role: text("role").notNull(), // 'admin' | 'manager' | 'encargado' | 'employee'
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // Fichaje module extensions (all nullable — safe for existing rows)
  anvizId: text("anviz_id").unique(),          // ID en lector biométrico Anviz
  nfcId: text("nfc_id").unique(),              // Tag NFC para fichaje por tarjeta
  contractType: text("contract_type"),         // 'full_time' | 'part_time' | 'hourly'
  weeklyHours: numeric("weekly_hours"),        // horas contratadas por semana
  phone: text("phone"),
  dni: text("dni"),
  hourlyRate: numeric("hourly_rate"),
  legacyFichajeId: text("legacy_fichaje_id"), // ID entero del sistema de fichaje antiguo (para migración)
});

export const employeePinsTable = pgTable("employee_pins", {
  employeeId: uuid("employee_id").primaryKey().references(() => employeesTable.id, { onDelete: "cascade" }),
  pinHash: text("pin_hash").notNull(),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({ id: true, createdAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
