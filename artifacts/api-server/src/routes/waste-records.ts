import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  wasteRecordsTable,
  ingredientsTable,
  stockMovementsTable,
} from "@workspace/db";
import { eq, and, desc, gte, lte, sum, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

const VALID_TYPES = ["expired", "spoiled", "breakage", "overproduction", "quality", "other"] as const;

// ── GET /admin/waste-records ──────────────────────────────────────────────────
router.get("/admin/waste-records", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { ingredientId, from, to, limit = "200" } = req.query as Record<string, string | undefined>;

  let query = db
    .select({
      id: wasteRecordsTable.id,
      ingredientId: wasteRecordsTable.ingredientId,
      ingredientName: ingredientsTable.name,
      ingredientUnit: ingredientsTable.unit,
      quantity: wasteRecordsTable.quantity,
      unit: wasteRecordsTable.unit,
      unitCost: wasteRecordsTable.unitCost,
      totalCost: wasteRecordsTable.totalCost,
      reason: wasteRecordsTable.reason,
      wasteType: wasteRecordsTable.wasteType,
      employeeId: wasteRecordsTable.employeeId,
      createdAt: wasteRecordsTable.createdAt,
    })
    .from(wasteRecordsTable)
    .innerJoin(ingredientsTable, eq(wasteRecordsTable.ingredientId, ingredientsTable.id))
    .$dynamic();

  const conds: any[] = [];
  if (ingredientId) conds.push(eq(wasteRecordsTable.ingredientId, ingredientId));
  if (from) conds.push(gte(wasteRecordsTable.createdAt, new Date(from)));
  if (to) conds.push(lte(wasteRecordsTable.createdAt, new Date(to)));
  if (conds.length) query = query.where(and(...conds));

  const rows = await query
    .orderBy(desc(wasteRecordsTable.createdAt))
    .limit(Math.min(parseInt(limit ?? "200"), 500));

  res.json(rows);
});

// ── GET /admin/waste-records/summary ─────────────────────────────────────────
// Aggregate waste cost by ingredient for the given period.
router.get("/admin/waste-records/summary", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { from, to } = req.query as { from?: string; to?: string };
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400_000);

  const rows = await db
    .select({
      ingredientId: wasteRecordsTable.ingredientId,
      ingredientName: ingredientsTable.name,
      totalQty: sum(wasteRecordsTable.quantity).mapWith(Number),
      totalCost: sum(wasteRecordsTable.totalCost).mapWith(Number),
    })
    .from(wasteRecordsTable)
    .innerJoin(ingredientsTable, eq(wasteRecordsTable.ingredientId, ingredientsTable.id))
    .where(and(
      gte(wasteRecordsTable.createdAt, fromDate),
      lte(wasteRecordsTable.createdAt, toDate),
    ))
    .groupBy(wasteRecordsTable.ingredientId, ingredientsTable.name)
    .orderBy(sum(wasteRecordsTable.totalCost));

  res.json({
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    rows,
    totalWasteCost: rows.reduce((s, r) => s + (r.totalCost ?? 0), 0),
  });
});

// ── POST /admin/waste-records ─────────────────────────────────────────────────
router.post("/admin/waste-records", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const {
    ingredientId, quantity, unit, unitCost, reason = "", wasteType = "expired",
  } = req.body as {
    ingredientId: string;
    quantity: string;
    unit?: string;
    unitCost?: string;
    reason?: string;
    wasteType?: string;
  };

  if (!ingredientId || !quantity) {
    res.status(400).json({ error: "ingredientId y quantity son obligatorios" }); return;
  }
  if (!VALID_TYPES.includes(wasteType as any)) {
    res.status(400).json({ error: `wasteType debe ser: ${VALID_TYPES.join(", ")}` }); return;
  }

  const [ingredient] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, ingredientId));
  if (!ingredient) { res.status(404).json({ error: "Ingrediente no encontrado" }); return; }

  const qty = Math.abs(parseFloat(String(quantity)));
  if (isNaN(qty) || qty <= 0) { res.status(400).json({ error: "quantity debe ser > 0" }); return; }

  const costPerUnit = parseFloat(String(unitCost ?? ingredient.averageCost ?? ingredient.purchaseCost ?? "0"));
  const totalCost = qty * costPerUnit;
  const recordUnit = unit ?? ingredient.unit;

  const user = (req as any).user;

  await db.transaction(async (tx) => {
    await tx.select({ id: ingredientsTable.id }).from(ingredientsTable)
      .where(eq(ingredientsTable.id, ingredientId))
      .for("update");
    // Insert waste record
    await tx.insert(wasteRecordsTable).values({
      ingredientId,
      quantity: String(qty),
      unit: recordUnit,
      unitCost: String(costPerUnit),
      totalCost: String(totalCost),
      reason,
      wasteType,
      employeeId: user?.id ?? null,
    });

    // Decrement current stock
    await tx
      .update(ingredientsTable)
      .set({
        currentStock: sql`GREATEST(0, (${ingredientsTable.currentStock})::numeric - ${qty}::numeric)`,
        updatedAt: new Date(),
      })
      .where(eq(ingredientsTable.id, ingredientId));

    // Log as waste movement
    await tx.insert(stockMovementsTable).values({
      ingredientId,
      movementType: "waste",
      quantity: String(-qty),
      unitCost: String(costPerUnit),
      reason: `Merma (${wasteType}): ${reason}`,
      employeeId: user?.id ?? null,
    });
  });

  const [updated] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, ingredientId));
  res.status(201).json({ ok: true, ingredient: updated });
});

export default router;
