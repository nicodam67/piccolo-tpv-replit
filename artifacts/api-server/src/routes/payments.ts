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
} from "@workspace/db";
import { eq, and, sum, inArray, gte } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { idempotency } from "../middlewares/idempotency";
import { emitToFunction } from "../lib/socket-events";
import { logDocumentAction } from "../lib/document-audit";
import { calcMultiRateBreakdown } from "../lib/tax";
import { issuePoints } from "./crm.js";

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

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "Pedido no encontrado" });
    return;
  }

  // Look up the method BEFORE the order-status guard so the idempotency check
  // (which needs method.id) can run even for already-paid orders.
  const [method] = await db
    .select()
    .from(paymentMethodsTable)
    .where(and(eq(paymentMethodsTable.code, methodCode), eq(paymentMethodsTable.active, true)));

  if (!method) {
    res.status(400).json({ error: "Método de pago no válido" });
    return;
  }

  // Elevated-privilege methods: invitation requires admin role
  const ADMIN_ONLY_METHODS = ["invitation"];
  if (ADMIN_ONLY_METHODS.includes(method.code)) {
    const userRole = (req as any).user?.role as string;
    if (userRole !== "admin") {
      res.status(403).json({ error: `El método "${method.name}" requiere permisos de administrador` });
      return;
    }
  }

  // ── Settled-order gate with idempotency ──────────────────────────────────
  // Idempotency is ONLY applied when the order is already fully settled.
  // During open split-payment accumulation (order not yet "paid") all payment
  // requests are processed normally so two equal-amount partial payments can
  // both succeed without false deduplication.
  //
  // When the order IS settled: check for a matching completed payment
  // (orderId + methodId + amount, 60 s window) and return it as an idempotent
  // 200. This converts what would be a 409 on a final-payment retry into a
  // success response the client can safely act on.
  if (order.status === "paid") {
    const cutoff = new Date(Date.now() - 60_000);
    const [dupe] = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.orderId, orderId),
          eq(paymentsTable.paymentMethodId, method.id),
          eq(paymentsTable.amount, amount),
          eq(paymentsTable.status, "completed"),
          gte(paymentsTable.createdAt, cutoff),
        )
      )
      .limit(1);

    if (dupe) {
      const [existingTicket] = await db
        .select()
        .from(ticketsTable)
        .where(eq(ticketsTable.orderId, orderId));
      res.status(200).json({
        payment: dupe,
        ticket: existingTicket ?? null,
        change: "0.00",
        newRemaining: 0,   // order is settled — remaining is definitively 0
        idempotent: true,
      });
      return;
    }

    // No recent matching payment found → genuine re-payment on a settled order
    res.status(409).json({ error: "El pedido ya está cobrado" });
    return;
  }

  // Fetch items with taxRate for accurate total
  const items = await db
    .select({ unitPrice: orderItemsTable.unitPrice, quantity: orderItemsTable.quantity, taxRate: orderItemsTable.taxRate })
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, orderId));

  const discountResultPay = await db
    .select({ total: sum(discountsTable.discountAmount) })
    .from(discountsTable)
    .where(eq(discountsTable.orderId, orderId));
  const discountForOrder = parseFloat(discountResultPay[0]?.total ?? "0");

  const lineTotals = items.map((it) => ({
    lineTotal: parseFloat(it.unitPrice) * it.quantity,
    taxRate: it.taxRate ?? 10,
  }));
  const { total } = calcMultiRateBreakdown(lineTotals, discountForOrder);
  const totalNum = parseFloat(total);

  const paidResult = await db
    .select({ paid: sum(paymentsTable.amount) })
    .from(paymentsTable)
    .where(and(eq(paymentsTable.orderId, orderId), eq(paymentsTable.status, "completed")));

  const alreadyPaid = parseFloat(paidResult[0]?.paid ?? "0");
  const remaining = parseFloat((totalNum - alreadyPaid).toFixed(2));

  // Only cash can exceed remaining (for change)
  if (methodCode !== "cash" && amountNum > remaining + 0.001) {
    res.status(400).json({
      error: `El importe excede el pendiente de ${remaining.toFixed(2)} €. Solo el efectivo puede superar el pendiente para dar cambio.`,
    });
    return;
  }

  // Get open cash session for this terminal (prefer body.terminal, fallback to header)
  const terminalName = bodyTerminal ?? (req.headers["x-terminal-name"] as string | undefined);

  if (!terminalName) {
    // No terminal supplied — count open sessions to decide whether to allow fallback
    const allOpen = await db
      .select({ id: cashSessionsTable.id })
      .from(cashSessionsTable)
      .where(eq(cashSessionsTable.status, "open"));
    if (allOpen.length > 1) {
      res.status(400).json({
        error: "Hay varias cajas abiertas. Indica el terminal en el que estás operando.",
      });
      return;
    }
  }

  const sessionCondition = terminalName
    ? and(eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.terminalName, terminalName))
    : eq(cashSessionsTable.status, "open");
  const [openSession] = await db
    .select()
    .from(cashSessionsTable)
    .where(sessionCondition)
    .limit(1);

  // Enforce: a terminal that was provided must map to an open session
  if (terminalName && !openSession) {
    res.status(409).json({
      error: `No hay caja abierta en el terminal "${terminalName}". Abre la caja antes de cobrar.`,
    });
    return;
  }
  // Enforce: cash payments always require an open session
  if (!openSession && methodCode === "cash") {
    res.status(409).json({
      error: "No hay ninguna caja abierta. Abre la caja antes de cobrar con efectivo.",
    });
    return;
  }

  // Insert payment (cap at remaining for non-cash; for cash allow full amount for change calc)
  const effectiveAmount = methodCode === "cash"
    ? Math.min(amountNum, remaining + 0.001) <= remaining
      ? amount
      : remaining.toFixed(2)  // only charge remaining, return change to customer
    : amount;

  const change = methodCode === "cash" ? Math.max(0, amountNum - remaining) : 0;

  const result = await db.transaction(async (tx) => {
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

    // Recalculate remaining after this payment
    const newPaid = alreadyPaid + parseFloat(effectiveAmount);
    const newRemaining = parseFloat((totalNum - newPaid).toFixed(2));

    let ticket = null;
    if (newRemaining <= 0.001) {
      // Issue ticket + close order + free table
      const { taxBreakdown, subtotal, taxTotal } = calcMultiRateBreakdown(lineTotals, discountForOrder);

      // Copy emisor fields from business_config (snapshot at issuance time)
      const [bizConfig] = await db.select().from(businessConfigTable).limit(1);
      // Determine payment method name for forma_pago
      const [pmRow] = await db
        .select({ name: paymentMethodsTable.name })
        .from(paymentsTable)
        .innerJoin(paymentMethodsTable, eq(paymentsTable.paymentMethodId, paymentMethodsTable.id))
        .where(and(eq(paymentsTable.orderId, orderId), eq(paymentsTable.status, "completed")))
        .limit(1);

      const [t] = await tx
        .insert(ticketsTable)
        .values({
          orderId,
          cashSessionId: openSession?.id ?? null,
          serie: "T",
          nifEmisor: bizConfig?.nif ?? "",
          razonSocialEmisor: bizConfig?.razonSocial ?? "",
          direccionEmisor: bizConfig?.direccionFiscal ?? "",
          formaPago: pmRow?.name ?? method.name,
          verifactuStatus: "pending",
          subtotal,
          taxTotal,
          total,
          taxBreakdown: taxBreakdown as any,
          employeeId,
        })
        .returning();
      ticket = t;

      // Log ticket issuance to document audit
      await logDocumentAction({
        action: "issue_ticket",
        documentType: "ticket",
        documentId: t.id,
        employeeId,
        employeeName: (req as any).user?.name ?? "",
        terminal: (req.headers["x-forwarded-for"] as string) ?? req.socket?.remoteAddress ?? "",
        amount: total,
        details: `Ticket T-${t.ticketNumber} emitido para pedido ${orderId}`,
      });

      await tx.update(ordersTable).set({ status: "paid" }).where(eq(ordersTable.id, orderId));

      if (order.tableId) {
        await tx
          .update(restaurantTablesTable)
          .set({ status: "free" })
          .where(eq(restaurantTablesTable.id, order.tableId));
      }
    }

    return { payment, ticket, change: change.toFixed(2), newRemaining: Math.max(0, newRemaining) };
  });

  // Auto-issue loyalty points when order is fully paid and has a client
  if (result.ticket && order.clientId) {
    try {
      await issuePoints({
        clientId: order.clientId,
        orderId: orderId,
        importeTotal: parseFloat(result.ticket.total ?? "0"),
        empleadoId: employeeId ?? null,
        empleadoNombre: (req as any).user?.name ?? "",
      });
    } catch {
      // Points issuance failure must never block payment confirmation
    }
  }

  // Emit table refresh so floor plan updates
  try {
    emitToFunction("floor", "tables:refresh");
  } catch { /* socket not init */ }

  res.status(201).json(result);
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
