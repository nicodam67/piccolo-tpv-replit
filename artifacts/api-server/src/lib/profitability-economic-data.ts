import { db } from "@workspace/db";
import {
  cashMachineTransactionsTable,
  discountsTable,
  orderItemsTable,
  ordersTable,
  paymentAttemptsTable,
  paymentsTable,
  paymentVoidsTable,
  splitGroupItemsTable,
  stockMovementsTable,
  ticketsTable,
} from "@workspace/db";
import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  projectEconomicActivity,
  type EconomicAdjustment,
} from "./economic-activity";
import { recognisedLineRevenue } from "./profitability-calculator";

export interface ProjectedProfitabilitySale {
  orderId: string;
  orderItemId: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  taxRate: number;
  isInvitation: boolean;
  channel: string;
  deliveryType: string;
  effectiveChannel: string;
  recognisedGross: number;
  recognisedNet: number;
  cogs: number;
  cogsSource: "stock_snapshot" | "current_recipe_fallback";
  createdAt: Date;
  economicEventId: string;
  economicEventType: "sale" | "adjustment";
}

export interface ProjectedEconomicData {
  rows: ProjectedProfitabilitySale[];
  issuedTicketCount: number;
  actualOpenDays: number;
  snapshotCogs: number;
  totalCogs: number;
  historicalCogsCoveragePct: number;
}

/**
 * Loads the canonical FoodCost economic projection. Both profitability reports
 * and break-even analysis use this function so voids, refunds, discounts and
 * historical COGS cannot diverge between screens.
 */
export async function loadProjectedEconomicActivity(input: {
  from: Date;
  to: Date;
  channel?: string;
  currentCostByProduct: Map<string, number>;
}): Promise<ProjectedEconomicData> {
  const [paymentVoidRows, cashRefundRows, onlineRefundRows] = await Promise.all([
    db.select({
      id: paymentVoidsTable.id,
      orderId: paymentsTable.orderId,
      amount: paymentsTable.amount,
      occurredAt: paymentVoidsTable.createdAt,
    }).from(paymentVoidsTable)
      .innerJoin(paymentsTable, eq(paymentVoidsTable.originalPaymentId, paymentsTable.id))
      .innerJoin(ticketsTable, eq(ticketsTable.orderId, paymentsTable.orderId))
      .where(and(
        eq(ticketsTable.isDemo, false),
        lte(paymentVoidsTable.createdAt, input.to),
      )),
    db.select({
      id: cashMachineTransactionsTable.id,
      orderId: cashMachineTransactionsTable.orderId,
      amountRequested: cashMachineTransactionsTable.amountRequested,
      amountDispensed: cashMachineTransactionsTable.changeDispensed,
      splitRef: cashMachineTransactionsTable.splitRef,
      occurredAt: cashMachineTransactionsTable.completedAt,
    }).from(cashMachineTransactionsTable)
      .innerJoin(ticketsTable, eq(ticketsTable.orderId, cashMachineTransactionsTable.orderId))
      .where(and(
        eq(ticketsTable.isDemo, false),
        eq(cashMachineTransactionsTable.transactionType, "refund"),
        eq(cashMachineTransactionsTable.status, "completada"),
        isNotNull(cashMachineTransactionsTable.orderId),
        isNotNull(cashMachineTransactionsTable.completedAt),
        lte(cashMachineTransactionsTable.completedAt, input.to),
      )),
    db.select({
      id: paymentAttemptsTable.id,
      orderId: paymentAttemptsTable.orderId,
      amountCents: paymentAttemptsTable.amountCents,
      occurredAt: paymentAttemptsTable.refundedAt,
    }).from(paymentAttemptsTable)
      .innerJoin(ticketsTable, eq(ticketsTable.orderId, paymentAttemptsTable.orderId))
      .where(and(
        eq(ticketsTable.isDemo, false),
        eq(paymentAttemptsTable.status, "refunded"),
        isNotNull(paymentAttemptsTable.orderId),
        isNotNull(paymentAttemptsTable.refundedAt),
        lte(paymentAttemptsTable.refundedAt, input.to),
      )),
  ]);

  const validSplitIds = [...new Set(cashRefundRows
    .map((refund) => refund.splitRef)
    .filter((ref): ref is string =>
      Boolean(ref && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ref)),
    ))];
  const splitItems = validSplitIds.length > 0
    ? await db.select({
        splitGroupId: splitGroupItemsTable.splitGroupId,
        orderItemId: splitGroupItemsTable.orderItemId,
        quantity: splitGroupItemsTable.quantity,
      }).from(splitGroupItemsTable)
        .where(inArray(splitGroupItemsTable.splitGroupId, validSplitIds))
    : [];
  const itemsBySplit = new Map<string, Array<{ orderItemId: string; quantity: number }>>();
  for (const item of splitItems) {
    const items = itemsBySplit.get(item.splitGroupId) ?? [];
    items.push({ orderItemId: item.orderItemId, quantity: parseFloat(item.quantity) });
    itemsBySplit.set(item.splitGroupId, items);
  }

  const adjustments: EconomicAdjustment[] = [
    ...paymentVoidRows.map((row) => ({
      id: `payment_void:${row.id}`,
      orderId: row.orderId,
      grossAmount: parseFloat(row.amount),
      occurredAt: row.occurredAt,
    })),
    ...cashRefundRows
      .filter((row): row is typeof row & { orderId: string; occurredAt: Date } =>
        Boolean(row.orderId && row.occurredAt),
      )
      .map((row) => ({
        id: `cash_refund:${row.id}`,
        orderId: row.orderId,
        grossAmount: parseFloat(row.amountDispensed) > 0
          ? parseFloat(row.amountDispensed)
          : parseFloat(row.amountRequested),
        occurredAt: row.occurredAt,
        scopedItems: row.splitRef ? itemsBySplit.get(row.splitRef) : undefined,
      })),
    ...onlineRefundRows
      .filter((row): row is typeof row & { orderId: string; occurredAt: Date } =>
        Boolean(row.orderId && row.occurredAt),
      )
      .map((row) => ({
        id: `online_refund:${row.id}`,
        orderId: row.orderId,
        grossAmount: row.amountCents / 100,
        occurredAt: row.occurredAt,
      })),
  ];
  const adjustedOrderIds = [...new Set(adjustments.map((row) => row.orderId))];
  const ticketInPeriod = and(
    gte(ticketsTable.issuedAt, input.from),
    lte(ticketsTable.issuedAt, input.to),
  );
  const salesRows = await db.select({
    orderId: orderItemsTable.orderId,
    orderItemId: orderItemsTable.id,
    productId: orderItemsTable.productId,
    quantity: orderItemsTable.quantity,
    unitPrice: orderItemsTable.unitPrice,
    taxRate: orderItemsTable.taxRate,
    isInvitation: orderItemsTable.isInvitation,
    channel: ordersTable.channel,
    deliveryType: ordersTable.deliveryType,
    createdAt: ticketsTable.issuedAt,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .innerJoin(ticketsTable, eq(ticketsTable.orderId, ordersTable.id))
    .where(and(
      eq(ticketsTable.isDemo, false),
      adjustedOrderIds.length > 0
        ? or(ticketInPeriod, inArray(ordersTable.id, adjustedOrderIds))
        : ticketInPeriod,
      input.channel
        ? or(eq(ordersTable.channel, input.channel), eq(ordersTable.deliveryType, input.channel))
        : sql`true`,
    ));

  const orderIds = [...new Set(salesRows.map((sale) => sale.orderId))];
  const orderItemIds = salesRows.map((sale) => sale.orderItemId);
  const [discounts, movementRows] = await Promise.all([
    orderIds.length > 0
      ? db.select().from(discountsTable).where(inArray(discountsTable.orderId, orderIds))
      : [],
    orderItemIds.length > 0
      ? db.select({
          orderItemId: stockMovementsTable.orderItemId,
          quantity: stockMovementsTable.quantity,
          unitCost: stockMovementsTable.unitCost,
        }).from(stockMovementsTable)
          .where(and(
            eq(stockMovementsTable.movementType, "sale"),
            inArray(stockMovementsTable.orderItemId, orderItemIds),
          ))
      : [],
  ]);

  const snapshotCogsByItem = new Map<string, number>();
  for (const movement of movementRows) {
    if (!movement.orderItemId) continue;
    const cogs = Math.abs(parseFloat(movement.quantity))
      * parseFloat(movement.unitCost ?? "0");
    snapshotCogsByItem.set(
      movement.orderItemId,
      (snapshotCogsByItem.get(movement.orderItemId) ?? 0) + cogs,
    );
  }
  const orderGross = new Map<string, number>();
  for (const sale of salesRows) {
    if (sale.isInvitation) continue;
    orderGross.set(
      sale.orderId,
      (orderGross.get(sale.orderId) ?? 0)
        + parseFloat(sale.unitPrice) * (sale.quantity ?? 0),
    );
  }
  const lineDiscounts = new Map<string, number>();
  const orderDiscounts = new Map<string, number>();
  for (const discount of discounts) {
    const amount = parseFloat(discount.discountAmount);
    if (discount.orderItemId) {
      lineDiscounts.set(
        discount.orderItemId,
        (lineDiscounts.get(discount.orderItemId) ?? 0) + amount,
      );
    } else {
      orderDiscounts.set(
        discount.orderId,
        (orderDiscounts.get(discount.orderId) ?? 0) + amount,
      );
    }
  }

  const baseRows = salesRows.map((sale) => {
    const quantity = sale.quantity ?? 0;
    const recognisedGross = recognisedLineRevenue({
      gross: parseFloat(sale.unitPrice) * quantity,
      isInvitation: sale.isInvitation,
      lineDiscount: lineDiscounts.get(sale.orderItemId),
      orderDiscount: orderDiscounts.get(sale.orderId),
      orderGross: orderGross.get(sale.orderId),
    });
    const snapshotCogs = snapshotCogsByItem.get(sale.orderItemId);
    return {
      ...sale,
      effectiveChannel: sale.deliveryType === "table" ? sale.channel : sale.deliveryType,
      recognisedGross,
      recognisedNet: recognisedGross / (1 + sale.taxRate / 100),
      cogs: snapshotCogs ?? (input.currentCostByProduct.get(sale.productId) ?? 0) * quantity,
      cogsSource: snapshotCogs == null
        ? "current_recipe_fallback" as const
        : "stock_snapshot" as const,
    };
  });
  const rows = projectEconomicActivity({
    sales: baseRows,
    adjustments,
    from: input.from,
    to: input.to,
  });
  const periodSales = baseRows.filter((sale) =>
    sale.createdAt >= input.from
    && sale.createdAt <= input.to
    && sale.recognisedGross > 0,
  );
  const issuedTicketCount = new Set(periodSales.map((sale) => sale.orderId)).size;
  const actualOpenDays = new Set(
    periodSales.map((sale) => sale.createdAt.toISOString().slice(0, 10)),
  ).size;
  const totalCogs = rows.reduce((total, sale) => total + sale.cogs, 0);
  const snapshotCogs = rows
    .filter((sale) => sale.cogsSource === "stock_snapshot")
    .reduce((total, sale) => total + sale.cogs, 0);
  const historicalCogsCoveragePct = Math.abs(totalCogs) > Number.EPSILON
    ? Math.abs(snapshotCogs) / Math.abs(totalCogs) * 100
    : 100;

  return {
    rows,
    issuedTicketCount,
    actualOpenDays,
    snapshotCogs,
    totalCogs,
    historicalCogsCoveragePct,
  };
}
