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
  idempotencyKeysTable,
  restaurantTablesTable,
} from "@workspace/db";
import { eq, and, desc, sum, inArray, or, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { adapterRegistry } from "../lib/cash-machine/registry";
import { settleOrderIfFullyPaid } from "../lib/settle-order";
import { emitToFunction } from "../lib/socket-events";
import { idempotency } from "../middlewares/idempotency";

const ADMIN_ROLES   = ["admin"];
const MANAGER_ROLES = ["manager", "admin"];
const PAYMENT_ROLES = ["waiter", "cashier", "encargado", "manager", "admin"];
const CASH_MACHINE_IN_FLIGHT = [
  "pending", "iniciando", "esperando_efectivo", "efectivo_parcial",
  "devolviendo_cambio", "conciliacion_pendiente",
] as const;

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
    try {
      const scenario = req.headers["x-simulator-scenario"] as string | undefined;
      if (scenario) adapterRegistry.setScenario(scenario);
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
  idempotency,
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
    const requestKey = req.headers["idempotency-key"];
    if (typeof requestKey !== "string") {
      res.status(400).json({ error: "Idempotency-Key es obligatoria" });
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
        .select({ id: ordersTable.id, status: ordersTable.status, tableId: ordersTable.tableId })
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

    let adapter;
    try {
      adapter = adapterRegistry.getAdapter();
      const scenario = req.headers["x-simulator-scenario"] as string | undefined;
      if (scenario) adapterRegistry.setScenario(scenario);
    } catch (err: any) {
      res.status(503).json({ error: err?.message ?? "Conector no configurado" });
      return;
    }

    const terminal = terminalName ?? "Caja principal";
    const [orderForLock] = orderId
      ? await db.select({ tableId: ordersTable.tableId }).from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1)
      : [{ tableId: null }];

    let txRow;
    try {
      txRow = await db.transaction(async (tx) => {
        const lockKeys = [
          `cash-machine:device:${cfg.deviceId}`,
          `cash-machine:reference:${requestKey}`,
          `cash-machine:terminal:${terminal}`,
          ...(orderId ? [`cash-machine:order:${orderId}`] : []),
          ...(orderForLock?.tableId ? [`cash-machine:table:${orderForLock.tableId}`] : []),
          ...(splitRef ? [`cash-machine:split:${splitRef}`] : []),
        ].sort();
        for (const key of lockKeys) {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
        }
        const [inflight] = await tx.select({ id: cashMachineTransactionsTable.id })
          .from(cashMachineTransactionsTable)
          .where(and(
            eq(cashMachineTransactionsTable.transactionType, "payment"),
            inArray(cashMachineTransactionsTable.status, [...CASH_MACHINE_IN_FLIGHT]),
            or(
              eq(cashMachineTransactionsTable.deviceId, cfg.deviceId),
              eq(cashMachineTransactionsTable.terminalName, terminal),
              ...(orderId ? [eq(cashMachineTransactionsTable.orderId, orderId)] : []),
              ...(splitRef ? [eq(cashMachineTransactionsTable.splitRef, splitRef)] : []),
            ),
          ))
          .limit(1);
        if (inflight) throw new Error("CASH_MACHINE_IN_FLIGHT");
        const [pending] = await tx.insert(cashMachineTransactionsTable).values({
        orderId: orderId ?? null,
        splitRef: splitRef ?? null,
        transactionType: "payment",
        amountRequested: parseFloat(amount).toFixed(2),
        status: "pending",
        deviceTransactionId: null,
        employeeId,
        terminalName: terminal,
        deviceId: cfg.deviceId,
        }).returning();
        await tx.insert(idempotencyKeysTable).values({
          cacheKey: `${req.user!.id}:${requestKey}`,
          userId: req.user!.id,
          statusCode: 202,
          response: { transaction: pending },
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
        }).onConflictDoNothing();
        return pending;
      });
    } catch (error) {
      if (error instanceof Error && error.message === "CASH_MACHINE_IN_FLIGHT") {
        res.status(409).json({ error: "Ya existe un cobro físico pendiente de conciliación" });
        return;
      }
      throw error;
    }

    try {
      const deviceResult = await adapter.startPayment(
        parseFloat(amount).toFixed(2),
        txRow.id,
      );
      const [started] = await db.update(cashMachineTransactionsTable).set({
        status: deviceResult.status,
        deviceTransactionId: deviceResult.deviceTransactionId,
      }).where(eq(cashMachineTransactionsTable.id, txRow.id)).returning();
      await db.update(idempotencyKeysTable).set({
        statusCode: 201,
        response: { transaction: started },
      }).where(eq(idempotencyKeysTable.cacheKey, `${req.user!.id}:${requestKey}`));
      res.status(201).json({ transaction: started });
    } catch (err: any) {
      const [unknown] = await db.update(cashMachineTransactionsTable).set({
        status: "conciliacion_pendiente",
        deviceError: "Resultado físico desconocido; requiere conciliación",
      }).where(eq(cashMachineTransactionsTable.id, txRow.id)).returning();
      await db.update(idempotencyKeysTable).set({
        statusCode: 202,
        response: { transaction: unknown, reconciliationRequired: true },
      }).where(eq(idempotencyKeysTable.cacheKey, `${req.user!.id}:${requestKey}`));
      res.status(202).json({ transaction: unknown, reconciliationRequired: true });
    }
  },
);

// ─── Payments: Poll ───────────────────────────────────────────────────────────

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
    if (txRow.status === "conciliacion_pendiente") {
      res.status(202).json({ transaction: txRow, reconciliationRequired: true });
      return;
    }
    if (TERMINAL_STATUSES.includes(txRow.status) && txRow.status !== "completada") {
      res.json({ transaction: txRow });
      return;
    }

    if (!txRow.deviceTransactionId) {
      try {
        const restarted = await adapterRegistry.getAdapter().startPayment(
          txRow.amountRequested,
          txRow.id,
        );
        const [resumed] = await db.update(cashMachineTransactionsTable).set({
          status: restarted.status,
          deviceTransactionId: restarted.deviceTransactionId,
          deviceError: null,
        }).where(eq(cashMachineTransactionsTable.id, id)).returning();
        res.status(202).json({ transaction: resumed, recovering: true });
      } catch {
        const [unknown] = await db.update(cashMachineTransactionsTable).set({
          status: "conciliacion_pendiente",
          deviceError: "No se pudo confirmar si el dispositivo inició el cobro",
        }).where(eq(cashMachineTransactionsTable.id, id)).returning();
        res.status(202).json({ transaction: unknown, reconciliationRequired: true });
      }
      return;
    }

    let deviceStatus;
    let updated = txRow;
    let justCompleted = txRow.status === "completada";
    if (txRow.status === "completada") {
      deviceStatus = {
        status: txRow.status,
        amountReceived: txRow.amountReceived,
        changeDispensed: txRow.changeDispensed,
        deviceError: txRow.deviceError,
      };
    } else {
      try {
        deviceStatus = await adapterRegistry.getAdapter().getPaymentStatus(txRow.deviceTransactionId);
      } catch {
        const [unknown] = await db.update(cashMachineTransactionsTable).set({
          status: "conciliacion_pendiente",
          deviceError: "Desconexión durante confirmación física",
        }).where(eq(cashMachineTransactionsTable.id, id)).returning();
        res.status(202).json({ transaction: unknown, reconciliationRequired: true });
        return;
      }
      const isNowTerminal = TERMINAL_STATUSES.includes(deviceStatus.status);
      justCompleted = isNowTerminal && deviceStatus.status === "completada";
      [updated] = await db.update(cashMachineTransactionsTable).set({
        status: deviceStatus.status,
        amountReceived: deviceStatus.amountReceived,
        changeDispensed: deviceStatus.changeDispensed,
        deviceError: deviceStatus.deviceError ?? null,
        ...(isNowTerminal ? { completedAt: new Date() } : {}),
      }).where(eq(cashMachineTransactionsTable.id, id)).returning();
    }

    // If just completed and we have an order, record the payment then settle.
    // Payment insert is idempotent via `reference` unique index + ON CONFLICT DO NOTHING.
    // Settlement (`settleOrderIfFullyPaid`) is idempotent via the order.status guard.
    // Both guards together make concurrent polls safe.
    let settlementResult = null;
    if (justCompleted && txRow.orderId && txRow.employeeId) {
      try {
        const methodId = await ensurePaymentMethod();
        const netAmount = (
          parseFloat(deviceStatus.amountReceived) - parseFloat(deviceStatus.changeDispensed)
        ).toFixed(2);
        const [openSession] = await db
          .select({ id: cashSessionsTable.id })
          .from(cashSessionsTable)
          .where(eq(cashSessionsTable.status, "open"))
          .limit(1);

        // Insert payment (idempotent)
        await db
          .insert(paymentsTable)
          .values({
            orderId:         txRow.orderId,
            paymentMethodId: methodId,
            amount:          netAmount,
            employeeId:      txRow.employeeId,
            reference:       txRow.id,   // idempotency key — unique index enforces exactly-once
            ...(openSession ? { cashSessionId: openSession.id } : {}),
          })
          .onConflictDoNothing();

        // Settle the order (ticket issuance + order→paid + table→free)
        settlementResult = await settleOrderIfFullyPaid({
          orderId:       txRow.orderId,
          employeeId:    txRow.employeeId,
          cashSessionId: openSession?.id ?? null,
        });

        // Notify floor plan clients
        if (settlementResult.settled) {
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
        const [unknown] = await db
          .update(cashMachineTransactionsTable)
          .set({
            status: "conciliacion_pendiente",
            deviceError: `Settlement error: ${settleErr?.message ?? "unknown"}`,
          })
          .where(eq(cashMachineTransactionsTable.id, txRow.id))
          .returning();
        res.status(202).json({
          error: "Resultado físico pendiente de conciliación.",
          transaction: unknown,
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

    const NON_CANCELLABLE = ["completada", "cancelada", "tiempo_agotado", "error", "conciliacion_pendiente"];
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
      const [unknown] = await db.update(cashMachineTransactionsTable).set({
        status: "conciliacion_pendiente",
        deviceError: "Cancelación física sin confirmación",
      }).where(eq(cashMachineTransactionsTable.id, id)).returning();
      res.status(202).json({ transaction: unknown, reconciliationRequired: true });
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
      const scenario = req.headers["x-simulator-scenario"] as string | undefined;
      if (scenario) adapterRegistry.setScenario(scenario);
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
