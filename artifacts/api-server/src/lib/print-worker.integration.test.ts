import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  db,
  printAuditTable,
  printQueueTable,
  printersTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  processPrintQueueOnce,
  recoverStalePrintJobs,
} from "./print-worker";

const run = process.env["RUN_DB_INTEGRATION_TESTS"] === "1";
const ids = {
  simulation: randomUUID(),
  down: randomUUID(),
  fallback: randomUUID(),
};
const jobIds: string[] = [];

describe.runIf(run)("print worker with PostgreSQL", () => {
  beforeAll(async () => {
    await db.insert(printersTable).values([
      {
        id: ids.simulation,
        name: "Integration simulated printer",
        type: "cocina",
        departmentCode: "cocina",
        connectionType: "simulation",
      },
      {
        id: ids.down,
        name: "Integration disconnected printer",
        type: "cocina",
        departmentCode: "cocina",
        connectionType: "tcp",
        ip: "127.0.0.1",
        port: 1,
        fallbackPrinterId: ids.fallback,
      },
      {
        id: ids.fallback,
        name: "Integration fallback printer",
        type: "cocina",
        departmentCode: "cocina",
        connectionType: "simulation",
      },
    ]);
  });

  afterAll(async () => {
    if (jobIds.length) {
      await db.delete(printAuditTable).where(inArray(printAuditTable.printQueueId, jobIds));
      await db.delete(printQueueTable).where(inArray(printQueueTable.id, jobIds));
    }
    await db.delete(printersTable).where(inArray(printersTable.id, Object.values(ids)));
  });

  async function insertJob(
    printerId: string,
    patch: Partial<typeof printQueueTable.$inferInsert> = {},
  ) {
    const id = randomUUID();
    jobIds.push(id);
    await db.insert(printQueueTable).values({
      id,
      printerId,
      documentType: "test_ticket",
      content: "MESA 12\n1 x TEST",
      dedupeKey: `integration:${id}`,
      availableAt: new Date(Date.now() - 60_000),
      ...patch,
    });
    return id;
  }

  it("delivers one concurrent claim exactly once", async () => {
    const id = await insertJob(ids.simulation);
    const now = new Date();
    await Promise.all([
      processPrintQueueOnce(now),
      processPrintQueueOnce(now),
    ]);
    const [job] = await db.select().from(printQueueTable).where(eq(printQueueTable.id, id));
    expect(job.status).toBe("delivered");
    expect(job.attempts).toBe(1);
    expect(job.confirmationLevel).toBe("simulated");
  });

  it("marks an expired in-flight lease as ambiguous instead of duplicating", async () => {
    const id = await insertJob(ids.simulation, {
      status: "sending",
      leaseUntil: new Date(Date.now() - 1_000),
      lockedBy: "dead-process",
    });
    expect(await recoverStalePrintJobs()).toBeGreaterThanOrEqual(1);
    const [job] = await db.select().from(printQueueTable).where(eq(printQueueTable.id, id));
    expect(job.status).toBe("delivery_unknown");
    expect(job.lastError).toMatch(/verificación manual/i);
  });

  it("keeps a disconnected printer visible and schedules exponential retry", async () => {
    const id = await insertJob(ids.down);
    const now = new Date();
    await processPrintQueueOnce(now);
    const [job] = await db.select().from(printQueueTable).where(eq(printQueueTable.id, id));
    expect(job.status).toBe("retrying");
    expect(job.attempts).toBe(1);
    expect(job.availableAt.toISOString()).toBe(new Date(now.getTime() + 5_000).toISOString());
    expect(job.lastError).toBeTruthy();
  });

  it("persists fallback as a deduplicated queue job after final failure", async () => {
    const id = await insertJob(ids.down, { attempts: 2 });
    await processPrintQueueOnce(new Date());
    const [primary] = await db.select().from(printQueueTable).where(eq(printQueueTable.id, id));
    expect(primary.status).toBe("failed");
    expect(primary.lastError).toMatch(/respaldo/i);

    const fallbackKey = `integration:${id}:fallback:${ids.fallback}`;
    const fallbackRows = await db.select().from(printQueueTable)
      .where(eq(printQueueTable.dedupeKey, fallbackKey));
    expect(fallbackRows).toHaveLength(1);
    jobIds.push(fallbackRows[0].id);

    await processPrintQueueOnce(new Date());
    const [fallback] = await db.select().from(printQueueTable)
      .where(eq(printQueueTable.id, fallbackRows[0].id));
    expect(fallback.status).toBe("delivered");
  });
});
