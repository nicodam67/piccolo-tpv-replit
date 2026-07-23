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
import { idempotency, invalidateIdempotencyCacheKey } from "../middlewares/idempotency";
import { logDocumentAction } from "../lib/document-audit";

const ADMIN_ROLES   = ["admin"];
const MANAGER_ROLES = ["manager", "admin"];
const PAYMENT_ROLES = ["waiter", "cashier", "encargado", "manager", "admin"];
const CASH_MACHINE_IN_FLIGHT = [
  "pending", "iniciando", "esperando_efectivo", "efectivo_parcial",
  "devolviendo_cambio", "conciliando", "conciliacion_pendiente",
] as const;

const router: IRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getConfig() {
  const [cfg] = await db.select().from(cashMachineConfigTable).limit(1);
  return cfg ?? null;
}

function cashMachineConfigDto(config: typeof cashMachineConfigTable.$inferSelect) {
  const { credentialKey: _credential, ...safe } = config;
  return { ...safe, hasCredential: Boolean(_credential) };
}

function transactionIdempotencyCacheKey(transaction: {
  employeeId: string | null;
  splitRef: string | null;
}): string | null {
  if (!transaction.employeeId || !transaction.splitRef?.startsWith("idem:")) return null;
  const idempotencyKey = transaction.splitRef.slice(5).split("|split:", 1)[0];
  return `${transaction.employeeId}:${idempotencyKey}`;
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
        timeoutMs: 30000,
        enabled: false,
        hasCredential: false,
      });
      return;
    }
    res.json(cashMachineConfigDto(cfg));
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
    if (
      process.env["NODE_ENV"] === "production"
      && (enabled === true || existing?.enabled)
      && (manufacturer ?? existing?.manufacturer ?? "simulator") === "simulator"
    ) {
      res.status(503).json({ error: "No se puede habilitar una caja simulada en producción" });
      return;
    }

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
      await logDocumentAction({
        action: "cash_machine_config_updated",
        documentType: "config",
        documentId: row.id,
        employeeId: req.user?.id,
        employeeName: req.user?.name ?? "",
        details: "Configuración creada; credencial omitida de auditoría",
      });
      res.status(201).json(cashMachineConfigDto(row));
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

    await logDocumentAction({
      action: "cash_machine_config_updated",
      documentType: "config",
      documentId: updated.id,
      employeeId: req.user?.id,
      employeeName: req.user?.name ?? "",
      details: `Campos actualizados: ${Object.keys(updates).filter((key) => key !== "credentialKey").join(", ")}`,
    });
    res.json(cashMachineConfigDto(updated));
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
      if (["paid", "completed"].includes(order.status)) {
        res.status(409).json({ error: "El pedido ya está cobrado o cerrado" });
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
          ...(orderId ? [`order-critical:${orderId}`] : []),
          ...(orderForLock?.tableId ? [`cash-machine:table:${orderForLock.tableId}`] : []),
          ...(splitRef ? [`cash-machine:split:${splitRef}`] : []),
        ].sort();
        for (const key of lockKeys) {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
        }
        if (orderId) {
          const [lockedOrder] = await tx.select({ status: ordersTable.status })
            .from(ordersTable)
            .where(eq(ordersTable.id, orderId))
            .for("update");
          if (!lockedOrder || ["paid", "completed"].includes(lockedOrder.status)) {
            throw new Error("ORDER_ALREADY_PAID");
          }
        }
        const [inflight] = await tx.select({
          id: cashMachineTransactionsTable.id,
          transactionType: cashMachineTransactionsTable.transactionType,
          status: cashMachineTransactionsTable.status,
          deviceId: cashMachineTransactionsTable.deviceId,
          orderId: cashMachineTransactionsTable.orderId,
          splitRef: cashMachineTransactionsTable.splitRef,
          terminalName: cashMachineTransactionsTable.terminalName,
        })
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
        if (
          inflight
          && inflight.transactionType === "payment"
          && (CASH_MACHINE_IN_FLIGHT as readonly string[]).includes(inflight.status)
        ) throw new Error("CASH_MACHINE_IN_FLIGHT");
        const [pending] = await tx.insert(cashMachineTransactionsTable).values({
        orderId: orderId ?? null,
        splitRef: `idem:${requestKey}${splitRef ? `|split:${splitRef}` : ""}`,
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
      if (error instanceof Error && error.message === "ORDER_ALREADY_PAID") {
        res.status(409).json({ error: "El pedido ya está cobrado" });
        return;
      }
      throw error;
    }

    try {
      const deviceResult = await adapter.startPayment(
        parseFloat(amount).toFixed(2),
        txRow.id,
      );
      const [updatedStart] = await db.update(cashMachineTransactionsTable).set({
        status: deviceResult.status,
        deviceTransactionId: deviceResult.deviceTransactionId,
      }).where(eq(cashMachineTransactionsTable.id, txRow.id)).returning();
      const started = updatedStart ?? {
        ...txRow,
        status: deviceResult.status,
        deviceTransactionId: deviceResult.deviceTransactionId,
      };
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
    if (txRow.transactionType !== "payment") {
      res.status(400).json({ error: "La transacción no es un cobro" });
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
        status: justCompleted && txRow.orderId ? "conciliando" : deviceStatus.status,
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
        const physicalOrderId = txRow.orderId;
        const physicalEmployeeId = txRow.employeeId;
        const methodId = await ensurePaymentMethod();
        const netAmount = (
          parseFloat(deviceStatus.amountReceived) - parseFloat(deviceStatus.changeDispensed)
        ).toFixed(2);
        const [openSession] = await db
          .select({ id: cashSessionsTable.id })
          .from(cashSessionsTable)
          .where(eq(cashSessionsTable.status, "open"))
          .limit(1);

        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"order-critical:" + physicalOrderId}))`);
          const [lockedOrder] = await tx.select({ status: ordersTable.status })
            .from(ordersTable)
            .where(eq(ordersTable.id, physicalOrderId))
            .for("update");
          const [existingPayment] = await tx.select({ id: paymentsTable.id })
            .from(paymentsTable)
            .where(eq(paymentsTable.reference, txRow.id))
            .limit(1);
          if (lockedOrder?.status === "paid" && !existingPayment) {
            throw new Error("ORDER_PAID_BEFORE_PHYSICAL_RECONCILIATION");
          }
          await tx.insert(paymentsTable).values({
            orderId:         physicalOrderId,
            paymentMethodId: methodId,
            amount:          netAmount,
            employeeId:      physicalEmployeeId,
            reference:       txRow.id,   // idempotency key — unique index enforces exactly-once
            ...(openSession ? { cashSessionId: openSession.id } : {}),
          }).onConflictDoNothing();
          await tx.update(cashMachineTransactionsTable).set({
            status: "conciliando",
            amountReceived: deviceStatus.amountReceived,
            changeDispensed: deviceStatus.changeDispensed,
          }).where(eq(cashMachineTransactionsTable.id, txRow.id));
        });

        // Settle the order (ticket issuance + order→paid + table→free)
        settlementResult = await settleOrderIfFullyPaid({
          orderId:       physicalOrderId,
          employeeId:    physicalEmployeeId,
          cashSessionId: openSession?.id ?? null,
        });
        [updated] = await db.update(cashMachineTransactionsTable).set({
          status: "completada",
          deviceError: null,
          completedAt: new Date(),
        }).where(eq(cashMachineTransactionsTable.id, txRow.id)).returning();

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

    const NON_CANCELLABLE = ["completada", "cancelada", "tiempo_agotado", "error", "conciliando", "conciliacion_pendiente"];
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

router.post(
  "/cash-machine/payments/:id/reconcile",
  requireAuth,
  requireRole("manager", "admin"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const [current] = await db.select().from(cashMachineTransactionsTable)
      .where(eq(cashMachineTransactionsTable.id, id))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "Transacción no encontrada" });
      return;
    }
    if (current.status !== "conciliacion_pendiente") {
      res.status(409).json({ error: "La transacción no requiere conciliación" });
      return;
    }
    if (current.transactionType === "refund") {
      try {
        const result = await adapterRegistry.getAdapter().refund(current.amountRequested, current.id);
        const [refund] = await db.update(cashMachineTransactionsTable).set({
          status: result.status === "completada" ? "completada" : "error",
          changeDispensed: result.status === "completada" ? current.amountRequested : "0",
          deviceError: result.deviceError ?? null,
          completedAt: new Date(),
        }).where(eq(cashMachineTransactionsTable.id, id)).returning();
        const cacheKey = transactionIdempotencyCacheKey(current);
        if (cacheKey) {
          await db.update(idempotencyKeysTable).set({
            statusCode: result.status === "completada" ? 200 : 422,
            response: { transaction: refund },
          }).where(eq(idempotencyKeysTable.cacheKey, cacheKey));
          invalidateIdempotencyCacheKey(cacheKey);
        }
        res.status(result.status === "completada" ? 200 : 422).json({ transaction: refund });
      } catch {
        res.status(202).json({ transaction: current, reconciliationRequired: true });
      }
      return;
    }
    if (current.transactionType !== "payment") {
      res.status(409).json({ error: "Tipo de transacción no conciliable" });
      return;
    }
    const [updated] = await db.update(cashMachineTransactionsTable).set({
      status: current.deviceTransactionId ? "iniciando" : "pending",
      deviceError: null,
    }).where(eq(cashMachineTransactionsTable.id, id)).returning();
    const cacheKey = transactionIdempotencyCacheKey(current);
    if (cacheKey) {
      await db.update(idempotencyKeysTable).set({
        statusCode: 202,
        response: { transaction: updated, recovering: true },
      }).where(eq(idempotencyKeysTable.cacheKey, cacheKey));
      invalidateIdempotencyCacheKey(cacheKey);
    }
    await logDocumentAction({
      action: "cash_machine_reconciliation_started",
      documentType: "cash_machine",
      documentId: id,
      employeeId: req.user?.id,
      employeeName: req.user?.name ?? "",
      details: "Reconciliación manual iniciada",
    });
    res.status(202).json({ transaction: updated, recovering: true });
  },
);

// ─── Refunds ──────────────────────────────────────────────────────────────────

router.post(
  "/cash-machine/refunds",
  requireAuth,
  requireRole(...MANAGER_ROLES),
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
    let refundAdapter;
    try {
      refundAdapter = adapterRegistry.getAdapter();
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : "Conector no configurado" });
      return;
    }

    const terminal = terminalName ?? "Caja principal";
    const txRow = await db.transaction(async (tx) => {
      for (const key of [
        `cash-machine:device:${cfg.deviceId}`,
        `cash-machine:refund:${requestKey}`,
        ...(orderId ? [`order-critical:${orderId}`] : []),
      ].sort()) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
      }
      const [inflight] = await tx.select({
        id: cashMachineTransactionsTable.id,
        transactionType: cashMachineTransactionsTable.transactionType,
        status: cashMachineTransactionsTable.status,
      })
        .from(cashMachineTransactionsTable)
        .where(and(
          eq(cashMachineTransactionsTable.transactionType, "refund"),
          eq(cashMachineTransactionsTable.deviceId, cfg.deviceId),
          inArray(cashMachineTransactionsTable.status, [...CASH_MACHINE_IN_FLIGHT]),
        ))
        .limit(1);
      if (
        inflight
        && inflight.transactionType === "refund"
        && (CASH_MACHINE_IN_FLIGHT as readonly string[]).includes(inflight.status)
      ) throw new Error("REFUND_IN_FLIGHT");
      const [pending] = await tx.insert(cashMachineTransactionsTable).values({
        orderId: orderId ?? null,
        splitRef: `idem:${requestKey}${splitRef ? `|split:${splitRef}` : ""}`,
        transactionType: "refund",
        amountRequested: parseFloat(amount).toFixed(2),
        status: "pending",
        deviceId: cfg.deviceId,
        terminalName: terminal,
        employeeId,
      }).returning();
      await tx.insert(idempotencyKeysTable).values({
        cacheKey: `${req.user!.id}:${requestKey}`,
        userId: req.user!.id,
        statusCode: 202,
        response: { transaction: pending },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      }).onConflictDoNothing();
      return pending;
    }).catch((error) => {
      if (error instanceof Error && error.message === "REFUND_IN_FLIGHT") return null;
      throw error;
    });
    if (!txRow) {
      res.status(409).json({ error: "Ya existe una devolución física en curso" });
      return;
    }

    let deviceResult;
    try {
      const scenario = req.headers["x-simulator-scenario"] as string | undefined;
      if (scenario) adapterRegistry.setScenario(scenario);
      deviceResult = await refundAdapter.refund(
        parseFloat(amount).toFixed(2),
        txRow.id,
      );
    } catch (err: any) {
      const [unknown] = await db
        .update(cashMachineTransactionsTable)
        .set({ status: "conciliacion_pendiente", deviceError: "Resultado de devolución desconocido" })
        .where(eq(cashMachineTransactionsTable.id, txRow.id))
        .returning();
      await db.update(idempotencyKeysTable).set({
        statusCode: 202,
        response: { transaction: unknown, reconciliationRequired: true },
      }).where(eq(idempotencyKeysTable.cacheKey, `${req.user!.id}:${requestKey}`));
      res.status(202).json({ transaction: unknown, reconciliationRequired: true });
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
      await db.update(idempotencyKeysTable).set({
        statusCode: 422,
        response: { error: deviceResult.deviceError ?? "Refund failed", transaction: updated },
      }).where(eq(idempotencyKeysTable.cacheKey, `${req.user!.id}:${requestKey}`));
      res.status(422).json({ error: deviceResult.deviceError ?? "Refund failed", transaction: updated });
      return;
    }

    await db.update(idempotencyKeysTable).set({
      statusCode: 201,
      response: { transaction: updated },
    }).where(eq(idempotencyKeysTable.cacheKey, `${req.user!.id}:${requestKey}`));
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
