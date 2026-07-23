import { Router, type IRouter, type Response } from "express";
import { db, pool } from "@workspace/db";
import {
  discountsTable,
  ordersTable,
  orderItemsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requirePermission, verifyManagerToken } from "../middlewares/auth";
import { logDocumentAction } from "../lib/document-audit";

const router: IRouter = Router();

async function holdDiscountOrderLock(orderId: string, res: Response): Promise<void> {
  const client = await pool.connect();
  const key = `order-critical:${orderId}`;
  await client.query("SELECT pg_advisory_lock(hashtext($1))", [key]);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    void client.query("SELECT pg_advisory_unlock(hashtext($1))", [key])
      .finally(() => client.release());
  };
  res.once("finish", release);
  res.once("close", release);
}

// GET /orders/:id/discounts
router.get("/orders/:id/discounts", requireAuth, async (req, res): Promise<void> => {
  const orderId = req.params.id as string;
  const rows = await db
    .select({
      id: discountsTable.id,
      orderId: discountsTable.orderId,
      orderItemId: discountsTable.orderItemId,
      type: discountsTable.type,
      value: discountsTable.value,
      discountAmount: discountsTable.discountAmount,
      reason: discountsTable.reason,
      authorizedBy: discountsTable.authorizedBy,
      createdAt: discountsTable.createdAt,
    })
    .from(discountsTable)
    .where(eq(discountsTable.orderId, orderId));
  res.json(rows);
});

// POST /orders/:id/discounts
// Body: { type, value, reason, orderItemId?, managerToken? }
// type: 'percentage' | 'fixed' | 'invitation'
// Gate: requires 'discounts.apply' permission.
// Large discounts (> 20%) or invitations additionally require either:
//   - admin role, OR
//   - a valid short-lived manager-auth token (from POST /api/auth/manager-authorize)
router.post(
  "/orders/:id/discounts",
  requireAuth,
  requirePermission("discounts.apply"),   // ← permission-based guard (replaces loose requireRole)
  async (req, res): Promise<void> => {
    const orderId = req.params.id as string;
    const employeeId = req.user!.id;
    const role = req.user!.role;

    const { type, value, reason, orderItemId } = req.body as {
      type: "percentage" | "fixed" | "invitation";
      value: string;
      reason?: string;
      orderItemId?: string;
    };

    if (!["percentage", "fixed", "invitation"].includes(type)) {
      res.status(400).json({ error: "Tipo de descuento inválido" });
      return;
    }
    if (!reason?.trim() || reason.trim().length < 3) {
      res.status(400).json({ error: "El motivo del descuento es obligatorio" });
      return;
    }

    const valueNum = parseFloat(value ?? "0");
    if (isNaN(valueNum) || valueNum <= 0) {
      res.status(400).json({ error: "Valor de descuento inválido" });
      return;
    }

    // ── Elevated authorization check ──────────────────────────────────────────
    // Invitations or discounts > 20% require admin role OR a valid manager token.
    const needsElevation = type === "invitation" || (type === "percentage" && valueNum > 20);
    if (needsElevation && role !== "admin") {
      const managerAuth = verifyManagerToken(req, "discount.apply");
      if (!managerAuth) {
        res.status(403).json({
          error: type === "invitation"
            ? "Las invitaciones requieren autorización de encargado"
            : "Descuentos superiores al 20% requieren autorización de encargado",
        });
        return;
      }
      // managerAuth is valid — log it
    }

    await holdDiscountOrderLock(orderId, res);
    // Verify order exists and is not paid under the same lock as payment.
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
    if (!order) {
      res.status(404).json({ error: "Pedido no encontrado" });
      return;
    }
    if (order.status === "paid") {
      res.status(409).json({ error: "No se puede aplicar descuento a un pedido ya cobrado" });
      return;
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (type === "fixed" || type === "invitation") {
      discountAmount = valueNum;
    } else if (type === "percentage") {
      if (orderItemId) {
        const [item] = await db
          .select({ unitPrice: orderItemsTable.unitPrice, quantity: orderItemsTable.quantity })
          .from(orderItemsTable)
          .where(and(eq(orderItemsTable.id, orderItemId), eq(orderItemsTable.orderId, orderId)));
        if (!item) {
          res.status(404).json({ error: "Línea de pedido no encontrada" });
          return;
        }
        const lineTotal = parseFloat(item.unitPrice) * item.quantity;
        discountAmount = (lineTotal * valueNum) / 100;
      } else {
        const items = await db
          .select({ unitPrice: orderItemsTable.unitPrice, quantity: orderItemsTable.quantity })
          .from(orderItemsTable)
          .where(eq(orderItemsTable.orderId, orderId));
        const orderTotal = items.reduce((a, i) => a + parseFloat(i.unitPrice) * i.quantity, 0);
        discountAmount = (orderTotal * valueNum) / 100;
      }
    }

    const [discount] = await db
      .insert(discountsTable)
      .values({
        orderId,
        orderItemId: orderItemId ?? null,
        type,
        value: value,
        discountAmount: discountAmount.toFixed(2),
        reason: reason.trim(),
        authorizedBy: employeeId,
      })
      .returning();

    await logDocumentAction({
      action: "apply_discount",
      documentType: "ticket",
      documentId: orderId,
      employeeId,
      employeeName: req.user?.name ?? "",
      terminal: (req.headers["x-terminal"] as string) ?? "",
      amount: discountAmount.toFixed(2),
      details: `Descuento ${type} ${value}${type === "percentage" ? "%" : "€"}: ${reason}`,
    });

    res.status(201).json(discount);
  }
);

// DELETE /orders/:id/discounts/:discountId
router.delete(
  "/orders/:id/discounts/:discountId",
  requireAuth,
  requirePermission("discounts.apply"),
  async (req, res): Promise<void> => {
    const discountId = req.params.discountId as string;
    const orderId = req.params.id as string;
    const role = req.user!.role;

    // Deletion of any discount requires admin OR manager auth
    if (role !== "admin") {
      const managerAuth = verifyManagerToken(req, "discount.delete");
      if (!managerAuth) {
        res.status(403).json({ error: "Eliminar descuentos requiere autorización de administrador o encargado" });
        return;
      }
    }

    await holdDiscountOrderLock(orderId, res);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
    if (order?.status === "paid") {
      res.status(409).json({ error: "No se puede eliminar descuentos de un pedido cobrado" });
      return;
    }

    await db.delete(discountsTable).where(eq(discountsTable.id, discountId));
    res.json({ ok: true });
  }
);

export default router;
