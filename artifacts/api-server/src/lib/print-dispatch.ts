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
import { eq, and, inArray } from "drizzle-orm";
import {
  buildKitchenTicket,
  buildAddedTicket,
  buildCancellationTicket,
  buildModificationTicket,
  type OrderInfo,
  type TicketItem,
  type TemplateConfig,
} from "./ticket-builder";
import {
  buildPrintDedupeKey,
  resolvePrinterTargets,
} from "./print-resilience";

// ── loadPrintConfig ────────────────────────────────────────────────────────────
export async function loadPrintConfig(executor: any = db): Promise<{
  printMode: string;
  template: TemplateConfig;
}> {
  const [cfg] = await executor
    .select({
      printMode: (businessConfigTable as any).printMode,
      printTemplateConfig: (businessConfigTable as any).printTemplateConfig,
      nombreComercial: businessConfigTable.nombreComercial,
      datosFiscales: (businessConfigTable as any).razonSocial,
      web: businessConfigTable.web,
    })
    .from(businessConfigTable)
    .limit(1);

  const template: TemplateConfig = {
    nombreComercial: cfg?.nombreComercial ?? "",
    datosFiscales: cfg?.datosFiscales ?? "",
    piePagina: cfg?.web ?? "",
    mensajeAgradecimiento: "¡Gracias por su visita!",
    mostrarPrecios: false,
    headerExtra: "",
    ...(cfg?.printTemplateConfig as object ?? {}),
  };

  return {
    printMode: cfg?.printMode ?? "kds_only",
    template,
  };
}

// ── resolvePrintersForItem ─────────────────────────────────────────────────────
export function resolvePrintersForItem(
  productId: string,
  categoryId: string,
  prepZone: string,
  allPrinters: typeof printersTable.$inferSelect[],
  routingMap: Map<string, string[]>, // key: `${entityType}:${entityId}`
): typeof printersTable.$inferSelect[] {
  return resolvePrinterTargets(productId, categoryId, prepZone, allPrinters, routingMap);
}

// ── enqueuePrintJob ────────────────────────────────────────────────────────────
async function enqueuePrintJob(
  executor: any,
  printer: typeof printersTable.$inferSelect,
  orderId: string | null,
  documentType: string,
  content: string,
  actorId?: string | null,
  actorName?: string,
  dedupeKey?: string,
): Promise<void> {
  await executor.insert(printQueueTable).values({
    printerId: printer.id,
    orderId,
    documentType,
    content,
    status: "pending",
    dedupeKey: dedupeKey ?? null,
    actorId: actorId ?? null,
    actorName: actorName ?? "sistema",
  }).onConflictDoNothing({ target: printQueueTable.dedupeKey });
}

// ── dispatchKitchenPrint ───────────────────────────────────────────────────────
// Main entry: called from POST /orders/:orderId/send after creating kitchenTasks.
export async function dispatchKitchenPrint(params: {
  order: OrderInfo;
  items: Array<{
    orderItemId: string;
    productId: string;
    categoryId: string;
    prepZone: string;
    ticketItem: TicketItem;
  }>;
  isAdded?: boolean; // true = print only new items with AÑADIDO header
  actorId?: string;
  actorName?: string;
  executor?: any;
  requireRoutes?: boolean;
}): Promise<void> {
  const {
    order,
    items,
    isAdded = false,
    actorId,
    actorName,
    executor = db,
    requireRoutes = false,
  } = params;

  const { printMode, template } = await loadPrintConfig(executor);
  if (printMode === "kds_only" && !requireRoutes) return;

  if (!items.length) return;

  // Load all active printers
  const allPrinters = await executor
    .select()
    .from(printersTable)
    .where(eq(printersTable.active, true));

  if (!allPrinters.length) {
    if (requireRoutes) throw new Error("PRINT_ROUTE_MISSING:no_active_printers");
    return;
  }

  // Load all routing rules for the products/categories in this order
  const productIds = items.map(i => i.productId);
  const categoryIds = [...new Set(items.map(i => i.categoryId))];
  const allEntityIds = [...productIds, ...categoryIds];

  const routingRows = await executor
    .select()
    .from(printRoutingTable)
    .where(inArray(printRoutingTable.entityId, allEntityIds));

  const routingMap = new Map<string, string[]>();
  for (const row of routingRows) {
    routingMap.set(`${row.entityType}:${row.entityId}`, row.printerIds as string[]);
  }

  // Group items by target printer set so we send one ticket per printer
  const printerToItems = new Map<string, {
    printer: typeof allPrinters[0];
    ticketItems: TicketItem[];
    orderItemIds: string[];
  }>();

  for (const item of items) {
    const printers = resolvePrintersForItem(
      item.productId,
      item.categoryId,
      item.prepZone,
      allPrinters,
      routingMap,
    );
    if (printers.length === 0 && requireRoutes) {
      throw new Error(`PRINT_ROUTE_MISSING:${item.prepZone}`);
    }
    for (const printer of printers) {
      if (!printerToItems.has(printer.id)) {
        printerToItems.set(printer.id, { printer, ticketItems: [], orderItemIds: [] });
      }
      printerToItems.get(printer.id)!.ticketItems.push(item.ticketItem);
      printerToItems.get(printer.id)!.orderItemIds.push(item.orderItemId);
    }
  }

  // Enqueue one print job per printer
  for (const { printer, ticketItems, orderItemIds } of printerToItems.values()) {
    const wide = printer.paperWidth === 80;
    const content = isAdded
      ? buildAddedTicket(order, ticketItems, template, wide)
      : buildKitchenTicket(order, ticketItems, template, wide);

    await enqueuePrintJob(
      executor,
      printer,
      order.id,
      isAdded ? "added_ticket" : "kitchen_ticket",
      content,
      actorId,
      actorName,
      buildPrintDedupeKey({
        documentType: isAdded ? "added_ticket" : "kitchen_ticket",
        orderId: order.id,
        printerId: printer.id,
        operationIds: orderItemIds,
      }),
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
  operationId?: string;
  executor?: any;
  requireRoutes?: boolean;
}): Promise<void> {
  const {
    order,
    item,
    productId,
    categoryId,
    prepZone,
    reason,
    actorId,
    actorName,
    operationId,
    executor = db,
    requireRoutes = false,
  } = params;

  const { printMode, template } = await loadPrintConfig(executor);
  if (printMode === "kds_only" && !requireRoutes) return;

  const allPrinters = await executor.select().from(printersTable).where(eq(printersTable.active, true));
  const routingRows = await executor.select().from(printRoutingTable)
    .where(inArray(printRoutingTable.entityId, [productId, categoryId]));
  const routingMap = new Map<string, string[]>();
  for (const row of routingRows) routingMap.set(`${row.entityType}:${row.entityId}`, row.printerIds as string[]);

  const printers = await resolvePrintersForItem(productId, categoryId, prepZone, allPrinters, routingMap);
  if (printers.length === 0 && requireRoutes) {
    throw new Error(`PRINT_ROUTE_MISSING:${prepZone}`);
  }

  for (const printer of printers) {
    const wide = printer.paperWidth === 80;
    const content = buildCancellationTicket(order, item, reason, actorName ?? "sistema", template, wide);
    await enqueuePrintJob(
      executor,
      printer,
      order.id,
      "cancellation_ticket",
      content,
      actorId,
      actorName,
      `cancellation_ticket:${order.id}:${printer.id}:${operationId ?? productId}`,
    );
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
    await enqueuePrintJob(
      db,
      printer,
      order.id,
      "modification_ticket",
      content,
      actorId,
      actorName,
      `modification_ticket:${order.id}:${printer.id}:${productId}:${Date.now()}`,
    );
  }
}
