/**
 * ticket-builder.ts
 * Generates text-based ESC/POS ticket content for the simulated print connector.
 * All output is plain-text with ASCII separators — ready for real ESC/POS when
 * a hardware connector is added.
 */

export interface TicketItem {
  quantity: number;
  name: string;
  formatName?: string | null;
  notes?: string;
  allergyNote?: string;
  hasAllergy?: boolean;
  modifiers?: string[];
  unitPrice?: string;
  taxRate?: number;
}

export interface OrderInfo {
  id: string;
  tableName?: string | null;
  zone?: string | null;
  orderNumber?: string | null;
  orderType?: string;
  deliveryType?: string;
  clientName?: string;
  clientPhone?: string;
  guestCount?: number;
  employeeName?: string | null;
  estimatedReadyAt?: Date | string | null;
  sentAt?: Date | string | null;
  createdAt?: Date | string;
}

export interface TemplateConfig {
  nombreComercial?: string;
  datosFiscales?: string;
  piePagina?: string;
  mensajeAgradecimiento?: string;
  mostrarPrecios?: boolean;
  headerExtra?: string;
}

const LINE_80 = "=".repeat(48);
const LINE_80_THIN = "-".repeat(48);
const LINE_58 = "=".repeat(32);
const LINE_58_THIN = "-".repeat(32);

function sep(wide = true): string {
  return wide ? LINE_80 : LINE_58;
}
function sepThin(wide = true): string {
  return wide ? LINE_80_THIN : LINE_58_THIN;
}

function center(text: string, width = 48): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(pad) + text;
}

function formatTs(d?: Date | string | null): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function allergyHeader(items: TicketItem[], wide = true): string[] {
  const allergyItems = items.filter(i => i.hasAllergy && i.allergyNote);
  if (!allergyItems.length) return [];
  const lines: string[] = [];
  lines.push(sep(wide));
  lines.push(center("!!! ALERGIAS / INTOLERANCIAS !!!", wide ? 48 : 32));
  lines.push(sep(wide));
  for (const item of allergyItems) {
    lines.push(`  ${item.quantity}x ${item.name}`);
    lines.push(`  ALERGENO: ${item.allergyNote}`);
  }
  lines.push(sep(wide));
  return lines;
}

// ── buildKitchenTicket ────────────────────────────────────────────────────────
export function buildKitchenTicket(
  order: OrderInfo,
  items: TicketItem[],
  config: TemplateConfig = {},
  wide = true,
  headerLabel?: string,
): string {
  const lines: string[] = [];
  const w = wide ? 48 : 32;

  if (config.nombreComercial) {
    lines.push(center(config.nombreComercial.toUpperCase(), w));
    lines.push(sepThin(wide));
  }

  if (headerLabel) {
    lines.push(center(`*** ${headerLabel} ***`, w));
    lines.push(sep(wide));
  }

  // Location / order type
  const location = order.tableName
    ? `MESA: ${order.tableName}${order.zone ? ` (${order.zone})` : ""}`
    : order.deliveryType === "delivery" ? "REPARTO A DOMICILIO"
    : order.deliveryType === "takeaway" ? "PARA LLEVAR"
    : "MOSTRADOR";
  lines.push(location);

  if (order.orderNumber) lines.push(`PEDIDO: ${order.orderNumber}`);
  if (order.employeeName) lines.push(`CAMARERO: ${order.employeeName}`);
  if (order.guestCount && order.guestCount > 1) lines.push(`COMENSALES: ${order.guestCount}`);
  lines.push(`HORA: ${formatTs(order.sentAt ?? order.createdAt)}`);

  if (order.estimatedReadyAt) {
    lines.push(`LISTO PARA: ${formatTs(order.estimatedReadyAt)}`);
  }
  if (order.clientName) lines.push(`CLIENTE: ${order.clientName}`);

  // Allergy block at top
  const allergyLines = allergyHeader(items, wide);
  if (allergyLines.length) lines.push(...allergyLines);
  else lines.push(sep(wide));

  // Items
  for (const item of items) {
    const priceStr = config.mostrarPrecios && item.unitPrice ? `  ${item.unitPrice}€` : "";
    const nameLine = `  ${item.quantity}x ${item.name}${item.formatName ? ` [${item.formatName}]` : ""}${priceStr}`;
    lines.push(nameLine);
    if (item.modifiers?.length) lines.push(`     + ${item.modifiers.join(", ")}`);
    if (item.notes?.trim()) lines.push(`     > ${item.notes.trim()}`);
    if (item.hasAllergy && item.allergyNote) {
      lines.push(`     *** ALERGIA: ${item.allergyNote} ***`);
    }
  }

  lines.push(sep(wide));
  if (config.headerExtra) { lines.push(config.headerExtra); lines.push(sepThin(wide)); }
  lines.push("");
  return lines.join("\n");
}

// ── buildAddedTicket ──────────────────────────────────────────────────────────
export function buildAddedTicket(
  order: OrderInfo,
  newItems: TicketItem[],
  config: TemplateConfig = {},
  wide = true,
): string {
  return buildKitchenTicket(order, newItems, config, wide, "AÑADIDO");
}

// ── buildCancellationTicket ───────────────────────────────────────────────────
export function buildCancellationTicket(
  order: OrderInfo,
  item: TicketItem,
  reason: string,
  actorName: string,
  config: TemplateConfig = {},
  wide = true,
): string {
  const w = wide ? 48 : 32;
  const lines: string[] = [];
  if (config.nombreComercial) {
    lines.push(center(config.nombreComercial.toUpperCase(), w));
    lines.push(sepThin(wide));
  }
  lines.push(center("*** ANULADO ***", w));
  lines.push(sep(wide));

  const location = order.tableName ? `MESA: ${order.tableName}` : "PEDIDO ONLINE";
  lines.push(location);
  if (order.orderNumber) lines.push(`PEDIDO: ${order.orderNumber}`);
  lines.push(`HORA: ${formatTs(new Date())}`);
  lines.push(sep(wide));
  lines.push(`  ${item.quantity}x ${item.name}${item.formatName ? ` [${item.formatName}]` : ""}`);
  if (item.modifiers?.length) lines.push(`     + ${item.modifiers.join(", ")}`);
  if (item.notes?.trim()) lines.push(`     > ${item.notes}`);
  lines.push(sepThin(wide));
  lines.push(`MOTIVO: ${reason || "Sin especificar"}`);
  lines.push(`USUARIO: ${actorName}`);
  lines.push(sep(wide));
  lines.push("");
  return lines.join("\n");
}

// ── buildModificationTicket ───────────────────────────────────────────────────
export function buildModificationTicket(
  order: OrderInfo,
  before: { name: string; notes?: string; modifiers?: string[] },
  after: { name: string; notes?: string; modifiers?: string[] },
  reason: string,
  actorName: string,
  config: TemplateConfig = {},
  wide = true,
): string {
  const w = wide ? 48 : 32;
  const lines: string[] = [];
  if (config.nombreComercial) {
    lines.push(center(config.nombreComercial.toUpperCase(), w));
    lines.push(sepThin(wide));
  }
  lines.push(center("*** MODIFICACIÓN ***", w));
  lines.push(sep(wide));

  const location = order.tableName ? `MESA: ${order.tableName}` : "PEDIDO ONLINE";
  lines.push(location);
  if (order.orderNumber) lines.push(`PEDIDO: ${order.orderNumber}`);
  lines.push(`HORA: ${formatTs(new Date())}`);
  lines.push(sep(wide));
  lines.push("ANTES:");
  lines.push(`  ${before.name}`);
  if (before.modifiers?.length) lines.push(`  + ${before.modifiers.join(", ")}`);
  if (before.notes?.trim()) lines.push(`  > ${before.notes}`);
  lines.push(sepThin(wide));
  lines.push("AHORA:");
  lines.push(`  ${after.name}`);
  if (after.modifiers?.length) lines.push(`  + ${after.modifiers.join(", ")}`);
  if (after.notes?.trim()) lines.push(`  > ${after.notes}`);
  lines.push(sepThin(wide));
  lines.push(`MOTIVO: ${reason || "Sin especificar"}`);
  lines.push(`USUARIO: ${actorName}`);
  lines.push(sep(wide));
  lines.push("");
  return lines.join("\n");
}

// ── buildReprintHeader ────────────────────────────────────────────────────────
export function buildReprintHeader(reason: string, actorName: string, wide = true): string {
  const w = wide ? 48 : 32;
  return [
    center("*** REIMPRESION ***", w),
    `USUARIO: ${actorName}`,
    `MOTIVO: ${reason}`,
    `HORA: ${formatTs(new Date())}`,
    sep(wide),
    "",
  ].join("\n");
}

// ── buildTestTicket ───────────────────────────────────────────────────────────
export function buildTestTicket(printerName: string, printerType: string, wide = true): string {
  const w = wide ? 48 : 32;
  return [
    center("*** PRUEBA DE IMPRESORA ***", w),
    sep(wide),
    `Nombre: ${printerName}`,
    `Tipo: ${printerType}`,
    `Ancho: ${wide ? "80" : "58"} mm`,
    "Caracteres: España, niño, pingüino",
    "Acentos: á é í ó ú Á É Í Ó Ú",
    "Símbolos: € ¿Qué tal? ¡Correcto!",
    "Corte automático después de 3 líneas",
    `Hora: ${formatTs(new Date())}`,
    sep(wide),
    center("Piccolo TPV", w),
    center("Sistema de impresion activo", w),
    sep(wide),
    "",
  ].join("\n");
}

// ── buildPrefacturaTicket ─────────────────────────────────────────────────────
export function buildPrefacturaTicket(
  order: OrderInfo,
  items: TicketItem[],
  subtotal: string,
  taxTotal: string,
  total: string,
  prefacturaNumber: string,
  config: TemplateConfig = {},
  wide = true,
): string {
  const w = wide ? 48 : 32;
  const lines: string[] = [];

  if (config.nombreComercial) lines.push(center(config.nombreComercial.toUpperCase(), w));
  if (config.datosFiscales) lines.push(center(config.datosFiscales, w));
  lines.push(sep(wide));
  lines.push(center("PREFACTURA", w));
  lines.push(center("DOCUMENTO NO VALIDO COMO FACTURA", w));
  lines.push(sep(wide));

  const location = order.tableName ? `Mesa: ${order.tableName}` : "Pedido";
  lines.push(`${location}    ${formatTs(new Date())}`);
  lines.push(`Prefactura: ${prefacturaNumber}`);
  lines.push(sepThin(wide));

  for (const item of items) {
    const name = `${item.quantity}x ${item.name}${item.formatName ? ` [${item.formatName}]` : ""}`;
    const price = item.unitPrice ? `${(parseFloat(item.unitPrice) * item.quantity).toFixed(2)}€` : "";
    const padding = Math.max(1, (wide ? 46 : 30) - name.length - price.length);
    lines.push(`${name}${" ".repeat(padding)}${price}`);
    if (item.notes?.trim()) lines.push(`   > ${item.notes}`);
  }

  lines.push(sepThin(wide));
  lines.push(`${"SUBTOTAL".padEnd(wide ? 38 : 22)}${subtotal}€`);
  lines.push(`${"IVA (10%)".padEnd(wide ? 38 : 22)}${taxTotal}€`);
  lines.push(sep(wide));
  lines.push(`${"TOTAL".padEnd(wide ? 38 : 22)}${total}€`);
  lines.push(sep(wide));
  if (config.mensajeAgradecimiento) lines.push(center(config.mensajeAgradecimiento, w));
  if (config.piePagina) lines.push(center(config.piePagina, w));
  lines.push("");
  return lines.join("\n");
}

// ── buildFiscalDocumentTicket ─────────────────────────────────────────────────
export function buildFiscalDocumentTicket(
  documentType: "factura_simplificada" | "factura_completa" | "factura_rectificativa" | "informe_x" | "informe_z",
  data: Record<string, unknown>,
  config: TemplateConfig = {},
  wide = true,
): string {
  const w = wide ? 48 : 32;
  const labels: Record<string, string> = {
    factura_simplificada:  "FACTURA SIMPLIFICADA",
    factura_completa:      "FACTURA",
    factura_rectificativa: "FACTURA RECTIFICATIVA",
    informe_x:             "INFORME X (PROVISIONAL)",
    informe_z:             "INFORME Z (CIERRE DE CAJA)",
  };
  const lines: string[] = [];
  if (config.nombreComercial) lines.push(center(config.nombreComercial.toUpperCase(), w));
  if (config.datosFiscales)   lines.push(center(config.datosFiscales, w));
  lines.push(sep(wide));
  lines.push(center(labels[documentType] ?? documentType.toUpperCase(), w));
  lines.push(sep(wide));
  for (const [k, v] of Object.entries(data)) {
    lines.push(`${String(k)}: ${String(v)}`);
  }
  lines.push(sep(wide));
  if (config.piePagina) lines.push(center(config.piePagina, w));
  lines.push("");
  return lines.join("\n");
}
