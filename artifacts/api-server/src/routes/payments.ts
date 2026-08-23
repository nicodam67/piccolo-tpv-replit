import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  productsTable,
  restaurantTablesTable,
  employeesTable,
  paymentsTable,
  paymentMethodsTable,
  cashSessionsTable,
  ticketsTable,
  businessConfigTable,
  discountsTable,
  documentAuditLogTable,
} from "@workspace/db";
import { eq, and, sum, gte, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { idempotency } from "../middlewares/idempotency";
import { emitToFunction } from "../lib/socket-events";
import { calcMultiRateBreakdown } from "../lib/tax";
import { issuePoints } from "./crm.js";
import { createFiscalRecord, FiscalIssuanceError } from "../lib/fiscal-issuance.js";
import { getNextNumber } from "../lib/invoice-series.js";

// Roles allowed to process payments (excludes kitchen staff)
const PAYMENT_ROLES = ["waiter", "cashier", "manager", "admin"];

const router: IRouter = Router();

// Rate limiter: 30 payment requests per minute per IP.
// High enough for normal operation (busy service), low enough to block
// automated duplicate-payment attacks.
const paymentLimiter = rateLimit({
  windowMs: 60 * 1_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes de cobro. Espere un momento e inténtelo de nuevo." },
});

// GET /orders/:id/payment-summary
router.get("/orders/:id/payment-summary", requireAuth, async (req, res): Promise<void> => {
  const id = req.params.id as string;

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) {
    res.status(404).json({ error: "Pedido no encontrado" });
    return;
  }

  const items = await db
    .select({
      id: orderItemsTable.id,
      productName: productsTable.name,
      quantity: orderItemsTable.quantity,
      unitPrice: orderItemsTable.unitPrice,
      taxRate: orderItemsTable.taxRate,
      status: orderItemsTable.status,
    })
    .from(orderItemsTable)
    .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(eq(orderItemsTable.orderId, id));

  const [tableRow] = order.tableId
    ? await db
        .select({ name: restaurantTablesTable.name })
        .from(restaurantTablesTable)
        .where(eq(restaurantTablesTable.id, order.tableId))
    : [{ name: "—" }];

  const [empRow] = order.employeeId
    ? await db
        .select({ name: employeesTable.name })
        .from(employeesTable)
        .where(eq(employeesTable.id, order.employeeId))
    : [{ name: "—" }];

  // Sum all discounts applied to this order (percentage, fixed, invitation)
  const discountResult = await db
    .select({ total: sum(discountsTable.discountAmount) })
    .from(discountsTable)
    .where(eq(discountsTable.orderId, id));
  const discountTotal = parseFloat(discountResult[0]?.total ?? "0");

  // Compute VAT breakdown per line, then aggregate (discount distributed proportionally)
  const lineTotals = items.map((it) => ({
    lineTotal: parseFloat(it.unitPrice) * it.quantity,
    taxRate: it.taxRate ?? 10,
  }));
  const { taxBreakdown, subtotal, taxTotal, total } = calcMultiRateBreakdown(lineTotals, discountTotal);

  // Paid so far
  const paidResult = await db
    .select({ paid: sum(paymentsTable.amount) })
    .from(paymentsTable)
    .where(and(eq(paymentsTable.orderId, id), eq(paymentsTable.status, "completed")));

  const paid = parseFloat(paidResult[0]?.paid ?? "0");
  const remaining = parseFloat((parseFloat(total) - paid).toFixed(2));

  // Payment methods
  const methods = await db
    .select()
    .from(paymentMethodsTable)
    .where(eq(paymentMethodsTable.active, true))
    .orderBy(paymentMethodsTable.sortOrder);

  // Existing payments
  const existingPayments = await db
    .select({
      id: paymentsTable.id,
      amount: paymentsTable.amount,
      status: paymentsTable.status,
      createdAt: paymentsTable.createdAt,
      methodCode: paymentMethodsTable.code,
      methodName: paymentMethodsTable.name,
    })
    .from(paymentsTable)
    .innerJoin(paymentMethodsTable, eq(paymentsTable.paymentMethodId, paymentMethodsTable.id))
    .where(eq(paymentsTable.orderId, id));

  res.json({
    order: {
      id: order.id,
      status: order.status,
      tableName: tableRow?.name,
      employeeName: empRow?.name,
    },
    items: items.map((it) => ({
      ...it,
      lineTotal: (parseFloat(it.unitPrice) * it.quantity).toFixed(2),
    })),
    ...(discountTotal > 0 && { discount: discountTotal.toFixed(2) }),
    taxBreakdown,
    subtotal,
    taxTotal,
    total,
    paid: paid.toFixed(2),
    remaining: remaining.toFixed(2),
    methods,
    payments: existingPayments,
  });
});

// POST /orders/:id/payments
router.post("/orders/:id/payments", requireAuth, requireRole(...PAYMENT_ROLES), paymentLimiter, idempotency, async (req, res): Promise<void> => {
  const orderId = req.params.id as string;
  const employeeId = (req as any).user?.id as string;
  const employeeName = (req as any).user?.name ?? "";
  const { methodCode, amount, reference, terminal: bodyTerminal } = req.body as {
    methodCode: string;
    amount: string;
    reference?: string;
    terminal?: string;
  };

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    res.status(400).json({ error: "Importe inválido" });
    return;
  }

  const terminalName = bodyTerminal ?? (req.headers["x-terminal-name"] as string | undefined);
  const terminalAddress =
    (req.headers["x-forwarded-for"] as string) ?? req.socket?.remoteAddress ?? "";

  let result;
  try {
    result = await db.transaction(async (tx) => {
      // One order lock covers payment accumulation, final issuance and retries.
      await tx.execute(sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`);
      const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId));
      if (!order) throw new FiscalIssuanceError("ORDER_NOT_FOUND", "Pedido no encontrado");

      const [method] = await tx
        .select()
        .from(paymentMethodsTable)
        .where(and(eq(paymentMethodsTable.code, methodCode), eq(paymentMethodsTable.active, true)));
      if (!method) throw new FiscalIssuanceError("INVALID_PAYMENT_METHOD", "Método de pago no válido");
      if (method.code === "invitation" && (req as any).user?.role !== "admin") {
        throw new FiscalIssuanceError(
          "PAYMENT_METHOD_FORBIDDEN",
          `El método "${method.name}" requiere permisos de administrador`,
        );
      }

      if (order.status === "paid") {
        const cutoff = new Date(Date.now() - 60_000);
        const [dupe] = await tx
          .select()
          .from(paymentsTable)
          .where(and(
            eq(paymentsTable.orderId, orderId),
            eq(paymentsTable.paymentMethodId, method.id),
            eq(paymentsTable.status, "completed"),
            gte(paymentsTable.createdAt, cutoff),
          ))
          .limit(1);
        const [existingTicket] = await tx
          .select()
          .from(ticketsTable)
          .where(eq(ticketsTable.orderId, orderId));
        if (dupe && existingTicket) {
          return {
            payment: dupe,
            ticket: existingTicket,
            change: "0.00",
            newRemaining: 0,
            idempotent: true,
            order,
          };
        }
        throw new FiscalIssuanceError("ORDER_ALREADY_PAID", "El pedido ya está cobrado");
      }

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
      const lineTotals = items.map((item) => ({
        lineTotal: parseFloat(item.unitPrice) * item.quantity,
        taxRate: item.taxRate ?? 10,
      }));
      const totals = calcMultiRateBreakdown(lineTotals, discountForOrder);
      const totalNum = parseFloat(totals.total);
      const paidResult = await tx
        .select({ paid: sum(paymentsTable.amount) })
        .from(paymentsTable)
        .where(and(eq(paymentsTable.orderId, orderId), eq(paymentsTable.status, "completed")));
      const alreadyPaid = parseFloat(paidResult[0]?.paid ?? "0");
      const remaining = parseFloat((totalNum - alreadyPaid).toFixed(2));

      if (methodCode !== "cash" && amountNum > remaining + 0.001) {
        throw new FiscalIssuanceError(
          "PAYMENT_EXCEEDS_REMAINING",
          `El importe excede el pendiente de ${remaining.toFixed(2)} €. Solo el efectivo puede superar el pendiente para dar cambio.`,
        );
      }

      if (!terminalName) {
        const allOpen = await tx
          .select({ id: cashSessionsTable.id })
          .from(cashSessionsTable)
          .where(eq(cashSessionsTable.status, "open"));
        if (allOpen.length > 1) {
          throw new FiscalIssuanceError(
            "TERMINAL_REQUIRED",
            "Hay varias cajas abiertas. Indica el terminal en el que estás operando.",
          );
        }
      }
      const sessionCondition = terminalName
        ? and(eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.terminalName, terminalName))
        : eq(cashSessionsTable.status, "open");
      const [openSession] = await tx
        .select()
        .from(cashSessionsTable)
        .where(sessionCondition)
        .limit(1);
      if (terminalName && !openSession) {
        throw new FiscalIssuanceError(
          "CASH_SESSION_MISSING",
          `No hay caja abierta en el terminal "${terminalName}". Abre la caja antes de cobrar.`,
        );
      }
      if (!openSession && methodCode === "cash") {
        throw new FiscalIssuanceError(
          "CASH_SESSION_MISSING",
          "No hay ninguna caja abierta. Abre la caja antes de cobrar con efectivo.",
        );
      }

      const effectiveAmount =
        methodCode === "cash" && amountNum > remaining ? remaining.toFixed(2) : amount;
      const change = methodCode === "cash" ? Math.max(0, amountNum - remaining) : 0;
      const [payment] = await tx
        .insert(paymentsTable)
        .values({
          orderId,
          cashSessionId: openSession?.id ?? null,
          paymentMethodId: method.id,
          amount: effectiveAmount,
          status: "completed",
          reference: reference ?? null,
          employeeId,
        })
        .returning();

      const newPaid = alreadyPaid + parseFloat(effectiveAmount);
      const newRemaining = parseFloat((totalNum - newPaid).toFixed(2));
      let ticket = null;

      if (newRemaining <= 0.001) {
        const [bizConfig] = await tx.select().from(businessConfigTable).limit(1);
        const ticketNumber = await getNextNumber("T", "ticket", tx);
        const issuedAt = new Date();
        const [createdTicket] = await tx
          .insert(ticketsTable)
          .values({
            orderId,
            ticketNumber,
            cashSessionId: openSession?.id ?? null,
            serie: "T",
            nifEmisor: bizConfig?.nif ?? "",
            razonSocialEmisor: bizConfig?.razonSocial ?? "",
            direccionEmisor: bizConfig?.direccionFiscal ?? "",
            formaPago: method.name,
            verifactuStatus: "pending",
            subtotal: totals.subtotal,
            taxTotal: totals.taxTotal,
            total: totals.total,
            taxBreakdown: totals.taxBreakdown,
            issuedAt,
            employeeId,
          })
          .returning();

        await createFiscalRecord(tx, {
          ticketId: createdTicket.id,
          serie: createdTicket.serie,
          numero: createdTicket.ticketNumber,
          issuedAt,
          tipoFactura: "F2",
          emisorNif: createdTicket.nifEmisor,
          emisorNombre: createdTicket.razonSocialEmisor,
          baseImponible: totals.subtotal,
          cuotaTotal: totals.taxTotal,
          importeTotal: totals.total,
          desgloseIva: totals.taxBreakdown.map((tax) => ({
            tipoImpositivo: Number(tax.rate).toFixed(2),
            baseImponible: tax.base,
            cuotaRepercutida: tax.cuota,
          })),
          empleadoId: employeeId,
          empleadoNombre: employeeName,
          terminal: terminalAddress,
        });

        await tx.insert(documentAuditLogTable).values({
          action: "issue_ticket",
          documentType: "ticket",
          documentId: createdTicket.id,
          employeeId,
          employeeName,
          terminal: terminalAddress,
          amount: totals.total,
          details: `Ticket T-${ticketNumber} y registro fiscal emitidos atómicamente para pedido ${orderId}`,
        });
        await tx.update(ordersTable).set({ status: "paid" }).where(eq(ordersTable.id, orderId));
        if (order.tableId) {
          await tx
            .update(restaurantTablesTable)
            .set({ status: "free" })
            .where(eq(restaurantTablesTable.id, order.tableId));
        }
        ticket = createdTicket;
      }

      return {
        payment,
        ticket,
        change: change.toFixed(2),
        newRemaining: Math.max(0, newRemaining),
        idempotent: false,
        order,
      };
    });
  } catch (error) {
    if (error instanceof FiscalIssuanceError) {
      const status =
        error.code === "ORDER_NOT_FOUND" ? 404
          : error.code === "PAYMENT_METHOD_FORBIDDEN" ? 403
            : ["ORDER_ALREADY_PAID", "CASH_SESSION_MISSING"].includes(error.code) ? 409
              : ["MISSING_ISSUER_NIF", "ISSUER_MISMATCH"].includes(error.code) ? 503
                : 400;
      res.status(status).json({
        error: error.message,
        code: error.code,
        recoverable: status === 503,
      });
      return;
    }
    console.error("[payments] atomic fiscal issuance failed:", error);
    res.status(503).json({
      error: "No se pudo completar el cobro fiscal. No se ha emitido la factura; reintenta.",
      code: "FISCAL_TRANSACTION_FAILED",
      recoverable: true,
    });
    return;
  }

  // Auto-issue loyalty points when order is fully paid and has a client
  if (result.ticket && result.order.clientId && !result.idempotent) {
    try {
      await issuePoints({
        clientId: result.order.clientId,
        orderId: orderId,
        importeTotal: parseFloat(result.ticket.total ?? "0"),
        empleadoId: employeeId ?? null,
        empleadoNombre: employeeName,
      });
    } catch {
      // Points issuance failure must never block payment confirmation
    }
  }

  // Emit table refresh so floor plan updates
  try {
    emitToFunction("floor", "tables:refresh");
  } catch { /* socket not init */ }

  res.status(result.idempotent ? 200 : 201).json({
    payment: result.payment,
    ticket: result.ticket,
    change: result.change,
    newRemaining: result.newRemaining,
    ...(result.idempotent ? { idempotent: true } : {}),
  });
});

// GET /orders/:id/ticket
router.get("/orders/:id/ticket", requireAuth, async (req, res): Promise<void> => {
  const id = req.params.id as string;

  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.orderId, id));

  if (!ticket) {
    res.status(404).json({ error: "No hay ticket para este pedido" });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));

  const items = await db
    .select({
      productName: productsTable.name,
      quantity: orderItemsTable.quantity,
      unitPrice: orderItemsTable.unitPrice,
      taxRate: orderItemsTable.taxRate,
    })
    .from(orderItemsTable)
    .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(eq(orderItemsTable.orderId, id));

  const [tableRow] = order?.tableId
    ? await db
        .select({ name: restaurantTablesTable.name })
        .from(restaurantTablesTable)
        .where(eq(restaurantTablesTable.id, order.tableId))
    : [{ name: "—" }];

  const [emp] = await db
    .select({ name: employeesTable.name })
    .from(employeesTable)
    .where(eq(employeesTable.id, ticket.employeeId));

  const payments = await db
    .select({
      amount: paymentsTable.amount,
      methodName: paymentMethodsTable.name,
    })
    .from(paymentsTable)
    .innerJoin(paymentMethodsTable, eq(paymentsTable.paymentMethodId, paymentMethodsTable.id))
    .where(and(eq(paymentsTable.orderId, id), eq(paymentsTable.status, "completed")));

  // Build taxBreakdown from stored ticket data or recompute from items
  const storedBreakdown = (ticket as any).taxBreakdown;
  const taxBreakdown = storedBreakdown ?? calcMultiRateBreakdown(
    items.map((it) => ({
      lineTotal: parseFloat(it.unitPrice) * it.quantity,
      taxRate: it.taxRate ?? 10,
    }))
  ).taxBreakdown;

  res.json({
    ticket,
    order: { id: order?.id, tableName: tableRow?.name, createdAt: order?.createdAt },
    items: items.map((it) => ({
      ...it,
      lineTotal: (parseFloat(it.unitPrice) * it.quantity).toFixed(2),
    })),
    taxBreakdown,
    payments,
    employeeName: emp?.name,
  });
});

export default router;
