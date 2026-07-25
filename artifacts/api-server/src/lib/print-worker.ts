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
import { eq, and, inArray, isNull, lte, or, asc, desc, sql } from "drizzle-orm";
import { getPrinterStatus, sendToPrinter } from "./print-connector";
import { emitToFunction } from "./socket-events";

const POLL_INTERVAL_MS = 5_000;
const MAX_ATTEMPTS     = 3;
let   workerTimer: ReturnType<typeof setInterval> | null = null;
let   workerRunning = false;

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

const SENDING_LEASE_MS = 60_000;

async function recoverInterruptedJobs(now: Date): Promise<void> {
  const interrupted = await db
    .update(printQueueTable)
    .set({
      status: "retrying",
      leaseExpiresAt: null,
      nextAttemptAt: now,
      lastError: "Envío interrumpido; reenviado automáticamente",
      content: sql`CASE
        WHEN ${printQueueTable.content} LIKE '*** REENVIADO ***%' THEN ${printQueueTable.content}
        ELSE '*** REENVIADO ***' || E'\n\n' || ${printQueueTable.content}
      END`,
    })
    .where(and(
      eq(printQueueTable.status, "sending"),
      or(isNull(printQueueTable.leaseExpiresAt), lte(printQueueTable.leaseExpiresAt, now)),
    ))
    .returning({ id: printQueueTable.id });
  for (const job of interrupted) {
    await audit(job.id, "interrupted", "sistema", { recovery: "automatic_retry" });
  }
}

async function recoverAvailablePrinters(): Promise<void> {
  const errored = await db
    .select()
    .from(printQueueTable)
    .where(and(
      eq(printQueueTable.status, "error"),
      sql`COALESCE((${printQueueTable.meta}->>'autoRecoveryCount')::int, 0) < 1`,
    ))
    .orderBy(sql`COALESCE(
      (${printQueueTable.meta}->>'lastRecoveryCheckAt')::timestamptz,
      to_timestamp(0)
    )`, asc(printQueueTable.createdAt))
    .limit(10);
  await Promise.all(errored.map(async (job) => {
    const meta = (job.meta ?? {}) as Record<string, unknown>;
    if (Number(meta["autoRecoveryCount"] ?? 0) >= 1) return;
    const [printer] = await db.select().from(printersTable)
      .where(eq(printersTable.id, job.printerId));
    if (!printer?.active) {
      await db.update(printQueueTable).set({
        meta: { ...meta, lastRecoveryCheckAt: new Date().toISOString() },
      }).where(eq(printQueueTable.id, job.id));
      return;
    }
    const status = await getPrinterStatus({
      printerId: printer.id,
      printerIp: printer.ip,
      printerPort: printer.port,
      connectorMode: printer.connectorMode,
      connectTimeoutMs: printer.connectTimeoutMs,
    });
    if (status.status !== "online") {
      await db.update(printQueueTable).set({
        meta: { ...meta, lastRecoveryCheckAt: new Date().toISOString() },
      }).where(eq(printQueueTable.id, job.id));
      return;
    }
    await db.update(printQueueTable).set({
      status: "retrying",
      attempts: 0,
      nextAttemptAt: null,
      lastError: "Dispositivo recuperado; reenvío automático",
      content: job.content.startsWith("*** REENVIADO ***")
        ? job.content
        : `*** REENVIADO ***\n\n${job.content}`,
      meta: { ...meta, autoRecoveryCount: Number(meta["autoRecoveryCount"] ?? 0) + 1 },
    }).where(and(
      eq(printQueueTable.id, job.id),
      eq(printQueueTable.status, "error"),
    ));
    await audit(job.id, "recovered", "sistema", {
      printerId: printer.id,
      destination: printer.name,
    });
  }));
}

export async function processPrintQueueOnce(): Promise<void> {
  const now = new Date();
  await recoverInterruptedJobs(now);

  // Pick pending or retrying jobs whose next-attempt time has passed.
  const jobs = await db
    .select({
      id:         printQueueTable.id,
      printerId:  printQueueTable.printerId,
      content:    printQueueTable.content,
      copies:     printQueueTable.documentType, // just for ref
      attempts:   printQueueTable.attempts,
      status:     printQueueTable.status,
      priority:   printQueueTable.priority,
      createdAt:  printQueueTable.createdAt,
    })
    .from(printQueueTable)
    .where(
      and(
        inArray(printQueueTable.status, ["pending", "retrying"]),
        or(isNull(printQueueTable.nextAttemptAt), lte(printQueueTable.nextAttemptAt, now)),
      ),
    )
    .orderBy(desc(printQueueTable.priority), asc(printQueueTable.createdAt))
    .limit(10);

  for (const job of jobs) {
    // Lock the row: move to 'sending' so parallel workers don't double-send
    const [locked] = await db
      .update(printQueueTable)
      .set({
        status: "sending",
        sentAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + SENDING_LEASE_MS),
      })
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
      connectorMode: printer.connectorMode,
      codePage: printer.codePage,
      cutEnabled: printer.cutEnabled,
      drawerEnabled: printer.drawerEnabled && Boolean((fullJob.meta as any)?.openDrawer),
      connectTimeoutMs: printer.connectTimeoutMs,
      writeTimeoutMs: printer.writeTimeoutMs,
    });

    if (result.ok) {
      await db.update(printQueueTable).set({
        status: "printed",
        printedAt: new Date(),
        attempts: fullJob.attempts + 1,
        leaseExpiresAt: null,
        nextAttemptAt: null,
      }).where(eq(printQueueTable.id, job.id));

      await audit(job.id, "sent", "sistema", { printer: printer.name, attempt: fullJob.attempts + 1 });

      try { emitToFunction("admin", "print:status", { jobId: job.id, status: "printed", printerName: printer.name }); } catch {}

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
              connectorMode: fallback.connectorMode,
              codePage: fallback.codePage,
              cutEnabled: fallback.cutEnabled,
              drawerEnabled: false,
              connectTimeoutMs: fallback.connectTimeoutMs,
              writeTimeoutMs: fallback.writeTimeoutMs,
            });

            if (fbResult.ok) {
              await db.update(printQueueTable).set({
                status: "printed",
                printedAt: new Date(),
                attempts: newAttempts,
                lastError: `Enviado a respaldo: ${fallback.name}`,
                leaseExpiresAt: null,
                nextAttemptAt: null,
              }).where(eq(printQueueTable.id, job.id));

              await audit(job.id, "fallback", "sistema", { primary: printer.name, fallback: fallback.name });
              try { emitToFunction("admin", "print:status", {
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
          leaseExpiresAt: null,
          nextAttemptAt: null,
          meta: {
            ...((fullJob.meta ?? {}) as Record<string, unknown>),
            retryable: result.retryable,
            connector: printer.connectorMode,
          },
        }).where(eq(printQueueTable.id, job.id));

        try { emitToFunction("admin", "print:status", {
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
          leaseExpiresAt: null,
          nextAttemptAt: new Date(Date.now() + (newAttempts === 1 ? 5_000 : 15_000)),
          content: fullJob.content.startsWith("*** REENVIADO ***")
            ? fullJob.content
            : `*** REENVIADO ***\n\n${fullJob.content}`,
          meta: {
            ...((fullJob.meta ?? {}) as Record<string, unknown>),
            retryable: result.retryable,
            connector: printer.connectorMode,
          },
        }).where(eq(printQueueTable.id, job.id));

        try { emitToFunction("admin", "print:status", {
          jobId: job.id,
          status: "retrying",
          printerName: printer.name,
          attempt: newAttempts,
        }); } catch {};
      }
    }
  }
  await recoverAvailablePrinters();
}

export function startPrintWorker(): void {
  if (workerTimer) return;
  const runGuarded = async () => {
    if (workerRunning) return;
    workerRunning = true;
    try {
      await processPrintQueueOnce();
    } finally {
      workerRunning = false;
    }
  };
  void runGuarded().catch(err => console.error("[print-worker]", err));
  workerTimer = setInterval(() => {
    void runGuarded().catch(err => console.error("[print-worker]", err));
  }, POLL_INTERVAL_MS);
  console.log("[print-worker] started, polling every", POLL_INTERVAL_MS, "ms");
}

export function stopPrintWorker(): void {
  if (workerTimer) { clearInterval(workerTimer); workerTimer = null; }
}
