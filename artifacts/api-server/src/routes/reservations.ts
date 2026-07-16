/**
 * Reservations — full professional CRUD + status flow + auto-assign suggestion.
 *
 * Status flow:
 *   pendiente → confirmada → recordatorio_enviado → cliente_avisado
 *            → cliente_llegado → sentada → finalizada
 *            → cancelada_cliente | cancelada_restaurante | no_presentado | en_espera
 *
 * Conflict rule: same mesa, same fecha, active reservations overlap based on
 * each reservation's duracion_minutos.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  reservationsTable,
  reservationStatusHistoryTable,
  restaurantTablesTable,
  roomZonesTable,
  ordersTable,
  tableEventsTable,
  crmClientsTable,
} from "@workspace/db";
import { sql, eq, and, ne, inArray, gte, lte, asc, desc, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

const TERMINAL_STATUSES = ["cancelada_cliente", "cancelada_restaurante", "no_presentado", "finalizada"];
const ACTIVE_STATUSES   = ["pendiente", "confirmada", "recordatorio_enviado", "cliente_avisado", "cliente_llegado", "sentada", "en_espera"];
const ALL_STATUSES      = [...ACTIVE_STATUSES, ...TERMINAL_STATUSES];

/** HH:MM → total minutes */
function toMins(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Do two time windows overlap? Window = [start, start+duration) */
function overlaps(
  horaA: string, durA: number,
  horaB: string, durB: number,
): boolean {
  const startA = toMins(horaA);
  const endA   = startA + durA;
  const startB = toMins(horaB);
  const endB   = startB + durB;
  return startA < endB && startB < endA;
}

/** Check for overlapping reservations on the same table and date */
async function hasConflict(params: {
  mesaId: string;
  fecha: string;
  hora: string;
  duracionMinutos: number;
  excludeId?: string;
}): Promise<{ conflict: boolean; conflictWith?: string }> {
  const conditions = [
    eq(reservationsTable.mesaId, params.mesaId),
    eq(reservationsTable.fecha, params.fecha),
    inArray(reservationsTable.status, ACTIVE_STATUSES),
  ];
  if (params.excludeId) conditions.push(ne(reservationsTable.id, params.excludeId));

  const rows = await db
    .select({ id: reservationsTable.id, hora: reservationsTable.hora, duracion: reservationsTable.duracionMinutos, nombre: reservationsTable.nombre })
    .from(reservationsTable)
    .where(and(...conditions));

  const hit = rows.find(r => overlaps(r.hora, r.duracion, params.hora, params.duracionMinutos));
  return hit
    ? { conflict: true, conflictWith: `${hit.nombre} (${hit.hora})` }
    : { conflict: false };
}

/** Log a status transition */
async function logStatusChange(params: {
  reservationId: string;
  statusFrom: string;
  statusTo: string;
  changedBy?: string | null;
  notes?: string;
}) {
  await db.insert(reservationStatusHistoryTable).values({
    reservationId: params.reservationId,
    statusFrom:    params.statusFrom,
    statusTo:      params.statusTo,
    changedBy:     params.changedBy ?? null,
    notes:         params.notes ?? "",
  });
}

// ── GET /reservations ─────────────────────────────────────────────────────────
// ?date=YYYY-MM-DD    — single day
// ?from=YYYY-MM-DD    — range start (inclusive)
// ?to=YYYY-MM-DD      — range end (inclusive)
// ?status=xxx         — filter by status
// ?clientId=uuid      — filter by CRM client
// ?includeClient=true — JOIN crm_clients to return client name/phone

router.get("/reservations", requireAuth, async (req, res): Promise<void> => {
  const q = req.query;
  const date    = typeof q.date    === "string" ? q.date    : null;
  const from    = typeof q.from    === "string" ? q.from    : null;
  const to      = typeof q.to      === "string" ? q.to      : null;
  const status  = typeof q.status  === "string" ? q.status  : null;
  const clientId = typeof q.clientId === "string" ? q.clientId : null;

  const conditions = [];
  if (date)     conditions.push(eq(reservationsTable.fecha, date));
  if (from)     conditions.push(gte(reservationsTable.fecha, from));
  if (to)       conditions.push(lte(reservationsTable.fecha, to));
  if (status && ALL_STATUSES.includes(status)) conditions.push(eq(reservationsTable.status, status));
  if (clientId) conditions.push(eq(reservationsTable.clientId, clientId));

  const rows = await db
    .select({
      reservation:  reservationsTable,
      clientNombre: crmClientsTable.nombre,
      clientApellidos: crmClientsTable.apellidos,
      clientEmail:  crmClientsTable.email,
      clientTelefono: crmClientsTable.telefono,
      mesaNumero:   restaurantTablesTable.tableNumber,
    })
    .from(reservationsTable)
    .leftJoin(crmClientsTable, eq(reservationsTable.clientId, crmClientsTable.id))
    .leftJoin(restaurantTablesTable, eq(reservationsTable.mesaId, restaurantTablesTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(reservationsTable.fecha), asc(reservationsTable.hora));

  res.json(rows.map(r => ({
    ...r.reservation,
    clientNombre: r.clientNombre,
    clientApellidos: r.clientApellidos,
    clientEmail:  r.clientEmail,
    clientTelefono: r.clientTelefono,
    mesaNumero:   r.mesaNumero,
  })));
});

// ── GET /reservations/suggest-table ──────────────────────────────────────────
// Auto-assignment: suggest best available tables for a reservation.
// ?fecha, ?hora, ?duracion, ?personas, ?zona, ?accesibilidad=true, ?trona=true

router.get("/reservations/suggest-table", requireAuth, async (req, res): Promise<void> => {
  const q = req.query;
  const fecha    = typeof q.fecha    === "string" ? q.fecha    : null;
  const hora     = typeof q.hora     === "string" ? q.hora     : null;
  const duracion = typeof q.duracion === "string" ? parseInt(q.duracion) : 90;
  const personas = typeof q.personas === "string" ? parseInt(q.personas) : 2;
  const zona     = typeof q.zona     === "string" ? q.zona     : null;

  if (!fecha || !hora) { res.status(400).json({ error: "fecha y hora requeridas" }); return; }

  // All tables
  const allTables = await db
    .select({
      id: restaurantTablesTable.id,
      tableNumber: restaurantTablesTable.tableNumber,
      capacity: restaurantTablesTable.capacity,
      status: restaurantTablesTable.status,
      zoneId: restaurantTablesTable.zoneId,
      zoneName: roomZonesTable.name,
    })
    .from(restaurantTablesTable)
    .leftJoin(roomZonesTable, eq(restaurantTablesTable.zoneId, roomZonesTable.id))
    .where(eq(restaurantTablesTable.active, true));

  // Reservations that conflict with the time window
  const busyConditions = [
    eq(reservationsTable.fecha, fecha),
    inArray(reservationsTable.status, ACTIVE_STATUSES),
  ];
  const busyReservations = await db
    .select({ mesaId: reservationsTable.mesaId, hora: reservationsTable.hora, duracion: reservationsTable.duracionMinutos })
    .from(reservationsTable)
    .where(and(...busyConditions));

  const busyTableIds = new Set(
    busyReservations
      .filter(r => r.mesaId && overlaps(r.hora, r.duracion, hora, duracion))
      .map(r => r.mesaId!)
  );

  // Tables currently occupied in the TPV
  const occupiedTableIds = new Set(
    allTables.filter(t => t.status === "occupied" || t.status === "reserved").map(t => t.id)
  );

  // Score available tables
  const candidates = allTables
    .filter(t => !busyTableIds.has(t.id) && !occupiedTableIds.has(t.id))
    .filter(t => t.capacity >= personas)
    .map(t => {
      let score = 100;
      // Prefer smallest table that fits (minimize waste)
      score -= (t.capacity - personas) * 5;
      // Prefer matching zone
      if (zona && t.zoneName?.toLowerCase().includes(zona.toLowerCase())) score += 30;
      return { ...t, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  res.json({ suggestions: candidates, busyTableCount: busyTableIds.size });
});

// ── GET /reservations/:id ─────────────────────────────────────────────────────
router.get("/reservations/:id", requireAuth, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [row] = await db
    .select({
      reservation: reservationsTable,
      clientNombre: crmClientsTable.nombre,
      clientApellidos: crmClientsTable.apellidos,
      clientEmail: crmClientsTable.email,
      clientTelefono: crmClientsTable.telefono,
      mesaNumero: restaurantTablesTable.tableNumber,
    })
    .from(reservationsTable)
    .leftJoin(crmClientsTable, eq(reservationsTable.clientId, crmClientsTable.id))
    .leftJoin(restaurantTablesTable, eq(reservationsTable.mesaId, restaurantTablesTable.id))
    .where(eq(reservationsTable.id, id))
    .limit(1);

  if (!row) { res.status(404).json({ error: "Reserva no encontrada" }); return; }

  const history = await db
    .select()
    .from(reservationStatusHistoryTable)
    .where(eq(reservationStatusHistoryTable.reservationId, id))
    .orderBy(asc(reservationStatusHistoryTable.changedAt));

  res.json({ ...row.reservation, clientNombre: row.clientNombre, mesaNumero: row.mesaNumero, history });
});

// ── POST /reservations ────────────────────────────────────────────────────────
router.post("/reservations", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user as { id?: string } | undefined;
  const b = req.body ?? {};

  if (!b.fecha  || typeof b.fecha  !== "string") { res.status(400).json({ error: "fecha requerida (YYYY-MM-DD)" }); return; }
  if (!b.hora   || typeof b.hora   !== "string") { res.status(400).json({ error: "hora requerida (HH:MM)" }); return; }
  if (!b.nombre || !b.nombre.trim())              { res.status(400).json({ error: "nombre requerido" }); return; }

  const mesaId         = typeof b.mesaId   === "string" && b.mesaId   ? b.mesaId   : null;
  const clientId       = typeof b.clientId === "string" && b.clientId ? b.clientId : null;
  const shiftId        = typeof b.shiftId  === "string" && b.shiftId  ? b.shiftId  : null;
  const duracionMinutos = Number.isFinite(b.duracionMinutos) && b.duracionMinutos > 0 ? Math.floor(b.duracionMinutos) : 90;

  if (mesaId) {
    const { conflict, conflictWith } = await hasConflict({ mesaId, fecha: b.fecha, hora: b.hora, duracionMinutos });
    if (conflict) { res.status(409).json({ error: `Conflicto con reserva existente: ${conflictWith}` }); return; }
  }

  const [row] = await db.insert(reservationsTable).values({
    fecha:                b.fecha,
    hora:                 b.hora,
    nombre:               b.nombre.trim(),
    telefono:             typeof b.telefono === "string" ? b.telefono.trim() : "",
    email:                typeof b.email    === "string" ? b.email.trim()    : "",
    personas:             Number.isFinite(b.personas) && b.personas >= 1 ? Math.floor(b.personas) : 2,
    clientId,
    shiftId,
    zonaPreferida:        typeof b.zonaPreferida === "string" ? b.zonaPreferida.trim() || null : null,
    mesaId,
    duracionMinutos,
    idioma:               typeof b.idioma  === "string" ? b.idioma  : "es",
    alergias:             typeof b.alergias === "string" ? b.alergias.trim() : "",
    trona:                b.trona === true,
    accesibilidad:        b.accesibilidad === true,
    mascota:              b.mascota === true,
    ocasion:              typeof b.ocasion === "string" && b.ocasion ? b.ocasion : null,
    canal:                typeof b.canal   === "string" ? b.canal : "phone",
    confirmacionRequerida: b.confirmacionRequerida === true,
    notes:                typeof b.notes  === "string" ? b.notes.trim() : "",
    notasInternas:        typeof b.notasInternas === "string" ? b.notasInternas.trim() : "",
    status:               "pendiente",
    createdBy:            user?.id ?? null,
  }).returning();

  // Log initial status
  await logStatusChange({ reservationId: row!.id, statusFrom: "", statusTo: "pendiente", changedBy: user?.id });

  // If linked to a CRM client, update visit stats
  if (clientId) {
    await db.update(crmClientsTable)
      .set({ updatedAt: new Date() })
      .where(eq(crmClientsTable.id, clientId));
  }

  res.status(201).json(row);
});

// ── PATCH /reservations/:id ───────────────────────────────────────────────────
router.patch("/reservations/:id", requireAuth, async (req, res): Promise<void> => {
  const id   = req.params.id as string;
  const user = (req as any).user as { id?: string } | undefined;
  const b    = req.body ?? {};

  const [existing] = await db.select().from(reservationsTable).where(eq(reservationsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Reserva no encontrada" }); return; }

  const updates: Partial<typeof reservationsTable.$inferInsert> = { updatedAt: new Date() };

  if (typeof b.fecha    === "string") updates.fecha    = b.fecha;
  if (typeof b.hora     === "string") updates.hora     = b.hora;
  if (typeof b.nombre   === "string" && b.nombre.trim()) updates.nombre = b.nombre.trim();
  if (typeof b.telefono === "string") updates.telefono = b.telefono.trim();
  if (typeof b.email    === "string") updates.email    = b.email.trim();
  if (Number.isFinite(b.personas) && b.personas >= 1) updates.personas = Math.floor(b.personas);
  if ("clientId"       in b) updates.clientId        = b.clientId ?? null;
  if ("shiftId"        in b) updates.shiftId         = b.shiftId ?? null;
  if ("zonaPreferida"  in b) updates.zonaPreferida   = b.zonaPreferida ?? null;
  if ("mesaId"         in b) updates.mesaId          = b.mesaId ?? null;
  if (Number.isFinite(b.duracionMinutos) && b.duracionMinutos > 0) updates.duracionMinutos = Math.floor(b.duracionMinutos);
  if (typeof b.idioma   === "string") updates.idioma   = b.idioma;
  if (typeof b.alergias === "string") updates.alergias = b.alergias.trim();
  if (typeof b.trona    === "boolean") updates.trona   = b.trona;
  if (typeof b.accesibilidad === "boolean") updates.accesibilidad = b.accesibilidad;
  if (typeof b.mascota  === "boolean") updates.mascota = b.mascota;
  if ("ocasion"         in b) updates.ocasion         = b.ocasion ?? null;
  if (typeof b.canal    === "string") updates.canal    = b.canal;
  if (typeof b.confirmacionRequerida === "boolean") updates.confirmacionRequerida = b.confirmacionRequerida;
  if (typeof b.recordatorioEnviado   === "boolean") updates.recordatorioEnviado   = b.recordatorioEnviado;
  if (typeof b.notes         === "string") updates.notes         = b.notes.trim();
  if (typeof b.notasInternas === "string") updates.notasInternas = b.notasInternas.trim();

  const newStatus = typeof b.status === "string" && ALL_STATUSES.includes(b.status) ? b.status : null;
  if (newStatus) updates.status = newStatus;

  // Conflict check if table / date / time / duration is changing
  const newMesaId   = updates.mesaId   !== undefined ? updates.mesaId   : existing.mesaId;
  const newFecha    = updates.fecha    ?? existing.fecha;
  const newHora     = updates.hora     ?? existing.hora;
  const newDuracion = updates.duracionMinutos ?? existing.duracionMinutos;
  const effectiveStatus = newStatus ?? existing.status;

  if (newMesaId && ACTIVE_STATUSES.includes(effectiveStatus)) {
    const { conflict, conflictWith } = await hasConflict({ mesaId: newMesaId, fecha: newFecha, hora: newHora, duracionMinutos: newDuracion, excludeId: id });
    if (conflict) { res.status(409).json({ error: `Conflicto con reserva existente: ${conflictWith}` }); return; }
  }

  const [row] = await db.update(reservationsTable).set(updates).where(eq(reservationsTable.id, id)).returning();

  // Log status change if status changed
  if (newStatus && newStatus !== existing.status) {
    await logStatusChange({ reservationId: id, statusFrom: existing.status, statusTo: newStatus, changedBy: user?.id, notes: b.statusNotes ?? "" });

    // If marked no_presentado, increment counter on CRM client
    if (newStatus === "no_presentado" && existing.clientId) {
      await db.update(crmClientsTable)
        .set({ noPresentados: sql`no_presentados + 1`, updatedAt: new Date() } as any)
        .where(eq(crmClientsTable.id, existing.clientId));
    }
    // If cancelled, increment cancelaciones
    if ((newStatus === "cancelada_cliente" || newStatus === "cancelada_restaurante") && existing.clientId) {
      await db.update(crmClientsTable)
        .set({ cancelaciones: sql`cancelaciones + 1`, updatedAt: new Date() } as any)
        .where(eq(crmClientsTable.id, existing.clientId));
    }
    // If finalizada, update ultima_visita and total_visitas on CRM client
    if (newStatus === "finalizada" && existing.clientId) {
      await db.update(crmClientsTable)
        .set({ ultimaVisita: new Date(), totalVisitas: sql`total_visitas + 1`, updatedAt: new Date() } as any)
        .where(eq(crmClientsTable.id, existing.clientId));
    }
  }

  res.json(row);
});

// ── DELETE /reservations/:id ──────────────────────────────────────────────────
router.delete("/reservations/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [row] = await db.delete(reservationsTable).where(eq(reservationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Reserva no encontrada" }); return; }
  res.status(204).send();
});

// ── POST /reservations/:id/arrive ─────────────────────────────────────────────
// Marks reservation as cliente_llegado and optionally opens the assigned table.
router.post("/reservations/:id/arrive", requireAuth, async (req, res): Promise<void> => {
  const id   = req.params.id as string;
  const user = (req as any).user as { id?: string; name?: string } | undefined;
  const { openTable = false } = req.body ?? {};

  const [reservation] = await db.select().from(reservationsTable).where(eq(reservationsTable.id, id)).limit(1);
  if (!reservation) { res.status(404).json({ error: "Reserva no encontrada" }); return; }
  if (!["pendiente", "confirmada", "recordatorio_enviado", "cliente_avisado", "en_espera"].includes(reservation.status)) {
    res.status(409).json({ error: `No se puede marcar llegado desde estado '${reservation.status}'` }); return;
  }

  const [updated] = await db
    .update(reservationsTable)
    .set({ status: "cliente_llegado", updatedAt: new Date() })
    .where(eq(reservationsTable.id, id))
    .returning();

  await logStatusChange({ reservationId: id, statusFrom: reservation.status, statusTo: "cliente_llegado", changedBy: user?.id });

  let tableResult: { tableId: string; orderId: string } | null = null;

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
        tableId:    table.id,
        employeeId: user?.id ?? null,
        status:     "open",
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
      alergias:   reservation.alergias,
      trona:      reservation.trona,
    },
  });
});

// ── GET /reservations/:id/history ─────────────────────────────────────────────
router.get("/reservations/:id/history", requireAuth, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const rows = await db
    .select()
    .from(reservationStatusHistoryTable)
    .where(eq(reservationStatusHistoryTable.reservationId, id))
    .orderBy(asc(reservationStatusHistoryTable.changedAt));
  res.json(rows);
});

export default router;
