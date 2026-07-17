/**
 * Offline Module — device management, sync queue, network diagnostics
 *
 * GET    /offline/devices                    — list all devices
 * GET    /offline/devices/:id               — single device
 * POST   /offline/devices                   — register / upsert by fingerprint
 * PATCH  /offline/devices/:id              — update fields + audit sensitive changes
 * GET    /offline/devices/:id/history      — device audit log
 * POST   /offline/devices/:id/ping         — server-side connectivity probe
 * GET    /offline/network-diagnostics      — probe all registered device IPs
 * POST   /offline/sync                     — sync offline queue
 * GET    /offline/queue                    — list queue items
 * POST   /offline/queue/:id/resolve        — resolve queue conflict
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  offlineDevicesTable,
  offlineQueueTable,
  techEventsTable,
  deviceAuditLogTable,
  ordersTable,
  orderItemsTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import crypto from "node:crypto";
import net from "node:net";

const router = Router();
const guard = [requireAuth, requireRole("admin", "manager", "encargado")];
const adminGuard = [requireAuth, requireRole("admin")];
const anyAuth = [requireAuth];

// ─── Probe helpers ────────────────────────────────────────────────────────────

/** TCP connect probe: tests if a host:port is reachable within timeoutMs */
function tcpPing(host: string, port: number, timeoutMs = 2000): Promise<{ reachable: boolean; latencyMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ reachable: false, latencyMs: timeoutMs });
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ reachable: true, latencyMs: Date.now() - start });
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve({ reachable: false, latencyMs: Date.now() - start });
    });
  });
}

/** HTTP GET probe: checks if a URL responds within timeoutMs */
async function httpProbe(url: string, timeoutMs = 3000): Promise<{ reachable: boolean; latencyMs: number; status?: number }> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, method: "GET" });
    clearTimeout(timer);
    return { reachable: res.status < 500, latencyMs: Date.now() - start, status: res.status };
  } catch {
    return { reachable: false, latencyMs: Date.now() - start };
  }
}

/** Writes a device audit log entry for sensitive field changes */
async function writeAuditEntry(
  deviceId: string,
  event: string,
  oldValue: string | null,
  newValue: string | null,
  performedBy: string | null,
) {
  await db.insert(deviceAuditLogTable).values({
    deviceId,
    event,
    oldValue,
    newValue,
    performedBy,
  }).catch(() => {});
}

// ─── GET /offline/devices ─────────────────────────────────────────────────────
router.get("/offline/devices", ...guard, async (_req, res) => {
  const devices = await db.select().from(offlineDevicesTable)
    .orderBy(desc(offlineDevicesTable.lastSeenAt));
  res.json(devices);
});

// ─── GET /offline/devices/:id ─────────────────────────────────────────────────
router.get("/offline/devices/:id", ...guard, async (req, res) => {
  const id = req.params.id as string;
  const [device] = await db.select().from(offlineDevicesTable)
    .where(eq(offlineDevicesTable.id, id));
  if (!device) { res.status(404).json({ error: "Dispositivo no encontrado" }); return; }
  res.json(device);
});

// ─── POST /offline/devices ────────────────────────────────────────────────────
router.post("/offline/devices", ...anyAuth, async (req, res) => {
  const {
    name,
    deviceType = "tpv",
    deviceSubtype = "otro",
    fingerprint: fp,
    ipAddress,
    macAddress,
    os,
    browserVersion,
  } = req.body as Record<string, string>;

  if (!name) { res.status(422).json({ error: "name requerido" }); return; }

  const fingerprint = fp ?? crypto.randomBytes(16).toString("hex");

  const existing = await db.select().from(offlineDevicesTable)
    .where(eq(offlineDevicesTable.fingerprint, fingerprint));

  if (existing.length > 0) {
    const prev = existing[0];
    const patch: Record<string, unknown> = { lastSeenAt: new Date(), status: "online", updatedAt: new Date() };
    const performedBy = (req as any).user?.id ?? null;

    // Detect IP change
    if (ipAddress && prev.ipAddress && prev.ipAddress !== ipAddress) {
      await writeAuditEntry(prev.id, "ip_changed", prev.ipAddress, ipAddress, performedBy);
      await db.insert(techEventsTable).values({
        level: "warning",
        module: "offline",
        deviceId: prev.id,
        message: `Cambio de IP detectado: ${prev.ipAddress} → ${ipAddress}`,
        data: { deviceId: prev.id, oldIp: prev.ipAddress, newIp: ipAddress },
      }).catch(() => {});
    }
    if (ipAddress) patch.ipAddress = ipAddress;
    if (macAddress) patch.macAddress = macAddress;
    if (os) patch.os = os;
    if (browserVersion) patch.browserVersion = browserVersion;

    const [updated] = await db.update(offlineDevicesTable)
      .set(patch as any)
      .where(eq(offlineDevicesTable.fingerprint, fingerprint))
      .returning();
    res.json(updated);
    return;
  }

  const [device] = await db.insert(offlineDevicesTable).values({
    name,
    deviceType,
    deviceSubtype,
    fingerprint,
    ipAddress,
    macAddress,
    os,
    browserVersion,
    offlinePerms: ["open_table", "add_item", "cash_payment", "clock_in", "clock_out"],
    status: "online",
    lastSeenAt: new Date(),
  }).returning();

  res.status(201).json(device);
});

// ─── PATCH /offline/devices/:id ───────────────────────────────────────────────
router.patch("/offline/devices/:id", ...guard, async (req, res) => {
  const id = req.params.id as string;
  const performedBy: string | null = (req as any).user?.id ?? null;

  const [existing] = await db.select().from(offlineDevicesTable)
    .where(eq(offlineDevicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Dispositivo no encontrado" }); return; }

  const {
    status,
    offlinePerms,
    name,
    deviceType,
    deviceSubtype,
    ipAddress,
    macAddress,
    os,
    browserVersion,
    assignedZoneId,
    defaultPrinterId,
    cobroPermitido,
    offlineAutorizado,
    usuarioHabitual,
    notes,
  } = req.body as Record<string, unknown>;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (status !== undefined) patch.status = status;
  if (offlinePerms !== undefined) patch.offlinePerms = offlinePerms;
  if (name !== undefined) patch.name = name;
  if (deviceType !== undefined) patch.deviceType = deviceType;
  if (deviceSubtype !== undefined) patch.deviceSubtype = deviceSubtype;
  if (ipAddress !== undefined) patch.ipAddress = ipAddress;
  if (macAddress !== undefined) patch.macAddress = macAddress;
  if (os !== undefined) patch.os = os;
  if (browserVersion !== undefined) patch.browserVersion = browserVersion;
  if (assignedZoneId !== undefined) patch.assignedZoneId = assignedZoneId || null;
  if (defaultPrinterId !== undefined) patch.defaultPrinterId = defaultPrinterId || null;
  if (cobroPermitido !== undefined) patch.cobroPermitido = Boolean(cobroPermitido);
  if (offlineAutorizado !== undefined) patch.offlineAutorizado = Boolean(offlineAutorizado);
  if (usuarioHabitual !== undefined) patch.usuarioHabitual = usuarioHabitual || null;
  if (notes !== undefined) patch.notes = notes;

  const [row] = await db.update(offlineDevicesTable)
    .set(patch as any)
    .where(eq(offlineDevicesTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Dispositivo no encontrado" }); return; }

  // ── Audit log for sensitive fields ─────────────────────────────────────
  if (status !== undefined && status !== existing.status) {
    await writeAuditEntry(id, "status_changed", existing.status, String(status), performedBy);
    if (status === "blocked" || status === "revoked") {
      await db.insert(techEventsTable).values({
        level: "warning",
        module: "offline",
        message: `Dispositivo ${row.name} ${status === "blocked" ? "bloqueado" : "revocado"}`,
        data: { deviceId: id },
      }).catch(() => {});
    }
  }
  if (ipAddress !== undefined && ipAddress !== existing.ipAddress) {
    await writeAuditEntry(id, "ip_changed", existing.ipAddress, ipAddress as string | null, performedBy);
  }
  if (cobroPermitido !== undefined && Boolean(cobroPermitido) !== existing.cobroPermitido) {
    await writeAuditEntry(id, "cobro_changed", String(existing.cobroPermitido), String(cobroPermitido), performedBy);
  }
  if (offlineAutorizado !== undefined && Boolean(offlineAutorizado) !== existing.offlineAutorizado) {
    await writeAuditEntry(id, "offline_autorizado_changed", String(existing.offlineAutorizado), String(offlineAutorizado), performedBy);
  }

  res.json(row);
});

// ─── GET /offline/devices/:id/history ─────────────────────────────────────────
router.get("/offline/devices/:id/history", ...guard, async (req, res) => {
  const id = req.params.id as string;
  const rows = await db.select().from(deviceAuditLogTable)
    .where(eq(deviceAuditLogTable.deviceId, id))
    .orderBy(desc(deviceAuditLogTable.createdAt))
    .limit(100);
  res.json(rows);
});

// ─── POST /offline/devices/:id/ping ───────────────────────────────────────────
router.post("/offline/devices/:id/ping", ...adminGuard, async (req, res) => {
  const id = req.params.id as string;
  const [device] = await db.select().from(offlineDevicesTable)
    .where(eq(offlineDevicesTable.id, id));

  if (!device) { res.status(404).json({ error: "Dispositivo no encontrado" }); return; }

  const ip = device.ipAddress;
  if (!ip) {
    res.json({
      deviceId: id,
      deviceName: device.name,
      ipAddress: null,
      lan: { reachable: false, latencyMs: null, error: "Sin IP registrada" },
      api: { reachable: false, latencyMs: null },
      printer: { reachable: false, latencyMs: null },
      internet: { reachable: false, latencyMs: null },
    });
    return;
  }

  // Probe LAN, API server, and internet in parallel
  const [lan, api, internet] = await Promise.all([
    tcpPing(ip, 80, 2000),
    httpProbe(`http://localhost:${process.env.PORT ?? 8080}/`, 2000),
    httpProbe("https://1.1.1.1", 3000),
  ]);

  // Printer probe: look up the assigned printer's own IP and probe that — not the device IP
  let printer: { reachable: boolean | null; latencyMs: number | null } = { reachable: null, latencyMs: null };
  if (device.defaultPrinterId) {
    const printerRow = await db.execute(
      sql`SELECT ip FROM printers WHERE id = ${device.defaultPrinterId} LIMIT 1`
    ) as { rows: Array<{ ip: string }> };
    const printerIp = printerRow.rows?.[0]?.ip;
    if (printerIp) {
      const r = await tcpPing(printerIp, 9100, 2000).then(r => r.reachable ? r : tcpPing(printerIp, 80, 1000));
      printer = { reachable: r.reachable, latencyMs: r.reachable ? r.latencyMs : null };
    } else {
      printer = { reachable: false, latencyMs: null };
    }
  }

  res.json({
    deviceId: id,
    deviceName: device.name,
    ipAddress: ip,
    checkedAt: new Date().toISOString(),
    lan: { reachable: lan.reachable, latencyMs: lan.reachable ? lan.latencyMs : null },
    api: { reachable: api.reachable, latencyMs: api.reachable ? api.latencyMs : null, status: api.status },
    printer,
    internet: { reachable: internet.reachable, latencyMs: internet.reachable ? internet.latencyMs : null },
  });
});

// ─── GET /offline/network-diagnostics ─────────────────────────────────────────
router.get("/offline/network-diagnostics", ...adminGuard, async (_req, res) => {
  // Fetch all devices and all printers in one round-trip each
  const [allDevices, allPrinters] = await Promise.all([
    db.select().from(offlineDevicesTable).orderBy(offlineDevicesTable.name),
    db.execute(sql`SELECT id, ip FROM printers WHERE ip IS NOT NULL AND ip != ''`) as Promise<{ rows: Array<{ id: string; ip: string }> }>,
  ]);

  const printerIpById = Object.fromEntries(
    (allPrinters as { rows: Array<{ id: string; ip: string }> }).rows.map((p) => [p.id, p.ip])
  );

  // Check server internet once (shared result for all devices)
  const serverInternet = await httpProbe("https://1.1.1.1", 3000);
  // Check API server (our own health endpoint) once
  const apiProbe = await httpProbe(`http://localhost:${process.env.PORT ?? 8080}/`, 2000);

  // Probe all devices in parallel — each gets lan + printer; api + internet are shared
  const devices = await Promise.all(
    allDevices.map(async (device) => {
      const ip = device.ipAddress;
      let lan = { reachable: false, latencyMs: null as number | null, error: "Sin IP" as string | undefined };

      if (ip) {
        const r = await tcpPing(ip, 80, 2000);
        lan = { reachable: r.reachable, latencyMs: r.reachable ? r.latencyMs : null, error: undefined };
      }

      // Printer: probe the assigned printer's network address, not the device IP
      let printer: { reachable: boolean | null; latencyMs: number | null } = { reachable: null, latencyMs: null };
      if (device.defaultPrinterId) {
        const printerIp = printerIpById[device.defaultPrinterId];
        if (printerIp) {
          const r = await tcpPing(printerIp, 9100, 2000).then(r => r.reachable ? r : tcpPing(printerIp, 80, 1000));
          printer = { reachable: r.reachable, latencyMs: r.reachable ? r.latencyMs : null };
        } else {
          printer = { reachable: false, latencyMs: null };
        }
      }

      return {
        deviceId: device.id,
        deviceName: device.name,
        ipAddress: ip,
        deviceSubtype: device.deviceSubtype,
        status: device.status,
        checkedAt: new Date().toISOString(),
        lan,
        api: { reachable: apiProbe.reachable, latencyMs: apiProbe.reachable ? apiProbe.latencyMs : null, status: apiProbe.status },
        printer,
        internet: { reachable: serverInternet.reachable, latencyMs: serverInternet.reachable ? serverInternet.latencyMs : null },
      };
    })
  );

  res.json({
    serverInternet: { reachable: serverInternet.reachable, latencyMs: serverInternet.reachable ? serverInternet.latencyMs : null },
    checkedAt: new Date().toISOString(),
    devices,
  });
});

// ─── POST /offline/sync ───────────────────────────────────────────────────────
router.post("/offline/sync", ...anyAuth, async (req, res) => {
  const { deviceId: deviceFingerprint, operations = [] } = req.body as {
    deviceId?: string;
    operations: Array<{
      idempotencyKey: string;
      operationType: string;
      payload: Record<string, unknown>;
    }>;
  };

  const results: Array<{
    idempotencyKey: string;
    status: "synced" | "conflict" | "failed" | "skipped";
    error?: string;
  }> = [];

  if (!deviceFingerprint) {
    res.status(403).json({
      error: "device_unknown",
      message: "Se requiere un deviceId registrado para sincronizar.",
    });
    return;
  }

  const [foundDevice] = await db.select().from(offlineDevicesTable)
    .where(eq(offlineDevicesTable.fingerprint, deviceFingerprint));

  if (!foundDevice) {
    res.status(403).json({
      error: "device_unknown",
      message: "Dispositivo no registrado. Registra este dispositivo antes de sincronizar.",
    });
    return;
  }
  if (foundDevice.status === "blocked") {
    res.status(403).json({
      error: "device_blocked",
      message: "Este dispositivo está bloqueado. Contacta con el administrador.",
    });
    return;
  }
  if (foundDevice.status === "revoked") {
    res.status(403).json({
      error: "device_revoked",
      message: "Este dispositivo ha sido revocado y ya no puede sincronizar.",
    });
    return;
  }

  const deviceRecord = foundDevice;
  await db.update(offlineDevicesTable)
    .set({ lastSeenAt: new Date(), lastSyncAt: new Date(), status: "online" })
    .where(eq(offlineDevicesTable.id, foundDevice.id))
    .catch(() => {});

  for (const op of operations) {
    const [existing] = await db.select().from(offlineQueueTable)
      .where(eq(offlineQueueTable.idempotencyKey, op.idempotencyKey));

    if (existing?.status === "synced") {
      results.push({ idempotencyKey: op.idempotencyKey, status: "skipped" });
      continue;
    }

    try {
      let resultPayload: Record<string, unknown> = {};

      switch (op.operationType) {
        case "open_table": {
          const tableId = op.payload["tableId"] as string;
          if (tableId) {
            const [order] = await db.insert(ordersTable).values({
              tableId,
              status: "open",
              guestCount: Number(op.payload["guestCount"] ?? 1),
              employeeId: op.payload["employeeId"] as string ?? null,
            }).returning().catch(() => [null]);
            resultPayload = { orderId: order?.id ?? null };
          }
          break;
        }
        case "add_item": {
          const orderId = op.payload["orderId"] as string;
          const productId = op.payload["productId"] as string;
          if (orderId && productId) {
            const [item] = await db.insert(orderItemsTable).values({
              orderId,
              productId,
              quantity: Number(op.payload["quantity"] ?? 1),
              unitPrice: String(op.payload["unitPrice"] ?? "0"),
              notes: String(op.payload["notes"] ?? ""),
            }).returning().catch(() => [null as any]);
            resultPayload = { itemId: item?.id ?? null };
          }
          break;
        }
        case "cash_payment":
        case "clock_in":
        case "clock_out":
          resultPayload = { acknowledged: true, note: "Operación registrada para procesamiento" };
          break;
        default:
          resultPayload = { note: "Tipo de operación desconocido" };
      }

      await db.insert(offlineQueueTable).values({
        deviceId: deviceRecord?.id ?? null,
        employeeId: (req.user as { id?: string } | undefined)?.id ?? null,
        operationType: op.operationType,
        idempotencyKey: op.idempotencyKey,
        payload: op.payload,
        status: "synced",
        resultPayload,
        syncedAt: new Date(),
      }).onConflictDoUpdate({
        target: offlineQueueTable.idempotencyKey,
        set: { status: "synced", syncedAt: new Date(), resultPayload },
      });

      results.push({ idempotencyKey: op.idempotencyKey, status: "synced" });
    } catch (err) {
      await db.insert(offlineQueueTable).values({
        deviceId: deviceRecord?.id ?? null,
        operationType: op.operationType,
        idempotencyKey: op.idempotencyKey,
        payload: op.payload,
        status: "failed",
        lastError: String(err),
      }).onConflictDoUpdate({
        target: offlineQueueTable.idempotencyKey,
        set: { status: "failed", lastError: String(err) },
      });

      results.push({ idempotencyKey: op.idempotencyKey, status: "failed", error: String(err) });
    }
  }

  if (deviceFingerprint) {
    const [device] = await db.select().from(offlineDevicesTable)
      .where(eq(offlineDevicesTable.fingerprint, deviceFingerprint));
    if (device) {
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(offlineQueueTable)
        .where(and(
          eq(offlineQueueTable.deviceId, device.id),
          eq(offlineQueueTable.status, "pending"),
        ));
      await db.update(offlineDevicesTable)
        .set({ pendingOps: Number(count) })
        .where(eq(offlineDevicesTable.id, device.id));
    }
  }

  res.json({ results });
});

// ─── GET /offline/queue ────────────────────────────────────────────────────────
router.get("/offline/queue", ...guard, async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 50), 200);
  const offset = Number(req.query["offset"] ?? 0);
  const status = req.query["status"] as string | undefined;

  const conditions = status ? [eq(offlineQueueTable.status, status)] : [];
  const rows = await db.select().from(offlineQueueTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(offlineQueueTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(offlineQueueTable)
    .where(conditions.length ? and(...conditions) : undefined);

  res.json({ data: rows, total: count, limit, offset });
});

// ─── POST /offline/queue/:id/resolve ─────────────────────────────────────────
router.post("/offline/queue/:id/resolve", ...guard, async (req, res) => {
  const id = req.params.id as string;
  const { resolution = "accept_server" } = req.body as { resolution?: string };

  const newStatus = resolution === "skip" ? "skipped" : "synced";
  const [row] = await db.update(offlineQueueTable)
    .set({ status: newStatus, syncedAt: new Date(), updatedAt: new Date() })
    .where(eq(offlineQueueTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Operación no encontrada" }); return; }
  res.json(row);
});

export default router;
