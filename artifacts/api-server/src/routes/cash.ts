import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  cashSessionsTable,
  cashMovementsTable,
  paymentsTable,
  paymentMethodsTable,
  employeesTable,
} from "@workspace/db";
import { eq, and, isNull, desc, sum, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

// Roles allowed to manage cash sessions (open, close, movements, summary)
const CASH_MANAGER_ROLES = ["manager", "admin"];

const router: IRouter = Router();

// POST /cash-sessions/open
router.post("/cash-sessions/open", requireAuth, requireRole(...CASH_MANAGER_ROLES), async (req, res): Promise<void> => {
  const employeeId = (req as any).user?.id as string;
  const { openingFloat = "0" } = req.body as { openingFloat?: string };

  // Check no open session exists
  const [existing] = await db
    .select()
    .from(cashSessionsTable)
    .where(eq(cashSessionsTable.status, "open"))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "Ya hay una sesión de caja abierta" });
    return;
  }

  const [session] = await db
    .insert(cashSessionsTable)
    .values({ employeeId, openingFloat, status: "open" })
    .returning();

  res.status(201).json(session);
});

// GET /cash-sessions/current
router.get("/cash-sessions/current", requireAuth, async (_req, res): Promise<void> => {
  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(eq(cashSessionsTable.status, "open"))
    .orderBy(desc(cashSessionsTable.openedAt))
    .limit(1);

  if (!session) {
    res.json(null);
    return;
  }

  // Attach opener name
  const [emp] = await db
    .select({ name: employeesTable.name })
    .from(employeesTable)
    .where(eq(employeesTable.id, session.employeeId));

  res.json({ ...session, employeeName: emp?.name ?? "" });
});

// POST /cash-sessions/:id/movements
router.post("/cash-sessions/:id/movements", requireAuth, requireRole(...CASH_MANAGER_ROLES), async (req, res): Promise<void> => {
  const { id } = req.params;
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

  res.status(201).json(movement);
});

// POST /cash-sessions/:id/close
router.post("/cash-sessions/:id/close", requireAuth, requireRole(...CASH_MANAGER_ROLES), async (req, res): Promise<void> => {
  const { id } = req.params;
  const { countedCash } = req.body as { countedCash: string };

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.status, "open")));

  if (!session) {
    res.status(404).json({ error: "Sesión no encontrada o ya cerrada" });
    return;
  }

  // Expected cash = opening_float + cash_in payments + movements_in - movements_out
  const cashMethodRow = await db
    .select({ id: paymentMethodsTable.id })
    .from(paymentMethodsTable)
    .where(eq(paymentMethodsTable.code, "cash"))
    .limit(1);

  const cashMethodId = cashMethodRow[0]?.id;

  // Sum cash payments in this session
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

  const cashPaymentsIn = cashPaymentsResult[0]?.total ?? "0";

  // Sum movements
  const movInResult = await db
    .select({ total: sum(cashMovementsTable.amount) })
    .from(cashMovementsTable)
    .where(and(eq(cashMovementsTable.cashSessionId, id), eq(cashMovementsTable.movementType, "in")));

  const movOutResult = await db
    .select({ total: sum(cashMovementsTable.amount) })
    .from(cashMovementsTable)
    .where(
      and(eq(cashMovementsTable.cashSessionId, id), eq(cashMovementsTable.movementType, "out")),
    );

  const movIn = movInResult[0]?.total ?? "0";
  const movOut = movOutResult[0]?.total ?? "0";

  const expectedCash = (
    parseFloat(session.openingFloat) +
    parseFloat(cashPaymentsIn) +
    parseFloat(movIn) -
    parseFloat(movOut)
  ).toFixed(2);

  const difference = (parseFloat(countedCash) - parseFloat(expectedCash)).toFixed(2);

  const [closed] = await db
    .update(cashSessionsTable)
    .set({
      status: "closed",
      closedAt: new Date(),
      expectedCash,
      countedCash,
      difference,
    })
    .where(eq(cashSessionsTable.id, id))
    .returning();

  res.json(closed);
});

// GET /cash-sessions/:id/summary
router.get("/cash-sessions/:id/summary", requireAuth, requireRole(...CASH_MANAGER_ROLES), async (req, res): Promise<void> => {
  const { id } = req.params;

  const [session] = await db.select().from(cashSessionsTable).where(eq(cashSessionsTable.id, id));
  if (!session) {
    res.status(404).json({ error: "Sesión no encontrada" });
    return;
  }

  // Sales breakdown by payment method
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
    .select()
    .from(cashMovementsTable)
    .where(eq(cashMovementsTable.cashSessionId, id))
    .orderBy(cashMovementsTable.createdAt);

  res.json({ session, salesByMethod, movements });
});

export default router;
