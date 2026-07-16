import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  pgSequence,
  text,
  timestamp,
  uuid,
  date,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

// ---------------------------------------------------------------------------
// CRM Clients — customer master record
// ---------------------------------------------------------------------------
export const crmNumClienteSeq = pgSequence("crm_num_cliente_seq", { startWith: 1001 });

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
  // ── Reservation-linked extensions (added in 0005_reservations_v2) ──
  idioma:             text("idioma").notNull().default("es"),
  mesaFavoritaId:     uuid("mesa_favorita_id"),
  zonaFavorita:       text("zona_favorita"),
  rgpdMarketing:      boolean("rgpd_marketing").notNull().default(false),
  notasInternas:      text("notas_internas").notNull().default(""),
  flagNoPresentado:   boolean("flag_no_presentado").notNull().default(false),
  bloqueoOnline:      boolean("bloqueo_online").notNull().default(false),
  cancelaciones:      integer("cancelaciones").notNull().default(0),
  noPresentados:      integer("no_presentados").notNull().default(0),
  // ── v2 loyalty extensions (added in 0008_crm_loyalty) ──
  numCliente:         integer("num_cliente"),
  qrToken:            text("qr_token"),
  nivelId:            uuid("nivel_id"),
  nivelNombre:        text("nivel_nombre").notNull().default(""),
  saldoMonedero:      numeric("saldo_monedero", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CrmClient = typeof crmClientsTable.$inferSelect;

// ---------------------------------------------------------------------------
// CRM Loyalty Levels — configurable customer tiers (Bronce/Plata/Oro/VIP)
// ---------------------------------------------------------------------------
export const crmLoyaltyLevelsTable = pgTable("crm_loyalty_levels", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion").notNull().default(""),
  orden: integer("orden").notNull().default(0),
  requisitosGasto: numeric("requisito_gasto", { precision: 10, scale: 2 }).notNull().default("0"),
  requisitosVisitas: integer("requisito_visitas").notNull().default(0),
  multiplicadorPuntos: numeric("multiplicador_puntos", { precision: 4, scale: 2 }).notNull().default("1.00"),
  descuentoPct: numeric("descuento_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  beneficios: jsonb("beneficios").$type<string[]>().notNull().default([]),
  color: text("color").notNull().default("#6b7280"),
  icono: text("icono").notNull().default("⭐"),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CrmLoyaltyLevel = typeof crmLoyaltyLevelsTable.$inferSelect;

// ---------------------------------------------------------------------------
// CRM Loyalty Config — one row per installation
// ---------------------------------------------------------------------------
export const crmLoyaltyConfigTable = pgTable("crm_loyalty_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  activo: boolean("activo").notNull().default(false),
  puntosPorEuro: numeric("puntos_por_euro", { precision: 8, scale: 2 }).notNull().default("1"),
  valorPunto: numeric("valor_punto", { precision: 8, scale: 4 }).notNull().default("0.01"),
  caducidadDias: integer("caducidad_dias").notNull().default(0),
  canjeMinimo: integer("canje_minimo").notNull().default(100),
  bonificacionesCategorias: jsonb("bonificaciones_categorias").notNull().default({}),
  // v2 extended accumulation rules
  puntosExtraCumpleanos:    integer("puntos_extra_cumpleanos").notNull().default(0),
  puntosExtraPrimeraCompra: integer("puntos_extra_primera_compra").notNull().default(0),
  puntosExtraReserva:       integer("puntos_extra_reserva").notNull().default(0),
  puntosExtraRecogida:      integer("puntos_extra_recogida").notNull().default(0),
  puntosExtraOnline:        integer("puntos_extra_online").notNull().default(0),
  reglasPorProducto:        jsonb("reglas_por_producto").notNull().default({}),
  canjeMaxPorOperacion:     integer("canje_max_por_operacion").notNull().default(0),
  caducidadAvisoDias:       integer("caducidad_aviso_dias").notNull().default(7),
  nivelesActivos:           boolean("niveles_activos").notNull().default(false),
  monederoActivo:           boolean("monedero_activo").notNull().default(false),
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
  orderId: uuid("order_id"),
  campaniaId: uuid("campania_id"),
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
  // v2 beneficiary fields
  beneficiarioEmail:    text("beneficiario_email").notNull().default(""),
  beneficiarioNombre:   text("beneficiario_nombre").notNull().default(""),
  mensajePersonalizado: text("mensaje_personalizado").notNull().default(""),
  tipoEntrega:          text("tipo_entrega").notNull().default("digital"),
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
  // "emision" | "recarga" | "pago" | "bloqueo" | "desbloqueo" | "caducidad" | "devolucion"
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
// CRM Wallet / Monedero — promotional balance, refund credit, compensation
// ---------------------------------------------------------------------------
export const crmWalletTable = pgTable("crm_wallet", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().unique().references(() => crmClientsTable.id),
  saldoReal:         numeric("saldo_real", { precision: 10, scale: 2 }).notNull().default("0"),
  saldoPromo:        numeric("saldo_promo", { precision: 10, scale: 2 }).notNull().default("0"),
  saldoCompensacion: numeric("saldo_compensacion", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CrmWallet = typeof crmWalletTable.$inferSelect;

export const crmWalletTransactionsTable = pgTable("crm_wallet_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => crmClientsTable.id),
  // "recarga" | "pago" | "devolucion" | "compensacion" | "promo" | "ajuste" | "caducidad"
  tipo: text("tipo").notNull(),
  // "real" | "promo" | "compensacion"
  subtipo: text("subtipo").notNull().default(""),
  importe: numeric("importe", { precision: 10, scale: 2 }).notNull(),
  saldoAnterior: numeric("saldo_anterior", { precision: 10, scale: 2 }).notNull().default("0"),
  saldoPosterior: numeric("saldo_posterior", { precision: 10, scale: 2 }).notNull().default("0"),
  descripcion: text("descripcion").notNull().default(""),
  orderId: uuid("order_id"),
  empleadoId: uuid("empleado_id").references(() => employeesTable.id),
  empleadoNombre: text("empleado_nombre").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CrmWalletTransaction = typeof crmWalletTransactionsTable.$inferSelect;

// ---------------------------------------------------------------------------
// CRM Promotions & Coupons
// ---------------------------------------------------------------------------
export const crmPromotionsTable = pgTable("crm_promotions", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion").notNull().default(""),
  // "descuento_fijo" | "descuento_porcentual" | "2x1" | "3x2" | "menu_promocional" | "envio_gratis" | "producto_gratis"
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
  // v2 extended
  usoMaximoPorCliente: integer("uso_maximo_por_cliente").notNull().default(0),
  canal:               text("canal").notNull().default(""),
  compatible:          boolean("compatible").notNull().default(true),
  codigoUnico:         boolean("codigo_unico").notNull().default(false),
  productoGratisId:    uuid("producto_gratis_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CrmPromotion = typeof crmPromotionsTable.$inferSelect;

// ---------------------------------------------------------------------------
// CRM Coupon Uses — tracks per-client coupon redemptions
// ---------------------------------------------------------------------------
export const crmCouponUsesTable = pgTable("crm_coupon_uses", {
  id: uuid("id").primaryKey().defaultRandom(),
  promotionId: uuid("promotion_id").notNull().references(() => crmPromotionsTable.id),
  clientId: uuid("client_id").references(() => crmClientsTable.id),
  orderId: uuid("order_id"),
  usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CrmCouponUse = typeof crmCouponUsesTable.$inferSelect;

// ---------------------------------------------------------------------------
// CRM Campaigns
// ---------------------------------------------------------------------------
export const crmCampaignsTable = pgTable("crm_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion").notNull().default(""),
  // "manual" | "automatica" | "cumpleanos" | "inactividad" | "puntos_caducidad"
  tipo: text("tipo").notNull().default("manual"),
  // "borrador" | "programada" | "enviando" | "completada" | "pausada"
  estado: text("estado").notNull().default("borrador"),
  // "email" | "sms" | "whatsapp" | "web" | "ticket" | "cupon_cuenta"
  canal: text("canal").notNull().default("email"),
  asunto: text("asunto").notNull().default(""),
  contenido: text("contenido").notNull().default(""),
  // Segmentation criteria stored as JSON
  segmento: jsonb("segmento").$type<Record<string, unknown>>().notNull().default({}),
  fechaEnvio: timestamp("fecha_envio", { withTimezone: true }),
  fechaFin: timestamp("fecha_fin", { withTimezone: true }),
  // Cached stats
  totalDestinatarios: integer("total_destinatarios").notNull().default(0),
  totalEnviados:      integer("total_enviados").notNull().default(0),
  totalEntregados:    integer("total_entregados").notNull().default(0),
  totalFallidos:      integer("total_fallidos").notNull().default(0),
  totalUsados:        integer("total_usados").notNull().default(0),
  promotionId: uuid("promotion_id").references(() => crmPromotionsTable.id),
  empleadoId:   uuid("empleado_id").references(() => employeesTable.id),
  empleadoNombre: text("empleado_nombre").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CrmCampaign = typeof crmCampaignsTable.$inferSelect;

// ---------------------------------------------------------------------------
// CRM Campaign Sends — per-client delivery record
// ---------------------------------------------------------------------------
export const crmCampaignSendsTable = pgTable("crm_campaign_sends", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => crmCampaignsTable.id),
  clientId: uuid("client_id").notNull().references(() => crmClientsTable.id),
  // "pendiente" | "enviado" | "entregado" | "fallido" | "usado" | "baja"
  estado: text("estado").notNull().default("pendiente"),
  canal: text("canal").notNull().default(""),
  enviadoEn: timestamp("enviado_en", { withTimezone: true }),
  fallidoEn: timestamp("fallido_en", { withTimezone: true }),
  error: text("error"),
  usadoEn: timestamp("usado_en", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CrmCampaignSend = typeof crmCampaignSendsTable.$inferSelect;

// ---------------------------------------------------------------------------
// CRM Consents — granular per-client, per-channel consent records
// ---------------------------------------------------------------------------
export const crmConsentsTable = pgTable("crm_consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => crmClientsTable.id),
  // "operativo" | "marketing_email" | "marketing_sms" | "marketing_whatsapp"
  // | "perfilado" | "fidelizacion"
  tipo: text("tipo").notNull(),
  valor: boolean("valor").notNull(),
  canalOrigen: text("canal_origen").notNull().default(""),
  textoAceptado: text("texto_aceptado").notNull().default(""),
  versionLegal: text("version_legal").notNull().default("1.0"),
  ip: text("ip").notNull().default(""),
  revocadoEn: timestamp("revocado_en", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CrmConsent = typeof crmConsentsTable.$inferSelect;

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

// ---------------------------------------------------------------------------
// CRM Demo Data tracker — records which rows belong to demo seed
// ---------------------------------------------------------------------------
export const crmDemoDataTable = pgTable("crm_demo_data", {
  id: uuid("id").primaryKey().defaultRandom(),
  tabla: text("tabla").notNull(),
  rowId: uuid("row_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
