import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { loadQrMenuCatalogV1 } from "../lib/qr-menu-catalog";
import { requireQrMenuApiToken } from "../middlewares/qr-menu-api-auth";

const router: IRouter = Router();

const qrMenuApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes" },
});

const guards = [qrMenuApiLimiter, requireQrMenuApiToken] as const;

router.get("/v1/qr-menu/status", ...guards, async (_req, res): Promise<void> => {
  const catalog = await loadQrMenuCatalogV1();
  const restaurantId = (process.env["RESTAURANT_ID"] ?? "default")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  res.json({
    contractVersion: "v1",
    status: "ready",
    serverTime: new Date().toISOString(),
    restaurantId,
    catalogVersion: catalog.catalogVersion,
    catalogUpdatedAt: catalog.catalogUpdatedAt,
  });
});

router.get("/v1/qr-menu/catalog", ...guards, async (_req, res): Promise<void> => {
  res.json(await loadQrMenuCatalogV1());
});

export default router;
