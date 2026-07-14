import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Build the list of allowed CORS origins.
// ALLOWED_ORIGINS (comma-separated) lets ops override at deploy time.
// REPLIT_DEV_DOMAIN is injected automatically in the Replit dev environment.
const allowedOrigins: Set<string> = new Set(
  [
    // Production deployment URL
    "https://piccolo-tpv.replit.app",
    // Dev-environment proxy origin
    process.env["REPLIT_DEV_DOMAIN"]
      ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
      : null,
    // Optional operator override (comma-separated list)
    ...(process.env["ALLOWED_ORIGINS"] ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  ].filter((o): o is string => Boolean(o)),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no Origin header (same-origin, curl, mobile clients).
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      callback(new Error(`CORS: origin not allowed — ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
