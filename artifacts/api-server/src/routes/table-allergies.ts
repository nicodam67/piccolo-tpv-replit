/**
 * Table/order allergy management, KDS allergy confirmations, ingredient substitutions
 * and allergen conflict checking for the POS.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tableGuestAllergiesTable,
  allergyOverrideLogTable,
  kitchenAllergyConfirmationsTable,
  ingredientSubstitutionsTable,
  allergensCatalogTable,
  productAllergenCacheTable,
  allergenAuditLogTable,
} from "@workspace/db";
import {
  ordersTable,
  kitchenTasksTable,
  ingredientsTable,
  restaurantTablesTable,
} from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { recalculateProductAllergens } from "./allergens";

const router: IRouter = Router();

async function logAudit(
  entity: string, entityId: string, action: string,
  actorId: string | undefined, actorName: string, after?: unknown
) {
  try {
    await db.insert(allergenAuditLogTable).values({
      entity, entityId, action,
      actorId: actorId ?? null, actorName,
      after: after as any,
    });
  } catch { /* non-fatal */ }
}

// ─── GET /api/orders/:orderId/guest-allergies ─────────────────────────────────
router.get("/orders/:orderId/guest-allergies", requireAuth, async (req, res): Promise<void> => {
  const orderId = req.params.orderId as string;
  const rows = await db
    .select({
      id: tableGuestAllergiesTable.id,
      orderId: tableGuestAllergiesTable.orderId,
      tableId: tableGuestAllergiesTable.tableId,
      guestNumber: tableGuestAllergiesTable.guestNumber,
      allergenCode: tableGuestAllergiesTable.allergenCode,
      severity: tableGuestAllergiesTable.severity,
      notes: tableGuestAllergiesTable.notes,
      registeredAt: tableGuestAllergiesTable.registeredAt,
      active: tableGuestAllergiesTable.active,
      allergenName: allergensCatalogTable.nameEs,
      iconSlug: allergensCatalogTable.iconSlug,
    })
    .from(tableGuestAllergiesTable)
    .innerJoin(allergensCatalogTable, eq(tableGuestAllergiesTable.allergenCode, allergensCatalogTable.code))
    .where(and(eq(tableGuestAllergiesTable.orderId, orderId), eq(tableGuestAllergiesTable.active, true)));
  res.json(rows);
});

// ─── POST /api/orders/:orderId/guest-allergies — register allergy ──────────────
router.post("/orders/:orderId/guest-allergies", requireAuth, async (req, res): Promise<void> => {
  const orderId = req.params.orderId as string;
  const { guestNumber = "1", allergenCode, severity = "intolerance", notes } = req.body as {
    guestNumber?: string; allergenCode: string; severity?: string; notes?: string;
  };
  const user = req.user!;

  if (!allergenCode) { res.status(400).json({ error: "allergenCode es requerido" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }

  const [row] = await db.insert(tableGuestAllergiesTable).values({
    orderId,
    tableId: order.tableId ?? null,
    guestNumber: String(guestNumber),
    allergenCode,
    severity,
    notes: notes ?? null,
    registeredBy: user.id,
    active: true,
  }).returning();

  await logAudit("table_allergy", orderId, "register_allergy", user.id, user.name,
    { guestNumber, allergenCode, severity });
  res.status(201).json(row);
});

// ─── DELETE /api/orders/:orderId/guest-allergies/:id — deactivate ─────────────
router.delete("/orders/:orderId/guest-allergies/:id", requireAuth, async (req, res): Promise<void> => {
  const { id, orderId } = req.params as { id: string; orderId: string };
  await db.update(tableGuestAllergiesTable)
    .set({ active: false })
    .where(and(eq(tableGuestAllergiesTable.id, id), eq(tableGuestAllergiesTable.orderId, orderId)));
  res.json({ ok: true });
});

// ─── POST /api/orders/:orderId/check-allergy — check product against allergies ─
router.post("/orders/:orderId/check-allergy", requireAuth, async (req, res): Promise<void> => {
  const orderId = req.params.orderId as string;
  const { productId } = req.body as { productId: string };

  if (!productId) { res.status(400).json({ error: "productId es requerido" }); return; }

  // Get product allergen cache
  const productAllergens = await db
    .select({
      allergenCode: productAllergenCacheTable.allergenCode,
      type: productAllergenCacheTable.type,
      allergenName: allergensCatalogTable.nameEs,
    })
    .from(productAllergenCacheTable)
    .innerJoin(allergensCatalogTable, eq(productAllergenCacheTable.allergenCode, allergensCatalogTable.code))
    .where(eq(productAllergenCacheTable.productId, productId));

  // Get order guest allergies
  const guestAllergies = await db
    .select({
      id: tableGuestAllergiesTable.id,
      guestNumber: tableGuestAllergiesTable.guestNumber,
      allergenCode: tableGuestAllergiesTable.allergenCode,
      severity: tableGuestAllergiesTable.severity,
      allergenName: allergensCatalogTable.nameEs,
    })
    .from(tableGuestAllergiesTable)
    .innerJoin(allergensCatalogTable, eq(tableGuestAllergiesTable.allergenCode, allergensCatalogTable.code))
    .where(and(eq(tableGuestAllergiesTable.orderId, orderId), eq(tableGuestAllergiesTable.active, true)));

  // Find conflicts: product allergen (any type) vs guest allergy
  const conflicts = [];
  for (const ga of guestAllergies) {
    const match = productAllergens.find(pa => pa.allergenCode === ga.allergenCode);
    if (match) {
      conflicts.push({
        allergenCode: ga.allergenCode,
        allergenName: ga.allergenName ?? ga.allergenCode,
        severity: ga.severity,
        guestNumber: ga.guestNumber,
        guestAllergyId: ga.id,
        productAllergenType: match.type, // contains | traces | cross_contamination
        isBlocking: ga.severity === "life_threatening" || match.type === "contains",
      });
    }
  }

  res.json({ hasConflict: conflicts.length > 0, conflicts });
});

// ─── POST /api/orders/:orderId/allergy-override — manager authorizes exception ─
router.post("/orders/:orderId/allergy-override", requireAuth, requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const orderId = req.params.orderId as string;
  const { orderItemId, allergenCode, guestAllergyId, reason } = req.body as {
    orderItemId?: string; allergenCode: string; guestAllergyId?: string; reason?: string;
  };
  const user = req.user!;

  const [row] = await db.insert(allergyOverrideLogTable).values({
    orderId,
    orderItemId: orderItemId ?? null,
    allergenCode,
    guestAllergyId: guestAllergyId ?? null,
    authorizedBy: user.id,
    reason: reason ?? null,
  }).returning();

  await logAudit("allergy_override", orderId, "override", user.id, user.name,
    { allergenCode, orderItemId, reason });
  res.status(201).json(row);
});

// ─── POST /api/kitchen-tasks/:taskId/allergy-confirm — cook confirms review ────
router.post("/kitchen-tasks/:taskId/allergy-confirm", requireAuth, async (req, res): Promise<void> => {
  const { taskId } = req.params;
  const { notes, hasCrossContaminationRisk = false, guestAllergyIds = [] } = req.body as {
    notes?: string; hasCrossContaminationRisk?: boolean; guestAllergyIds?: string[];
  };
  const user = req.user!;

  const [task] = await db.select().from(kitchenTasksTable).where(eq(kitchenTasksTable.id, taskId as string)).limit(1);
  if (!task) { res.status(404).json({ error: "Tarea no encontrada" }); return; }

  const [confirmation] = await db.insert(kitchenAllergyConfirmationsTable).values({
    taskId: taskId as string,
    guestAllergyIds: guestAllergyIds as any,
    confirmedBy: user.id,
    confirmedAt: new Date(),
    notes: notes ?? null,
    hasCrossContaminationRisk,
  }).returning();

  await logAudit("kds_confirmation", taskId as string, "allergy_confirmed", user.id, user.name,
    { hasCrossContaminationRisk, notes });
  res.status(201).json(confirmation);
});

// ─── GET /api/kitchen-tasks/:taskId/allergy-confirmation ─────────────────────
router.get("/kitchen-tasks/:taskId/allergy-confirmation", requireAuth, async (req, res): Promise<void> => {
  const { taskId } = req.params;
  const [confirmation] = await db
    .select()
    .from(kitchenAllergyConfirmationsTable)
    .where(eq(kitchenAllergyConfirmationsTable.taskId, taskId as string))
    .orderBy(desc(kitchenAllergyConfirmationsTable.confirmedAt))
    .limit(1);
  res.json(confirmation ?? null);
});

// ─── POST /api/kitchen-tasks/:taskId/substitute-ingredient ───────────────────
router.post("/kitchen-tasks/:taskId/substitute-ingredient", requireAuth, async (req, res): Promise<void> => {
  const { taskId } = req.params;
  const {
    orderItemId, originalIngredientId, substituteIngredientId,
    originalIngredientName, substituteIngredientName,
  } = req.body as {
    orderItemId?: string;
    originalIngredientId?: string; substituteIngredientId?: string;
    originalIngredientName: string; substituteIngredientName: string;
  };
  const user = req.user!;

  // Compute new allergens from substitute ingredient
  let newAllergenSummary: { code: string; type: string }[] = [];
  if (substituteIngredientId) {
    const [ing] = await db.select({ allergenTags: ingredientsTable.allergenTags })
      .from(ingredientsTable).where(eq(ingredientsTable.id, substituteIngredientId));
    if (ing) {
      newAllergenSummary = (Array.isArray(ing.allergenTags) ? ing.allergenTags as string[] : [])
        .map(code => ({ code, type: "contains" }));
    }
  }

  const [sub] = await db.insert(ingredientSubstitutionsTable).values({
    taskId: taskId as string,
    orderItemId: orderItemId ?? null,
    originalIngredientId: originalIngredientId ?? null,
    substituteIngredientId: substituteIngredientId ?? null,
    originalIngredientName,
    substituteIngredientName,
    newAllergenSummary: newAllergenSummary as any,
    authorizedBy: user.id,
    substitutedAt: new Date(),
  }).returning();

  await logAudit("substitution", taskId as string, "ingredient_substituted", user.id, user.name, {
    original: originalIngredientName,
    substitute: substituteIngredientName,
    newAllergens: newAllergenSummary,
  });

  res.status(201).json({ ...sub, newAllergenSummary });
});

export default router;
