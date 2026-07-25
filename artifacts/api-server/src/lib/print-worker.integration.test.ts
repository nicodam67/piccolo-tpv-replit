import net from "node:net";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { processPrintQueueOnce } from "./print-worker";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const prefix = "E66-";

async function listen(server: net.Server, port = 0) {
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return (server.address() as net.AddressInfo).port;
}

async function cleanup() {
  const printers = await pool.query<{ id: string }>(
    "SELECT id FROM printers WHERE name LIKE $1",
    [`${prefix}%`],
  );
  const ids = printers.rows.map((row) => row.id);
  if (!ids.length) return;
  await pool.query(
    "DELETE FROM print_audit WHERE print_queue_id IN (SELECT id FROM print_queue WHERE printer_id = ANY($1::uuid[]))",
    [ids],
  );
  await pool.query("DELETE FROM print_queue WHERE printer_id = ANY($1::uuid[])", [ids]);
  await pool.query("DELETE FROM printers WHERE id = ANY($1::uuid[])", [ids]);
}

async function createPrinter(name: string, port: number, fallbackPrinterId?: string) {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO printers
      (name, type, ip, port, connector_mode, active, is_primary, fallback_printer_id,
       connect_timeout_ms, write_timeout_ms)
     VALUES ($1, 'cocina', '127.0.0.1', $2, 'tcp', true, true, $3, 250, 500)
     RETURNING id`,
    [name, port, fallbackPrinterId ?? null],
  );
  return result.rows[0].id;
}

async function createJob(printerId: string, options?: {
  status?: string;
  attempts?: number;
  leaseExpired?: boolean;
}) {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO print_queue
      (printer_id, document_type, content, status, attempts, lease_expires_at)
     VALUES ($1, 'kitchen_ticket', '2 x Café', $2, $3, $4)
     RETURNING id`,
    [
      printerId,
      options?.status ?? "pending",
      options?.attempts ?? 0,
      options?.leaseExpired ? new Date(Date.now() - 1000) : null,
    ],
  );
  return result.rows[0].id;
}

describeWithDatabase("production print worker software transport", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("persists and sends a queue job through TCP ESC/POS", async () => {
    const chunks: Buffer[] = [];
    const server = net.createServer((socket) => socket.on("data", (chunk) => chunks.push(Buffer.from(chunk))));
    const port = await listen(server);
    try {
      const printerId = await createPrinter(`${prefix}Happy`, port);
      const jobId = await createJob(printerId);
      await processPrintQueueOnce();
      const job = await pool.query<{ status: string; attempts: number }>(
        "SELECT status, attempts FROM print_queue WHERE id = $1",
        [jobId],
      );
      expect(job.rows[0]).toEqual({ status: "printed", attempts: 1 });
      expect(Buffer.concat(chunks).subarray(0, 2)).toEqual(Buffer.from([0x1b, 0x40]));
      const audit = await pool.query(
        "SELECT id FROM print_audit WHERE print_queue_id = $1 AND action = 'sent'",
        [jobId],
      );
      expect(audit.rowCount).toBe(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("retries failures and automatically recovers when the device returns", async () => {
    const reservation = net.createServer();
    const port = await listen(reservation);
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const printerId = await createPrinter(`${prefix}Recovery`, port);
    const jobId = await createJob(printerId);

    for (let attempt = 1; attempt <= 3; attempt++) {
      await processPrintQueueOnce();
      if (attempt < 3) {
        await pool.query(
          "UPDATE print_queue SET next_attempt_at = '1970-01-01' WHERE id = $1",
          [jobId],
        );
      }
    }
    const failed = await pool.query<{ status: string; attempts: number }>(
      "SELECT status, attempts FROM print_queue WHERE id = $1",
      [jobId],
    );
    expect(failed.rows[0]).toEqual({ status: "error", attempts: 3 });

    const received: Buffer[] = [];
    const server = net.createServer((socket) => socket.on("data", (chunk) => received.push(Buffer.from(chunk))));
    await listen(server, port);
    try {
      await processPrintQueueOnce();
      await processPrintQueueOnce();
      const recovered = await pool.query<{ status: string; content: string }>(
        "SELECT status, content FROM print_queue WHERE id = $1",
        [jobId],
      );
      expect(recovered.rows[0].status).toBe("printed");
      expect(recovered.rows[0].content).toContain("*** REENVIADO ***");
      expect(received.length).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("recovers an expired sending lease with a visible resend mark", async () => {
    const received: Buffer[] = [];
    const server = net.createServer((socket) => socket.on("data", (chunk) => received.push(Buffer.from(chunk))));
    const port = await listen(server);
    try {
      const printerId = await createPrinter(`${prefix}Interrupted`, port);
      const jobId = await createJob(printerId, { status: "sending", leaseExpired: true });
      await processPrintQueueOnce();
      const job = await pool.query<{ status: string; content: string }>(
        "SELECT status, content FROM print_queue WHERE id = $1",
        [jobId],
      );
      expect(job.rows[0].status).toBe("printed");
      expect(job.rows[0].content).toContain("*** REENVIADO ***");
      const audit = await pool.query(
        "SELECT id FROM print_audit WHERE print_queue_id = $1 AND action = 'interrupted'",
        [jobId],
      );
      expect(audit.rowCount).toBe(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("uses one configured fallback after primary exhaustion", async () => {
    const fallbackServer = net.createServer((socket) => socket.resume());
    const fallbackPort = await listen(fallbackServer);
    const primaryReservation = net.createServer();
    const primaryPort = await listen(primaryReservation);
    await new Promise<void>((resolve) => primaryReservation.close(() => resolve()));
    try {
      const fallbackId = await createPrinter(`${prefix}Fallback`, fallbackPort);
      const primaryId = await createPrinter(`${prefix}Primary`, primaryPort, fallbackId);
      const jobId = await createJob(primaryId, { attempts: 2 });
      await processPrintQueueOnce();
      const job = await pool.query<{ status: string; last_error: string }>(
        "SELECT status, last_error FROM print_queue WHERE id = $1",
        [jobId],
      );
      expect(job.rows[0].status).toBe("printed");
      expect(job.rows[0].last_error).toContain("respaldo");
      const audit = await pool.query(
        "SELECT id FROM print_audit WHERE print_queue_id = $1 AND action = 'fallback'",
        [jobId],
      );
      expect(audit.rowCount).toBe(1);
    } finally {
      await new Promise<void>((resolve) => fallbackServer.close(() => resolve()));
    }
  });

  it("drains a saturated queue in bounded batches without losing jobs", async () => {
    const server = net.createServer((socket) => socket.resume());
    const port = await listen(server);
    try {
      const printerId = await createPrinter(`${prefix}Queue`, port);
      for (let index = 0; index < 25; index++) await createJob(printerId);
      await processPrintQueueOnce();
      const first = await pool.query<{ status: string; count: string }>(
        `SELECT status, count(*) FROM print_queue
         WHERE printer_id = $1 GROUP BY status ORDER BY status`,
        [printerId],
      );
      expect(Object.fromEntries(first.rows.map((row) => [row.status, Number(row.count)])))
        .toEqual({ pending: 15, printed: 10 });
      await processPrintQueueOnce();
      await processPrintQueueOnce();
      const final = await pool.query<{ count: string }>(
        "SELECT count(*) FROM print_queue WHERE printer_id = $1 AND status = 'printed'",
        [printerId],
      );
      expect(Number(final.rows[0].count)).toBe(25);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
