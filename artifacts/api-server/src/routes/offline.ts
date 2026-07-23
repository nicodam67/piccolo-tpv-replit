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
  idempotencyKeysTable,
  ordersTable,
  restaurantTablesTable,
} from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import crypto from "node:crypto";
import net from "node:net";
import {
  createOrderItem,
  OrderItemServiceError,
  type AddOrderItemInput,
} from "../lib/order-item-service";

const router = Router();
const guard = [requireAuth, requireRole("admin", "manager", "encargado")];
const adminGuard = [requireAuth, requireRole("admin")];
const anyAuth = [requireAuth];

class OfflineConflictError extends Error {}
class PermanentOfflineError extends Error {}

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
    if (["blocked", "revoked"].includes(prev.status)) {
      res.status(403).json({
        error: prev.status === "revoked" ? "device_revoked" : "device_blocked",
        message: "El dispositivo no puede volver a registrarse sin intervención administrativa.",
      });
      return;
    }
    const patch: Record<string, unknown> = {
      lastSeenAt: new Date(),
      status: prev.offlineAutorizado ? "online" : "pending",
      updatedAt: new Date(),
    };
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

  const role = req.user?.role ?? "";
  const trustedRegistration = ["admin", "manager"].includes(role);
  const [device] = await db.insert(offlineDevicesTable).values({
    name,
    deviceType,
    deviceSubtype,
    fingerprint,
    ipAddress,
    macAddress,
    os,
    browserVersion,
    offlinePerms: trustedRegistration ? ["open_table", "add_item"] : [],
    offlineAutorizado: trustedRegistration,
    cobroPermitido: false,
    status: trustedRegistration ? "online" : "pending",
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
    retryable?: boolean;
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
  if (!foundDevice.offlineAutorizado) {
    res.status(403).json({
      error: "offline_not_authorized",
      message: "Este dispositivo no está autorizado para trabajar sin conexión.",
    });
    return;
  }

  const deviceRecord = foundDevice;
  await db.update(offlineDevicesTable)
    .set({ lastSeenAt: new Date(), lastSyncAt: new Date(), status: "syncing" })
    .where(eq(offlineDevicesTable.id, foundDevice.id))
    .catch(() => {});

  for (const op of operations) {
    if (!foundDevice.offlinePerms.includes(op.operationType)) {
      results.push({
        idempotencyKey: op.idempotencyKey,
        status: "failed",
        error: "Operación no autorizada para este dispositivo.",
      });
      continue;
    }
    if (op.operationType === "cash_payment" && !foundDevice.cobroPermitido) {
      results.push({
        idempotencyKey: op.idempotencyKey,
        status: "failed",
        error: "El dispositivo no tiene permitido realizar cobros.",
      });
      continue;
    }

    try {
      const outcome = await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${"offline:" + op.idempotencyKey}))`,
        );
        const [onlineReplay] = await tx
          .select({ cacheKey: idempotencyKeysTable.cacheKey })
          .from(idempotencyKeysTable)
          .where(sql`right(${idempotencyKeysTable.cacheKey}, ${op.idempotencyKey.length + 1}) = ${":" + op.idempotencyKey}`)
          .limit(1);
        if (onlineReplay) return { status: "skipped" as const };
        const [existing] = await tx.select().from(offlineQueueTable)
          .where(eq(offlineQueueTable.idempotencyKey, op.idempotencyKey))
          .for("update");
        if (existing?.status === "synced") {
          return { status: "skipped" as const };
        }

        let resultPayload: Record<string, unknown> = {};
        switch (op.operationType) {
          case "open_table": {
            const tableId = op.payload["tableId"] as string;
            if (!tableId) throw new PermanentOfflineError("tableId requerido");
            const [table] = await tx.update(restaurantTablesTable)
              .set({ status: "occupied" })
              .where(and(
                eq(restaurantTablesTable.id, tableId),
                inArray(restaurantTablesTable.status, ["free", "reserved", "pendiente_limpieza"]),
              ))
              .returning({ id: restaurantTablesTable.id });
            if (!table) throw new OfflineConflictError("La mesa ya no está disponible.");
            const [created] = await tx.insert(ordersTable).values({
              tableId,
              status: "open",
              guestCount: Math.max(1, Number(op.payload["guestCount"] ?? 1)),
              employeeId: req.user?.id ?? null,
            }).returning();
            resultPayload = { orderId: created.id };
            break;
          }
          case "add_item": {
            const orderId = op.payload["orderId"] as string;
            const productId = op.payload["productId"] as string;
            if (!orderId || !productId) {
              throw new PermanentOfflineError("orderId y productId requeridos");
            }
            await tx.execute(
              sql`SELECT pg_advisory_xact_lock(hashtext(${"order-critical:" + orderId}))`,
            );
            try {
              const created = await createOrderItem(tx, orderId, {
                productId,
                quantity: Number(op.payload["quantity"] ?? 1),
                notes: String(op.payload["notes"] ?? ""),
                formatId: typeof op.payload["formatId"] === "string"
                  ? op.payload["formatId"]
                  : undefined,
                modifiers: Array.isArray(op.payload["modifiers"])
                  ? op.payload["modifiers"] as AddOrderItemInput["modifiers"]
                  : undefined,
              });
              resultPayload = { itemId: created.item.id };
            } catch (error) {
              if (error instanceof OrderItemServiceError) {
                throw new OfflineConflictError(error.message);
              }
              throw error;
            }
            break;
          }
          case "cash_payment":
          case "clock_in":
          case "clock_out":
            throw new PermanentOfflineError(
              `${op.operationType} requiere conexión y no puede marcarse como completada sin ejecutarse.`,
            );
          default:
            throw new PermanentOfflineError(`Tipo de operación no soportado: ${op.operationType}`);
        }

        await tx.insert(offlineQueueTable).values({
          deviceId: deviceRecord.id,
          employeeId: req.user?.id ?? null,
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
        return { status: "synced" as const };
      });
      results.push({ idempotencyKey: op.idempotencyKey, status: outcome.status });
    } catch (err) {
      const conflict = err instanceof OfflineConflictError;
      const retryable = !conflict && !(err instanceof PermanentOfflineError);
      await db.insert(offlineQueueTable).values({
        deviceId: deviceRecord?.id ?? null,
        operationType: op.operationType,
        idempotencyKey: op.idempotencyKey,
        payload: op.payload,
        status: conflict ? "conflict" : retryable ? "pending" : "failed",
        lastError: String(err),
      }).onConflictDoUpdate({
        target: offlineQueueTable.idempotencyKey,
        set: {
          status: conflict ? "conflict" : retryable ? "pending" : "failed",
          lastError: String(err),
        },
      });

      results.push({
        idempotencyKey: op.idempotencyKey,
        status: conflict ? "conflict" : "failed",
        error: err instanceof Error ? err.message : String(err),
        retryable,
      });
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
        .set({ pendingOps: Number(count), status: "online", lastSyncAt: new Date() })
        .where(eq(offlineDevicesTable.id, device.id));
    }
  }

  if (operations.length > 0) {
    await db.insert(techEventsTable).values({
      level: results.some((result) => result.status === "failed") ? "warning" : "info",
      module: "offline",
      message: "Recuperación automática de operaciones offline completada",
      data: {
        deviceId: foundDevice.id,
        total: operations.length,
        synced: results.filter((result) => ["synced", "skipped"].includes(result.status)).length,
        conflicts: results.filter((result) => result.status === "conflict").length,
        failed: results.filter((result) => result.status === "failed").length,
      },
    }).catch(() => {});
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
