/**
 * Waiting list — walk-in customers waiting for a table.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { waitingListTable } from "@workspace/db";
import { eq, and, asc, inArray, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const ACTIVE_STATUSES = ["esperando", "avisado"];
const ALL_STATUSES = [...ACTIVE_STATUSES, "sentado", "cancelado", "no_localizado"];

// GET /waiting-list
// ?active=true filters only esperando|avisado
router.get("/waiting-list", requireAuth, async (req, res): Promise<void> => {
  const onlyActive = req.query.active === "true";
  const rows = await db
    .select()
    .from(waitingListTable)
    .where(onlyActive ? inArray(waitingListTable.status, ACTIVE_STATUSES) : undefined)
    .orderBy(asc(waitingListTable.horaLlegada));
  res.json(rows);
});

// POST /waiting-list
router.post("/waiting-list", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user as { id?: string } | undefined;
  const b = req.body ?? {};

  if (!b.nombre?.trim()) { res.status(400).json({ error: "nombre requerido" }); return; }
  if (!Number.isFinite(b.personas) || b.personas < 1) { res.status(400).json({ error: "personas inválido" }); return; }

  const [row] = await db.insert(waitingListTable).values({
    nombre:         b.nombre.trim(),
    telefono:       typeof b.telefono === "string" ? b.telefono.trim() : "",
    personas:       Math.floor(b.personas),
    horaLlegada:    b.horaLlegada ? new Date(b.horaLlegada) : new Date(),
    zonaPreferida:  typeof b.zonaPreferida === "string" ? b.zonaPreferida : null,
    tiempoEstimado: Number.isFinite(b.tiempoEstimado) ? b.tiempoEstimado : null,
    observaciones:  typeof b.observaciones === "string" ? b.observaciones.trim() : "",
    status:         "esperando",
    createdBy:      user?.id ?? null,
  }).returning();

  res.status(201).json(row);
});

// PATCH /waiting-list/:id
router.patch("/waiting-list/:id", requireAuth, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const b = req.body ?? {};
  const updates: Partial<typeof waitingListTable.$inferInsert> = { updatedAt: new Date() };

  if (typeof b.nombre === "string" && b.nombre.trim())   updates.nombre         = b.nombre.trim();
  if (typeof b.telefono === "string")                     updates.telefono       = b.telefono.trim();
  if (Number.isFinite(b.personas) && b.personas >= 1)    updates.personas       = Math.floor(b.personas);
  if ("zonaPreferida" in b)                               updates.zonaPreferida  = b.zonaPreferida ?? null;
  if (Number.isFinite(b.tiempoEstimado))                  updates.tiempoEstimado = b.tiempoEstimado;
  if (typeof b.observaciones === "string")                updates.observaciones  = b.observaciones.trim();
  if (typeof b.status === "string" && ALL_STATUSES.includes(b.status)) updates.status = b.status;

  const [row] = await db.update(waitingListTable).set(updates).where(eq(waitingListTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Entrada no encontrada" }); return; }
  res.json(row);
});

// DELETE /waiting-list/:id
router.delete("/waiting-list/:id", requireAuth, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [row] = await db.delete(waitingListTable).where(eq(waitingListTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Entrada no encontrada" }); return; }
  res.status(204).send();
});

export default router;
