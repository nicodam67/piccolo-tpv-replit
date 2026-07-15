import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  splitGroupsTable,
  splitGroupItemsTable,
  splitGroupPaymentsTable,
  ordersTable,
  orderItemsTable,
  productsTable,
  paymentsTable,
  paymentMethodsTable,
} from "@workspace/db";
import { eq, and, sum } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// GET /orders/:id/splits — list all split groups for an order
router.get("/orders/:id/splits", requireAuth, async (req, res): Promise<void> => {
  const orderId = req.params.id as string;

  const groups = await db
    .select()
    .from(splitGroupsTable)
    .where(eq(splitGroupsTable.orderId, orderId))
    .orderBy(splitGroupsTable.sortOrder);

  // For each group, fetch items and payments
  const result = await Promise.all(
    groups.map(async (g) => {
      const items = await db
        .select({
          id: splitGroupItemsTable.id,
          orderItemId: splitGroupItemsTable.orderItemId,
          quantity: splitGroupItemsTable.quantity,
          productName: productsTable.name,
          unitPrice: orderItemsTable.unitPrice,
        })
        .from(splitGroupItemsTable)
        .innerJoin(orderItemsTable, eq(splitGroupItemsTable.orderItemId, orderItemsTable.id))
        .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
        .where(eq(splitGroupItemsTable.splitGroupId, g.id));

      const paidResult = await db
        .select({ paid: sum(paymentsTable.amount) })
        .from(splitGroupPaymentsTable)
        .innerJoin(paymentsTable, eq(splitGroupPaymentsTable.paymentId, paymentsTable.id))
        .where(
          and(
            eq(splitGroupPaymentsTable.splitGroupId, g.id),
            eq(paymentsTable.status, "completed"),
          ),
        );

      const paid = parseFloat(paidResult[0]?.paid ?? "0");

      return {
        ...g,
        items: items.map((i) => ({
          ...i,
          lineTotal: (parseFloat(i.unitPrice) * parseFloat(i.quantity)).toFixed(2),
        })),
        paid: paid.toFixed(2),
      };
    }),
  );

  res.json(result);
});

// POST /orders/:id/splits — create or reset split groups
// Body: { groups: [{ label, items: [{ orderItemId, quantity }] }] }
router.post("/orders/:id/splits", requireAuth, async (req, res): Promise<void> => {
  const orderId = req.params.id as string;

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "Pedido no encontrado" });
    return;
  }
  if (order.status === "paid") {
    res.status(409).json({ error: "El pedido ya está cerrado" });
    return;
  }

  const { groups } = req.body as {
    groups: { label: string; items: { orderItemId: string; quantity: number }[] }[];
  };

  if (!Array.isArray(groups) || groups.length === 0) {
    res.status(400).json({ error: "Se requiere al menos un grupo" });
    return;
  }
  if (groups.length > 8) {
    res.status(400).json({ error: "Máximo 8 grupos de división" });
    return;
  }

  // Delete existing unpaid groups
  const existingGroups = await db
    .select()
    .from(splitGroupsTable)
    .where(and(eq(splitGroupsTable.orderId, orderId), eq(splitGroupsTable.status, "open")));

  for (const g of existingGroups) {
    await db.delete(splitGroupItemsTable).where(eq(splitGroupItemsTable.splitGroupId, g.id));
    await db.delete(splitGroupsTable).where(eq(splitGroupsTable.id, g.id));
  }

  // Create new groups
  const created = await db.transaction(async (tx) => {
    const result = [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];

      // Calculate group total
      let total = 0;
      for (const item of g.items) {
        const [oi] = await tx
          .select({ unitPrice: orderItemsTable.unitPrice })
          .from(orderItemsTable)
          .where(eq(orderItemsTable.id, item.orderItemId));
        if (oi) {
          total += parseFloat(oi.unitPrice) * item.quantity;
        }
      }

      const [group] = await tx
        .insert(splitGroupsTable)
        .values({ orderId, label: g.label, status: "open", total: total.toFixed(2), sortOrder: i })
        .returning();

      for (const item of g.items) {
        await tx
          .insert(splitGroupItemsTable)
          .values({ splitGroupId: group.id, orderItemId: item.orderItemId, quantity: String(item.quantity) });
      }

      result.push({ ...group, items: g.items });
    }
    return result;
  });

  res.status(201).json(created);
});

// PUT /orders/:id/splits/:groupId/pay — mark group as paid (called after payment completes)
router.put(
  "/orders/:id/splits/:groupId/pay",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = req.params.groupId as string;
    const { paymentId } = req.body as { paymentId: string };

    const [group] = await db
      .select()
      .from(splitGroupsTable)
      .where(eq(splitGroupsTable.id, groupId));

    if (!group) {
      res.status(404).json({ error: "Grupo no encontrado" });
      return;
    }

    if (paymentId) {
      await db
        .insert(splitGroupPaymentsTable)
        .values({ splitGroupId: groupId, paymentId })
        .onConflictDoNothing();
    }

    const [updated] = await db
      .update(splitGroupsTable)
      .set({ status: "paid" })
      .where(eq(splitGroupsTable.id, groupId))
      .returning();

    res.json(updated);
  },
);

export default router;
