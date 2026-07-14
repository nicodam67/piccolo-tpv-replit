import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import zonesRouter from "./zones";
import tablesRouter from "./tables";
import dashboardRouter from "./dashboard";
import categoriesRouter from "./categories";
import ordersRouter from "./orders";
import kdsRouter from "./kds";
import modifiersRouter from "./modifiers";
import notificationsRouter from "./notifications";
import cashRouter from "./cash";
import paymentsRouter from "./payments";
import canvasElementsRouter from "./canvas-elements";
import productsRouter from "./products";
import configRouter from "./config";
import documentsRouter from "./documents";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(zonesRouter);
router.use(tablesRouter);
router.use(dashboardRouter);
router.use(categoriesRouter);
router.use(ordersRouter);
router.use(kdsRouter);
router.use(modifiersRouter);
router.use(notificationsRouter);
router.use(cashRouter);
router.use(paymentsRouter);
router.use(canvasElementsRouter);
router.use(productsRouter);
router.use(configRouter);
router.use(documentsRouter);

export default router;
