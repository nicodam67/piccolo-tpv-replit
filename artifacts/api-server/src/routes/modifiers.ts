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
import { requireAuth, requireRole } from "../middlewares/auth";
import { emitToFunction } from "../lib/socket-events";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Waiter-accessible routes
// ─────────────────────────────────────────────────────────────────────────────

router.get("/products/:productId/modifiers", requireAuth, async (req, res): Promise<void> => {
  const { productId } = req.params;

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
      and(eq(productModifierGroupsTable.modifierGroupId, modifierGroupsTable.id), eq(modifierGroupsTable.active, true)),
    )
    .innerJoin(
      modifiersTable,
      and(eq(modifiersTable.groupId, modifierGroupsTable.id), eq(modifiersTable.active, true)),
    )
    .where(eq(productModifierGroupsTable.productId, productId))
    .orderBy(asc(modifierGroupsTable.sortOrder), asc(modifiersTable.sortOrder));

  const groupsMap = new Map<string, { id: string; name: string; required: boolean; maxSelect: number; modifiers: { id: string; name: string; priceDelta: string }[] }>();
  for (const row of rows) {
    if (!groupsMap.has(row.groupId)) {
      groupsMap.set(row.groupId, { id: row.groupId, name: row.groupName, required: row.required, maxSelect: row.maxSelect, modifiers: [] });
    }
    groupsMap.get(row.groupId)!.modifiers.push({ id: row.modifierId, name: row.modifierName, priceDelta: row.priceDelta });
  }
  res.json(Array.from(groupsMap.values()));
});

router.patch("/order-items/:itemId/details", requireAuth, async (req, res): Promise<void> => {
  const { itemId } = req.params;
  const { notes, allergyNote, hasAllergy, modifiers } = req.body as {
    notes?: string; allergyNote?: string; hasAllergy?: boolean;
    modifiers?: { modifierId?: string; modifierName: string; priceDelta: string }[];
  };

  const [item] = await db.select().from(orderItemsTable).where(eq(orderItemsTable.id, itemId));
  if (!item) { res.status(404).json({ error: "Línea no encontrada" }); return; }

  const updateFields: Partial<typeof item> = {};
  if (notes !== undefined) updateFields.notes = notes;
  if (allergyNote !== undefined) updateFields.allergyNote = allergyNote;
  if (hasAllergy !== undefined) updateFields.hasAllergy = hasAllergy;

  const [updated] = await db.update(orderItemsTable).set(updateFields).where(eq(orderItemsTable.id, itemId)).returning();

  if (modifiers !== undefined) {
    await db.delete(orderItemModifiersTable).where(eq(orderItemModifiersTable.orderItemId, itemId));
    if (modifiers.length > 0) {
      await db.insert(orderItemModifiersTable).values(
        modifiers.map((m) => ({ orderItemId: itemId, modifierId: m.modifierId ?? null, modifierName: m.modifierName, priceDelta: m.priceDelta })),
      );
    }
  }

  const itemModifiers = await db.select().from(orderItemModifiersTable).where(eq(orderItemModifiersTable.orderItemId, itemId));
  try { emitToFunction("floor", "orders:refresh", { orderId: item.orderId, employeeName: req.user?.name }); } catch { /* socket not initialised */ }
  res.json({ ...updated, modifiers: itemModifiers });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin modifier group CRUD
// ─────────────────────────────────────────────────────────────────────────────

// GET /admin/modifier-groups
router.get("/admin/modifier-groups", requireAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  const groups = await db
    .select()
    .from(modifierGroupsTable)
    .orderBy(asc(modifierGroupsTable.sortOrder));

  const modifiers = await db
    .select()
    .from(modifiersTable)
    .orderBy(asc(modifiersTable.sortOrder));

  const modsByGroup = new Map<string, typeof modifiers>();
  for (const m of modifiers) {
    if (!modsByGroup.has(m.groupId)) modsByGroup.set(m.groupId, []);
    modsByGroup.get(m.groupId)!.push(m);
  }

  res.json(groups.map((g) => ({ ...g, modifiers: modsByGroup.get(g.id) ?? [] })));
});

// POST /admin/modifier-groups
router.post("/admin/modifier-groups", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { name, required = false, maxSelect = 1, sortOrder = 0 } = req.body as {
    name: string; required?: boolean; maxSelect?: number; sortOrder?: number;
  };
  if (!name?.trim()) { res.status(400).json({ error: "name es obligatorio" }); return; }

  const [group] = await db
    .insert(modifierGroupsTable)
    .values({ name: name.trim(), required: Boolean(required), maxSelect: Number(maxSelect), sortOrder: Number(sortOrder) })
    .returning();
  res.status(201).json({ ...group, modifiers: [] });
});

// PATCH /admin/modifier-groups/:id
router.patch("/admin/modifier-groups/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { name, required, maxSelect, active, sortOrder } = req.body as {
    name?: string; required?: boolean; maxSelect?: number; active?: boolean; sortOrder?: number;
  };

  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name.trim();
  if (required != null) updates.required = required;
  if (maxSelect != null) updates.maxSelect = Number(maxSelect);
  if (active != null) updates.active = active;
  if (sortOrder != null) updates.sortOrder = Number(sortOrder);

  if (!Object.keys(updates).length) { res.status(400).json({ error: "Sin cambios" }); return; }

  const [updated] = await db.update(modifierGroupsTable).set(updates as any).where(eq(modifierGroupsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Grupo no encontrado" }); return; }
  res.json(updated);
});

// DELETE /admin/modifier-groups/:id
router.delete("/admin/modifier-groups/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db.update(modifierGroupsTable).set({ active: false }).where(eq(modifierGroupsTable.id, id));
  res.json({ ok: true });
});

// POST /admin/modifier-groups/:id/modifiers — add option
router.post("/admin/modifier-groups/:id/modifiers", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const groupId = req.params.id as string;
  const { name, priceDelta = "0", sortOrder = 0 } = req.body as {
    name: string; priceDelta?: string; sortOrder?: number;
  };
  if (!name?.trim()) { res.status(400).json({ error: "name es obligatorio" }); return; }

  const [modifier] = await db
    .insert(modifiersTable)
    .values({ groupId, name: name.trim(), priceDelta: String(priceDelta), sortOrder: Number(sortOrder) })
    .returning();
  res.status(201).json(modifier);
});

// PATCH /admin/modifiers/:id
router.patch("/admin/modifiers/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { name, priceDelta, active, sortOrder } = req.body as {
    name?: string; priceDelta?: string; active?: boolean; sortOrder?: number;
  };

  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name.trim();
  if (priceDelta != null) updates.priceDelta = String(priceDelta);
  if (active != null) updates.active = active;
  if (sortOrder != null) updates.sortOrder = Number(sortOrder);

  if (!Object.keys(updates).length) { res.status(400).json({ error: "Sin cambios" }); return; }

  const [updated] = await db.update(modifiersTable).set(updates as any).where(eq(modifiersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Opción no encontrada" }); return; }
  res.json(updated);
});

// DELETE /admin/modifiers/:id
router.delete("/admin/modifiers/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db.update(modifiersTable).set({ active: false }).where(eq(modifiersTable.id, id));
  res.json({ ok: true });
});

export default router;
