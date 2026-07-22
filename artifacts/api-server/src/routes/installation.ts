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
  manualsTable,
  ordersTable,
  orderItemsTable,
  kitchenTasksTable as kitchenTasks,
  restaurantTablesTable,
  productsTable,
  paymentsTable,
  paymentMethodsTable,
} from "@workspace/db";
import { eq, desc, asc, inArray, sql } from "drizzle-orm";
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
