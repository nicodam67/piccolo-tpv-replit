import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { APP_VERSION, RELEASE_CHANNEL } from "../lib/app-version";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.setHeader("X-Piccolo-Version", APP_VERSION);
  res.json(data);
});

router.get("/public/app-info", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    name: "Piccolo TPV",
    version: APP_VERSION,
    channel: RELEASE_CHANNEL,
    minSupportedVersion: "0.9.0-rc.1",
    productionCertified: false,
  });
});

export default router;
