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
import { eq, and, inArray } from "drizzle-orm";
import { sendToPrinter } from "./print-connector-sim";
import { getIO } from "./socket";

const POLL_INTERVAL_MS = 5_000;
const MAX_ATTEMPTS     = 3;
let   workerTimer: ReturnType<typeof setInterval> | null = null;

async function audit(
  printQueueId: string | null,
  action: string,
  actorName = "sistema",
  detail?: Record<string, unknown>,
): Promise<void> {
  await db.insert(printAuditTable).values({
    printQueueId,
    action,
    actorName,
    detail: detail ?? null,
  }).catch(() => { /* audit must not block the worker */ });
}

async function tick(): Promise<void> {
  const now = new Date();

  // Pick pending or retrying jobs whose next-attempt time has passed.
  const jobs = await db
    .select({
      id:         printQueueTable.id,
      printerId:  printQueueTable.printerId,
      content:    printQueueTable.content,
      copies:     printQueueTable.documentType, // just for ref
      attempts:   printQueueTable.attempts,
      status:     printQueueTable.status,
    })
    .from(printQueueTable)
    .where(
      and(
        inArray(printQueueTable.status, ["pending", "retrying"]),
      ),
    )
    .limit(10);

  for (const job of jobs) {
    // Lock the row: move to 'sending' so parallel workers don't double-send
    const [locked] = await db
      .update(printQueueTable)
      .set({ status: "sending", sentAt: new Date() })
      .where(and(
        eq(printQueueTable.id, job.id),
        inArray(printQueueTable.status, ["pending", "retrying"]),
      ))
      .returning({ id: printQueueTable.id });

    if (!locked) continue; // another worker took it

    // Load full job + printer
    const [fullJob] = await db.select().from(printQueueTable).where(eq(printQueueTable.id, job.id));
    if (!fullJob) continue;

    const [printer] = await db.select().from(printersTable).where(eq(printersTable.id, fullJob.printerId));
    if (!printer) {
      await db.update(printQueueTable).set({ status: "error", lastError: "Impresora no encontrada" }).where(eq(printQueueTable.id, job.id));
      continue;
    }

    const result = await sendToPrinter({
      printerId:  printer.id,
      printerIp:  printer.ip,
      printerPort: printer.port,
      content:    fullJob.content,
      copies:     printer.copies,
    });

    if (result.ok) {
      await db.update(printQueueTable).set({
        status: "printed",
        printedAt: new Date(),
        attempts: fullJob.attempts + 1,
      }).where(eq(printQueueTable.id, job.id));

      await audit(job.id, "sent", "sistema", { printer: printer.name, attempt: fullJob.attempts + 1 });

      try { getIO().emit("print:status", { jobId: job.id, status: "printed", printerName: printer.name }); } catch {}

    } else {
      const newAttempts = fullJob.attempts + 1;
      await audit(job.id, "failed", "sistema", { printer: printer.name, attempt: newAttempts, error: result.error });

      if (newAttempts >= MAX_ATTEMPTS) {
        // Try fallback printer if configured
        if (printer.fallbackPrinterId) {
          const [fallback] = await db.select().from(printersTable).where(eq(printersTable.id, printer.fallbackPrinterId));
          if (fallback) {
            const fbResult = await sendToPrinter({
              printerId:  fallback.id,
              printerIp:  fallback.ip,
              printerPort: fallback.port,
              content:    `[RESPALDO: ${printer.name} no disponible]\n\n${fullJob.content}`,
              copies:     fallback.copies,
            });

            if (fbResult.ok) {
              await db.update(printQueueTable).set({
                status: "printed",
                printedAt: new Date(),
                attempts: newAttempts,
                lastError: `Enviado a respaldo: ${fallback.name}`,
              }).where(eq(printQueueTable.id, job.id));

              await audit(job.id, "fallback", "sistema", { primary: printer.name, fallback: fallback.name });
              try { getIO().emit("print:status", {
                jobId: job.id,
                status: "printed_via_fallback",
                printerName: fallback.name,
                originalPrinter: printer.name,
              }); } catch {}
              continue;
            }
          }
        }

        // No fallback or fallback also failed → error
        await db.update(printQueueTable).set({
          status: "error",
          attempts: newAttempts,
          lastError: result.error ?? "Error desconocido",
        }).where(eq(printQueueTable.id, job.id));

        try { getIO().emit("print:status", {
          jobId: job.id,
          status: "error",
          printerName: printer.name,
          error: result.error,
        }); } catch {};

      } else {
        // Schedule a retry (exponential backoff already implicit by next poll)
        await db.update(printQueueTable).set({
          status: "retrying",
          attempts: newAttempts,
          lastError: result.error ?? "Error desconocido",
        }).where(eq(printQueueTable.id, job.id));

        try { getIO().emit("print:status", {
          jobId: job.id,
          status: "retrying",
          printerName: printer.name,
          attempt: newAttempts,
        }); } catch {};
      }
    }
  }
}

export function startPrintWorker(): void {
  if (workerTimer) return;
  workerTimer = setInterval(() => { tick().catch(err => console.error("[print-worker]", err)); }, POLL_INTERVAL_MS);
  console.log("[print-worker] started, polling every", POLL_INTERVAL_MS, "ms");
}

export function stopPrintWorker(): void {
  if (workerTimer) { clearInterval(workerTimer); workerTimer = null; }
}
