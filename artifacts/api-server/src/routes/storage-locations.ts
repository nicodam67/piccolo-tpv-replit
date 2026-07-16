import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { storageLocationsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// ── GET /admin/storage-locations ──────────────────────────────────────────────
router.get("/admin/storage-locations", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(storageLocationsTable)
    .where(eq(storageLocationsTable.active, true))
    .orderBy(asc(storageLocationsTable.name));
  res.json(rows);
});

// ── POST /admin/storage-locations ─────────────────────────────────────────────
router.post("/admin/storage-locations", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { name, description, temperature = "ambient" } = req.body as {
    name: string;
    description?: string;
    temperature?: string;
  };

  if (!name?.trim()) { res.status(400).json({ error: "name es obligatorio" }); return; }

  const VALID_TEMPS = ["ambient", "refrigerated", "frozen", "dry"];
  if (!VALID_TEMPS.includes(temperature)) {
    res.status(400).json({ error: `temperature debe ser: ${VALID_TEMPS.join(", ")}` }); return;
  }

  const [row] = await db
    .insert(storageLocationsTable)
    .values({ name: name.trim(), description: description ?? null, temperature })
    .returning();

  res.status(201).json(row);
});

// ── PATCH /admin/storage-locations/:id ───────────────────────────────────────
router.patch("/admin/storage-locations/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { name, description, temperature, active } = req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = (name as string).trim();
  if (description !== undefined) updates.description = description;
  if (temperature != null) updates.temperature = temperature;
  if (active != null) updates.active = active;

  if (!Object.keys(updates).length) { res.status(400).json({ error: "Sin cambios" }); return; }

  const [row] = await db
    .update(storageLocationsTable)
    .set(updates as any)
    .where(eq(storageLocationsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Ubicación no encontrada" }); return; }
  res.json(row);
});

// ── DELETE /admin/storage-locations/:id ──────────────────────────────────────
router.delete("/admin/storage-locations/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db
    .update(storageLocationsTable)
    .set({ active: false })
    .where(eq(storageLocationsTable.id, id));
  res.json({ ok: true });
});

export default router;
