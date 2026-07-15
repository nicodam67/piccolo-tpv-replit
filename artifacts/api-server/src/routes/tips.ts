import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tipsTable,
  paymentsTable,
  cashSessionsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logDocumentAction } from "../lib/document-audit";

const router: IRouter = Router();

// POST /payments/:id/tip
// Body: { amount, method }
router.post("/payments/:id/tip", requireAuth, async (req, res): Promise<void> => {
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

  const [tip] = await db
    .insert(tipsTable)
    .values({
      paymentId,
      orderId: payment.orderId,
      amount: amountNum.toFixed(2),
      method,
      cashSessionId: openSession?.id ?? null,
    })
    .returning();

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
