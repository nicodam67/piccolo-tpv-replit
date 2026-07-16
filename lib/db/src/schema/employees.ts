import { pgTable, text, boolean, timestamp, uuid, numeric, date, jsonb } from "drizzle-orm/pg-core";
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

  // HR module extensions (all nullable/default — safe for existing rows)
  lastName: text("last_name"),
  employeeNumber: text("employee_number"),
  email: text("email"),
  address: text("address"),
  hireDate: date("hire_date"),
  terminationDate: date("termination_date"),
  empStatus: text("emp_status").notNull().default("active"), // 'active'|'inactive'|'suspended'
  positionId: uuid("position_id"),             // FK to hr_positions (no constraint here to avoid circular)
  departmentId: uuid("department_id"),         // FK to hr_departments
  workCenterId: uuid("work_center_id"),        // FK to hr_work_centers
  monthlySalary: numeric("monthly_salary", { precision: 10, scale: 2 }),
  employerCostRate: numeric("employer_cost_rate", { precision: 5, scale: 4 }).notNull().default("1.35"),
  externalCode: text("external_code"),
  photoUrl: text("photo_url"),
  emergencyContact: jsonb("emergency_contact"),  // { name, phone, relation }
  empNotes: text("emp_notes"),
  isDemo: boolean("is_demo").notNull().default(false),
});

export const employeePinsTable = pgTable("employee_pins", {
  employeeId: uuid("employee_id").primaryKey().references(() => employeesTable.id, { onDelete: "cascade" }),
  pinHash: text("pin_hash").notNull(),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({ id: true, createdAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
