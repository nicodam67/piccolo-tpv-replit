/**
 * installation.ts
 * Hardware inventory, network registry, installation tests & diagnosis.
 *
 * Routes (all under /api):
 *   GET    /admin/installation/devices          list all inventory devices
 *   POST   /admin/installation/devices          create / seed device
 *   PATCH  /admin/installation/devices/:id      update device fields
 *   DELETE /admin/installation/devices/:id      delete device
 *
 *   GET    /admin/installation/network          list network registry
 *   POST   /admin/installation/network          add entry
 *   PATCH  /admin/installation/network/:id      update entry
 *   DELETE /admin/installation/network/:id      delete entry
 *
 *   GET    /admin/installation/tests            list test results
 *   POST   /admin/installation/tests            record test result
 *
 *   GET    /admin/installation/diagnosis        full installation semaphore status
 *
 *   POST   /admin/installation/seed             seed 5 default tablets + main PC
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  installationDevicesTable,
  networkRegistryTable,
  installationTestsTable,
  printersTable,
  offlineDevicesTable,
  backupSchedulesTable,
  cashSessionsTable,
  employeesTable,
} from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const ADMIN_ROLES = ["admin"] as const;
const MANAGER_ROLES = ["admin", "manager", "encargado"] as const;

const router = Router();

// ─── Helper ───────────────────────────────────────────────────────────────────
function semaphore(status: string): "ready" | "warning" | "pending" | "error" {
  if (status === "ready" || status === "ok") return "ready";
  if (status === "warning") return "warning";
  if (status === "pending" || status === "unknown") return "pending";
  return "error";
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEVICES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /admin/installation/devices
router.get("/admin/installation/devices", requireAuth, requireRole(...MANAGER_ROLES), async (_req, res): Promise<void> => {
  const devices = await db
    .select()
    .from(installationDevicesTable)
    .orderBy(asc(installationDevicesTable.deviceCategory), asc(installationDevicesTable.tabletNumber));
  res.json(devices);
});

// POST /admin/installation/devices
router.post("/admin/installation/devices", requireAuth, requireRole(...ADMIN_ROLES), async (req, res): Promise<void> => {
  const {
    name, tabletNumber, deviceCategory, brand, model, os, browser, ram, processor,
    diskSpace, appVersion, ipLocal, connectionType, usualEmployeeName, usualZone,
    paymentAllowed, offlineAuthorized, defaultPrinterId, mainPrinterAssociated,
    cashAssociated, status, notes,
  } = req.body as Partial<typeof installationDevicesTable.$inferInsert>;

  if (!name) {
    res.status(400).json({ error: "El nombre del dispositivo es obligatorio" });
    return;
  }

  const [device] = await db.insert(installationDevicesTable).values({
    name,
    tabletNumber: tabletNumber ?? null,
    deviceCategory: deviceCategory ?? "tablet",
    brand: brand ?? "",
    model: model ?? "",
    os: os ?? "",
    browser: browser ?? "",
    ram: ram ?? "",
    processor: processor ?? "",
    diskSpace: diskSpace ?? "",
    appVersion: appVersion ?? "",
    ipLocal: ipLocal ?? "",
    connectionType: connectionType ?? "wifi",
    usualEmployeeName: usualEmployeeName ?? "",
    usualZone: usualZone ?? "",
    paymentAllowed: paymentAllowed ?? false,
    offlineAuthorized: offlineAuthorized ?? true,
    defaultPrinterId: defaultPrinterId ?? null,
    mainPrinterAssociated: mainPrinterAssociated ?? "",
    cashAssociated: cashAssociated ?? "",
    status: status ?? "pending",
    notes: notes ?? "",
  }).returning();

  res.status(201).json(device);
});

// PATCH /admin/installation/devices/:id
router.patch("/admin/installation/devices/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const updates = req.body as Partial<typeof installationDevicesTable.$inferInsert>;

  const [updated] = await db
    .update(installationDevicesTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(installationDevicesTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Dispositivo no encontrado" });
    return;
  }
  res.json(updated);
});

// DELETE /admin/installation/devices/:id
router.delete("/admin/installation/devices/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db.delete(installationDevicesTable).where(eq(installationDevicesTable.id, id));
  res.status(204).send();
});

// ═══════════════════════════════════════════════════════════════════════════════
// NETWORK REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

// GET /admin/installation/network
router.get("/admin/installation/network", requireAuth, requireRole(...MANAGER_ROLES), async (_req, res): Promise<void> => {
  const entries = await db
    .select()
    .from(networkRegistryTable)
    .orderBy(asc(networkRegistryTable.deviceType), asc(networkRegistryTable.name));
  res.json(entries);
});

// POST /admin/installation/network
router.post("/admin/installation/network", requireAuth, requireRole(...ADMIN_ROLES), async (req, res): Promise<void> => {
  const { name, ip, mac, deviceType, zone, notes } = req.body as Partial<typeof networkRegistryTable.$inferInsert>;

  if (!name || !ip) {
    res.status(400).json({ error: "Nombre e IP son obligatorios" });
    return;
  }

  // Conflict detection: warn if IP already registered
  const existing = await db
    .select({ id: networkRegistryTable.id, name: networkRegistryTable.name })
    .from(networkRegistryTable)
    .where(eq(networkRegistryTable.ip, ip));

  const [entry] = await db.insert(networkRegistryTable).values({
    name,
    ip,
    mac: mac ?? "",
    deviceType: deviceType ?? "other",
    zone: zone ?? "",
    status: existing.length > 0 ? "conflict" : "unknown",
    notes: notes ?? "",
  }).returning();

  res.status(201).json({ ...entry, conflict: existing.length > 0 ? existing[0] : null });
});

// PATCH /admin/installation/network/:id
router.patch("/admin/installation/network/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const updates = req.body as Partial<typeof networkRegistryTable.$inferInsert>;

  // Re-check for IP conflict if IP is changing
  if (updates.ip) {
    const conflicting = await db
      .select({ id: networkRegistryTable.id })
      .from(networkRegistryTable)
      .where(eq(networkRegistryTable.ip, updates.ip));
    const others = conflicting.filter((c) => c.id !== id);
    if (others.length > 0) updates.status = "conflict";
  }

  const [updated] = await db
    .update(networkRegistryTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(networkRegistryTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Entrada no encontrada" });
    return;
  }
  res.json(updated);
});

// DELETE /admin/installation/network/:id
router.delete("/admin/installation/network/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db.delete(networkRegistryTable).where(eq(networkRegistryTable.id, id));
  res.status(204).send();
});

// ═══════════════════════════════════════════════════════════════════════════════
// INSTALLATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /admin/installation/tests
router.get("/admin/installation/tests", requireAuth, requireRole(...MANAGER_ROLES), async (_req, res): Promise<void> => {
  const tests = await db
    .select()
    .from(installationTestsTable)
    .orderBy(desc(installationTestsTable.performedAt));
  res.json(tests);
});

// POST /admin/installation/tests
router.post("/admin/installation/tests", requireAuth, requireRole(...MANAGER_ROLES), async (req, res): Promise<void> => {
  const { testType, deviceId, deviceName, result, notes, performedBy, metadata } =
    req.body as Partial<typeof installationTestsTable.$inferInsert>;

  if (!testType) {
    res.status(400).json({ error: "testType es obligatorio" });
    return;
  }

  const [test] = await db.insert(installationTestsTable).values({
    testType,
    deviceId: deviceId ?? null,
    deviceName: deviceName ?? "",
    result: result ?? "pending",
    notes: notes ?? "",
    performedBy: performedBy ?? "",
    metadata: metadata ?? null,
    performedAt: new Date(),
  }).returning();

  res.status(201).json(test);
});

// ═══════════════════════════════════════════════════════════════════════════════
// DIAGNOSIS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /admin/installation/diagnosis
router.get("/admin/installation/diagnosis", requireAuth, requireRole(...MANAGER_ROLES), async (_req, res): Promise<void> => {
  const [devices, printers, offlineDevices, backupSchedules, openSessions, employees] = await Promise.all([
    db.select().from(installationDevicesTable),
    db.select().from(printersTable),
    db.select().from(offlineDevicesTable),
    db.select().from(backupSchedulesTable).limit(5),
    db.select({ id: cashSessionsTable.id }).from(cashSessionsTable).where(eq(cashSessionsTable.status, "open")),
    db.select({ id: employeesTable.id }).from(employeesTable),
  ]);

  const mainComputer = devices.find((d) => d.deviceCategory === "main_computer");
  const tablets = devices
    .filter((d) => d.deviceCategory === "tablet")
    .sort((a, b) => (a.tabletNumber ?? 99) - (b.tabletNumber ?? 99));

  const kdsZones = ["cocina", "pizza", "ensalada", "barra", "pase"] as const;

  // Printer status per type
  const printerStatus = (type: string) => {
    const p = printers.find((pr) => pr.type === type && pr.active);
    if (!p) return "pending";
    return p.lastStatus === "online" ? "ready" : p.lastStatus === "error" ? "error" : "warning";
  };

  // Recent backup check
  const hasRecentBackup = backupSchedules.length > 0;

  // Users check
  const hasUsers = employees.length > 0;

  const diagnosis = {
    mainComputer: {
      status: mainComputer ? semaphore(mainComputer.status) : "pending",
      name: mainComputer?.name ?? "Ordenador principal",
      ip: mainComputer?.ipLocal ?? "",
    },
    tablets: tablets.map((t) => ({
      id: t.id,
      name: t.name,
      number: t.tabletNumber,
      status: semaphore(t.status),
      ip: t.ipLocal,
      zone: t.usualZone,
      paymentAllowed: t.paymentAllowed,
      offlineAuthorized: t.offlineAuthorized,
      lastSyncAt: t.lastSyncAt,
    })),
    kds: kdsZones.map((zone) => {
      const offlineKds = offlineDevices.find(
        (d) => d.deviceType === "kds" && d.name.toLowerCase().includes(zone)
      );
      return {
        zone,
        label: { cocina: "KDS Cocina", pizza: "KDS Pizza", ensalada: "KDS Ensaladas", barra: "KDS Barra", pase: "KDS Expedición" }[zone],
        status: offlineKds ? semaphore(offlineKds.status) : "pending",
      };
    }),
    printers: {
      principal: { label: "Impresora principal", status: printerStatus("facturacion") || printerStatus("principal") },
      cocina:    { label: "Impresora cocina",    status: printerStatus("cocina") },
      pizza:     { label: "Impresora pizza",     status: printerStatus("pizza") },
      ensalada:  { label: "Impresora ensaladas", status: printerStatus("ensalada") },
      barra:     { label: "Impresora barra",     status: printerStatus("barra") },
      reparto:   { label: "Impresora reparto",   status: printerStatus("reparto") },
    },
    cash: {
      status: openSessions.length > 0 ? "ready" : "pending",
      label: "Caja principal",
      openSessions: openSessions.length,
    },
    network:  { status: "pending" as const, label: "Red local" },
    internet: { status: "pending" as const, label: "Internet" },
    backup:   { status: hasRecentBackup ? "ready" : "pending" as const, label: "Copias de seguridad" },
    users:    { status: hasUsers ? "ready" : "pending" as const, label: "Usuarios", count: employees.length },
    offline:  {
      status: tablets.every((t) => t.offlineAuthorized) ? "ready" : "warning" as const,
      label: "Modo offline",
    },
    billing: { status: "pending" as const, label: "Facturación" },
    summary: {
      totalDevices: devices.length,
      readyDevices: devices.filter((d) => d.status === "ready").length,
      pendingDevices: devices.filter((d) => d.status === "pending").length,
      errorDevices: devices.filter((d) => d.status === "error").length,
    },
  };

  res.json(diagnosis);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEED DEFAULT DEVICES
// ═══════════════════════════════════════════════════════════════════════════════

// POST /admin/installation/seed
// Creates the 5 default tablets + main computer if they don't exist yet.
router.post("/admin/installation/seed", requireAuth, requireRole(...ADMIN_ROLES), async (req, res): Promise<void> => {
  const existing = await db.select({ id: installationDevicesTable.id }).from(installationDevicesTable);
  if (existing.length > 0) {
    res.status(409).json({ error: "Ya existen dispositivos registrados. Elimínalos primero si quieres reiniciar." });
    return;
  }

  const defaults: (typeof installationDevicesTable.$inferInsert)[] = [
    {
      name: "Ordenador principal",
      deviceCategory: "main_computer",
      connectionType: "cable",
      paymentAllowed: true,
      offlineAuthorized: false,
      status: "pending",
    },
    {
      name: "Tablet Sala 1",
      tabletNumber: 1,
      deviceCategory: "tablet",
      usualZone: "sala",
      paymentAllowed: false,
      offlineAuthorized: true,
      status: "pending",
    },
    {
      name: "Tablet Sala 2",
      tabletNumber: 2,
      deviceCategory: "tablet",
      usualZone: "sala",
      paymentAllowed: false,
      offlineAuthorized: true,
      status: "pending",
    },
    {
      name: "Tablet Sala 3",
      tabletNumber: 3,
      deviceCategory: "tablet",
      usualZone: "sala",
      paymentAllowed: false,
      offlineAuthorized: true,
      status: "pending",
    },
    {
      name: "Tablet Terraza 1",
      tabletNumber: 4,
      deviceCategory: "tablet",
      usualZone: "terraza",
      paymentAllowed: false,
      offlineAuthorized: true,
      status: "pending",
    },
    {
      name: "Tablet Encargado",
      tabletNumber: 5,
      deviceCategory: "tablet",
      usualZone: "todos",
      paymentAllowed: true,
      offlineAuthorized: true,
      status: "pending",
    },
  ];

  const created = await db.insert(installationDevicesTable).values(defaults).returning();
  res.status(201).json(created);
});

export default router;
