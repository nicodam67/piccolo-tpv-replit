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
 *   POST   /admin/installation/seed             seed 7 default tablets + main PC
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
  manualsTable,
  ordersTable,
  orderItemsTable,
  kitchenTasksTable as kitchenTasks,
  restaurantTablesTable,
  productsTable,
  paymentsTable,
  paymentMethodsTable,
  kdsStationsTable,
  tabletDevicesTable,
  backupDestinationsTable,
  backupRecordsTable,
  businessConfigTable,
  productionDepartmentsTable,
  techEventsTable,
} from "@workspace/db";
import { and, eq, desc, asc, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { idempotency } from "../middlewares/idempotency";
import {
  CERTIFICATION_STATUSES,
  PHYSICAL_CERTIFICATION_CASES,
  PHYSICAL_CERTIFICATION_CASE_IDS,
  certificationSummary,
  certificationTestType,
  mergeCertificationCases,
  renderCertificationHtml,
  sanitizeCertificationData,
  sanitizeCertificationText,
} from "../lib/installation-certification";
import { APP_VERSION } from "../lib/app-version";

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

type AssistantStepStatus = "ready" | "warning" | "pending" | "error";

async function loadInstallationAssistantSnapshot() {
  const dbStartedAt = Date.now();
  await db.execute(sql`SELECT 1`);
  const databaseLatencyMs = Date.now() - dbStartedAt;
  const [
    devices,
    printers,
    kdsStations,
    offlineDevices,
    fichajeTablets,
    destinations,
    schedules,
    backups,
    network,
    tests,
    businessConfigs,
    departments,
    incidents,
  ] = await Promise.all([
    db.select().from(installationDevicesTable),
    db.select().from(printersTable),
    db.select().from(kdsStationsTable),
    db.select().from(offlineDevicesTable),
    db.select().from(tabletDevicesTable),
    db.select().from(backupDestinationsTable),
    db.select().from(backupSchedulesTable),
    db.select().from(backupRecordsTable).orderBy(desc(backupRecordsTable.createdAt)).limit(20),
    db.select().from(networkRegistryTable),
    db.select().from(installationTestsTable).orderBy(desc(installationTestsTable.performedAt)),
    db.select().from(businessConfigTable).limit(1),
    db.select().from(productionDepartmentsTable),
    db.select().from(techEventsTable)
      .where(and(
        eq(techEventsTable.resolved, false),
        inArray(techEventsTable.level, ["error", "critical"]),
      ))
      .orderBy(desc(techEventsTable.createdAt))
      .limit(50),
  ]);

  const now = Date.now();
  const activePrinters = printers.filter((entry) => entry.active);
  const tcpPrinters = activePrinters.filter((entry) => entry.connectorMode === "tcp");
  const offlinePrinters = activePrinters.filter((entry) =>
    ["offline", "error", "paper_out", "cover_open"].includes(entry.lastStatus));
  const activeKds = kdsStations.filter((entry) => entry.active);
  const recentlySeen = (value: Date | null) =>
    Boolean(value && now - new Date(value).getTime() <= 5 * 60_000);
  const connectedOfflineDevices = offlineDevices.filter((entry) =>
    entry.status === "online" || recentlySeen(entry.lastSeenAt));
  const connectedFichaje = fichajeTablets.filter((entry) =>
    entry.status === "active" && recentlySeen(entry.lastSeenAt));
  const inventoryTablets = devices.filter((entry) => entry.deviceCategory === "tablet");
  const mainComputers = devices.filter((entry) => entry.deviceCategory === "main_computer");
  const activeDestinations = destinations.filter((entry) => entry.active);
  const activeSchedules = schedules.filter((entry) => entry.active);
  const recentVerifiedBackup = backups.find((entry) =>
    entry.status === "valid"
    && entry.verified
    && now - new Date(entry.createdAt).getTime() <= 24 * 60 * 60_000);
  const networkErrors = network.filter((entry) =>
    entry.status === "conflict" || entry.status === "unreachable");
  const networkUnknown = network.filter((entry) => entry.status === "unknown");

  const step = (
    id: string,
    label: string,
    status: AssistantStepStatus,
    configured: string[],
    missing: string[],
    errors: string[],
    corrections: string[],
    href: string,
    detection: string,
  ) => ({ id, label, status, configured, missing, errors, corrections, href, detection });

  const steps = [
    step(
      "main_computer",
      "Ordenador principal",
      !mainComputers.length ? "pending" : mainComputers.some((entry) => entry.status === "error") ? "error" : mainComputers.some((entry) => entry.status === "ready") ? "ready" : "warning",
      mainComputers.map((entry) => `${entry.name}: ${entry.status}`),
      mainComputers.length ? [] : ["Registrar el ordenador principal"],
      mainComputers.filter((entry) => entry.status === "error").map((entry) => `${entry.name}: error`),
      mainComputers.length ? ["Completar modelo, sistema operativo y estado del equipo"] : ["Abrir Inventario y registrar el ordenador"],
      "/admin/instalacion",
      "Inventario administrativo",
    ),
    step(
      "printers",
      "Impresoras",
      !activePrinters.length ? "pending" : offlinePrinters.length ? "error" : tcpPrinters.length === activePrinters.length && activePrinters.every((entry) => entry.lastStatus === "online") ? "ready" : "warning",
      activePrinters.map((entry) => `${entry.name}: ${entry.connectorMode}, ${entry.lastStatus}`),
      activePrinters.length ? [] : ["Configurar al menos una impresora"],
      offlinePrinters.map((entry) => `${entry.name}: ${entry.lastStatus}`),
      tcpPrinters.length < activePrinters.length ? ["Cambiar impresoras productivas de simulador a TCP"] : ["Ejecutar la prueba física por modelo"],
      "/admin/impresoras",
      "Estado pasivo del worker; online significa TCP, no papel",
    ),
    step(
      "kds",
      "Estaciones KDS",
      !activeKds.length ? "pending" : activeKds.every((entry) => recentlySeen(entry.lastPingAt)) ? "ready" : "warning",
      activeKds.map((entry) => `${entry.name}: ${recentlySeen(entry.lastPingAt) ? "ping reciente" : "sin ping reciente"}`),
      activeKds.length ? [] : ["Registrar estaciones KDS"],
      [],
      activeKds.some((entry) => !recentlySeen(entry.lastPingAt)) ? ["Ejecutar ping desde Estaciones KDS y verificar la pantalla"] : ["Validar flujo físico por departamento"],
      "/admin/kds-stations",
      "Configuración y último ping HTTP",
    ),
    step(
      "tablets",
      "Tablets",
      inventoryTablets.length < 7 ? "pending" : connectedOfflineDevices.length + connectedFichaje.length >= 7 ? "ready" : "warning",
      [`${inventoryTablets.length}/7 inventariadas`, `${connectedOfflineDevices.length + connectedFichaje.length} conectadas recientemente`],
      inventoryTablets.length < 7 ? [`Faltan ${7 - inventoryTablets.length} tablets en inventario`] : [],
      [],
      ["Registrar D1–D7 y ejecutar login, Wi‑Fi, memoria, sesión y permisos en cada dispositivo"],
      "/admin/instalacion",
      "Inventario + lastSeen de TPV/fichaje (5 min)",
    ),
    step(
      "storage",
      "NAS / S3",
      !activeDestinations.length ? "pending" : activeSchedules.some((entry) => entry.destinationId) ? "ready" : "warning",
      activeDestinations.map((entry) => `${entry.name}: ${entry.destType}`),
      activeDestinations.length ? [] : ["Configurar un destino local_mount, NAS o S3"],
      [],
      activeDestinations.length ? ["Ejecutar round-trip y restore con el harness de staging"] : ["Crear destino en Copias de seguridad"],
      "/admin/backup",
      "Configuración persistida; conectividad física requiere harness",
    ),
    step(
      "network",
      "Red local",
      !network.length ? "pending" : networkErrors.length ? "error" : networkUnknown.length ? "warning" : "ready",
      network.map((entry) => `${entry.name}: ${entry.status}`),
      network.length ? [] : ["Registrar router, servidor y dispositivos críticos"],
      networkErrors.map((entry) => `${entry.name}: ${entry.status}`),
      networkErrors.length ? ["Corregir conflictos/reservas DHCP y repetir diagnóstico"] : ["Verificar cobertura real en todas las zonas"],
      "/admin/devices",
      "Registro LAN; no equivale a señal Wi‑Fi física",
    ),
    step(
      "backups",
      "Copias de seguridad",
      !activeSchedules.length ? "pending" : recentVerifiedBackup ? "ready" : "warning",
      activeSchedules.map((entry) => `${entry.name}: ${entry.lastStatus}`),
      activeSchedules.length ? [] : ["Crear una programación activa"],
      activeSchedules.filter((entry) => entry.lastStatus === "error").map((entry) => `${entry.name}: ${entry.lastError ?? "error"}`),
      recentVerifiedBackup ? ["Ejecutar restore periódico en staging"] : ["Crear, verificar y restaurar una copia en staging"],
      "/admin/backup",
      "Schedule + backup válido, verificado y menor de 24 h",
    ),
  ];

  const certificationCases = mergeCertificationCases(tests);
  const config = businessConfigs[0];
  return {
    generatedAt: new Date().toISOString(),
    version: APP_VERSION,
    configuration: {
      restaurantName: config?.nombreComercial ?? "",
      legalName: config?.razonSocial ?? "",
      nif: config?.nif ?? "",
      setupCompleted: config?.setupCompleted ?? false,
      printMode: config?.printMode ?? "unknown",
      departmentCount: departments.filter((entry) => entry.active).length,
    },
    steps,
    diagnostics: {
      database: { status: "ready", latencyMs: databaseLatencyMs, detection: "SELECT 1 en vivo" },
      printers: { configured: activePrinters.length, offline: offlinePrinters.length, detection: "Estado pasivo" },
      kds: { configured: activeKds.length, recent: activeKds.filter((entry) => recentlySeen(entry.lastPingAt)).length },
      tablets: { inventoried: inventoryTablets.length, connected: connectedOfflineDevices.length + connectedFichaje.length },
      storage: { configured: activeDestinations.length, types: activeDestinations.map((entry) => entry.destType) },
      network: { entries: network.length, errors: networkErrors.length, unknown: networkUnknown.length },
      backups: { schedules: activeSchedules.length, recentVerified: Boolean(recentVerifiedBackup) },
      measuredAt: new Date().toISOString(),
      refreshAfterMs: 10_000,
    },
    devices: {
      mainComputers: mainComputers.length,
      printers: activePrinters.length,
      kds: activeKds.length,
      tablets: inventoryTablets.length,
      connectedTablets: connectedOfflineDevices.length + connectedFichaje.length,
      storageTypes: activeDestinations.map((entry) => entry.destType),
      details: [
        ...devices.map((entry) => ({
          type: entry.deviceCategory,
          name: sanitizeCertificationText(entry.name, 200),
          model: sanitizeCertificationText(entry.model, 200),
          status: entry.status,
          detection: "Inventario",
        })),
        ...activePrinters.map((entry) => ({
          type: "printer",
          name: sanitizeCertificationText(entry.name, 200),
          model: sanitizeCertificationText(`${entry.brand} ${entry.model}`.trim(), 200),
          status: entry.lastStatus,
          detection: entry.connectorMode === "tcp" ? "TCP pasivo" : "Simulador",
        })),
        ...activeKds.map((entry) => ({
          type: "kds",
          name: sanitizeCertificationText(entry.name, 200),
          model: entry.zoneType,
          status: recentlySeen(entry.lastPingAt) ? "recent" : "stale",
          detection: "Ping HTTP",
        })),
        ...activeDestinations.map((entry) => ({
          type: "storage",
          name: sanitizeCertificationText(entry.name, 200),
          model: entry.destType,
          status: "configured",
          detection: "Configuración",
        })),
      ],
    },
    certification: {
      catalogStatus: "PENDING_PHYSICAL_CERTIFICATION",
      cases: certificationCases,
      summary: certificationSummary(certificationCases),
    },
    incidents: incidents.map((entry) => ({
      level: entry.level,
      module: entry.module,
      message: sanitizeCertificationText(entry.message, 500),
      createdAt: entry.createdAt.toISOString(),
    })),
  };
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
  const { testType, deviceId, deviceName, result, notes, metadata } =
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
    performedBy: req.user?.name ?? req.user?.id ?? "",
    metadata: metadata ?? null,
    performedAt: new Date(),
  }).returning();

  res.status(201).json(test);
});

// GET /admin/installation/assistant
// Unified, read-only orchestration snapshot. Hardware states remain explicitly
// separated from physical certification attestations.
router.get(
  "/admin/installation/assistant",
  requireAuth,
  requireRole(...MANAGER_ROLES),
  async (_req, res): Promise<void> => {
    res.json(await loadInstallationAssistantSnapshot());
  },
);

// POST /admin/installation/certification/:caseId
// Append-only operator attestation using the existing installation_tests table.
router.post(
  "/admin/installation/certification/:caseId",
  requireAuth,
  requireRole(...MANAGER_ROLES),
  idempotency,
  async (req, res): Promise<void> => {
    const caseId = req.params.caseId as string;
    if (!PHYSICAL_CERTIFICATION_CASE_IDS.has(caseId)) {
      res.status(404).json({ error: "Prueba física desconocida" });
      return;
    }
    const status = req.body?.status as string;
    if (!CERTIFICATION_STATUSES.includes(status as (typeof CERTIFICATION_STATUSES)[number])) {
      res.status(400).json({ error: "Estado de certificación no válido" });
      return;
    }
    const notes = sanitizeCertificationText(req.body?.notes, 2_000);
    if (status === "failed" && !notes.trim()) {
      res.status(400).json({ error: "Una prueba fallida requiere observaciones" });
      return;
    }
    const catalogCase = PHYSICAL_CERTIFICATION_CASES.find((entry) => entry.caseId === caseId)!;
    const evidence = sanitizeCertificationData(req.body?.evidence ?? []);
    const performedBy = req.user?.name ?? req.user?.id ?? "";
    const [event] = await db.insert(installationTestsTable).values({
      testType: certificationTestType(caseId),
      deviceId: req.body?.deviceId ?? null,
      deviceName: sanitizeCertificationText(req.body?.deviceName, 200),
      result: status,
      notes,
      performedBy,
      metadata: {
        delivery: 68,
        sourceDelivery: 67,
        caseId,
        area: catalogCase.area,
        evidence,
      },
      performedAt: new Date(),
    }).returning();
    await db.insert(techEventsTable).values({
      level: status === "failed" ? "warning" : "info",
      module: "installation",
      message: `Certificación ${caseId}: ${status}`,
      code: "E68_CERTIFICATION_STATUS",
      data: {
        caseId,
        status,
        performedBy,
      },
    });
    res.status(201).json(mergeCertificationCases([event]).find((entry) => entry.caseId === caseId));
  },
);

// GET /admin/installation/certification/export?format=html|json
// Admin-only because the report aggregates operational configuration.
router.get(
  "/admin/installation/certification/export",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const format = String(req.query.format ?? "html");
    if (!["html", "json"].includes(format)) {
      res.status(400).json({ error: "Formato no válido" });
      return;
    }
    const snapshot = await loadInstallationAssistantSnapshot();
    await db.insert(techEventsTable).values({
      level: "info",
      module: "installation",
      message: `Informe de certificación exportado (${format})`,
      code: "E68_CERTIFICATION_EXPORT",
      data: { format, performedBy: req.user?.name ?? req.user?.id ?? "" },
    });
    const date = snapshot.generatedAt.slice(0, 10);
    if (format === "json") {
      res.setHeader("Content-Disposition", `attachment; filename="piccolo-certificacion-${date}.json"`);
      res.json(snapshot);
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="piccolo-certificacion-${date}.html"`);
    res.send(renderCertificationHtml(snapshot, req.query.print === "1"));
  },
);

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
// Creates the 7 certification tablets + main computer if they don't exist yet.
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
    {
      name: "Tablet Cobertura Wi-Fi",
      tabletNumber: 6,
      deviceCategory: "tablet",
      usualZone: "zona_limite",
      paymentAllowed: false,
      offlineAuthorized: true,
      status: "pending",
    },
    {
      name: "Tablet PWA y revocación",
      tabletNumber: 7,
      deviceCategory: "tablet",
      usualZone: "sala",
      paymentAllowed: false,
      offlineAuthorized: true,
      status: "pending",
    },
  ];

  const created = await db.insert(installationDevicesTable).values(defaults).returning();
  res.status(201).json(created);
});

// ═══════════════════════════════════════════════════════════════════════════════
// MANUALS (DB-backed operational checklists)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /admin/installation/manuals
router.get("/admin/installation/manuals", requireAuth, requireRole(...MANAGER_ROLES), async (_req, res): Promise<void> => {
  const manuals = await db.select().from(manualsTable).orderBy(asc(manualsTable.type));
  res.json(manuals);
});

// PATCH /admin/installation/manuals/:type
router.patch("/admin/installation/manuals/:type", requireAuth, requireRole(...ADMIN_ROLES), async (req, res): Promise<void> => {
  const type = req.params.type as string;
  const { steps, supportPhone, title } = req.body as { steps?: unknown[]; supportPhone?: string; title?: string };

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (steps !== undefined)       patch.steps       = steps;
  if (supportPhone !== undefined) patch.supportPhone = supportPhone;
  if (title !== undefined)       patch.title       = title;

  const [updated] = await db
    .update(manualsTable)
    .set(patch as any)
    .where(eq(manualsTable.type, type))
    .returning();

  if (!updated) { res.status(404).json({ error: "Manual no encontrado" }); return; }
  res.json(updated);
});

// ═══════════════════════════════════════════════════════════════════════════════
// INSTALLATION SIMULATION
// ═══════════════════════════════════════════════════════════════════════════════

// POST /admin/installation-simulation/run
router.post("/admin/installation-simulation/run", requireAuth, requireRole(...ADMIN_ROLES), async (req, res): Promise<void> => {
  const results: Array<{ session: number; tableName: string; steps: Array<{ step: string; ok: boolean; error?: string }> }> = [];

  // 1. Get first 5 active tables
  const tables = await db
    .select({ id: restaurantTablesTable.id, name: restaurantTablesTable.name })
    .from(restaurantTablesTable)
    .limit(5);

  if (tables.length === 0) {
    res.status(422).json({ error: "No hay mesas configuradas. Crea al menos una mesa antes de simular." });
    return;
  }

  // 2. Get 3 products to use as demo items
  const products = await db
    .select({ id: productsTable.id, name: productsTable.name, price: productsTable.price, prepZone: productsTable.prepZone })
    .from(productsTable)
    .limit(3);

  if (products.length === 0) {
    res.status(422).json({ error: "No hay productos configurados. Crea al menos un producto antes de simular." });
    return;
  }

  const performedBy = (req as any).user?.id ?? null;
  const sessionCount = Math.min(5, tables.length);

  for (let i = 0; i < sessionCount; i++) {
    const table = tables[i];
    const steps: Array<{ step: string; ok: boolean; error?: string }> = [];

    try {
      // Step 1: Create demo order
      let orderId: string | null = null;
      try {
        const [order] = await db.insert(ordersTable).values({
          tableId: table.id,
          status: "open",
          guestCount: 2,
          isDemo: true,
          employeeId: performedBy,
        }).returning();
        orderId = order.id;
        steps.push({ step: "Abrir mesa", ok: true });
      } catch (e: any) {
        steps.push({ step: "Abrir mesa", ok: false, error: e?.message });
        results.push({ session: i + 1, tableName: table.name, steps });
        continue;
      }

      // Step 2: Add items
      const itemsToAdd = products.slice(0, Math.min(3, products.length));
      const insertedItems: Array<{ id: string; productName: string; prepZone: string }> = [];
      try {
        for (const prod of itemsToAdd) {
          const [item] = await db.insert(orderItemsTable).values({
            orderId,
            productId: prod.id,
            quantity: 1,
            unitPrice: prod.price ?? "0.00",
            notes: `Demo sim ${i + 1}`,
          }).returning();
          insertedItems.push({ id: item.id, productName: prod.name, prepZone: prod.prepZone ?? "cocina" });
        }
        steps.push({ step: "Añadir artículos", ok: true });
      } catch (e: any) {
        steps.push({ step: "Añadir artículos", ok: false, error: e?.message });
      }

      // Step 3: Create kitchen tasks (simulated send)
      const taskIds: string[] = [];
      try {
        for (const item of insertedItems) {
          const [task] = await db.insert(kitchenTasks).values({
            orderId,
            orderItemId: item.id,
            prepZone: item.prepZone || "cocina",
            productName: item.productName,
            quantity: 1,
            status: "new",
          }).returning();
          taskIds.push(task.id);
        }
        // Mark order as sent
        await db.update(ordersTable).set({ status: "sent" }).where(eq(ordersTable.id, orderId!));
        steps.push({ step: "Enviar a cocina (KDS)", ok: taskIds.length > 0 });
      } catch (e: any) {
        steps.push({ step: "Enviar a cocina (KDS)", ok: false, error: e?.message });
      }

      // Step 4: Mark tasks as ready (simulated)
      try {
        if (taskIds.length > 0) {
          await db.update(kitchenTasks)
            .set({ status: "ready", readyAt: new Date(), updatedAt: new Date() })
            .where(inArray(kitchenTasks.id, taskIds));
        }
        steps.push({ step: "KDS marca como listo", ok: taskIds.length > 0 });
      } catch (e: any) {
        steps.push({ step: "KDS marca como listo", ok: false, error: e?.message });
      }

      // Step 5: Record demo payment — always close the order; payment insert is best-effort
      let paymentOk = false;
      let closeOk = false;

      try {
        // Resolve employee for payment (NOT NULL constraint) — use req.user or first admin
        let employeeId: string | null = performedBy;
        if (!employeeId) {
          const [emp] = await db
            .select({ id: employeesTable.id })
            .from(employeesTable)
            .where(eq(employeesTable.role, "admin"))
            .limit(1);
          employeeId = emp?.id ?? null;
        }

        // Get first active payment method
        const [pm] = await db
          .select({ id: paymentMethodsTable.id })
          .from(paymentMethodsTable)
          .where(eq(paymentMethodsTable.active, true))
          .limit(1);

        if (pm && employeeId) {
          await db.insert(paymentsTable).values({
            orderId: orderId!,
            paymentMethodId: pm.id,
            amount: "10.00",
            employeeId,
            isDemo: true,
            status: "completed",
          });
          paymentOk = true;
        }
      } catch { /* payment failure is non-fatal for order closure */ }

      // Always close the order, even if payment insert failed
      try {
        await db.update(ordersTable)
          .set({ status: "closed" })
          .where(eq(ordersTable.id, orderId!));
        closeOk = true;
      } catch (e: any) {
        steps.push({ step: "Cobrar y cerrar", ok: false, error: `Cierre fallido: ${e?.message}` });
      }

      if (closeOk) {
        steps.push({
          step: "Cobrar y cerrar",
          ok: true,
          error: paymentOk ? undefined : "Pago demo omitido (sin empleado o método de pago activo)",
        });
      }

      // Step 6: Record test result
      try {
        const allOk = steps.every(s => s.ok);
        await db.insert(installationTestsTable).values({
          testType: "full_simulation",
          deviceName: `Sesión virtual ${i + 1} — ${table.name}`,
          result: allOk ? "ok" : "warning",
          notes: steps.filter(s => !s.ok).map(s => s.step).join(", ") || "Todo OK",
          performedBy: performedBy ? String(performedBy) : "sistema",
          metadata: { orderId, tableId: table.id, sessionIndex: i + 1 },
        });
      } catch { /* non-fatal */ }

    } catch (e: any) {
      steps.push({ step: "Error inesperado", ok: false, error: e?.message });
    }

    results.push({ session: i + 1, tableName: table.name, steps });
  }

  const totalSteps = results.flatMap(r => r.steps).length;
  const passedSteps = results.flatMap(r => r.steps).filter(s => s.ok).length;
  const allPassed = results.every(r => r.steps.every(s => s.ok));

  res.json({
    ok: allPassed,
    sessionsRun: results.length,
    totalSteps,
    passedSteps,
    failedSteps: totalSteps - passedSteps,
    results,
    summary: allPassed
      ? `Simulación completada: ${results.length} sesiones, todos los pasos superados.`
      : `Simulación con advertencias: ${totalSteps - passedSteps} pasos fallaron.`,
    isDemo: true,
    runAt: new Date().toISOString(),
  });
});

export default router;
