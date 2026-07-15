/**
 * settle-order.ts
 *
 * Shared helper: after a payment row has been inserted, check whether the order
 * is now fully paid.  If so, atomically issue the ticket, mark the order `paid`,
 * and release the table — exactly the same logic as the normal
 * POST /orders/:id/payments settlement path.
 *
 * Idempotent: if the order is already `paid` it returns early without
 * re-settling, so concurrent cash-machine poll calls are safe.
 */

import { db } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  restaurantTablesTable,
  paymentsTable,
  paymentMethodsTable,
  cashSessionsTable,
  ticketsTable,
  businessConfigTable,
  discountsTable,
} from "@workspace/db";
import { eq, and, sum } from "drizzle-orm";
import { calcMultiRateBreakdown } from "./tax";
import { logDocumentAction } from "./document-audit";

export interface SettlementResult {
  /** True if the order was just settled (ticket issued, status → paid). */
  settled: boolean;
  ticket: typeof ticketsTable.$inferSelect | null;
  /** Remaining balance after all payments (≥ 0). */
  remaining: number;
}

/**
 * Checks whether `orderId` is now fully paid and, if so, runs settlement inside
 * a DB transaction: ticket issuance, order → `paid`, table → `free`.
 *
 * Safe to call multiple times (idempotent via order.status check).
 */
export async function settleOrderIfFullyPaid({
  orderId,
  employeeId,
  employeeName = "",
  cashSessionId,
}: {
  orderId: string;
  employeeId: string;
  employeeName?: string;
  cashSessionId?: string | null;
}): Promise<SettlementResult> {
  return db.transaction(async (tx) => {
    // Guard against re-settlement
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId));
    if (!order || order.status === "paid") {
      return { settled: false, ticket: null, remaining: 0 };
    }

    // Compute order total with VAT
    const items = await tx
      .select({
        unitPrice: orderItemsTable.unitPrice,
        quantity: orderItemsTable.quantity,
        taxRate: orderItemsTable.taxRate,
      })
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, orderId));

    const discountResult = await tx
      .select({ total: sum(discountsTable.discountAmount) })
      .from(discountsTable)
      .where(eq(discountsTable.orderId, orderId));
    const discountForOrder = parseFloat(discountResult[0]?.total ?? "0");

    const lineTotals = items.map((it) => ({
      lineTotal: parseFloat(it.unitPrice) * it.quantity,
      taxRate: it.taxRate ?? 10,
    }));
    const { total, taxBreakdown, subtotal, taxTotal } = calcMultiRateBreakdown(lineTotals, discountForOrder);
    const totalNum = parseFloat(total);

    // Sum all completed payments for this order
    const paidResult = await tx
      .select({ paid: sum(paymentsTable.amount) })
      .from(paymentsTable)
      .where(and(eq(paymentsTable.orderId, orderId), eq(paymentsTable.status, "completed")));
    const alreadyPaid = parseFloat(paidResult[0]?.paid ?? "0");
    const remaining = parseFloat((totalNum - alreadyPaid).toFixed(2));

    if (remaining > 0.001) {
      return { settled: false, ticket: null, remaining: Math.max(0, remaining) };
    }

    // ── Fully paid → settle ───────────────────────────────────────────────────

    const [bizConfig] = await tx.select().from(businessConfigTable).limit(1);

    // Forma de pago: use name of the most recent payment method
    const [pmRow] = await tx
      .select({ name: paymentMethodsTable.name })
      .from(paymentsTable)
      .innerJoin(paymentMethodsTable, eq(paymentsTable.paymentMethodId, paymentMethodsTable.id))
      .where(and(eq(paymentsTable.orderId, orderId), eq(paymentsTable.status, "completed")))
      .limit(1);

    const [ticket] = await tx
      .insert(ticketsTable)
      .values({
        orderId,
        cashSessionId: cashSessionId ?? null,
        serie: "T",
        nifEmisor:            bizConfig?.nif ?? "",
        razonSocialEmisor:    bizConfig?.razonSocial ?? "",
        direccionEmisor:      bizConfig?.direccionFiscal ?? "",
        formaPago:            pmRow?.name ?? "Caja automática",
        verifactuStatus:      "pending",
        subtotal,
        taxTotal,
        total,
        taxBreakdown:         taxBreakdown as any,
        employeeId,
      })
      .returning();

    await logDocumentAction({
      action: "issue_ticket",
      documentType: "ticket",
      documentId: ticket.id,
      employeeId,
      employeeName,
      terminal: "",
      amount: total,
      details: `Ticket T-${ticket.ticketNumber} emitido para pedido ${orderId} (caja automática)`,
    });

    // Mark order paid
    await tx.update(ordersTable).set({ status: "paid" }).where(eq(ordersTable.id, orderId));

    // Release table
    if (order.tableId) {
      await tx
        .update(restaurantTablesTable)
        .set({ status: "free" })
        .where(eq(restaurantTablesTable.id, order.tableId));
    }

    return { settled: true, ticket, remaining: 0 };
  });
}
