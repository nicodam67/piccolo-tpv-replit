import { createHash } from "node:crypto";

/**
 * Orden HAC/1177/2024 — detalle técnico de huella AEAT.
 *
 * The field names, order and `=`/`&` separators are part of the signed input.
 * Values are the same lexical values persisted in the fiscal record/XML.
 */
function digest(fields: ReadonlyArray<readonly [name: string, value: string]>): string {
  const input = fields
    .map(([name, value]) => `${name}=${value.trim()}`)
    .join("&");
  return createHash("sha256").update(input, "utf8").digest("hex").toUpperCase();
}

export interface HuellaAltaInput {
  emisorNif: string;
  numSerieFactura: string;
  fechaExpedicion: string;
  tipoFactura: string;
  cuotaTotal: string;
  importeTotal: string;
  huellaAnterior: string;
  fechaHoraGeneracion: string;
}

export function buildHuellaAltaInput(params: HuellaAltaInput): string {
  return [
    ["IDEmisorFactura", params.emisorNif],
    ["NumSerieFactura", params.numSerieFactura],
    ["FechaExpedicionFactura", params.fechaExpedicion],
    ["TipoFactura", params.tipoFactura],
    ["CuotaTotal", params.cuotaTotal],
    ["ImporteTotal", params.importeTotal],
    ["Huella", params.huellaAnterior],
    ["FechaHoraHusoGenRegistro", params.fechaHoraGeneracion],
  ]
    .map(([name, value]) => `${name}=${value.trim()}`)
    .join("&");
}

export function calcularHuellaAlta(params: HuellaAltaInput): string {
  return digest([
    ["IDEmisorFactura", params.emisorNif],
    ["NumSerieFactura", params.numSerieFactura],
    ["FechaExpedicionFactura", params.fechaExpedicion],
    ["TipoFactura", params.tipoFactura],
    ["CuotaTotal", params.cuotaTotal],
    ["ImporteTotal", params.importeTotal],
    ["Huella", params.huellaAnterior],
    ["FechaHoraHusoGenRegistro", params.fechaHoraGeneracion],
  ]);
}

export interface HuellaAnulacionInput {
  emisorNif: string;
  numSerieFactura: string;
  fechaExpedicion: string;
  huellaAnterior: string;
  fechaHoraGeneracion: string;
}

export function calcularHuellaAnulacion(params: HuellaAnulacionInput): string {
  return digest([
    ["IDEmisorFacturaAnulada", params.emisorNif],
    ["NumSerieFacturaAnulada", params.numSerieFactura],
    ["FechaExpedicionFacturaAnulada", params.fechaExpedicion],
    ["Huella", params.huellaAnterior],
    ["FechaHoraHusoGenRegistro", params.fechaHoraGeneracion],
  ]);
}

export function formatAeatDate(date: Date, timeZone = "Europe/Madrid"): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("day")}-${value("month")}-${value("year")}`;
}

export function formatAeatDateTime(date: Date, timeZone = "Europe/Madrid"): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const offset = value("timeZoneName").replace("GMT", "") || "+00:00";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}${offset}`;
}
