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
      tagline,
      moneda,
      idioma,
      regimenFiscal,
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
          tagline: tagline ?? "",
          moneda: moneda ?? "EUR",
          idioma: idioma ?? "es",
          regimenFiscal: regimenFiscal ?? "general",
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
          tagline: tagline !== undefined ? tagline : existing[0].tagline,
          moneda: moneda !== undefined ? moneda : existing[0].moneda,
          idioma: idioma !== undefined ? idioma : existing[0].idioma,
          regimenFiscal: regimenFiscal !== undefined ? regimenFiscal : existing[0].regimenFiscal,
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

// ── Public branding endpoint (no auth required) ───────────────────────────────

router.get("/public/branding", async (_req, res): Promise<void> => {
  const rows = await db.select().from(businessConfigTable).limit(1);
  if (rows.length === 0) {
    if (process.env["NODE_ENV"] === "production") {
      res.status(503).json({ error: "Carta no configurada", code: "QR_NOT_CONFIGURED" });
      return;
    }
    res.json({
      // New QR-module fields
      restaurantName: "", tagline: "", heroImageUrl: "", heroVideoUrl: "",
      address: "", city: "", province: "", postalCode: "", country: "",
      phone: "", establishedYear: null, openingHours: null,
      cardLayout: "grid", accentColor: "#ef4444", logoUrl: "",
      themeColors: null, themeFonts: null, cardSettings: null, schedule: null,
      // Legacy fields kept for backward-compat (menu.tsx, ticket.tsx, prefactura.tsx, order-status.tsx)
      nombreComercial: "", foundedYear: null,
    });
    return;
  }
  const r = rows[0];
  res.json({
    // New QR-module fields
    restaurantName: r.nombreComercial,
    tagline: r.tagline,
    heroImageUrl: r.heroImageUrl,
    heroVideoUrl: r.heroVideoUrl,
    address: r.address,
    city: r.qrCity,
    province: r.qrProvince,
    postalCode: r.qrPostalCode,
    country: r.qrCountry,
    phone: r.phone,
    establishedYear: r.foundedYear ?? null,
    openingHours: r.openingHours ?? null,
    cardLayout: r.cardLayout,
    accentColor: r.accentColor,
    logoUrl: r.logoUrl,
    themeColors: r.themeColors ?? null,
    themeFonts: r.themeFonts ?? null,
    cardSettings: r.cardSettings ?? null,
    schedule: r.qrSchedule ?? null,
    // Legacy fields kept for backward-compat (menu.tsx, ticket.tsx, prefactura.tsx, order-status.tsx)
    nombreComercial: r.nombreComercial,
    foundedYear: r.foundedYear ?? null,
  });
});

// ── Admin branding CRUD ───────────────────────────────────────────────────────

router.get("/admin/branding", requireAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(businessConfigTable).limit(1);
  if (rows.length === 0) {
    res.json({
      nombreComercial: "", tagline: "", heroImageUrl: "", heroVideoUrl: "",
      address: "", phone: "", foundedYear: null, openingHours: null,
      cardLayout: "grid", accentColor: "#ef4444", logoUrl: "",
    });
    return;
  }
  const r = rows[0];
  res.json({
    nombreComercial: r.nombreComercial,
    tagline: r.tagline,
    heroImageUrl: r.heroImageUrl,
    heroVideoUrl: r.heroVideoUrl,
    address: r.address,
    phone: r.phone,
    foundedYear: r.foundedYear,
    openingHours: r.openingHours ?? null,
    cardLayout: r.cardLayout,
    accentColor: r.accentColor,
    logoUrl: r.logoUrl,
  });
});

router.patch("/admin/branding", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const {
    nombreComercial, tagline, heroImageUrl, heroVideoUrl,
    address, phone, foundedYear, openingHours, cardLayout, accentColor, logoUrl,
  } = req.body as Record<string, unknown>;

  const existing = await db.select().from(businessConfigTable).limit(1);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (nombreComercial !== undefined) updates.nombreComercial = nombreComercial;
  if (tagline !== undefined) updates.tagline = tagline;
  if (heroImageUrl !== undefined) updates.heroImageUrl = heroImageUrl;
  if (heroVideoUrl !== undefined) updates.heroVideoUrl = heroVideoUrl;
  if (address !== undefined) updates.address = address;
  if (phone !== undefined) updates.phone = phone;
  if (foundedYear !== undefined) updates.foundedYear = foundedYear;
  if (openingHours !== undefined) updates.openingHours = openingHours;
  if (cardLayout !== undefined) updates.cardLayout = cardLayout;
  if (accentColor !== undefined) updates.accentColor = accentColor;
  if (logoUrl !== undefined) updates.logoUrl = logoUrl;

  let result;
  if (existing.length === 0) {
    [result] = await db.insert(businessConfigTable).values({
      nombreComercial: (nombreComercial as string) ?? "",
      razonSocial: "", nif: "", direccionFiscal: "", codigoPostal: "",
      poblacion: "", provincia: "", pais: "España", telefono: "", email: "", web: "",
      logoUrl: (logoUrl as string) ?? "",
      tagline: (tagline as string) ?? "",
      heroImageUrl: (heroImageUrl as string) ?? "",
      heroVideoUrl: (heroVideoUrl as string) ?? "",
      address: (address as string) ?? "",
      phone: (phone as string) ?? "",
      foundedYear: (foundedYear as number) ?? null,
      openingHours: (openingHours as any) ?? null,
      cardLayout: (cardLayout as string) ?? "grid",
      accentColor: (accentColor as string) ?? "#ef4444",
    }).returning();
  } else {
    [result] = await db.update(businessConfigTable)
      .set(updates as any)
      .where(eq(businessConfigTable.id, existing[0].id))
      .returning();
  }

  const employee = (req as any).user;
  await logDocumentAction({
    action: "update_branding",
    documentType: "config",
    documentId: result.id,
    employeeId: employee.id,
    employeeName: employee.name,
  });

  res.json({
    nombreComercial: result.nombreComercial,
    tagline: result.tagline,
    heroImageUrl: result.heroImageUrl,
    heroVideoUrl: result.heroVideoUrl,
    address: result.address,
    phone: result.phone,
    foundedYear: result.foundedYear,
    openingHours: result.openingHours ?? null,
    cardLayout: result.cardLayout,
    accentColor: result.accentColor,
    logoUrl: result.logoUrl,
  });
});

// ── QR Branding (full schema — separate from legacy /admin/branding) ──────────

router.get("/admin/qr-branding", requireAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(businessConfigTable).limit(1);
  const empty = {
    restaurantName: "", tagline: "", heroImageUrl: "", heroVideoUrl: "",
    address: "", city: "", province: "", postalCode: "", country: "",
    phone: "", establishedYear: "", themeColors: null, themeFonts: null,
    cardSettings: null, schedule: null, logoUrl: "",
  };
  if (rows.length === 0) { res.json(empty); return; }
  const r = rows[0];
  res.json({
    restaurantName: r.nombreComercial,
    tagline: r.tagline,
    heroImageUrl: r.heroImageUrl,
    heroVideoUrl: r.heroVideoUrl,
    address: r.address,
    city: r.qrCity,
    province: r.qrProvince,
    postalCode: r.qrPostalCode,
    country: r.qrCountry,
    phone: r.phone,
    establishedYear: r.foundedYear ? String(r.foundedYear) : "",
    logoUrl: r.logoUrl,
    themeColors: r.themeColors ?? null,
    themeFonts: r.themeFonts ?? null,
    cardSettings: r.cardSettings ?? null,
    schedule: r.qrSchedule ?? null,
  });
});

router.put("/admin/qr-branding", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const existing = await db.select().from(businessConfigTable).limit(1);
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.restaurantName !== undefined) updates.nombreComercial = body.restaurantName;
  if (body.tagline !== undefined) updates.tagline = body.tagline;
  if (body.heroImageUrl !== undefined) updates.heroImageUrl = body.heroImageUrl;
  if (body.heroVideoUrl !== undefined) updates.heroVideoUrl = body.heroVideoUrl;
  if (body.address !== undefined) updates.address = body.address;
  if (body.city !== undefined) updates.qrCity = body.city;
  if (body.province !== undefined) updates.qrProvince = body.province;
  if (body.postalCode !== undefined) updates.qrPostalCode = body.postalCode;
  if (body.country !== undefined) updates.qrCountry = body.country;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.establishedYear !== undefined) updates.foundedYear = body.establishedYear ? Number(body.establishedYear) : null;
  if (body.logoUrl !== undefined) updates.logoUrl = body.logoUrl;
  if (body.themeColors !== undefined) updates.themeColors = body.themeColors;
  if (body.themeFonts !== undefined) updates.themeFonts = body.themeFonts;
  if (body.cardSettings !== undefined) updates.cardSettings = body.cardSettings;
  if (body.schedule !== undefined) updates.qrSchedule = body.schedule;

  let result;
  if (existing.length === 0) {
    [result] = await db.insert(businessConfigTable).values({
      nombreComercial: (body.restaurantName as string) ?? "",
      razonSocial: "", nif: "", direccionFiscal: "", codigoPostal: "",
      poblacion: "", provincia: "", pais: "España", telefono: "", email: "", web: "",
      tagline: (body.tagline as string) ?? "",
      heroImageUrl: (body.heroImageUrl as string) ?? "",
      heroVideoUrl: (body.heroVideoUrl as string) ?? "",
      address: (body.address as string) ?? "",
      phone: (body.phone as string) ?? "",
      logoUrl: (body.logoUrl as string) ?? "",
      // QR-specific fields — must be present in insert too, not only in update
      qrCity: (body.city as string) ?? "",
      qrProvince: (body.province as string) ?? "",
      qrPostalCode: (body.postalCode as string) ?? "",
      qrCountry: (body.country as string) ?? "",
      foundedYear: body.establishedYear ? Number(body.establishedYear) : null,
      themeColors: (body.themeColors as any) ?? undefined,
      themeFonts: (body.themeFonts as any) ?? undefined,
      cardSettings: (body.cardSettings as any) ?? undefined,
      qrSchedule: (body.schedule as any) ?? undefined,
    }).returning();
  } else {
    [result] = await db.update(businessConfigTable)
      .set(updates as any)
      .where(eq(businessConfigTable.id, existing[0].id))
      .returning();
  }

  const employee = (req as any).user;
  await logDocumentAction({
    action: "update_qr_branding",
    documentType: "config",
    documentId: result.id,
    employeeId: employee.id,
    employeeName: employee.name,
  });

  res.json({ ok: true });
});

export default router;
