import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { businessConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logDocumentAction } from "../lib/document-audit";

const router: IRouter = Router();

// GET /config/business — public read (frontend needs restaurant name everywhere)
router.get("/config/business", async (req, res): Promise<void> => {
  const rows = await db.select().from(businessConfigTable).limit(1);
  if (rows.length === 0) {
    // Return empty config if not yet seeded
    res.json({
      nombreComercial: "",
      razonSocial: "",
      nif: "",
      direccionFiscal: "",
      codigoPostal: "",
      poblacion: "",
      provincia: "",
      pais: "España",
      telefono: "",
      email: "",
      web: "",
      logoUrl: "",
    });
    return;
  }
  const { id: _id, active: _active, updatedAt: _updatedAt, ...config } = rows[0];
  res.json(config);
});

// PUT /config/business — admin only
router.put(
  "/config/business",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const {
      nombreComercial,
      razonSocial,
      nif,
      direccionFiscal,
      codigoPostal,
      poblacion,
      provincia,
      pais,
      telefono,
      email,
      web,
      logoUrl,
    } = req.body as Record<string, string>;

    const existing = await db.select().from(businessConfigTable).limit(1);

    let result;
    if (existing.length === 0) {
      [result] = await db
        .insert(businessConfigTable)
        .values({
          nombreComercial: nombreComercial ?? "",
          razonSocial: razonSocial ?? "",
          nif: nif ?? "",
          direccionFiscal: direccionFiscal ?? "",
          codigoPostal: codigoPostal ?? "",
          poblacion: poblacion ?? "",
          provincia: provincia ?? "",
          pais: pais ?? "España",
          telefono: telefono ?? "",
          email: email ?? "",
          web: web ?? "",
          logoUrl: logoUrl ?? "",
        })
        .returning();
    } else {
      [result] = await db
        .update(businessConfigTable)
        .set({
          nombreComercial: nombreComercial ?? existing[0].nombreComercial,
          razonSocial: razonSocial ?? existing[0].razonSocial,
          nif: nif ?? existing[0].nif,
          direccionFiscal: direccionFiscal ?? existing[0].direccionFiscal,
          codigoPostal: codigoPostal ?? existing[0].codigoPostal,
          poblacion: poblacion ?? existing[0].poblacion,
          provincia: provincia ?? existing[0].provincia,
          pais: pais ?? existing[0].pais,
          telefono: telefono ?? existing[0].telefono,
          email: email ?? existing[0].email,
          web: web ?? existing[0].web,
          logoUrl: logoUrl ?? existing[0].logoUrl,
          updatedAt: new Date(),
        })
        .where(eq(businessConfigTable.id, existing[0].id))
        .returning();
    }

    const employee = (req as any).user;
    await logDocumentAction({
      action: "update_business_config",
      documentType: "config",
      documentId: result.id,
      employeeId: employee.id,
      employeeName: employee.name,
      terminal: req.headers["x-forwarded-for"] as string ?? req.socket.remoteAddress ?? "",
    });

    res.json(result);
  }
);

export default router;
