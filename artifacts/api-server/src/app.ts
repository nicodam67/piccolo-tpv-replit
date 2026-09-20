import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import router from "./routes";
import { logger } from "./lib/logger";
import { sanitizeInputs } from "./middlewares/sanitize";

const app: Express = express();

// Trust the Replit / Google Cloud proxy — required for express-rate-limit to
// read X-Forwarded-For correctly and for secure cookies over HTTPS.
app.set("trust proxy", 1);

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
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Manager-Token",
      "X-Courier-Token",
      "X-Device-Token",
    ],
    credentials: true,
  }),
);
// Capture raw request body for Stripe webhook signature verification.
// The verify callback runs before JSON parsing; we store the raw Buffer on the
// request object so the webhook route can pass it verbatim to
// stripe.webhooks.constructEvent().
// ── Security headers ─────────────────────────────────────────────────────────
// Applied before routing so every response — including errors — gets them.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");            // disabled per OWASP recommendation
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=()");
  next();
});

app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Strip HTML tags from all text body fields (defense-in-depth; Zod schemas are
// still the primary validation layer).
app.use(sanitizeInputs);

app.use("/api", (req, res, next) => {
  const normalizedPath = req.path.toLowerCase();
  if (
    process.env.NODE_ENV === "production"
    && (/\/demo-data(?:\/|$)/.test(normalizedPath) || normalizedPath.includes("simulation"))
  ) {
    res.status(404).json({ error: "Ruta no disponible en producción" });
    return;
  }
  next();
});

app.use("/api", router);

export default app;
