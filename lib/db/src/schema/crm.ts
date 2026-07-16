import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  date,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

// ---------------------------------------------------------------------------
// CRM Clients — customer master record
// ---------------------------------------------------------------------------
export const crmClientsTable = pgTable("crm_clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  apellidos: text("apellidos").notNull().default(""),
  telefono: text("telefono").notNull().default(""),
  email: text("email").notNull().default(""),
  fechaNacimiento: date("fecha_nacimiento"),
  direccion: text("direccion").notNull().default(""),
  observaciones: text("observaciones").notNull().default(""),
  activo: boolean("activo").notNull().default(true),
  rgpdConsentimiento: boolean("rgpd_consentimiento").notNull().default(false),
  rgpdFecha: timestamp("rgpd_fecha", { withTimezone: true }),
  // Cached aggregates — updated on each sale
  totalGasto: numeric("total_gasto", { precision: 12, scale: 2 }).notNull().default("0"),
  totalVisitas: integer("total_visitas").notNull().default(0),
  ultimaVisita: timestamp("ultima_visita", { withTimezone: true }),
  puntosSaldo: integer("puntos_saldo").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CrmClient = typeof crmClientsTable.$inferSelect;

// ---------------------------------------------------------------------------
// CRM Loyalty Config — one row per installation
// ---------------------------------------------------------------------------
export const crmLoyaltyConfigTable = pgTable("crm_loyalty_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  activo: boolean("activo").notNull().default(false),
  puntosPorEuro: numeric("puntos_por_euro", { precision: 8, scale: 2 }).notNull().default("1"),
  valorPunto: numeric("valor_punto", { precision: 8, scale: 4 }).notNull().default("0.01"),
  caducidadDias: integer("caducidad_dias").notNull().default(0),   // 0 = never
  canjeMinimo: integer("canje_minimo").notNull().default(100),     // min pts to redeem
  bonificacionesCategorias: jsonb("bonificaciones_categorias").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CrmLoyaltyConfig = typeof crmLoyaltyConfigTable.$inferSelect;

// ---------------------------------------------------------------------------
// CRM Loyalty Points — movements ledger (append-only)
// ---------------------------------------------------------------------------
export const crmLoyaltyPointsTable = pgTable("crm_loyalty_points", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => crmClientsTable.id),
  // "emision" | "canje" | "expiracion" | "ajuste_positivo" | "ajuste_negativo"
  tipo: text("tipo").notNull(),
  puntos: integer("puntos").notNull(),
  saldoAnterior: integer("saldo_anterior").notNull().default(0),
  saldoPosterior: integer("saldo_posterior").notNull().default(0),
  descripcion: text("descripcion").notNull().default(""),
  orderId: uuid("order_id"),  // soft FK — no constraint to avoid circular deps
  empleadoId: uuid("empleado_id").references(() => employeesTable.id),
  empleadoNombre: text("empleado_nombre").notNull().default(""),
  expiraEn: timestamp("expira_en", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CrmLoyaltyPoint = typeof crmLoyaltyPointsTable.$inferSelect;

// ---------------------------------------------------------------------------
// CRM Gift Cards
// ---------------------------------------------------------------------------
export const crmGiftCardsTable = pgTable("crm_gift_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique(),
  saldoInicial: numeric("saldo_inicial", { precision: 10, scale: 2 }).notNull().default("0"),
  saldoActual: numeric("saldo_actual", { precision: 10, scale: 2 }).notNull().default("0"),
  clientId: uuid("client_id").references(() => crmClientsTable.id),
  // "activa" | "bloqueada" | "consumida" | "caducada"
  estado: text("estado").notNull().default("activa"),
  fechaCaducidad: timestamp("fecha_caducidad", { withTimezone: true }),
  notas: text("notas").notNull().default(""),
  empleadoId: uuid("empleado_id").references(() => employeesTable.id),
  empleadoNombre: text("empleado_nombre").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CrmGiftCard = typeof crmGiftCardsTable.$inferSelect;

// ---------------------------------------------------------------------------
// CRM Gift Card Transactions — movements ledger
// ---------------------------------------------------------------------------
export const crmGiftCardTransactionsTable = pgTable("crm_gift_card_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  giftCardId: uuid("gift_card_id").notNull().references(() => crmGiftCardsTable.id),
  orderId: uuid("order_id"),
  // "emision" | "recarga" | "pago" | "bloqueo" | "desbloqueo" | "caducidad"
  tipo: text("tipo").notNull(),
  importe: numeric("importe", { precision: 10, scale: 2 }).notNull(),
  saldoAnterior: numeric("saldo_anterior", { precision: 10, scale: 2 }).notNull(),
  saldoPosterior: numeric("saldo_posterior", { precision: 10, scale: 2 }).notNull(),
  empleadoId: uuid("empleado_id").references(() => employeesTable.id),
  empleadoNombre: text("empleado_nombre").notNull().default(""),
  notas: text("notas").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CrmGiftCardTransaction = typeof crmGiftCardTransactionsTable.$inferSelect;

// ---------------------------------------------------------------------------
// CRM Promotions & Coupons
// ---------------------------------------------------------------------------
export const crmPromotionsTable = pgTable("crm_promotions", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion").notNull().default(""),
  // "descuento_fijo" | "descuento_porcentual" | "2x1" | "menu_promocional"
  tipo: text("tipo").notNull(),
  valor: numeric("valor", { precision: 10, scale: 2 }).notNull().default("0"),
  codigo: text("codigo").notNull().default(""),
  activo: boolean("activo").notNull().default(true),
  fechaInicio: timestamp("fecha_inicio", { withTimezone: true }),
  fechaFin: timestamp("fecha_fin", { withTimezone: true }),
  diasSemana: jsonb("dias_semana").notNull().default([]),
  horaInicio: text("hora_inicio").notNull().default(""),
  horaFin: text("hora_fin").notNull().default(""),
  categoriaIds: jsonb("categoria_ids").notNull().default([]),
  productIds: jsonb("product_ids").notNull().default([]),
  montoMinimo: numeric("monto_minimo", { precision: 10, scale: 2 }).notNull().default("0"),
  usoMaximo: integer("uso_maximo").notNull().default(0),
  usoActual: integer("uso_actual").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CrmPromotion = typeof crmPromotionsTable.$inferSelect;

// ---------------------------------------------------------------------------
// CRM Audit Log — immutable, append-only
// ---------------------------------------------------------------------------
export const crmAuditLogTable = pgTable("crm_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  accion: text("accion").notNull(),
  clientId: uuid("client_id"),
  entidadTipo: text("entidad_tipo").notNull().default(""),
  entidadId: uuid("entidad_id"),
  empleadoId: uuid("empleado_id").references(() => employeesTable.id),
  empleadoNombre: text("empleado_nombre").notNull().default(""),
  terminal: text("terminal").notNull().default(""),
  datos: jsonb("datos"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CrmAuditLog = typeof crmAuditLogTable.$inferSelect;
