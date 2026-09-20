import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tipsTable,
  paymentsTable,
  cashSessionsTable,
  idempotencyKeysTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logDocumentAction } from "../lib/document-audit";
import { idempotency } from "../middlewares/idempotency";

const router: IRouter = Router();

// POST /payments/:id/tip
// Body: { amount, method }
router.post("/payments/:id/tip", requireAuth, idempotency, async (req, res): Promise<void> => {
  const paymentId = req.params.id as string;
  const employeeId = (req as any).user?.id as string;
  const { amount, method = "cash" } = req.body as {
    amount: string;
    method?: "cash" | "card";
  };

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    res.status(400).json({ error: "Importe de propina inválido" });
    return;
  }
  if (!["cash", "card"].includes(method)) {
    res.status(400).json({ error: "Método de propina inválido" });
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

  // Get open session for audit linkage
  const [openSession] = await db
    .select()
    .from(cashSessionsTable)
    .where(eq(cashSessionsTable.status, "open"))
    .limit(1);
  if (method === "cash" && !openSession) {
    res.status(409).json({ error: "No hay caja abierta para registrar la propina en efectivo" });
    return;
  }

  const tip = await db.transaction(async (tx) => {
    if (openSession) {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${"cash-session:" + openSession.id}))`,
      );
      const [lockedSession] = await tx
        .select({ status: cashSessionsTable.status })
        .from(cashSessionsTable)
        .where(eq(cashSessionsTable.id, openSession.id))
        .for("update");
      if (lockedSession?.status !== "open") return null;
    }
    const [created] = await tx.insert(tipsTable).values({
      paymentId,
      orderId: payment.orderId,
      amount: amountNum.toFixed(2),
      method,
      cashSessionId: openSession?.id ?? null,
    }).returning();
    const requestKey = req.headers["idempotency-key"];
    if (typeof requestKey === "string" && req.user?.id) {
      await tx.insert(idempotencyKeysTable).values({
        cacheKey: `${req.user.id}:${requestKey}`,
        userId: req.user.id,
        statusCode: 201,
        response: created,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      }).onConflictDoNothing();
    }
    return created;
  });
  if (!tip) {
    res.status(409).json({ error: "La caja se cerró antes de registrar la propina" });
    return;
  }

  await logDocumentAction({
    action: "register_tip",
    documentType: "ticket",
    documentId: payment.orderId,
    employeeId,
    employeeName: (req as any).user?.name ?? "",
    terminal: (req.headers["x-terminal"] as string) ?? "",
    amount: amountNum.toFixed(2),
    details: `Propina ${method}: ${amountNum.toFixed(2)}€`,
  });

  res.status(201).json(tip);
});

// GET /orders/:id/tips
router.get("/orders/:id/tips", requireAuth, async (req, res): Promise<void> => {
  const orderId = req.params.id as string;
  const tips = await db
    .select()
    .from(tipsTable)
    .where(eq(tipsTable.orderId, orderId));
  res.json(tips);
});

export default router;
