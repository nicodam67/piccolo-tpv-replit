/**
 * Service shifts — CRUD for configurable restaurant service time slots.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { serviceShiftsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateOpeningHours } from "../lib/configuration";
import { logDocumentAction } from "../lib/document-audit";

const router: IRouter = Router();

// GET /service-shifts
router.get("/service-shifts", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(serviceShiftsTable)
    .orderBy(asc(serviceShiftsTable.horaInicio));
  res.json(rows);
});

// POST /service-shifts
router.post("/service-shifts", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const b = req.body ?? {};
  if (!b.nombre?.trim()) { res.status(400).json({ error: "nombre requerido" }); return; }
  if (!b.horaInicio) { res.status(400).json({ error: "horaInicio requerida" }); return; }
  if (!b.horaFin)    { res.status(400).json({ error: "horaFin requerida" }); return; }
  const scheduleIssues = validateOpeningHours({
    mon: { open: b.horaInicio, close: b.horaFin },
  });
  if (scheduleIssues.length > 0) {
    res.status(422).json({ error: "Horario de reservas no válido", issues: scheduleIssues });
    return;
  }

  const [row] = await db.insert(serviceShiftsTable).values({
    nombre:           b.nombre.trim(),
    tipo:             ["comida", "cena", "especial"].includes(b.tipo) ? b.tipo : "comida",
    horaInicio:       b.horaInicio,
    horaFin:          b.horaFin,
    intervaloMinutos: Number.isFinite(b.intervaloMinutos) ? b.intervaloMinutos : 15,
    capacidadMax:     Number.isFinite(b.capacidadMax) ? b.capacidadMax : 50,
    maxReservas:      Number.isFinite(b.maxReservas) ? b.maxReservas : 20,
    maxComensales:    Number.isFinite(b.maxComensales) ? b.maxComensales : 50,
    duracionDefault:  Number.isFinite(b.duracionDefault) ? b.duracionDefault : 90,
    diasActivos:      Array.isArray(b.diasActivos) ? b.diasActivos : [0,1,2,3,4,5,6],
    activo:           b.activo !== false,
  }).returning();

  await logDocumentAction({
    action: "create_service_shift",
    documentType: "configuration",
    documentId: row.id,
    employeeId: req.user?.id,
    employeeName: req.user?.name ?? "",
    details: `Turno de reservas "${row.nombre}" creado`,
  });
  res.status(201).json(row);
});

// PATCH /service-shifts/:id
router.patch("/service-shifts/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const b = req.body ?? {};
  const updates: Partial<typeof serviceShiftsTable.$inferInsert> = { updatedAt: new Date() };
  const [existing] = await db.select().from(serviceShiftsTable).where(eq(serviceShiftsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Turno no encontrado" }); return; }

  if (typeof b.nombre === "string" && b.nombre.trim()) updates.nombre = b.nombre.trim();
  if (["comida", "cena", "especial"].includes(b.tipo)) updates.tipo = b.tipo;
  if (typeof b.horaInicio === "string") updates.horaInicio = b.horaInicio;
  if (typeof b.horaFin === "string") updates.horaFin = b.horaFin;
  if (Number.isFinite(b.intervaloMinutos)) updates.intervaloMinutos = b.intervaloMinutos;
  if (Number.isFinite(b.capacidadMax))     updates.capacidadMax     = b.capacidadMax;
  if (Number.isFinite(b.maxReservas))      updates.maxReservas      = b.maxReservas;
  if (Number.isFinite(b.maxComensales))    updates.maxComensales    = b.maxComensales;
  if (Number.isFinite(b.duracionDefault))  updates.duracionDefault  = b.duracionDefault;
  if (Array.isArray(b.diasActivos))        updates.diasActivos      = b.diasActivos;
  if (typeof b.activo === "boolean")       updates.activo           = b.activo;

  const scheduleIssues = validateOpeningHours({
    mon: {
      open: String(updates.horaInicio ?? existing.horaInicio),
      close: String(updates.horaFin ?? existing.horaFin),
    },
  });
  if (scheduleIssues.length > 0) {
    res.status(422).json({ error: "Horario de reservas no válido", issues: scheduleIssues });
    return;
  }

  const [row] = await db.update(serviceShiftsTable).set(updates).where(eq(serviceShiftsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Turno no encontrado" }); return; }
  await logDocumentAction({
    action: "update_service_shift",
    documentType: "configuration",
    documentId: row.id,
    employeeId: req.user?.id,
    employeeName: req.user?.name ?? "",
    details: `Turno de reservas "${row.nombre}" actualizado`,
  });
  res.json(row);
});

// DELETE /service-shifts/:id
router.delete("/service-shifts/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [row] = await db.delete(serviceShiftsTable).where(eq(serviceShiftsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Turno no encontrado" }); return; }
  await logDocumentAction({
    action: "delete_service_shift",
    documentType: "configuration",
    documentId: row.id,
    employeeId: req.user?.id,
    employeeName: req.user?.name ?? "",
    details: `Turno de reservas "${row.nombre}" eliminado`,
  });
  res.status(204).send();
});

export default router;
