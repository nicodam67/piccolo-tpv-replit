import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  discountsTable,
  ordersTable,
  orderItemsTable,
  productsTable,
  employeesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logDocumentAction } from "../lib/document-audit";

const router: IRouter = Router();

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
// Body: { type, value, reason, orderItemId?, pin? }
// type: 'percentage' | 'fixed' | 'invitation'
// Requires manager/admin. If discount > 20% (configurable threshold), requires admin.
router.post(
  "/orders/:id/discounts",
  requireAuth,
  requireRole("waiter", "manager", "admin"),
  async (req, res): Promise<void> => {
    const orderId = req.params.id as string;
    const employeeId = (req as any).user?.id as string;
    const role = (req as any).user?.role as string;

    const { type, value, reason, orderItemId, pin } = req.body as {
      type: "percentage" | "fixed" | "invitation";
      value: string;
      reason?: string;
      orderItemId?: string;
      pin?: string;
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

    // Waiters cannot apply any discount
    if (role === "waiter") {
      res.status(403).json({ error: "Los camareros no pueden aplicar descuentos" });
      return;
    }

    // Invitations require admin
    if (type === "invitation" && role !== "admin") {
      res.status(403).json({ error: "Solo los administradores pueden aplicar invitaciones" });
      return;
    }

    // Percentage > 20% requires admin
    if (type === "percentage" && valueNum > 20 && role !== "admin") {
      res.status(403).json({ error: "Descuentos superiores al 20% requieren autorización de administrador" });
      return;
    }

    // Verify order exists
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
        // Line-level: get item price
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
        // Order-level: sum all items
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

    // Audit
    await logDocumentAction({
      action: "apply_discount",
      documentType: "ticket",
      documentId: orderId,
      employeeId,
      employeeName: (req as any).user?.name ?? "",
      terminal: (req.headers["x-terminal"] as string) ?? "",
      amount: discountAmount.toFixed(2),
      details: `Descuento ${type} ${value}${type === "percentage" ? "%" : "€"}: ${reason}`,
    });

    res.status(201).json(discount);
  }
);

// DELETE /orders/:id/discounts/:discountId — admin only, only if order not paid
router.delete(
  "/orders/:id/discounts/:discountId",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const discountId = req.params.discountId as string;
    const orderId = req.params.id as string;

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
