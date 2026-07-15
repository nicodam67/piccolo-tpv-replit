import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  cashSessionsTable,
  cashMovementsTable,
  paymentsTable,
  paymentMethodsTable,
  employeesTable,
  discountsTable,
  tipsTable,
  paymentVoidsTable,
} from "@workspace/db";
import { eq, and, desc, sum, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logDocumentAction } from "../lib/document-audit";

// Roles allowed to manage cash sessions
const CASH_MANAGER_ROLES = ["manager", "admin"];

const router: IRouter = Router();

// GET /payment-methods — list all active payment methods
router.get("/payment-methods", requireAuth, async (_req, res): Promise<void> => {
  const methods = await db
    .select()
    .from(paymentMethodsTable)
    .where(eq(paymentMethodsTable.active, true))
    .orderBy(paymentMethodsTable.sortOrder);
  res.json(methods);
});

// POST /cash-sessions/open
router.post(
  "/cash-sessions/open",
  requireAuth,
  requireRole(...CASH_MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const employeeId = (req as any).user?.id as string;
    const {
      openingFloat = "0",
      terminalName = "Caja principal",
      blindClose = false,
      notes,
    } = req.body as {
      openingFloat?: string;
      terminalName?: string;
      blindClose?: boolean;
      notes?: string;
    };

    // Enforce unique open session per terminal
    const [existing] = await db
      .select()
      .from(cashSessionsTable)
      .where(
        and(
          eq(cashSessionsTable.status, "open"),
          eq(cashSessionsTable.terminalName, terminalName),
        ),
      )
      .limit(1);

    if (existing) {
      res.status(409).json({
        error: `Ya hay una sesión abierta en "${terminalName}". Ciérrala primero.`,
      });
      return;
    }

    const [session] = await db
      .insert(cashSessionsTable)
      .values({ employeeId, openingFloat, terminalName, blindClose, notes: notes ?? null, status: "open" })
      .returning();

    await logDocumentAction({
      action: "open_cash_session",
      documentType: "ticket",
      documentId: session.id,
      employeeId,
      employeeName: (req as any).user?.name ?? "",
      terminal: terminalName,
      amount: openingFloat,
      details: `Apertura de caja en ${terminalName}. Fondo: ${parseFloat(openingFloat).toFixed(2)}€`,
    });

    res.status(201).json(session);
  },
);

// GET /cash-sessions/current — optionally filter by ?terminal=
router.get("/cash-sessions/current", requireAuth, async (req, res): Promise<void> => {
  const terminal = req.query.terminal as string | undefined;

  const conditions = terminal
    ? and(eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.terminalName, terminal))
    : eq(cashSessionsTable.status, "open");

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(conditions)
    .orderBy(desc(cashSessionsTable.openedAt))
    .limit(1);

  if (!session) {
    res.json(null);
    return;
  }

  const [emp] = await db
    .select({ name: employeesTable.name })
    .from(employeesTable)
    .where(eq(employeesTable.id, session.employeeId));

  res.json({ ...session, employeeName: emp?.name ?? "" });
});

// POST /cash-sessions/:id/movements
router.post(
  "/cash-sessions/:id/movements",
  requireAuth,
  requireRole(...CASH_MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const employeeId = (req as any).user?.id as string;
    const { movementType, amount, reason } = req.body as {
      movementType: "in" | "out";
      amount: string;
      reason: string;
    };

    if (!["in", "out"].includes(movementType)) {
      res.status(400).json({ error: "movementType debe ser 'in' o 'out'" });
      return;
    }
    if (!reason?.trim()) {
      res.status(400).json({ error: "El motivo es obligatorio" });
      return;
    }

    const [session] = await db
      .select()
      .from(cashSessionsTable)
      .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.status, "open")));

    if (!session) {
      res.status(404).json({ error: "Sesión de caja no encontrada o cerrada" });
      return;
    }

    const [movement] = await db
      .insert(cashMovementsTable)
      .values({ cashSessionId: id, movementType, amount, reason: reason.trim(), employeeId })
      .returning();

    await logDocumentAction({
      action: movementType === "in" ? "cash_in" : "cash_out",
      documentType: "ticket",
      documentId: id,
      employeeId,
      employeeName: (req as any).user?.name ?? "",
      terminal: session.terminalName,
      amount,
      details: reason,
    });

    res.status(201).json(movement);
  },
);

// POST /cash-sessions/:id/close
router.post(
  "/cash-sessions/:id/close",
  requireAuth,
  requireRole(...CASH_MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const employeeId = (req as any).user?.id as string;
    const { countedCash, discrepancyReason, closingNotes } = req.body as {
      countedCash: string;
      discrepancyReason?: string;
      closingNotes?: string;
    };

    if (!countedCash) {
      res.status(400).json({ error: "El efectivo contado es obligatorio" });
      return;
    }

    const [session] = await db
      .select()
      .from(cashSessionsTable)
      .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.status, "open")));

    if (!session) {
      res.status(404).json({ error: "Sesión no encontrada o ya cerrada" });
      return;
    }

    // Expected cash = opening float + cash payments in this session + movements_in - movements_out
    const cashMethodRow = await db
      .select({ id: paymentMethodsTable.id })
      .from(paymentMethodsTable)
      .where(eq(paymentMethodsTable.code, "cash"))
      .limit(1);

    const cashMethodId = cashMethodRow[0]?.id;

    const cashPaymentsResult = cashMethodId
      ? await db
          .select({ total: sum(paymentsTable.amount) })
          .from(paymentsTable)
          .where(
            and(
              eq(paymentsTable.cashSessionId, id),
              eq(paymentsTable.paymentMethodId, cashMethodId),
              eq(paymentsTable.status, "completed"),
            ),
          )
      : [{ total: "0" }];

    const cashSales = parseFloat(cashPaymentsResult[0]?.total ?? "0");

    const movementsResult = await db
      .select({ type: cashMovementsTable.movementType, total: sum(cashMovementsTable.amount) })
      .from(cashMovementsTable)
      .where(eq(cashMovementsTable.cashSessionId, id))
      .groupBy(cashMovementsTable.movementType);

    const movIn  = parseFloat(movementsResult.find((m) => m.type === "in")?.total  ?? "0");
    const movOut = parseFloat(movementsResult.find((m) => m.type === "out")?.total ?? "0");

    const expectedCash = (parseFloat(session.openingFloat) + cashSales + movIn - movOut).toFixed(2);
    const difference   = (parseFloat(countedCash) - parseFloat(expectedCash)).toFixed(2);

    // Require discrepancy reason if |diff| > 5€
    const diffAbs = Math.abs(parseFloat(difference));
    if (diffAbs > 5 && !discrepancyReason?.trim()) {
      res.status(422).json({
        error: "Se requiere explicación para el descuadre",
        expectedCash,
        difference,
      });
      return;
    }

    const [closed] = await db
      .update(cashSessionsTable)
      .set({
        status: "closed",
        closedAt: new Date(),
        expectedCash,
        countedCash,
        difference,
        discrepancyReason: discrepancyReason ?? null,
        closingNotes: closingNotes ?? null,
      })
      .where(eq(cashSessionsTable.id, id))
      .returning();

    await logDocumentAction({
      action: "close_cash_session",
      documentType: "ticket",
      documentId: id,
      employeeId,
      employeeName: (req as any).user?.name ?? "",
      terminal: session.terminalName,
      amount: expectedCash,
      details: `Cierre de caja. Esperado: ${expectedCash}€ | Contado: ${countedCash}€ | Diferencia: ${difference}€`,
    });

    res.json(closed);
  },
);

// GET /cash-sessions/:id/summary
router.get(
  "/cash-sessions/:id/summary",
  requireAuth,
  requireRole(...CASH_MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;

    const [session] = await db
      .select()
      .from(cashSessionsTable)
      .where(eq(cashSessionsTable.id, id));

    if (!session) {
      res.status(404).json({ error: "Sesión no encontrada" });
      return;
    }

    const [emp] = await db
      .select({ name: employeesTable.name })
      .from(employeesTable)
      .where(eq(employeesTable.id, session.employeeId));

    const salesByMethod = await db
      .select({
        methodCode: paymentMethodsTable.code,
        methodName: paymentMethodsTable.name,
        total: sum(paymentsTable.amount),
      })
      .from(paymentsTable)
      .innerJoin(paymentMethodsTable, eq(paymentsTable.paymentMethodId, paymentMethodsTable.id))
      .where(and(eq(paymentsTable.cashSessionId, id), eq(paymentsTable.status, "completed")))
      .groupBy(paymentMethodsTable.code, paymentMethodsTable.name);

    const movements = await db
      .select({
        id: cashMovementsTable.id,
        movementType: cashMovementsTable.movementType,
        amount: cashMovementsTable.amount,
        reason: cashMovementsTable.reason,
        employeeId: cashMovementsTable.employeeId,
        createdAt: cashMovementsTable.createdAt,
        employeeName: employeesTable.name,
      })
      .from(cashMovementsTable)
      .leftJoin(employeesTable, eq(cashMovementsTable.employeeId, employeesTable.id))
      .where(eq(cashMovementsTable.cashSessionId, id))
      .orderBy(cashMovementsTable.createdAt);

    res.json({ session: { ...session, employeeName: emp?.name ?? "" }, salesByMethod, movements });
  },
);

// GET /cash-sessions/:id/report — full Z-report data
router.get(
  "/cash-sessions/:id/report",
  requireAuth,
  requireRole(...CASH_MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;

    const [session] = await db
      .select()
      .from(cashSessionsTable)
      .where(eq(cashSessionsTable.id, id));

    if (!session) {
      res.status(404).json({ error: "Sesión no encontrada" });
      return;
    }

    const [emp] = await db
      .select({ name: employeesTable.name })
      .from(employeesTable)
      .where(eq(employeesTable.id, session.employeeId));

    // Sales by payment method
    const salesByMethod = await db
      .select({
        methodCode: paymentMethodsTable.code,
        methodName: paymentMethodsTable.name,
        total: sum(paymentsTable.amount),
      })
      .from(paymentsTable)
      .innerJoin(paymentMethodsTable, eq(paymentsTable.paymentMethodId, paymentMethodsTable.id))
      .where(and(eq(paymentsTable.cashSessionId, id), eq(paymentsTable.status, "completed")))
      .groupBy(paymentMethodsTable.code, paymentMethodsTable.name);

    // Cash movements
    const movements = await db
      .select({
        id: cashMovementsTable.id,
        movementType: cashMovementsTable.movementType,
        amount: cashMovementsTable.amount,
        reason: cashMovementsTable.reason,
        createdAt: cashMovementsTable.createdAt,
        employeeName: employeesTable.name,
      })
      .from(cashMovementsTable)
      .leftJoin(employeesTable, eq(cashMovementsTable.employeeId, employeesTable.id))
      .where(eq(cashMovementsTable.cashSessionId, id))
      .orderBy(cashMovementsTable.createdAt);

    // Tips in this session
    const tips = await db
      .select({ amount: tipsTable.amount, method: tipsTable.method })
      .from(tipsTable)
      .where(eq(tipsTable.cashSessionId, id));

    // Total payments in session
    const paymentsInSession = await db
      .select()
      .from(paymentsTable)
      .where(and(eq(paymentsTable.cashSessionId, id), eq(paymentsTable.status, "completed")));

    // Voids (counter-movements for anulaciones)
    const voids = await db
      .select({
        id: paymentVoidsTable.id,
        reason: paymentVoidsTable.reason,
        createdAt: paymentVoidsTable.createdAt,
        originalPaymentId: paymentVoidsTable.originalPaymentId,
        employeeName: employeesTable.name,
      })
      .from(paymentVoidsTable)
      .leftJoin(employeesTable, eq(paymentVoidsTable.authorizedBy, employeesTable.id))
      .where(eq(paymentVoidsTable.cashSessionId, id));

    // Aggregated totals
    const totalSales = salesByMethod.reduce((a, m) => a + parseFloat(m.total ?? "0"), 0);
    const totalTips  = tips.reduce((a, t) => a + parseFloat(t.amount), 0);
    const movIn  = movements.filter((m) => m.movementType === "in").reduce((a, m) => a + parseFloat(m.amount), 0);
    const movOut = movements.filter((m) => m.movementType === "out").reduce((a, m) => a + parseFloat(m.amount), 0);

    res.json({
      session: { ...session, employeeName: emp?.name ?? "" },
      salesByMethod,
      movements,
      tips,
      voids,
      totalSales: totalSales.toFixed(2),
      totalTips: totalTips.toFixed(2),
      movIn: movIn.toFixed(2),
      movOut: movOut.toFixed(2),
      paymentsCount: paymentsInSession.length,
    });
  },
);

// POST /cash-sessions/:id/void-payment — admin only
router.post(
  "/cash-sessions/:id/void-payment",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const sessionId = req.params.id as string;
    const employeeId = (req as any).user?.id as string;
    const { paymentId, reason } = req.body as { paymentId: string; reason: string };

    if (!reason?.trim() || reason.trim().length < 5) {
      res.status(400).json({ error: "Se requiere motivo detallado para la anulación" });
      return;
    }

    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, paymentId));

    if (!payment) {
      res.status(404).json({ error: "Pago no encontrado" });
      return;
    }
    if (payment.status === "voided") {
      res.status(409).json({ error: "Este pago ya ha sido anulado" });
      return;
    }

    const [session] = await db
      .select()
      .from(cashSessionsTable)
      .where(eq(cashSessionsTable.id, sessionId));

    // Mark payment as voided and create counter cash movement (for cash payments)
    const result = await db.transaction(async (tx) => {
      await tx
        .update(paymentsTable)
        .set({ status: "voided" })
        .where(eq(paymentsTable.id, paymentId));

      // Get method
      const [method] = await db
        .select({ code: paymentMethodsTable.code })
        .from(paymentMethodsTable)
        .where(eq(paymentMethodsTable.id, payment.paymentMethodId));

      let counterMovementId: string | null = null;

      if (method?.code === "cash" && session?.status === "open") {
        // Return cash to drawer via counter movement
        const [mov] = await tx
          .insert(cashMovementsTable)
          .values({
            cashSessionId: sessionId,
            movementType: "out",
            amount: payment.amount,
            reason: `Anulación de pago: ${reason.trim()}`,
            employeeId,
          })
          .returning();
        counterMovementId = mov.id;
      }

      const [voidRecord] = await tx
        .insert(paymentVoidsTable)
        .values({
          originalPaymentId: paymentId,
          reason: reason.trim(),
          authorizedBy: employeeId,
          cashSessionId: session?.id ?? null,
          counterMovementId,
        })
        .returning();

      return voidRecord;
    });

    await logDocumentAction({
      action: "void_payment",
      documentType: "ticket",
      documentId: paymentId,
      employeeId,
      employeeName: (req as any).user?.name ?? "",
      terminal: session?.terminalName ?? "",
      amount: payment.amount,
      details: `Anulación: ${reason}`,
    });

    res.status(201).json(result);
  },
);

// GET /cash-sessions/history — list all closed sessions (admin/manager)
router.get(
  "/cash-sessions/history",
  requireAuth,
  requireRole(...CASH_MANAGER_ROLES),
  async (_req, res): Promise<void> => {
    const sessions = await db
      .select({
        id: cashSessionsTable.id,
        terminalName: cashSessionsTable.terminalName,
        openedAt: cashSessionsTable.openedAt,
        closedAt: cashSessionsTable.closedAt,
        openingFloat: cashSessionsTable.openingFloat,
        expectedCash: cashSessionsTable.expectedCash,
        countedCash: cashSessionsTable.countedCash,
        difference: cashSessionsTable.difference,
        status: cashSessionsTable.status,
        blindClose: cashSessionsTable.blindClose,
        employeeName: employeesTable.name,
      })
      .from(cashSessionsTable)
      .leftJoin(employeesTable, eq(cashSessionsTable.employeeId, employeesTable.id))
      .orderBy(desc(cashSessionsTable.openedAt))
      .limit(50);

    res.json(sessions);
  },
);

export default router;
