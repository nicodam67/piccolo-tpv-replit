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
  productionDepartmentsTable,
  type ProductionDepartment,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
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
  resolveEffectiveChannels,
} from "./production-departments";

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
export async function resolvePrintersForItem(
  productId: string,
  categoryId: string,
  prepZone: string,
  allPrinters: typeof printersTable.$inferSelect[],
  routingMap: Map<string, string[]>, // key: `${entityType}:${entityId}`
  departmentPrinterIds?: string[],
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

  // 3. Department-level ordered printer list
  if (departmentPrinterIds !== undefined) {
    const byId = new Map(allPrinters.filter((printer) => printer.active)
      .map((printer) => [printer.id, printer]));
    return departmentPrinterIds.flatMap((id) => {
      const printer = byId.get(id);
      return printer ? [printer] : [];
    });
  }

  // 4. Legacy zone-based fallback for installations not yet configured
  return allPrinters.filter(p => p.type === prepZone && p.active && p.isPrimary);
}

// ── enqueuePrintJob ────────────────────────────────────────────────────────────
async function enqueuePrintJob(
  printer: typeof printersTable.$inferSelect,
  orderId: string | null,
  documentType: string,
  content: string,
  actorId?: string | null,
  actorName?: string,
  sourceIds?: string[],
  executor: any = db,
): Promise<void> {
  const dedupeKey = documentType === "reprint"
    ? null
    : createHash("sha256")
      .update(`${orderId ?? "none"}:${printer.id}:${documentType}:${(sourceIds ?? []).sort().join(",")}:${content}`)
      .digest("hex");
  await executor.insert(printQueueTable).values({
    printerId: printer.id,
    orderId,
    documentType,
    content,
    status: "pending",
    actorId: actorId ?? null,
    actorName: actorName ?? "sistema",
    dedupeKey,
  }).onConflictDoNothing();
}

// ── dispatchKitchenPrint ───────────────────────────────────────────────────────
// Main entry: called from POST /orders/:orderId/send after creating kitchenTasks.
export async function dispatchKitchenPrint(params: {
  order: OrderInfo;
  items: Array<{
    productId: string;
    categoryId: string;
    prepZone: string;
    orderItemId?: string;
    ticketItem: TicketItem;
  }>;
  isAdded?: boolean; // true = print only new items with AÑADIDO header
  actorId?: string;
  actorName?: string;
  executor?: any;
  printModeOverride?: "kds_only" | "printers_only" | "both";
  departmentsOverride?: ProductionDepartment[];
}): Promise<void> {
  const {
    order,
    items,
    isAdded = false,
    actorId,
    actorName,
    executor = db,
    printModeOverride,
    departmentsOverride,
  } = params;

  const config = await loadPrintConfig(executor);
  const printMode = printModeOverride ?? config.printMode;
  const template = config.template;
  if (printMode === "kds_only") return;

  if (!items.length) return;

  // Load all active printers
  const allPrinters = await executor
    .select()
    .from(printersTable)
    .where(eq(printersTable.active, true));

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
  const departments = departmentsOverride ?? await executor.select().from(productionDepartmentsTable)
    .where(eq(productionDepartmentsTable.active, true))
    .orderBy(productionDepartmentsTable.sortOrder) as ProductionDepartment[];
  const departmentByCode = new Map<string, ProductionDepartment>(
    departments.map((department) => [department.code, department]),
  );

  // Group items by target printer set so we send one ticket per printer
  const printerToItems = new Map<string, {
    printer: typeof allPrinters[0];
    ticketItems: TicketItem[];
    sourceIds: string[];
  }>();

  for (const item of items) {
    const department = departmentByCode.get(item.prepZone);
    if (department && !resolveEffectiveChannels(
      department,
      printMode as "kds_only" | "printers_only" | "both",
    ).printer) {
      continue;
    }
    const printers = await resolvePrintersForItem(
      item.productId,
      item.categoryId,
      item.prepZone,
      allPrinters,
      routingMap,
      department?.printerIds,
    );
    if (printers.length === 0) {
      throw new Error(`PRINT_DESTINATION_UNAVAILABLE:${item.prepZone}`);
    }
    for (const printer of printers) {
      if (!printerToItems.has(printer.id)) {
        printerToItems.set(printer.id, { printer, ticketItems: [], sourceIds: [] });
      }
      printerToItems.get(printer.id)!.ticketItems.push(item.ticketItem);
      if (item.orderItemId) printerToItems.get(printer.id)!.sourceIds.push(item.orderItemId);
    }
  }

  // Enqueue one print job per printer
  for (const { printer, ticketItems, sourceIds } of printerToItems.values()) {
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
      sourceIds,
      executor,
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
