import { db } from "@workspace/db";
import {
  fiscalChainStateTable,
  invoicesTable,
  ticketsTable,
  verifactuAuditLogTable,
  verifactuConfigTable,
  verifactuRecordsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  calcularHuellaAlta,
  formatAeatDate,
  formatAeatDateTime,
} from "./verifactu-hash.js";

export type FiscalTransaction =
  Parameters<Parameters<typeof db.transaction>[0]>[0];

export class FiscalIssuanceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FiscalIssuanceError";
    this.code = code;
  }
}

export interface FiscalIssuanceInput {
  invoiceId?: string;
  ticketId?: string;
  serie: string;
  numero: number;
  issuedAt: Date;
  tipoFactura: string;
  emisorNif: string;
  emisorNombre: string;
  destinatarioNif?: string;
  destinatarioNombre?: string;
  descripcion?: string;
  baseImponible: string;
  cuotaTotal: string;
  importeTotal: string;
  desgloseIva?: Array<{
    tipoImpositivo: string;
    baseImponible: string;
    cuotaRepercutida: string;
  }>;
  original?: {
    serie: string;
    numero: number;
    fechaExpedicion: string;
    motivo: string;
    tipoRectificativa?: "S" | "I";
  };
  empleadoId?: string | null;
  empleadoNombre?: string;
  terminal?: string;
  generatedAt?: Date;
}

function fixed2(value: string | number): string {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new FiscalIssuanceError("INVALID_AMOUNT", `Importe fiscal inválido: ${value}`);
  }
  return number.toFixed(2);
}

export function formatFiscalIdentity(serie: string, numero: number): string {
  return `${serie.trim()}-${String(numero).padStart(4, "0")}`;
}

async function existingAlta(
  tx: FiscalTransaction,
  input: FiscalIssuanceInput,
) {
  const sourceCondition = input.ticketId
    ? eq(verifactuRecordsTable.ticketId, input.ticketId)
    : input.invoiceId
      ? eq(verifactuRecordsTable.invoiceId, input.invoiceId)
      : undefined;
  if (!sourceCondition) return undefined;

  const [existing] = await tx
    .select()
    .from(verifactuRecordsTable)
    .where(and(sourceCondition, eq(verifactuRecordsTable.registroTipo, "alta")))
    .limit(1);
  return existing;
}

/**
 * Creates and chains one immutable RegistroAlta using the caller's transaction.
 * The chain-head row is locked until commit, serializing every process that
 * emits for the same SIF identity.
 */
export async function createFiscalRecord(
  tx: FiscalTransaction,
  input: FiscalIssuanceInput,
) {
  if (Boolean(input.invoiceId) === Boolean(input.ticketId)) {
    throw new FiscalIssuanceError(
      "INVALID_SOURCE",
      "El registro fiscal debe pertenecer exactamente a una factura o ticket",
    );
  }
  if (!input.emisorNif.trim()) {
    throw new FiscalIssuanceError(
      "MISSING_ISSUER_NIF",
      "No se puede emitir: falta el NIF fiscal del emisor",
    );
  }
  if (!Number.isInteger(input.numero) || input.numero <= 0) {
    throw new FiscalIssuanceError("INVALID_NUMBER", "La numeración fiscal no es válida");
  }

  const [config] = await tx
    .select()
    .from(verifactuConfigTable)
    .where(eq(verifactuConfigTable.singletonKey, 1))
    .limit(1);
  if (config?.emisorNif && config.emisorNif !== input.emisorNif) {
    throw new FiscalIssuanceError(
      "ISSUER_MISMATCH",
      "El NIF de Configuración VERI*FACTU no coincide con el emisor de la factura",
    );
  }

  const idSistema = config?.idSistemaInformatico || "PICCOLO-TPV";
  const numeroInstalacion = config?.numeroInstalacion || "DEFAULT";
  const chainKey = `${input.emisorNif.trim()}|${idSistema}|${numeroInstalacion}`;

  await tx
    .insert(fiscalChainStateTable)
    .values({ chainKey })
    .onConflictDoNothing();

  const [chain] = await tx
    .select()
    .from(fiscalChainStateTable)
    .where(eq(fiscalChainStateTable.chainKey, chainKey))
    .for("update");
  if (!chain) {
    throw new FiscalIssuanceError("CHAIN_STATE_MISSING", "No se pudo bloquear la cadena fiscal");
  }

  // The source constraint is checked again after acquiring the chain lock so
  // concurrent retries cannot both append.
  const existing = await existingAlta(tx, input);
  if (existing) return existing;

  const generatedAt = input.generatedAt ?? new Date();
  const fechaExpedicion = formatAeatDate(input.issuedAt);
  const fechaHoraGeneracion = formatAeatDateTime(generatedAt);
  const numSerieFactura = formatFiscalIdentity(input.serie, input.numero);
  const cuotaTotal = fixed2(input.cuotaTotal);
  const importeTotal = fixed2(input.importeTotal);
  const huellaAnterior = chain.lastHash;
  const huella = calcularHuellaAlta({
    emisorNif: input.emisorNif,
    numSerieFactura,
    fechaExpedicion,
    tipoFactura: input.tipoFactura,
    cuotaTotal,
    importeTotal,
    huellaAnterior,
    fechaHoraGeneracion,
  });
  const chainSequence = chain.currentSequence + 1;

  const [record] = await tx
    .insert(verifactuRecordsTable)
    .values({
      invoiceId: input.invoiceId ?? null,
      ticketId: input.ticketId ?? null,
      registroTipo: "alta",
      tipoFactura: input.tipoFactura,
      serie: input.serie,
      numero: input.numero,
      numSerieFactura,
      fechaExpedicion,
      fechaHoraGeneracion,
      emisorNif: input.emisorNif.trim(),
      emisorNombre: input.emisorNombre.trim(),
      destinatarioNif: input.destinatarioNif?.trim() ?? "",
      destinatarioNombre: input.destinatarioNombre?.trim() ?? "",
      descripcion: input.descripcion ?? "Servicios de hostelería",
      baseImponible: fixed2(input.baseImponible),
      tipoIva: input.desgloseIva?.[0]?.tipoImpositivo ?? "0.00",
      cuotaIva: cuotaTotal,
      cuotaTotal,
      importeTotal,
      desgloseIva: input.desgloseIva ?? null,
      tipoRectificativa: input.original?.tipoRectificativa ?? "",
      facturaRectificadaSerie: input.original?.serie ?? "",
      facturaRectificadaNumero: input.original?.numero ?? null,
      facturaRectificadaFecha: input.original?.fechaExpedicion ?? "",
      motivoRectificacion: input.original?.motivo ?? "",
      chainKey,
      chainSequence,
      huellaAnterior,
      huella,
      idSistemaInformatico: idSistema,
      nombreSistemaInformatico: config?.nombreSistemaInformatico || "Piccolo TPV",
      versionSistema: config?.versionSistema || "1.0.0",
      numeroInstalacion,
      esVerifactu: true,
      estado: "pendiente_envio",
      entornoEnvio: config?.entorno || "simulador",
      empleadoId: input.empleadoId ?? null,
      empleadoNombre: input.empleadoNombre ?? "",
    })
    .returning();

  await tx
    .update(fiscalChainStateTable)
    .set({
      currentSequence: chainSequence,
      lastRecordId: record.id,
      lastHash: huella,
      updatedAt: generatedAt,
    })
    .where(eq(fiscalChainStateTable.chainKey, chainKey));

  if (input.ticketId) {
    await tx
      .update(ticketsTable)
      .set({
        verifactuStatus: "generated",
        verifactuResponse: JSON.stringify({ registroId: record.id, huella }),
      })
      .where(eq(ticketsTable.id, input.ticketId));
  } else if (input.invoiceId) {
    await tx
      .update(invoicesTable)
      .set({
        verifactuStatus: "generated",
        verifactuResponse: { registroId: record.id, huella },
      })
      .where(eq(invoicesTable.id, input.invoiceId));
  }

  await tx.insert(verifactuAuditLogTable).values({
    recordId: record.id,
    invoiceId: input.invoiceId ?? null,
    accion: "generar_registro",
    empleadoId: input.empleadoId ?? null,
    empleadoNombre: input.empleadoNombre ?? "",
    terminal: input.terminal ?? "",
    resultado: "ok",
    detalles: `Huella: ${huella} | Identidad: ${numSerieFactura} | Secuencia: ${chainSequence}`,
  });

  return record;
}
