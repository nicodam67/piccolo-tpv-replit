/**
 * Reservations CRUD + status flow.
 * Status flow: pendiente → confirmada → cliente_llegado → sentada → finalizada / cancelada / no_presentado
 * Conflict rule: same mesa, same fecha, active reservation within 90 minutes.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  reservationsTable,
  restaurantTablesTable,
  ordersTable,
  tableEventsTable,
} from "@workspace/db";
import { sql, eq, and, ne, not, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

const TERMINAL_STATUSES = ["cancelada", "no_presentado", "finalizada"];
const ACTIVE_STATUSES   = ["pendiente", "confirmada", "cliente_llegado", "sentada"];
const ALL_STATUSES      = [...ACTIVE_STATUSES, ...TERMINAL_STATUSES];

/** Convert HH:MM string to total minutes for overlap comparison */
function toMins(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Check for conflicting reservations on the same table and date */
async function hasConflict(params: {
  mesaId: string;
  fecha: string;
  hora: string;
  excludeId?: string;
}): Promise<boolean> {
  const targetMins = toMins(params.hora);
  const SLOT_MIN = 90; // 90-minute window

  const conditions = [
    eq(reservationsTable.mesaId, params.mesaId),
    eq(reservationsTable.fecha, params.fecha),
    inArray(reservationsTable.status, ACTIVE_STATUSES),
  ];
  if (params.excludeId) conditions.push(ne(reservationsTable.id, params.excludeId));

  const rows = await db
    .select({ hora: reservationsTable.hora })
    .from(reservationsTable)
    .where(and(...conditions));

  return rows.some(r => Math.abs(toMins(r.hora) - targetMins) < SLOT_MIN);
}

// ── GET /reservations ─────────────────────────────────────────────────────────
// ?date=YYYY-MM-DD  — filter by fecha
// ?status=xxx       — filter by status

router.get("/reservations", requireAuth, async (req, res): Promise<void> => {
  const conditions: ReturnType<typeof eq>[] = [];

  const date = typeof req.query.date === "string" ? req.query.date : null;
  const status = typeof req.query.status === "string" ? req.query.status : null;

  if (date) conditions.push(eq(reservationsTable.fecha, date));
  if (status && ALL_STATUSES.includes(status)) conditions.push(eq(reservationsTable.status, status));

  const rows = await db
    .select()
    .from(reservationsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(reservationsTable.fecha, reservationsTable.hora);

  res.json(rows);
});

// ── POST /reservations ────────────────────────────────────────────────────────

router.post("/reservations", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user as { id?: string } | undefined;
  const b = req.body ?? {};

  if (!b.fecha || typeof b.fecha !== "string") { res.status(400).json({ error: "fecha requerida (YYYY-MM-DD)" }); return; }
  if (!b.hora  || typeof b.hora  !== "string") { res.status(400).json({ error: "hora requerida (HH:MM)" }); return; }
  if (!b.nombre || typeof b.nombre !== "string" || !b.nombre.trim()) { res.status(400).json({ error: "nombre requerido" }); return; }

  const mesaId = typeof b.mesaId === "string" && b.mesaId ? b.mesaId : null;

  // Conflict check only when a specific table is assigned
  if (mesaId) {
    const conflict = await hasConflict({ mesaId, fecha: b.fecha, hora: b.hora });
    if (conflict) { res.status(409).json({ error: "Ya existe una reserva activa en esa mesa en ese horario" }); return; }
  }

  const [row] = await db.insert(reservationsTable).values({
    fecha:         b.fecha,
    hora:          b.hora,
    nombre:        b.nombre.trim(),
    telefono:      typeof b.telefono === "string" ? b.telefono.trim() : "",
    personas:      Number.isFinite(b.personas) && b.personas >= 1 ? Math.floor(b.personas) : 2,
    zonaPreferida: typeof b.zonaPreferida === "string" ? b.zonaPreferida.trim() : null,
    mesaId,
    notes:         typeof b.notes === "string" ? b.notes.trim() : "",
    status:        "pendiente",
    createdBy:     user?.id ?? null,
  }).returning();

  res.status(201).json(row);
});

// ── PATCH /reservations/:id ───────────────────────────────────────────────────

router.patch("/reservations/:id", requireAuth, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const b = req.body ?? {};
  const updates: Partial<typeof reservationsTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (typeof b.fecha    === "string") updates.fecha    = b.fecha;
  if (typeof b.hora     === "string") updates.hora     = b.hora;
  if (typeof b.nombre   === "string" && b.nombre.trim()) updates.nombre  = b.nombre.trim();
  if (typeof b.telefono === "string") updates.telefono = b.telefono.trim();
  if (Number.isFinite(b.personas) && b.personas >= 1)   updates.personas = Math.floor(b.personas);
  if ("zonaPreferida" in b) updates.zonaPreferida = b.zonaPreferida ?? null;
  if ("mesaId"        in b) updates.mesaId        = b.mesaId ?? null;
  if (typeof b.notes  === "string")  updates.notes    = b.notes.trim();
  if (typeof b.status === "string" && ALL_STATUSES.includes(b.status)) updates.status = b.status;

  // Conflict check if table or date/hora is being changed
  const [existing] = await db.select().from(reservationsTable).where(eq(reservationsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Reserva no encontrada" }); return; }

  const newMesaId = updates.mesaId ?? existing.mesaId;
  const newFecha  = updates.fecha  ?? existing.fecha;
  const newHora   = updates.hora   ?? existing.hora;

  if (newMesaId && ACTIVE_STATUSES.includes(updates.status ?? existing.status)) {
    const conflict = await hasConflict({ mesaId: newMesaId, fecha: newFecha, hora: newHora, excludeId: id });
    if (conflict) { res.status(409).json({ error: "Ya existe una reserva activa en esa mesa en ese horario" }); return; }
  }

  const [row] = await db
    .update(reservationsTable)
    .set(updates)
    .where(eq(reservationsTable.id, id))
    .returning();

  res.json(row);
});

// ── DELETE /reservations/:id ──────────────────────────────────────────────────

router.delete("/reservations/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;

  const [row] = await db
    .delete(reservationsTable)
    .where(eq(reservationsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Reserva no encontrada" }); return; }
  res.status(204).send();
});

// ── POST /reservations/:id/arrive ─────────────────────────────────────────────
// Marks reservation as cliente_llegado and optionally opens the assigned table.
// Returns pre-filled data for the OpenTableModal.

router.post("/reservations/:id/arrive", requireAuth, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const user = (req as any).user as { id?: string; name?: string } | undefined;
  const { openTable = false } = req.body ?? {};

  const [reservation] = await db
    .select()
    .from(reservationsTable)
    .where(eq(reservationsTable.id, id))
    .limit(1);

  if (!reservation) { res.status(404).json({ error: "Reserva no encontrada" }); return; }
  if (!["pendiente", "confirmada"].includes(reservation.status)) {
    res.status(409).json({ error: `No se puede marcar llegado desde estado '${reservation.status}'` }); return;
  }

  // Update status
  const [updated] = await db
    .update(reservationsTable)
    .set({ status: "cliente_llegado", updatedAt: new Date() })
    .where(eq(reservationsTable.id, id))
    .returning();

  let tableResult: { tableId: string; orderId: string } | null = null;

  // Optionally open the assigned table
  if (openTable && reservation.mesaId) {
    const result = await db.transaction(async (tx) => {
      const [table] = await tx
        .update(restaurantTablesTable)
        .set({ status: "occupied" })
        .where(and(
          eq(restaurantTablesTable.id, reservation.mesaId!),
          sql`status IN ('free', 'reserved')`,
        ))
        .returning();
      if (!table) return null;

      const [order] = await tx.insert(ordersTable).values({
        tableId:   table.id,
        employeeId: user?.id ?? null,
        status:    "open",
        guestCount: reservation.personas,
        notes:      reservation.notes,
        clientName: reservation.nombre,
      }).returning();

      return { tableId: table.id, orderId: order.id };
    });

    tableResult = result;

    if (tableResult) {
      try {
        await db.insert(tableEventsTable).values({
          tableId:      tableResult.tableId,
          orderId:      tableResult.orderId,
          employeeId:   user?.id ?? null,
          employeeName: user?.name ?? "",
          action:       "open_table",
          details:      `Reserva llegada — ${reservation.nombre} · ${reservation.personas}p`,
          metadata:     { reservationId: id },
        });
      } catch { /* non-critical */ }
    }
  }

  res.json({
    reservation: updated,
    tableOpened: tableResult,
    prefill: {
      guestCount: reservation.personas,
      clientName: reservation.nombre,
      notes:      reservation.notes,
      mesaId:     reservation.mesaId,
    },
  });
});

export default router;
