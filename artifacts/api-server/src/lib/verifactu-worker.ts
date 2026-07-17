/**
 * verifactu-worker.ts — Background worker for VERI*FACTU record submission
 *
 * Polls every 60 s for verifactu_records with estado = 'pendiente_envio' or
 * 'pendiente_reintento' (where proximo_reintento is in the past), calls the
 * existing submitRecord() helper, logs each attempt to verifactu_audit_log,
 * and marks as 'failed_permanent' after MAX_RETRIES failed attempts.
 */

import { db } from "@workspace/db";
import { verifactuRecordsTable, verifactuAuditLogTable } from "@workspace/db";
import { eq, or, and, lte, sql } from "drizzle-orm";
import { submitRecord, getConfig } from "../routes/verifactu.js";

const POLL_INTERVAL_MS = 60_000; // 1 minute
const MAX_RETRIES = 3;

let workerTimer: ReturnType<typeof setInterval> | null = null;

// ─── Tick ─────────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  const now = new Date();

  // Load config once per tick (lightweight — single-row table)
  let config: Awaited<ReturnType<typeof getConfig>>;
  try {
    config = await getConfig();
    if (!config.activo) return; // VeriFactu disabled — skip silently
  } catch (err) {
    console.error("[verifactu-worker] could not load config:", err);
    return;
  }

  // Find records that are ready to submit
  const pending = await db
    .select()
    .from(verifactuRecordsTable)
    .where(
      or(
        eq(verifactuRecordsTable.estado, "pendiente_envio"),
        and(
          eq(verifactuRecordsTable.estado, "pendiente_reintento"),
          lte(verifactuRecordsTable.proximoReintento, now),
        ),
      )
    )
    .limit(20); // cap per tick to avoid thundering herd on backlog

  if (pending.length === 0) return;

  console.log(`[verifactu-worker] ${pending.length} registro(s) pendiente(s)`);

  for (const record of pending) {
    try {
      const result = await submitRecord(record, config);

      if (result.ok || result.estado === "aceptado" || result.estado === "aceptado_con_errores") {
        // Success — mark record with the AEAT response
        await db
          .update(verifactuRecordsTable)
          .set({
            estado: result.estado,
            aeatCodigo: result.codigo,
            aeatDescripcion: result.descripcion,
            aeatCsv: result.csv,
            xmlRespuesta: result.xmlRespuesta,
            aeatFechaEnvio: now,
            updatedAt: now,
          })
          .where(eq(verifactuRecordsTable.id, record.id));

        await logAudit(record.id, "envio_automatico", "ok",
          `Enviado por worker. Estado: ${result.estado}. CSV: ${result.csv}`);

      } else {
        // Failure — increment retry counter
        const newRetries = (record.reintentos ?? 0) + 1;
        const isPermanent = newRetries >= MAX_RETRIES;
        const nextRetry = isPermanent
          ? null
          : new Date(now.getTime() + 5 * 60_000 * newRetries); // back-off: 5, 10, 15 min

        await db
          .update(verifactuRecordsTable)
          .set({
            estado: isPermanent ? "failed_permanent" : "pendiente_reintento",
            reintentos: newRetries,
            proximoReintento: nextRetry,
            aeatCodigo: result.codigo,
            aeatDescripcion: result.descripcion,
            updatedAt: now,
          })
          .where(eq(verifactuRecordsTable.id, record.id));

        await logAudit(record.id, "reintento_fallido",
          isPermanent ? "failed_permanent" : "reintento",
          `Intento ${newRetries}/${MAX_RETRIES}. Código: ${result.codigo}. ${result.descripcion}`);

        if (isPermanent) {
          console.warn(`[verifactu-worker] registro ${record.id} marcado como failed_permanent tras ${MAX_RETRIES} intentos`);
        }
      }
    } catch (err) {
      // Unexpected error — increment retries but do not crash the worker
      const newRetries = (record.reintentos ?? 0) + 1;
      const isPermanent = newRetries >= MAX_RETRIES;
      const nextRetry = isPermanent ? null : new Date(now.getTime() + 5 * 60_000 * newRetries);

      await db
        .update(verifactuRecordsTable)
        .set({
          estado: isPermanent ? "failed_permanent" : "pendiente_reintento",
          reintentos: newRetries,
          proximoReintento: nextRetry,
          updatedAt: now,
        })
        .where(eq(verifactuRecordsTable.id, record.id))
        .catch(() => {});

      await logAudit(record.id, "error_interno", "error",
        `Error inesperado en el worker: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});

      console.error(`[verifactu-worker] error procesando registro ${record.id}:`, err);
    }
  }
}

async function logAudit(
  recordId: string,
  accion: string,
  resultado: string,
  detalles: string
): Promise<void> {
  await db.insert(verifactuAuditLogTable).values({
    recordId,
    accion,
    empleadoNombre: "worker",
    terminal: "background",
    resultado,
    detalles,
  }).catch(() => {});
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startVerifactuWorker(): void {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    tick().catch((err) => console.error("[verifactu-worker] tick error:", err));
  }, POLL_INTERVAL_MS);
  // Run immediately on start to pick up anything pending from a previous session
  void tick().catch((err) => console.error("[verifactu-worker] initial tick error:", err));
  console.log("[verifactu-worker] started, polling every", POLL_INTERVAL_MS / 1000, "s");
}

export function stopVerifactuWorker(): void {
  if (workerTimer) { clearInterval(workerTimer); workerTimer = null; }
}
