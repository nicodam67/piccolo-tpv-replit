import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  modifierGroupsTable,
  modifiersTable,
  productModifierGroupsTable,
  orderItemsTable,
  orderItemModifiersTable,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getIO } from "../lib/socket";

const router: IRouter = Router();

// GET /products/:productId/modifiers — return modifier groups + options for a product
router.get("/products/:productId/modifiers", requireAuth, async (req, res): Promise<void> => {
  const { productId } = req.params;

  // Get all modifier groups linked to this product
  const rows = await db
    .select({
      groupId: modifierGroupsTable.id,
      groupName: modifierGroupsTable.name,
      required: modifierGroupsTable.required,
      maxSelect: modifierGroupsTable.maxSelect,
      groupSort: modifierGroupsTable.sortOrder,
      modifierId: modifiersTable.id,
      modifierName: modifiersTable.name,
      priceDelta: modifiersTable.priceDelta,
      modifierSort: modifiersTable.sortOrder,
    })
    .from(productModifierGroupsTable)
    .innerJoin(
      modifierGroupsTable,
      and(
        eq(productModifierGroupsTable.modifierGroupId, modifierGroupsTable.id),
        eq(modifierGroupsTable.active, true),
      ),
    )
    .innerJoin(
      modifiersTable,
      and(
        eq(modifiersTable.groupId, modifierGroupsTable.id),
        eq(modifiersTable.active, true),
      ),
    )
    .where(eq(productModifierGroupsTable.productId, productId))
    .orderBy(asc(modifierGroupsTable.sortOrder), asc(modifiersTable.sortOrder));

  // Group into modifier groups
  const groupsMap = new Map<
    string,
    {
      id: string;
      name: string;
      required: boolean;
      maxSelect: number;
      modifiers: { id: string; name: string; priceDelta: string }[];
    }
  >();

  for (const row of rows) {
    if (!groupsMap.has(row.groupId)) {
      groupsMap.set(row.groupId, {
        id: row.groupId,
        name: row.groupName,
        required: row.required,
        maxSelect: row.maxSelect,
        modifiers: [],
      });
    }
    groupsMap.get(row.groupId)!.modifiers.push({
      id: row.modifierId,
      name: row.modifierName,
      priceDelta: row.priceDelta,
    });
  }

  res.json(Array.from(groupsMap.values()));
});

// PATCH /order-items/:itemId/details — update notes, allergyNote, hasAllergy, and modifiers
router.patch("/order-items/:itemId/details", requireAuth, async (req, res): Promise<void> => {
  const { itemId } = req.params;
  const {
    notes,
    allergyNote,
    hasAllergy,
    modifiers,
  } = req.body as {
    notes?: string;
    allergyNote?: string;
    hasAllergy?: boolean;
    modifiers?: { modifierId?: string; modifierName: string; priceDelta: string }[];
  };

  const [item] = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.id, itemId));

  if (!item) {
    res.status(404).json({ error: "Línea no encontrada" });
    return;
  }

  // Update the item fields
  const updateFields: Partial<typeof item> = {};
  if (notes !== undefined) updateFields.notes = notes;
  if (allergyNote !== undefined) updateFields.allergyNote = allergyNote;
  if (hasAllergy !== undefined) updateFields.hasAllergy = hasAllergy;

  const [updated] = await db
    .update(orderItemsTable)
    .set(updateFields)
    .where(eq(orderItemsTable.id, itemId))
    .returning();

  // Replace modifiers if provided
  if (modifiers !== undefined) {
    await db.delete(orderItemModifiersTable).where(eq(orderItemModifiersTable.orderItemId, itemId));

    if (modifiers.length > 0) {
      await db.insert(orderItemModifiersTable).values(
        modifiers.map((m) => ({
          orderItemId: itemId,
          modifierId: m.modifierId ?? null,
          modifierName: m.modifierName,
          priceDelta: m.priceDelta,
        })),
      );
    }
  }

  // Return the updated item with its modifiers
  const itemModifiers = await db
    .select()
    .from(orderItemModifiersTable)
    .where(eq(orderItemModifiersTable.orderItemId, itemId));

  try {
    getIO().emit("orders:refresh", { orderId: item.orderId });
  } catch {
    // socket not initialised
  }

  res.json({ ...updated, modifiers: itemModifiers });
});

export default router;
