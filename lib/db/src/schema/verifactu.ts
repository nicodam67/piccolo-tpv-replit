import {
  bigint,
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";
import { invoicesTable } from "./documents";
import { ticketsTable } from "./payments";

// ---------------------------------------------------------------------------
// VeriFactu Records — one row per fiscal registration (alta or anulación)
// Immutable once generated; corrections produce a new rectificativa record.
// ---------------------------------------------------------------------------

export const verifactuRecordsTable = pgTable("verifactu_records", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Exactly one source is set for new alta records. Legacy/anulación rows can
  // retain their historical shape.
  invoiceId: uuid("invoice_id").references(() => invoicesTable.id),
  ticketId: uuid("ticket_id").references(() => ticketsTable.id),

  // "alta" = RegistroAlta, "anulacion" = RegistroAnulacion
  registroTipo: text("registro_tipo").notNull().default("alta"),

  // Invoice type per AEAT: F1 | F2 | F3 | R1 | R2 | R3 | R4 | R5
  tipoFactura: text("tipo_factura").notNull().default("F2"),

  // Series and correlative number (e.g. serie="FS", numero=1 → "FS/1")
  serie: text("serie").notNull(),
  numero: integer("numero").notNull(),
  numSerieFactura: text("num_serie_factura").notNull(), // "FS1" (concatenated for hash)

  // Emission date (dd-mm-yyyy) and generation timestamp
  fechaExpedicion: text("fecha_expedicion").notNull(), // dd-mm-yyyy
  fechaHoraGeneracion: text("fecha_hora_generacion").notNull(), // dd-mm-yyyyTHH:mm:ss+HH:MM

  // Issuer data (snapshot at generation time)
  emisorNif: text("emisor_nif").notNull(),
  emisorNombre: text("emisor_nombre").notNull(),

  // Recipient data (optional for F2)
  destinatarioNif: text("destinatario_nif").notNull().default(""),
  destinatarioNombre: text("destinatario_nombre").notNull().default(""),

  // Operation description
  descripcion: text("descripcion").notNull().default("Servicios de hostelería"),

  // Amounts (2 decimal strings)
  baseImponible: numeric("base_imponible", { precision: 12, scale: 2 }).notNull().default("0"),
  tipoIva: numeric("tipo_iva", { precision: 5, scale: 2 }).notNull().default("10.00"),
  cuotaIva: numeric("cuota_iva", { precision: 12, scale: 2 }).notNull().default("0"),
  cuotaTotal: numeric("cuota_total", { precision: 12, scale: 2 }).notNull().default("0"),
  importeTotal: numeric("importe_total", { precision: 12, scale: 2 }).notNull().default("0"),

  // Multi-rate VAT breakdown as JSON [{tipoImpositivo, baseImponible, cuotaRepercutida}]
  desgloseIva: jsonb("desglose_iva"),

  // Rectification fields
  tipoRectificativa: text("tipo_rectificativa").notNull().default(""), // "S" | "I"
  facturaRectificadaSerie: text("factura_rectificada_serie").notNull().default(""),
  facturaRectificadaNumero: integer("factura_rectificada_numero"),
  facturaRectificadaFecha: text("factura_rectificada_fecha").notNull().default(""),
  motivoRectificacion: text("motivo_rectificacion").notNull().default(""),

  // Anulación reference (for anulacion records)
  registroAnuladoId: uuid("registro_anulado_id"),
  motivoAnulacion: text("motivo_anulacion").notNull().default(""),
  autorizadorAnulacion: text("autorizador_anulacion").notNull().default(""),

  // Hash chain
  chainKey: text("chain_key").notNull().default("legacy"),
  chainSequence: bigint("chain_sequence", { mode: "number" }).notNull().default(0),
  huellaAnterior: text("huella_anterior").notNull().default(""), // "" for first record
  huella: text("huella").notNull(), // SHA-256 uppercase hex

  // Software identification (snapshot from config)
  idSistemaInformatico: text("id_sistema_informatico").notNull().default("PICCOLO-TPV"),
  nombreSistemaInformatico: text("nombre_sistema_informatico").notNull().default("Piccolo TPV"),
  versionSistema: text("version_sistema").notNull().default("1.0"),
  numeroInstalacion: text("numero_instalacion").notNull().default(""),

  // VeriFactu indicator (true = verifactu mode, false = no-verifactu mode)
  esVerifactu: boolean("es_verifactu").notNull().default(true),

  // QR content URL
  qrContent: text("qr_content").notNull().default(""),

  // XML payload generated for this record
  xmlPayload: text("xml_payload"),

  // Submission state machine
  // borrador | validado | pendiente_envio | enviando | aceptado | aceptado_con_errores
  // | rechazado | pendiente_reintento | anulado | rectificado
  estado: text("estado").notNull().default("validado"),

  // AEAT response data
  aeatFechaEnvio: timestamp("aeat_fecha_envio", { withTimezone: true }),
  aeatCodigo: text("aeat_codigo").notNull().default(""),
  aeatDescripcion: text("aeat_descripcion").notNull().default(""),
  aeatCsv: text("aeat_csv").notNull().default(""), // Código Seguro de Verificación
  aeatResponse: jsonb("aeat_response"),

  // Retry tracking
  reintentos: integer("reintentos").notNull().default(0),
  proximoReintento: timestamp("proximo_reintento", { withTimezone: true }),

  // Raw XML sent and response received (for audit)
  xmlEnviado: text("xml_enviado"),
  xmlRespuesta: text("xml_respuesta"),

  // Entorno used when sending
  entornoEnvio: text("entorno_envio").notNull().default("simulador"), // simulador | pruebas | produccion

  // Employee who triggered the generation
  empleadoId: uuid("empleado_id").references(() => employeesTable.id),
  empleadoNombre: text("empleado_nombre").notNull().default(""),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VerifactuRecord = typeof verifactuRecordsTable.$inferSelect;

// One locked head per SIF identity. Issuance locks this row before reading the
// previous hash, which serializes the chain across all Node processes.
export const fiscalChainStateTable = pgTable("fiscal_chain_state", {
  chainKey: text("chain_key").primaryKey(),
  currentSequence: bigint("current_sequence", { mode: "number" }).notNull().default(0),
  lastRecordId: uuid("last_record_id").references(() => verifactuRecordsTable.id),
  lastHash: text("last_hash").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FiscalChainState = typeof fiscalChainStateTable.$inferSelect;

// ---------------------------------------------------------------------------
// VeriFactu Config — system-level settings (one row per installation)
// ---------------------------------------------------------------------------

export const verifactuConfigTable = pgTable("verifactu_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  singletonKey: integer("singleton_key").notNull().default(1).unique(),

  // Issuer identification
  emisorNif: text("emisor_nif").notNull().default(""),
  emisorNombre: text("emisor_nombre").notNull().default(""),

  // Software identification (sent to AEAT)
  idSistemaInformatico: text("id_sistema_informatico").notNull().default("PICCOLO-TPV"),
  nombreSistemaInformatico: text("nombre_sistema_informatico").notNull().default("Piccolo TPV"),
  versionSistema: text("version_sistema").notNull().default("1.0.0"),
  numeroInstalacion: text("numero_instalacion").notNull().default(""),

  // Active environment: simulador | pruebas | produccion
  entorno: text("entorno").notNull().default("simulador"),

  // AEAT endpoints (can be overridden)
  endpointPruebas: text("endpoint_pruebas").notNull().default(
    "https://prewww2.aeat.es/wlpl/TIKE-CONT/ws/SuministroLRWS"
  ),
  endpointProduccion: text("endpoint_produccion").notNull().default(
    "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SuministroLRWS"
  ),

  // Certificate paths (files stored outside repo; never in DB values)
  certificadoPath: text("certificado_path").notNull().default(""),
  // Password stored encrypted; key = SHA-256(SESSION_SECRET)
  certificadoPasswordEnc: text("certificado_password_enc").notNull().default(""),

  // Auto-retry settings
  autoRetry: boolean("auto_retry").notNull().default(true),
  maxReintentos: integer("max_reintentos").notNull().default(3),
  retryIntervalMinutes: integer("retry_interval_minutes").notNull().default(30),

  // Module enabled flag
  activo: boolean("activo").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VerifactuConfig = typeof verifactuConfigTable.$inferSelect;

// ---------------------------------------------------------------------------
// VeriFactu Audit Log — immutable, append-only
// ---------------------------------------------------------------------------

export const verifactuAuditLogTable = pgTable("verifactu_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),

  recordId: uuid("record_id").references(() => verifactuRecordsTable.id),
  invoiceId: uuid("invoice_id"),

  // Action types:
  // generar_registro | validar_registro | enviar_aeat | reintento_envio |
  // respuesta_aceptada | respuesta_rechazada | respuesta_con_errores |
  // generar_anulacion | generar_rectificativa | verificar_cadena |
  // cambio_config | error_generacion | error_envio
  accion: text("accion").notNull(),

  empleadoId: uuid("empleado_id").references(() => employeesTable.id),
  empleadoNombre: text("empleado_nombre").notNull().default(""),
  terminal: text("terminal").notNull().default(""),

  resultado: text("resultado").notNull().default("ok"), // ok | error
  detalles: text("detalles").notNull().default(""),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VerifactuAuditLog = typeof verifactuAuditLogTable.$inferSelect;
