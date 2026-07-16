import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ingredientCategoriesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// ── GET /admin/ingredient-categories ─────────────────────────────────────────
router.get("/admin/ingredient-categories", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(ingredientCategoriesTable)
    .where(eq(ingredientCategoriesTable.active, true))
    .orderBy(asc(ingredientCategoriesTable.sortOrder), asc(ingredientCategoriesTable.name));
  res.json(rows);
});

// ── POST /admin/ingredient-categories ─────────────────────────────────────────
router.post("/admin/ingredient-categories", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { name, color = "#6366f1", icon = "📦", sortOrder = 0 } = req.body as {
    name: string;
    color?: string;
    icon?: string;
    sortOrder?: number;
  };

  if (!name?.trim()) { res.status(400).json({ error: "name es obligatorio" }); return; }

  const [row] = await db
    .insert(ingredientCategoriesTable)
    .values({ name: name.trim(), color, icon, sortOrder })
    .returning();

  res.status(201).json(row);
});

// ── PATCH /admin/ingredient-categories/:id ────────────────────────────────────
router.patch("/admin/ingredient-categories/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { name, color, icon, sortOrder, active } = req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = (name as string).trim();
  if (color != null) updates.color = color;
  if (icon != null) updates.icon = icon;
  if (sortOrder != null) updates.sortOrder = sortOrder;
  if (active != null) updates.active = active;

  if (!Object.keys(updates).length) { res.status(400).json({ error: "Sin cambios" }); return; }

  const [row] = await db
    .update(ingredientCategoriesTable)
    .set(updates as any)
    .where(eq(ingredientCategoriesTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Categoría no encontrada" }); return; }
  res.json(row);
});

// ── DELETE /admin/ingredient-categories/:id ───────────────────────────────────
router.delete("/admin/ingredient-categories/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db
    .update(ingredientCategoriesTable)
    .set({ active: false })
    .where(eq(ingredientCategoriesTable.id, id));
  res.json({ ok: true });
});

export default router;
