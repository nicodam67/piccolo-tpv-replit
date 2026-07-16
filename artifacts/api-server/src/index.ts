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
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
