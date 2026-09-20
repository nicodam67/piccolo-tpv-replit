import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers['stripe-signature']",
    "req.headers['x-courier-token']",
    "req.headers['x-manager-token']",
    "req.headers['x-simulator-secret']",
    "req.body.password",
    "req.body.pin",
    "req.body.token",
    "req.body.deviceToken",
    "req.body.stripeSecretKey",
    "req.body.stripeWebhookSecret",
    "req.body.secretAccessKey",
    "req.body.apiKey",
    "req.body.certificadoPassword",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
