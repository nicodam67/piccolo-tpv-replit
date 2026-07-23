/**
 * print-dispatch.ts
 * Helper that resolves which printers should receive a kitchen ticket
 * and enqueues the print jobs. Called from the order send endpoint and
 * cancellation/modification routes.
 *
 * Routing priority (highest wins):
 *   1. Product-level override in print_routing
 *   2. Category-level override in print_routing
 *   3. Fallback: match by prepZone → printers.type
 */

import { db } from "@workspace/db";
import {
  printersTable,
  printQueueTable,
  printRoutingTable,
  businessConfigTable,
  productsTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  buildKitchenTicket,
  buildAddedTicket,
  buildCancellationTicket,
  buildModificationTicket,
  type OrderInfo,
  type TicketItem,
  type TemplateConfig,
} from "./ticket-builder";
import { sanitizePrintTemplate } from "./configuration";

// Map KDS prepZone values to printer types
const ZONE_TO_PRINTER_TYPE: Record<string, string> = {
  cocina:   "cocina",
  pizza:    "pizza",
  ensalada: "ensalada",
  barra:    "barra",
  pase:     "cocina",
  postres:  "postres",
};

// ── loadPrintConfig ────────────────────────────────────────────────────────────
export async function loadPrintConfig(): Promise<{
  printMode: string;
  template: TemplateConfig;
}> {
  const [cfg] = await db
    .select({
      printMode: (businessConfigTable as any).printMode,
      printTemplateConfig: (businessConfigTable as any).printTemplateConfig,
      nombreComercial: businessConfigTable.nombreComercial,
      razonSocial: businessConfigTable.razonSocial,
      nif: businessConfigTable.nif,
      direccionFiscal: businessConfigTable.direccionFiscal,
      web: businessConfigTable.web,
    })
    .from(businessConfigTable)
    .orderBy(desc(businessConfigTable.updatedAt))
    .limit(1);

  const template: TemplateConfig = {
    mensajeAgradecimiento: "¡Gracias por su visita!",
    mostrarPrecios: false,
    headerExtra: "",
    ...(sanitizePrintTemplate(cfg?.printTemplateConfig as Record<string, unknown> | null) ?? {}),
    nombreComercial: cfg?.nombreComercial ?? "",
    datosFiscales: [cfg?.razonSocial, cfg?.nif, cfg?.direccionFiscal].filter(Boolean).join(" · "),
    piePagina:
      ((cfg?.printTemplateConfig as Record<string, unknown> | null)?.piePagina as string | undefined)
      ?? cfg?.web
      ?? "",
  };

  return {
    printMode: cfg?.printMode ?? "kds_only",
    template,
  };
}

// ── resolvePrintersForItem ─────────────────────────────────────────────────────
async function resolvePrintersForItem(
  productId: string,
  categoryId: string,
  prepZone: string,
  allPrinters: typeof printersTable.$inferSelect[],
  routingMap: Map<string, string[]>, // key: `${entityType}:${entityId}`
): Promise<typeof printersTable.$inferSelect[]> {

  // 1. Product-level override
  const productKey = `product:${productId}`;
  if (routingMap.has(productKey)) {
    const ids = routingMap.get(productKey)!;
    return allPrinters.filter(p => ids.includes(p.id) && p.active);
  }

  // 2. Category-level override
  const catKey = `category:${categoryId}`;
  if (routingMap.has(catKey)) {
    const ids = routingMap.get(catKey)!;
    return allPrinters.filter(p => ids.includes(p.id) && p.active);
  }

  // 3. Zone-based fallback
  const printerType = ZONE_TO_PRINTER_TYPE[prepZone] ?? "cocina";
  return allPrinters.filter(p => p.type === printerType && p.active && p.isPrimary);
}

// ── enqueuePrintJob ────────────────────────────────────────────────────────────
async function enqueuePrintJob(
  printer: typeof printersTable.$inferSelect,
  orderId: string | null,
  documentType: string,
  content: string,
  actorId?: string | null,
  actorName?: string,
): Promise<void> {
  await db.insert(printQueueTable).values({
    printerId: printer.id,
    orderId,
    documentType,
    content,
    status: "pending",
    actorId: actorId ?? null,
    actorName: actorName ?? "sistema",
  });
}

// ── dispatchKitchenPrint ───────────────────────────────────────────────────────
// Main entry: called from POST /orders/:orderId/send after creating kitchenTasks.
export async function dispatchKitchenPrint(params: {
  order: OrderInfo;
  items: Array<{
    productId: string;
    categoryId: string;
    prepZone: string;
    ticketItem: TicketItem;
  }>;
  isAdded?: boolean; // true = print only new items with AÑADIDO header
  actorId?: string;
  actorName?: string;
}): Promise<void> {
  const { order, items, isAdded = false, actorId, actorName } = params;

  const { printMode, template } = await loadPrintConfig();
  if (printMode === "kds_only") return;

  if (!items.length) return;

  // Load all active printers
  const allPrinters = await db
    .select()
    .from(printersTable)
    .where(eq(printersTable.active, true));

  if (!allPrinters.length) return;

  // Load all routing rules for the products/categories in this order
  const productIds = items.map(i => i.productId);
  const categoryIds = [...new Set(items.map(i => i.categoryId))];
  const allEntityIds = [...productIds, ...categoryIds];

  const routingRows = await db
    .select()
    .from(printRoutingTable)
    .where(inArray(printRoutingTable.entityId, allEntityIds));

  const routingMap = new Map<string, string[]>();
  for (const row of routingRows) {
    routingMap.set(`${row.entityType}:${row.entityId}`, row.printerIds as string[]);
  }

  // Group items by target printer set so we send one ticket per printer
  const printerToItems = new Map<string, { printer: typeof allPrinters[0]; ticketItems: TicketItem[] }>();

  for (const item of items) {
    const printers = await resolvePrintersForItem(
      item.productId,
      item.categoryId,
      item.prepZone,
      allPrinters,
      routingMap,
    );
    for (const printer of printers) {
      if (!printerToItems.has(printer.id)) {
        printerToItems.set(printer.id, { printer, ticketItems: [] });
      }
      printerToItems.get(printer.id)!.ticketItems.push(item.ticketItem);
    }
  }

  // Enqueue one print job per printer
  for (const { printer, ticketItems } of printerToItems.values()) {
    const wide = printer.paperWidth === 80;
    const content = isAdded
      ? buildAddedTicket(order, ticketItems, template, wide)
      : buildKitchenTicket(order, ticketItems, template, wide);

    await enqueuePrintJob(
      printer,
      order.id,
      isAdded ? "added_ticket" : "kitchen_ticket",
      content,
      actorId,
      actorName,
    );
  }
}

// ── dispatchCancellationPrint ──────────────────────────────────────────────────
export async function dispatchCancellationPrint(params: {
  order: OrderInfo;
  item: TicketItem;
  productId: string;
  categoryId: string;
  prepZone: string;
  reason: string;
  actorId?: string;
  actorName?: string;
}): Promise<void> {
  const { order, item, productId, categoryId, prepZone, reason, actorId, actorName } = params;

  const { printMode, template } = await loadPrintConfig();
  if (printMode === "kds_only") return;

  const allPrinters = await db.select().from(printersTable).where(eq(printersTable.active, true));
  const routingRows = await db.select().from(printRoutingTable)
    .where(inArray(printRoutingTable.entityId, [productId, categoryId]));
  const routingMap = new Map<string, string[]>();
  for (const row of routingRows) routingMap.set(`${row.entityType}:${row.entityId}`, row.printerIds as string[]);

  const printers = await resolvePrintersForItem(productId, categoryId, prepZone, allPrinters, routingMap);

  for (const printer of printers) {
    const wide = printer.paperWidth === 80;
    const content = buildCancellationTicket(order, item, reason, actorName ?? "sistema", template, wide);
    await enqueuePrintJob(printer, order.id, "cancellation_ticket", content, actorId, actorName);
  }
}

// ── dispatchModificationPrint ──────────────────────────────────────────────────
export async function dispatchModificationPrint(params: {
  order: OrderInfo;
  before: { name: string; notes?: string; modifiers?: string[] };
  after: { name: string; notes?: string; modifiers?: string[] };
  productId: string;
  categoryId: string;
  prepZone: string;
  reason: string;
  actorId?: string;
  actorName?: string;
}): Promise<void> {
  const { order, before, after, productId, categoryId, prepZone, reason, actorId, actorName } = params;

  const { printMode, template } = await loadPrintConfig();
  if (printMode === "kds_only") return;

  const allPrinters = await db.select().from(printersTable).where(eq(printersTable.active, true));
  const routingRows = await db.select().from(printRoutingTable)
    .where(inArray(printRoutingTable.entityId, [productId, categoryId]));
  const routingMap = new Map<string, string[]>();
  for (const row of routingRows) routingMap.set(`${row.entityType}:${row.entityId}`, row.printerIds as string[]);

  const printers = await resolvePrintersForItem(productId, categoryId, prepZone, allPrinters, routingMap);

  for (const printer of printers) {
    const wide = printer.paperWidth === 80;
    const content = buildModificationTicket(order, before, after, reason, actorName ?? "sistema", template, wide);
    await enqueuePrintJob(printer, order.id, "modification_ticket", content, actorId, actorName);
  }
}
