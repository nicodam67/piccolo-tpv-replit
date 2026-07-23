import { Router, type IRouter, type Response } from "express";
import { db } from "@workspace/db";
import {
  alertConfigTable,
  businessConfigTable,
  cashMachineConfigTable,
  crmLoyaltyConfigTable,
  fichajeSettingsTable,
  installationDevicesTable,
  kdsStationsTable,
  onlineOrdersConfigTable,
  printersTable,
  printRoutingTable,
  restaurantTablesTable,
  rolePermissionsTable,
  roomZonesTable,
  serviceShiftsTable,
  tabletDevicesTable,
  type QrDaySchedule,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requirePermission, requireRole } from "../middlewares/auth";
import { logDocumentAction } from "../lib/document-audit";
import { PERMISSIONS } from "../lib/permissions";
import {
  localeForLanguage,
  openingHoursToQrSchedule,
  qrScheduleToOpeningHours,
  validateBusinessConfigInput,
  validateOpeningHours,
  validateQrSchedule,
  type OpeningHours,
  type ValidationIssue,
} from "../lib/configuration";

const router: IRouter = Router();

function validationError(res: Response, issues: ValidationIssue[]): void {
  res.status(422).json({ error: "Configuración no válida", issues });
}

function effectiveQrSchedule(row: typeof businessConfigTable.$inferSelect) {
  return openingHoursToQrSchedule(row.openingHours as OpeningHours | null)
    ?? row.qrSchedule
    ?? null;
}

// GET /config/business — public read (frontend needs restaurant name everywhere)
router.get("/config/business", async (_req, res): Promise<void> => {
  const [rows, timeclockRows] = await Promise.all([
    db.select().from(businessConfigTable).limit(1),
    db.select({ timezone: fichajeSettingsTable.timezone }).from(fichajeSettingsTable).limit(1),
  ]);
  const timezone = timeclockRows[0]?.timezone ?? "Europe/Madrid";
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
      moneda: "EUR",
      idioma: "es",
      regimenFiscal: "general",
      timezone,
    });
    return;
  }
  const { id: _id, active: _active, updatedAt: _updatedAt, ...config } = rows[0];
  res.json({ ...config, timezone });
});

// PUT /config/business — admin only
router.put(
  "/config/business",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const parsed = validateBusinessConfigInput(req.body);
    if (!parsed.data) {
      validationError(res, parsed.issues);
      return;
    }
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
    } = parsed.data as Record<string, string>;

    const existing = await db.select().from(businessConfigTable).limit(1);
    if (existing.length === 0) {
      const missing = [
        ["nombreComercial", nombreComercial],
        ["razonSocial", razonSocial],
        ["nif", nif],
        ["direccionFiscal", direccionFiscal],
      ]
        .filter(([, value]) => !value)
        .map(([field]) => ({
          field: field as string,
          message: "Campo obligatorio para crear la configuración.",
        }));
      if (missing.length > 0) {
        validationError(res, missing);
        return;
      }
    }

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

// GET /admin/configuration — unified, read-only view over existing sources.
// This endpoint does not persist a parallel copy; every section is read from
// the table already owned by its module.
router.get(
  "/admin/configuration",
  requireAuth,
  requirePermission(PERMISSIONS.settings.manage),
  async (_req, res): Promise<void> => {
    const [
      businessRows,
      timeclockRows,
      alertRows,
      printers,
      printRouting,
      kdsStations,
      reservationShifts,
      loyaltyRows,
      onlineRows,
      zones,
      tables,
      installationDevices,
      clockTablets,
      permissionOverrides,
      cashMachineRows,
    ] = await Promise.all([
      db.select().from(businessConfigTable).limit(1),
      db.select({
        id: fichajeSettingsTable.id,
        timezone: fichajeSettingsTable.timezone,
        weekStart: fichajeSettingsTable.weekStart,
        mobileClockEnabled: fichajeSettingsTable.mobileClockEnabled,
        reportEmail: fichajeSettingsTable.reportEmail,
        reportDayOfWeek: fichajeSettingsTable.reportDayOfWeek,
        updatedAt: fichajeSettingsTable.updatedAt,
      }).from(fichajeSettingsTable).limit(1),
      db.select().from(alertConfigTable).limit(1),
      db.select().from(printersTable),
      db.select().from(printRoutingTable),
      db.select().from(kdsStationsTable),
      db.select().from(serviceShiftsTable),
      db.select().from(crmLoyaltyConfigTable).limit(1),
      db.select({
        id: onlineOrdersConfigTable.id,
        takeawayEnabled: onlineOrdersConfigTable.takeawayEnabled,
        deliveryEnabled: onlineOrdersConfigTable.deliveryEnabled,
        schedule: onlineOrdersConfigTable.schedule,
        prepTimeMinutes: onlineOrdersConfigTable.prepTimeMinutes,
        minOrder: onlineOrdersConfigTable.minOrder,
        minOrderDelivery: onlineOrdersConfigTable.minOrderDelivery,
        deliveryFee: onlineOrdersConfigTable.deliveryFee,
        freeDeliveryFrom: onlineOrdersConfigTable.freeDeliveryFrom,
        maxAdvanceHours: onlineOrdersConfigTable.maxAdvanceHours,
        maxOrdersPerSlot: onlineOrdersConfigTable.maxOrdersPerSlot,
        paused: onlineOrdersConfigTable.paused,
        pauseReason: onlineOrdersConfigTable.pauseReason,
        updatedAt: onlineOrdersConfigTable.updatedAt,
      }).from(onlineOrdersConfigTable).limit(1),
      db.select().from(roomZonesTable),
      db.select().from(restaurantTablesTable),
      db.select({
        id: installationDevicesTable.id,
        name: installationDevicesTable.name,
        tabletNumber: installationDevicesTable.tabletNumber,
        deviceCategory: installationDevicesTable.deviceCategory,
        ipLocal: installationDevicesTable.ipLocal,
        usualZone: installationDevicesTable.usualZone,
        paymentAllowed: installationDevicesTable.paymentAllowed,
        offlineAuthorized: installationDevicesTable.offlineAuthorized,
        defaultPrinterId: installationDevicesTable.defaultPrinterId,
        status: installationDevicesTable.status,
        updatedAt: installationDevicesTable.updatedAt,
      }).from(installationDevicesTable),
      db.select({
        id: tabletDevicesTable.id,
        name: tabletDevicesTable.name,
        location: tabletDevicesTable.location,
        status: tabletDevicesTable.status,
        lastSeenAt: tabletDevicesTable.lastSeenAt,
        appVersion: tabletDevicesTable.appVersion,
      }).from(tabletDevicesTable),
      db.select().from(rolePermissionsTable),
      db.select({
        id: cashMachineConfigTable.id,
        manufacturer: cashMachineConfigTable.manufacturer,
        model: cashMachineConfigTable.model,
        host: cashMachineConfigTable.host,
        port: cashMachineConfigTable.port,
        connectionType: cashMachineConfigTable.connectionType,
        deviceId: cashMachineConfigTable.deviceId,
        timeoutMs: cashMachineConfigTable.timeoutMs,
        enabled: cashMachineConfigTable.enabled,
        updatedAt: cashMachineConfigTable.updatedAt,
      }).from(cashMachineConfigTable).limit(1),
    ]);

    const business = businessRows[0] ?? null;
    const printerIds = new Set(printers.filter((printer) => printer.active).map((printer) => printer.id));
    const issues: ValidationIssue[] = [];

    if (!business) {
      issues.push({ field: "business", message: "Falta la configuración del negocio." });
    } else {
      issues.push(...validateBusinessConfigInput({
        nombreComercial: business.nombreComercial,
        razonSocial: business.razonSocial,
        nif: business.nif,
        direccionFiscal: business.direccionFiscal,
        moneda: business.moneda,
        idioma: business.idioma,
        regimenFiscal: business.regimenFiscal,
      }).issues);
      issues.push(...validateOpeningHours(business.openingHours));
    }

    const tableNames = new Set<string>();
    for (const table of tables.filter((item) => item.active)) {
      const key = `${table.zoneId}:${table.layout}:${table.name.trim().toLocaleLowerCase("es")}`;
      if (tableNames.has(key)) {
        issues.push({
          field: "tables",
          message: `Mesa duplicada en la misma sala y plano: ${table.name}.`,
        });
      }
      tableNames.add(key);
    }

    for (const printer of printers) {
      if (printer.fallbackPrinterId && !printerIds.has(printer.fallbackPrinterId)) {
        issues.push({
          field: `printers.${printer.id}.fallbackPrinterId`,
          message: `La impresora de respaldo de ${printer.name} no existe o está inactiva.`,
        });
      }
    }
    for (const routing of printRouting) {
      for (const printerId of routing.printerIds) {
        if (!printerIds.has(printerId)) {
          issues.push({
            field: `printRouting.${routing.id}`,
            message: `La ruta de impresión referencia una impresora inexistente: ${printerId}.`,
          });
        }
      }
    }
    for (const device of installationDevices) {
      if (device.defaultPrinterId && !printerIds.has(device.defaultPrinterId)) {
        issues.push({
          field: `devices.${device.id}.defaultPrinterId`,
          message: `El dispositivo ${device.name} referencia una impresora inexistente.`,
        });
      }
    }

    const canonicalLocale = localeForLanguage(business?.idioma ?? "es");
    res.json({
      sourceOfTruth: {
        business: "business_config",
        fiscal: "business_config",
        taxRates: "products.tax_rate / product_formats.tax_rate",
        currency: "business_config.moneda",
        language: "business_config.idioma",
        timezone: "fichaje_settings.timezone",
        openingHours: "business_config.opening_hours",
        rooms: "room_zones",
        tables: "restaurant_tables",
        printers: "printers",
        printRouting: "print_routing",
        kds: "kds_stations + business_config.print_mode",
        qrMenu: "business_config",
        reservations: "service_shifts",
        crmLoyalty: "crm_loyalty_config",
        roles: "role_permissions",
        devices: "installation_devices",
        clockTablet: "tablet_devices + fichaje_settings",
        cash: "cash_machine_config",
      },
      shared: business
        ? {
            business,
            locale: canonicalLocale,
            timezone: timeclockRows[0]?.timezone ?? "Europe/Madrid",
            openingHours: business.openingHours ?? null,
            qrSchedule: effectiveQrSchedule(business),
          }
        : null,
      modules: {
        tpv: { zones, tables, alerts: alertRows[0] ?? null },
        reservations: { shifts: reservationShifts },
        crm: { loyalty: loyaltyRows[0] ?? null },
        qrMenu: business
          ? { schedule: effectiveQrSchedule(business), source: "business_config.opening_hours" }
          : null,
        kds: { stations: kdsStations, printMode: business?.printMode ?? "kds_only" },
        printing: { printers, routing: printRouting, printMode: business?.printMode ?? "kds_only" },
        cash: { automaticMachine: cashMachineRows[0] ?? null },
        timeclock: {
          settings: {
            ...(timeclockRows[0] ?? {}),
            companyName: business?.nombreComercial ?? "",
            locale: canonicalLocale,
          },
          tablets: clockTablets,
        },
        onlineOrders: onlineRows[0] ?? null,
        permissions: permissionOverrides,
        devices: installationDevices,
      },
      compatibility: {
        desktop: true,
        waiterTablets: true,
        fixedClockTablet: true,
        kds: true,
        qrMenu: true,
      },
      validation: { valid: issues.length === 0, issues },
    });
  },
);

// ── Public branding endpoint (no auth required) ───────────────────────────────

router.get("/public/branding", async (_req, res): Promise<void> => {
  const rows = await db.select().from(businessConfigTable).limit(1);
  if (rows.length === 0) {
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
    schedule: effectiveQrSchedule(r),
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

  if (openingHours !== undefined) {
    const issues = validateOpeningHours(openingHours);
    if (issues.length > 0) {
      validationError(res, issues);
      return;
    }
  }

  const existing = await db.select().from(businessConfigTable).limit(1);
  if (existing.length === 0) {
    res.status(409).json({
      error: "Configura primero los datos obligatorios del negocio en /api/config/business.",
    });
    return;
  }

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

  const [result] = await db.update(businessConfigTable)
    .set(updates as any)
    .where(eq(businessConfigTable.id, existing[0].id))
    .returning();

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
    schedule: effectiveQrSchedule(r),
  });
});

router.put("/admin/qr-branding", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  if (body.restaurantName !== undefined) {
    const parsedName = validateBusinessConfigInput({ nombreComercial: body.restaurantName });
    if (!parsedName.data) {
      validationError(res, parsedName.issues);
      return;
    }
    body.restaurantName = parsedName.data.nombreComercial;
  }
  if (body.schedule !== undefined) {
    const issues = validateQrSchedule(body.schedule);
    if (issues.length > 0) {
      validationError(res, issues);
      return;
    }
  }
  const existing = await db.select().from(businessConfigTable).limit(1);
  if (existing.length === 0) {
    res.status(409).json({
      error: "Configura primero los datos obligatorios del negocio en /api/config/business.",
    });
    return;
  }
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
  if (body.schedule !== undefined) {
    // openingHours is the canonical schedule. qrSchedule remains a legacy
    // column for backwards-compatible reads of installations not yet edited.
    updates.openingHours = qrScheduleToOpeningHours(body.schedule as QrDaySchedule[]);
  }

  const [result] = await db.update(businessConfigTable)
    .set(updates as any)
    .where(eq(businessConfigTable.id, existing[0].id))
    .returning();

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
