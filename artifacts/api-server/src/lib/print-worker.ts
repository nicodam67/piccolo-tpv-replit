/**
 * print-worker.ts
 * Background worker that processes the print_queue table.
 *
 * - Polls every POLL_INTERVAL_MS (default 5 s).
 * - Picks up 'pending' and 'retrying' jobs ordered by created_at.
 * - Calls the simulated connector (swap for real HTTP call in production).
 * - On success: marks job as 'printed'.
 * - On failure: increments attempts, sets exponential backoff via updated_at,
 *   switches to 'retrying' (up to MAX_ATTEMPTS). After MAX_ATTEMPTS tries the
 *   fallback printer if configured; otherwise marks 'error'.
 * - Emits socket 'print:status' so the TPV can show alerts.
 * - Records every transition in print_audit.
 */

import { db } from "@workspace/db";
import {
  printQueueTable,
  printersTable,
  printAuditTable,
} from "@workspace/db";
import { asc, eq, and, inArray, lte } from "drizzle-orm";
import { sendToPrinter } from "./print-connector-sim";
import { emitToFunction } from "./socket-events";
import { nextPrintRetryAt } from "./print-resilience";

const POLL_INTERVAL_MS = 5_000;
const MAX_ATTEMPTS     = 3;
const LEASE_MS         = 30_000;
const WORKER_ID        = `${process.pid}:${crypto.randomUUID()}`;
let   workerTimer: ReturnType<typeof setInterval> | null = null;

async function transition(
  jobId: string,
  values: Partial<typeof printQueueTable.$inferInsert>,
  action: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(printQueueTable)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(printQueueTable.id, jobId));
    await tx.insert(printAuditTable).values({
      printQueueId: jobId,
      action,
      actorName: "sistema",
      detail: detail ?? null,
    });
  });
}

export async function recoverStalePrintJobs(now = new Date()): Promise<number> {
  const recovered = await db.update(printQueueTable)
    .set({
      status: "delivery_unknown",
      lastError: "El proceso terminó durante el envío; requiere verificación manual antes de reintentar",
      lockedBy: null,
      leaseUntil: null,
      updatedAt: now,
    })
    .where(and(
      eq(printQueueTable.status, "sending"),
      lte(printQueueTable.leaseUntil, now),
    ))
    .returning({ id: printQueueTable.id });

  for (const row of recovered) {
    await db.insert(printAuditTable).values({
      printQueueId: row.id,
      action: "delivery_unknown",
      actorName: "sistema",
      detail: { reason: "expired_worker_lease" },
    });
  }
  return recovered.length;
}

export async function processPrintQueueOnce(now = new Date()): Promise<void> {
  await recoverStalePrintJobs(now);
  const jobs = await db
    .select({
      id: printQueueTable.id,
      printerId: printQueueTable.printerId,
      attempts: printQueueTable.attempts,
      status: printQueueTable.status,
    })
    .from(printQueueTable)
    .where(and(
      inArray(printQueueTable.status, ["pending", "retrying"]),
      lte(printQueueTable.availableAt, now),
    ))
    .orderBy(
      asc(printQueueTable.availableAt),
      asc(printQueueTable.createdAt),
      asc(printQueueTable.id),
    )
    .limit(10);

  for (const job of jobs) {
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    const [locked] = await db.update(printQueueTable)
      .set({
        status: "sending",
        sentAt: now,
        leaseUntil,
        lockedBy: WORKER_ID,
        updatedAt: now,
      })
      .where(and(
        eq(printQueueTable.id, job.id),
        inArray(printQueueTable.status, ["pending", "retrying"]),
      ))
      .returning({ id: printQueueTable.id });
    if (!locked) continue;

    const [fullJob] = await db.select().from(printQueueTable).where(eq(printQueueTable.id, job.id));
    if (!fullJob) continue;
    const [printer] = await db.select().from(printersTable).where(eq(printersTable.id, fullJob.printerId));
    if (!printer) {
      await transition(job.id, {
        status: "failed",
        lastError: "Impresora no encontrada",
        leaseUntil: null,
        lockedBy: null,
      }, "failed", { error: "printer_not_found" });
      continue;
    }

    const result = await sendToPrinter({
      printerId: printer.id,
      printerIp: printer.ip,
      printerPort: printer.port,
      content: fullJob.content,
      copies: printer.copies,
      connectionType: printer.connectionType as "simulation" | "tcp" | "windows_agent",
      agentUrl: printer.agentUrl,
      characterSet: printer.characterSet,
      autoCut: printer.autoCut,
      openCashDrawer: printer.openCashDrawer,
      dedupeKey: fullJob.dedupeKey,
    });

    if (result.ok) {
      await transition(job.id, {
        status: "delivered",
        printedAt: now,
        transportAckedAt: now,
        confirmationLevel: result.confirmationLevel,
        attempts: fullJob.attempts + 1,
        lastError: null,
        leaseUntil: null,
        lockedBy: null,
      }, "delivered", {
        printer: printer.name,
        attempt: fullJob.attempts + 1,
        confirmationLevel: result.confirmationLevel,
        simulated: result.simulated,
      });
      try {
        emitToFunction("admin", "print:status", {
          jobId: job.id,
          status: "delivered",
          printerName: printer.name,
          confirmationLevel: result.confirmationLevel,
        });
      } catch {}
      continue;
    }

    const newAttempts = fullJob.attempts + 1;
    if (newAttempts >= MAX_ATTEMPTS) {
      if (printer.fallbackPrinterId) {
        const [fallback] = await db.select().from(printersTable)
          .where(eq(printersTable.id, printer.fallbackPrinterId));
        if (fallback?.active) {
          await db.transaction(async (tx) => {
            await tx.update(printQueueTable).set({
              status: "failed",
              attempts: newAttempts,
              lastError: `Redirigido a respaldo: ${fallback.name}`,
              leaseUntil: null,
              lockedBy: null,
              updatedAt: now,
            }).where(eq(printQueueTable.id, job.id));
            await tx.insert(printQueueTable).values({
              printerId: fallback.id,
              orderId: fullJob.orderId,
              documentType: fullJob.documentType,
              content: `[RESPALDO: ${printer.name} no disponible]\n\n${fullJob.content}`,
              status: "pending",
              dedupeKey: `${fullJob.dedupeKey ?? fullJob.id}:fallback:${fallback.id}`,
              actorId: fullJob.actorId,
              actorName: fullJob.actorName,
              meta: {
                ...(fullJob.meta as object ?? {}),
                originalJobId: fullJob.id,
                fallbackFrom: printer.id,
              },
            }).onConflictDoNothing({ target: printQueueTable.dedupeKey });
            await tx.insert(printAuditTable).values({
              printQueueId: job.id,
              action: "fallback_queued",
              actorName: "sistema",
              detail: { primary: printer.name, fallback: fallback.name },
            });
          });
          continue;
        }
      }
      await transition(job.id, {
        status: "failed",
        attempts: newAttempts,
        lastError: result.error ?? "Error desconocido",
        leaseUntil: null,
        lockedBy: null,
      }, "failed", {
        printer: printer.name,
        attempt: newAttempts,
        error: result.error,
      });
      try {
        emitToFunction("admin", "print:status", {
          jobId: job.id,
          status: "failed",
          printerName: printer.name,
          error: result.error,
        });
      } catch {}
      continue;
    }

    const availableAt = nextPrintRetryAt(now, newAttempts);
    await transition(job.id, {
      status: "retrying",
      attempts: newAttempts,
      lastError: result.error ?? "Error desconocido",
      availableAt,
      leaseUntil: null,
      lockedBy: null,
    }, "retry_scheduled", {
      printer: printer.name,
      attempt: newAttempts,
      error: result.error,
      availableAt: availableAt.toISOString(),
    });
    try {
      emitToFunction("admin", "print:status", {
        jobId: job.id,
        status: "retrying",
        printerName: printer.name,
        attempt: newAttempts,
      });
    } catch {}
  }
}

export function startPrintWorker(): void {
  if (workerTimer) return;
  void recoverStalePrintJobs().catch(err => console.error("[print-worker:recovery]", err));
  workerTimer = setInterval(() => {
    processPrintQueueOnce().catch(err => console.error("[print-worker]", err));
  }, POLL_INTERVAL_MS);
  console.log("[print-worker] started, polling every", POLL_INTERVAL_MS, "ms");
}

export function stopPrintWorker(): void {
  if (workerTimer) { clearInterval(workerTimer); workerTimer = null; }
}
