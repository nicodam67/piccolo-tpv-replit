import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initSocket } from "./lib/socket";
import { seedDocuments } from "./lib/seed-documents";

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
  } catch (err) {
    logger.error({ err }, "Seed documents failed — continuing");
  }
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
