import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initSocket } from "./lib/socket";
import { seedDocuments } from "./lib/seed-documents";
import { seedCash } from "./lib/seed-cash";
import { seedStockDemo } from "./lib/seed-stock-demo";
import { seedReservationsDemo } from "./lib/seed-reservations-demo";
import { seedDeliveryDemo } from "./lib/seed-delivery-demo";
import { seedOnlineDemo } from "./lib/seed-online-demo";
import { startPrintWorker } from "./lib/print-worker";
import { startBackupWorker } from "./lib/backup-worker";
import { startVerifactuWorker } from "./lib/verifactu-worker";
import { pool } from "@workspace/db";
import { ensureIdempotencyTable } from "./middlewares/idempotency";

// Ensure the revoked_tokens table exists at startup — hard requirement.
// If this fails the process exits: without the table, token revocation is
// impossible and requireAuth would fail-closed (503) on every authenticated
// request, making the server unusable. Crashing here is the correct behavior.
async function ensureAuthTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti         TEXT        PRIMARY KEY,
      revoked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at  TIMESTAMPTZ NOT NULL
    )
  `);
  // Verify the table is actually accessible (catches permission issues that
  // CREATE TABLE IF NOT EXISTS may silently succeed on).
  await pool.query("SELECT 1 FROM revoked_tokens LIMIT 0");
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
initSocket(server);

server.listen(port, async () => {
  logger.info({ port }, "Server listening");
  // Guarantee auth tables exist before handling any requests
  await ensureAuthTables();
  // Guarantee idempotency table exists
  await ensureIdempotencyTable();
  try {
    await seedDocuments();
    await seedCash();
    // Demo seeds only run in development — never in production
    if (process.env["NODE_ENV"] !== "production") {
      await seedStockDemo();
      await seedReservationsDemo();
      await seedDeliveryDemo();
      await seedOnlineDemo();
    }
  } catch (err) {
    logger.error({ err }, "Seed documents failed — continuing");
  }
  startPrintWorker();
  startBackupWorker();
  startVerifactuWorker();
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
