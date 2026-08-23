import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  cashMachineConfigTable,
  cashMachineTransactionsTable,
  ordersTable,
  paymentMethodsTable,
  cashSessionsTable,
  paymentsTable,
  employeesTable,
} from "@workspace/db";
import { eq, and, desc, sum, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { adapterRegistry } from "../lib/cash-machine/registry";
import { settleOrderIfFullyPaid } from "../lib/settle-order";
import { emitToFunction } from "../lib/socket-events";

const ADMIN_ROLES   = ["admin"];
const MANAGER_ROLES = ["manager", "admin"];
const PAYMENT_ROLES = ["waiter", "cashier", "manager", "admin"];

const router: IRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getConfig() {
  const [cfg] = await db.select().from(cashMachineConfigTable).limit(1);
  return cfg ?? null;
}

async function ensurePaymentMethod(tx?: typeof db): Promise<string> {
  const executor = tx ?? db;
  const [existing] = await executor
    .select({ id: paymentMethodsTable.id })
    .from(paymentMethodsTable)
    .where(eq(paymentMethodsTable.code, "cash_machine"))
    .limit(1);
  if (existing) return existing.id;

  const [inserted] = await executor
    .insert(paymentMethodsTable)
    .values({ code: "cash_machine", name: "Efectivo – Caja automática", active: true, sortOrder: 10 })
    .returning({ id: paymentMethodsTable.id });
  return inserted.id;
}

// ─── Admin: Config ────────────────────────────────────────────────────────────

router.get(
  "/admin/cash-machine/config",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  async (_req, res): Promise<void> => {
    const cfg = await getConfig();
    if (!cfg) {
      // Return sensible defaults when no config exists yet
      res.json({
        id: null,
        manufacturer: "simulator",
        model: "Simulator v1",
        host: "localhost",
        port: 8080,
        connectionType: "tcp",
        deviceId: "device-1",
        credentialKey: null,
        timeoutMs: 30000,
        enabled: false,
        hasCredential: false,
      });
      return;
    }
    res.json({ ...cfg, hasCredential: !!cfg.credentialKey });
  },
);

router.put(
  "/admin/cash-machine/config",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const {
      manufacturer, model, host, port, connectionType, deviceId,
      credentialKey, timeoutMs, enabled,
    } = req.body as {
      manufacturer?: string;
      model?: string;
      host?: string;
      port?: number;
      connectionType?: string;
      deviceId?: string;
      credentialKey?: string;
      timeoutMs?: number;
      enabled?: boolean;
    };

    const existing = await getConfig();

    if (!existing) {
      const [row] = await db
        .insert(cashMachineConfigTable)
        .values({
          manufacturer: manufacturer ?? "simulator",
          model:        model ?? "Simulator v1",
          host:         host ?? "localhost",
          port:         port ?? 8080,
          connectionType: connectionType ?? "tcp",
          deviceId:     deviceId ?? "device-1",
          credentialKey: credentialKey ?? null,
          timeoutMs:    timeoutMs ?? 30000,
          enabled:      enabled ?? false,
        })
        .returning();
      res.status(201).json({ ...row, hasCredential: !!row.credentialKey });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (manufacturer  !== undefined) updates["manufacturer"]    = manufacturer;
    if (model         !== undefined) updates["model"]           = model;
    if (host          !== undefined) updates["host"]            = host;
    if (port          !== undefined) updates["port"]            = port;
    if (connectionType !== undefined) updates["connectionType"] = connectionType;
    if (deviceId      !== undefined) updates["deviceId"]        = deviceId;
    if (credentialKey !== undefined) updates["credentialKey"]   = credentialKey;
    if (timeoutMs     !== undefined) updates["timeoutMs"]       = timeoutMs;
    if (enabled       !== undefined) updates["enabled"]         = enabled;

    const [updated] = await db
      .update(cashMachineConfigTable)
      .set(updates)
      .where(eq(cashMachineConfigTable.id, existing.id))
      .returning();

    res.json({ ...updated, hasCredential: !!updated.credentialKey });
  },
);

// ─── Admin: Test Connection ────────────────────────────────────────────────────

router.post(
  "/admin/cash-machine/test-connection",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const scenario = req.headers["x-simulator-scenario"] as string | undefined;
    if (scenario) adapterRegistry.setScenario(scenario);

    try {
      const latency = await adapterRegistry.getAdapter().connect();
      res.json({ ok: true, latencyMs: latency });
    } catch (err: any) {
      res.status(503).json({ ok: false, error: err?.message ?? "Connection failed" });
    }
  },
);

// ─── Admin/Manager: Device Status ─────────────────────────────────────────────

router.get(
  "/admin/cash-machine/status",
  requireAuth,
  requireRole(...MANAGER_ROLES),
  async (_req, res): Promise<void> => {
    try {
      const status = await adapterRegistry.getAdapter().getStatus();
      res.json(status);
    } catch (err: any) {
      res.status(503).json({ error: err?.message ?? "Device unreachable" });
    }
  },
);

router.get(
  "/admin/cash-machine/cash-levels",
  requireAuth,
  requireRole(...MANAGER_ROLES),
  async (_req, res): Promise<void> => {
    try {
      const levels = await adapterRegistry.getAdapter().getCashLevels();
      res.json(levels);
    } catch (err: any) {
      res.status(503).json({ error: err?.message ?? "Device unreachable" });
    }
  },
);

// ─── Payments: Start ──────────────────────────────────────────────────────────

router.post(
  "/cash-machine/payments",
  requireAuth,
  requireRole(...PAYMENT_ROLES),
  async (req, res): Promise<void> => {
    const employeeId = (req as any).user?.id as string;
    const { orderId, amount, splitRef, terminalName } = req.body as {
      orderId?: string;
      amount: string;
      splitRef?: string;
      terminalName?: string;
    };

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      res.status(400).json({ error: "Importe inválido" });
      return;
    }

    const cfg = await getConfig();
    if (!cfg?.enabled) {
      res.status(503).json({ error: "La caja automática no está habilitada" });
      return;
    }

    // Validate order — must exist and not already be paid
    if (orderId) {
      const [order] = await db
        .select({ id: ordersTable.id, status: ordersTable.status })
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .limit(1);
      if (!order) {
        res.status(404).json({ error: "Pedido no encontrado" });
        return;
      }
      if (order.status === "paid") {
        res.status(409).json({ error: "El pedido ya está cobrado" });
        return;
      }
    }

    // Double-tap guard: reject if there's already an in-flight transaction for this order
    const IN_FLIGHT_STATUSES = ["pending", "iniciando", "esperando_efectivo", "efectivo_parcial", "devolviendo_cambio"] as const;
    if (orderId) {
      const [inflight] = await db
        .select({
          id:              cashMachineTransactionsTable.id,
          transactionType: cashMachineTransactionsTable.transactionType,
          status:          cashMachineTransactionsTable.status,
        })
        .from(cashMachineTransactionsTable)
        .where(
          and(
            eq(cashMachineTransactionsTable.orderId, orderId),
            eq(cashMachineTransactionsTable.transactionType, "payment"),
            inArray(cashMachineTransactionsTable.status, [...IN_FLIGHT_STATUSES]),
          ),
        )
        .limit(1);

      // All three columns are now selected — runtime check mirrors the SQL predicate
      if (
        inflight &&
        inflight.transactionType === "payment" &&
        (IN_FLIGHT_STATUSES as readonly string[]).includes(inflight.status)
      ) {
        res.status(409).json({ error: "Ya hay una transacción en curso para este pedido" });
        return;
      }
    }

    // Set simulator scenario from test header
    const scenario = req.headers["x-simulator-scenario"] as string | undefined;
    if (scenario) adapterRegistry.setScenario(scenario);

    let deviceResult;
    try {
      deviceResult = await adapterRegistry.getAdapter().startPayment(
        parseFloat(amount).toFixed(2),
        orderId ?? `manual-${Date.now()}`,
      );
    } catch (err: any) {
      res.status(503).json({ error: err?.message ?? "Device unreachable" });
      return;
    }

    const [txRow] = await db
      .insert(cashMachineTransactionsTable)
      .values({
        orderId: orderId ?? null,
        splitRef: splitRef ?? null,
        transactionType: "payment",
        amountRequested: parseFloat(amount).toFixed(2),
        status: deviceResult.status,
        deviceTransactionId: deviceResult.deviceTransactionId,
        employeeId,
        terminalName: terminalName ?? "Caja principal",
        deviceId: cfg.deviceId,
      })
      .returning();

    res.status(201).json({ transaction: txRow });
  },
);

// ─── Payments: Poll ───────────────────────────────────────────────────────────

async function reconcileCompletedPayment(
  transaction: typeof cashMachineTransactionsTable.$inferSelect,
) {
  if (!transaction.orderId || !transaction.employeeId) return null;
  const methodId = await ensurePaymentMethod();
  const netAmount = (
    parseFloat(transaction.amountReceived ?? "0")
    - parseFloat(transaction.changeDispensed ?? "0")
  ).toFixed(2);
  const [openSession] = await db
    .select({ id: cashSessionsTable.id })
    .from(cashSessionsTable)
    .where(eq(cashSessionsTable.status, "open"))
    .limit(1);

  return settleOrderIfFullyPaid({
    orderId: transaction.orderId,
    employeeId: transaction.employeeId,
    cashSessionId: openSession?.id ?? null,
    payment: {
      paymentMethodId: methodId,
      amount: netAmount,
      reference: transaction.id,
    },
  });
}

router.get(
  "/cash-machine/payments/:id",
  requireAuth,
  requireRole(...PAYMENT_ROLES),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;

    const [txRow] = await db
      .select()
      .from(cashMachineTransactionsTable)
      .where(eq(cashMachineTransactionsTable.id, id));

    if (!txRow) {
      res.status(404).json({ error: "Transacción no encontrada" });
      return;
    }

    const TERMINAL_STATUSES = ["completada", "cancelada", "tiempo_agotado", "error", "intervencion_manual"];
    if (TERMINAL_STATUSES.includes(txRow.status)) {
      if (txRow.status === "completada" && txRow.orderId && txRow.employeeId) {
        try {
          const settlement = await reconcileCompletedPayment(txRow);
          res.json({ transaction: txRow, settlement });
        } catch (error) {
          res.status(500).json({
            error: "El cobro está registrado y su liquidación fiscal sigue pendiente. Reintenta.",
            transaction: txRow,
            needsReconciliation: true,
          });
        }
        return;
      }
      res.json({ transaction: txRow });
      return;
    }

    if (!txRow.deviceTransactionId) {
      res.json({ transaction: txRow });
      return;
    }

    // Poll adapter for live status
    let deviceStatus;
    try {
      deviceStatus = await adapterRegistry.getAdapter().getPaymentStatus(txRow.deviceTransactionId);
    } catch (err: any) {
      res.status(503).json({ error: err?.message ?? "Device unreachable" });
      return;
    }

    const isNowTerminal = TERMINAL_STATUSES.includes(deviceStatus.status);
    const wasNotTerminal = !TERMINAL_STATUSES.includes(txRow.status);
    const justCompleted  = isNowTerminal && wasNotTerminal && deviceStatus.status === "completada";

    const [updated] = await db
      .update(cashMachineTransactionsTable)
      .set({
        status: deviceStatus.status,
        amountReceived: deviceStatus.amountReceived,
        changeDispensed: deviceStatus.changeDispensed,
        deviceError: deviceStatus.deviceError ?? null,
        ...(isNowTerminal ? { completedAt: new Date() } : {}),
      })
      .where(eq(cashMachineTransactionsTable.id, id))
      .returning();

    // If just completed and we have an order, record the payment then settle.
    // Payment insert is idempotent via `reference` unique index + ON CONFLICT DO NOTHING.
    // Settlement (`settleOrderIfFullyPaid`) is idempotent via the order.status guard.
    // Both guards together make concurrent polls safe.
    let settlementResult = null;
    if (justCompleted && txRow.orderId && txRow.employeeId) {
      try {
        settlementResult = await reconcileCompletedPayment({
          ...txRow,
          ...updated,
        });

        // Notify floor plan clients
        if (settlementResult?.settled) {
          try { emitToFunction("floor", "tables:refresh"); } catch { /* socket not init */ }
        }
      } catch (settleErr: any) {
        // Settlement failure is surfaced to the caller so the frontend can show
        // an explicit warning rather than silently accepting a half-completed state.
        // The device transaction is already recorded so reconciliation is possible.
        console.error(
          `[cash-machine] Settlement failed for tx ${txRow.id} / order ${txRow.orderId}:`,
          settleErr?.message ?? settleErr,
        );
        // Update the cash-machine tx to a special status so admin panel can identify it
        await db
          .update(cashMachineTransactionsTable)
          .set({ deviceError: `Settlement error: ${settleErr?.message ?? "unknown"}` })
          .where(eq(cashMachineTransactionsTable.id, txRow.id));
        res.status(500).json({
          error: "El cobro fue registrado por la máquina pero no se pudo liquidar el pedido. Contacta con soporte.",
          transaction: updated,
          needsReconciliation: true,
        });
        return;
      }
    }

    res.json({ transaction: updated, settlement: settlementResult });
  },
);

// ─── Payments: Cancel ─────────────────────────────────────────────────────────

router.post(
  "/cash-machine/payments/:id/cancel",
  requireAuth,
  requireRole(...PAYMENT_ROLES),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;

    const [txRow] = await db
      .select()
      .from(cashMachineTransactionsTable)
      .where(eq(cashMachineTransactionsTable.id, id));

    if (!txRow) {
      res.status(404).json({ error: "Transacción no encontrada" });
      return;
    }

    const NON_CANCELLABLE = ["completada", "cancelada", "tiempo_agotado", "error"];
    if (NON_CANCELLABLE.includes(txRow.status)) {
      res.status(409).json({ error: "La transacción ya no se puede cancelar" });
      return;
    }

    if (!txRow.deviceTransactionId) {
      const [updated] = await db
        .update(cashMachineTransactionsTable)
        .set({ status: "cancelada", completedAt: new Date() })
        .where(eq(cashMachineTransactionsTable.id, id))
        .returning();
      res.json({ transaction: updated });
      return;
    }

    let deviceResult;
    try {
      deviceResult = await adapterRegistry.getAdapter().cancelPayment(txRow.deviceTransactionId);
    } catch (err: any) {
      res.status(503).json({ error: err?.message ?? "Device unreachable" });
      return;
    }

    // If cash was inserted but couldn't be returned → manual intervention required
    const finalStatus =
      deviceResult.status === "cancelada"
        ? "cancelada"
        : parseFloat(deviceResult.amountReceived) > 0
          ? "intervencion_manual"
          : "cancelada";

    const [updated] = await db
      .update(cashMachineTransactionsTable)
      .set({
        status: finalStatus,
        amountReceived: deviceResult.amountReceived,
        changeDispensed: deviceResult.changeDispensed,
        completedAt: new Date(),
      })
      .where(eq(cashMachineTransactionsTable.id, id))
      .returning();

    res.json({ transaction: updated });
  },
);

// ─── Refunds ──────────────────────────────────────────────────────────────────

router.post(
  "/cash-machine/refunds",
  requireAuth,
  requireRole(...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const employeeId = (req as any).user?.id as string;
    const { orderId, amount, splitRef, terminalName } = req.body as {
      orderId?: string;
      amount: string;
      splitRef?: string;
      terminalName?: string;
    };

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      res.status(400).json({ error: "Importe inválido" });
      return;
    }

    const cfg = await getConfig();
    if (!cfg?.enabled) {
      res.status(503).json({ error: "La caja automática no está habilitada" });
      return;
    }

    const scenario = req.headers["x-simulator-scenario"] as string | undefined;
    if (scenario) adapterRegistry.setScenario(scenario);

    // Create pending transaction record
    const [txRow] = await db
      .insert(cashMachineTransactionsTable)
      .values({
        orderId: orderId ?? null,
        splitRef: splitRef ?? null,
        transactionType: "refund",
        amountRequested: parseFloat(amount).toFixed(2),
        status: "iniciando",
        deviceId: cfg.deviceId,
        terminalName: terminalName ?? "Caja principal",
        employeeId,
      })
      .returning();

    let deviceResult;
    try {
      deviceResult = await adapterRegistry.getAdapter().refund(
        parseFloat(amount).toFixed(2),
        orderId ?? `refund-${txRow.id}`,
      );
    } catch (err: any) {
      await db
        .update(cashMachineTransactionsTable)
        .set({ status: "error", deviceError: err?.message, completedAt: new Date() })
        .where(eq(cashMachineTransactionsTable.id, txRow.id));
      res.status(503).json({ error: err?.message ?? "Device unreachable" });
      return;
    }

    const finalStatus = deviceResult.status === "completada" ? "completada" : "error";
    const [updated] = await db
      .update(cashMachineTransactionsTable)
      .set({
        status: finalStatus,
        changeDispensed: deviceResult.status === "completada" ? parseFloat(amount).toFixed(2) : "0",
        deviceError: deviceResult.deviceError ?? null,
        completedAt: new Date(),
      })
      .where(eq(cashMachineTransactionsTable.id, txRow.id))
      .returning();

    if (finalStatus === "error") {
      res.status(422).json({ error: deviceResult.deviceError ?? "Refund failed", transaction: updated });
      return;
    }

    res.status(201).json({ transaction: updated });
  },
);

// ─── Transaction audit log ────────────────────────────────────────────────────

router.get(
  "/cash-machine/transactions",
  requireAuth,
  requireRole(...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const limit = Math.min(parseInt(req.query.limit as string ?? "50"), 200);
    const offset = parseInt(req.query.offset as string ?? "0");

    const rows = await db
      .select({
        id: cashMachineTransactionsTable.id,
        orderId: cashMachineTransactionsTable.orderId,
        transactionType: cashMachineTransactionsTable.transactionType,
        amountRequested: cashMachineTransactionsTable.amountRequested,
        amountReceived: cashMachineTransactionsTable.amountReceived,
        changeDispensed: cashMachineTransactionsTable.changeDispensed,
        status: cashMachineTransactionsTable.status,
        terminalName: cashMachineTransactionsTable.terminalName,
        startedAt: cashMachineTransactionsTable.startedAt,
        completedAt: cashMachineTransactionsTable.completedAt,
        deviceError: cashMachineTransactionsTable.deviceError,
        employeeName: employeesTable.name,
      })
      .from(cashMachineTransactionsTable)
      .leftJoin(employeesTable, eq(cashMachineTransactionsTable.employeeId, employeesTable.id))
      .orderBy(desc(cashMachineTransactionsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(rows);
  },
);

// ─── Cash session reconciliation ──────────────────────────────────────────────
// Returns cash machine totals alongside the cash session totals for Z/X-report.

router.get(
  "/cash-sessions/:id/cash-machine-summary",
  requireAuth,
  requireRole(...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const sessionId = req.params.id as string;

    const [session] = await db
      .select({ openedAt: cashSessionsTable.openedAt, closedAt: cashSessionsTable.closedAt })
      .from(cashSessionsTable)
      .where(eq(cashSessionsTable.id, sessionId));

    if (!session) {
      res.status(404).json({ error: "Sesión no encontrada" });
      return;
    }

    const from = session.openedAt;
    const to   = session.closedAt ?? new Date();

    // All cash machine transactions during this session window
    const txRows = await db
      .select()
      .from(cashMachineTransactionsTable)
      .where(
        and(
          // started_at between session open and close
          // Drizzle doesn't have between for timestamps; use gte/lte
          eq(cashMachineTransactionsTable.status, "completada"),
        ),
      )
      .orderBy(cashMachineTransactionsTable.startedAt);

    // Filter by time window in JS (simpler than raw SQL for now)
    const sessionTx = txRows.filter(
      (t) =>
        t.startedAt >= from &&
        (!session.closedAt || t.startedAt <= to),
    );

    const payments = sessionTx.filter((t) => t.transactionType === "payment");
    const refunds  = sessionTx.filter((t) => t.transactionType === "refund");

    const tpvCashTotal = await db
      .select({ total: sum(paymentsTable.amount) })
      .from(paymentsTable)
      .innerJoin(paymentMethodsTable, eq(paymentsTable.paymentMethodId, paymentMethodsTable.id))
      .where(
        and(
          eq(paymentsTable.cashSessionId, sessionId),
          eq(paymentMethodsTable.code, "cash_machine"),
        ),
      );

    // Net cash the device actually collected (received − change given back)
    const grossReceived  = payments.reduce((s, t) => s + parseFloat(t.amountReceived), 0);
    const changeOut      = payments.reduce((s, t) => s + parseFloat(t.changeDispensed), 0);
    const refundsOut     = refunds.reduce((s, t) => s + parseFloat(t.changeDispensed), 0);
    const deviceNet      = grossReceived - changeOut - refundsOut;

    // TPV total: sum of cash_machine payment rows (already stored as net amounts)
    const tpvTotal       = parseFloat(tpvCashTotal[0]?.total ?? "0");

    // Difference: positive → device holds more than TPV recorded; negative → under
    const difference     = deviceNet - tpvTotal;

    res.json({
      enabled: !!(await getConfig())?.enabled,
      tpvTotal:        tpvTotal.toFixed(2),
      deviceTotal:     deviceNet.toFixed(2),   // net device position
      grossReceived:   grossReceived.toFixed(2),
      changeDispensed: changeOut.toFixed(2),
      refundsDispensed: refundsOut.toFixed(2),
      difference:      difference.toFixed(2),
      transactionCount: payments.length,
    });
  },
);

export default router;
