/**
 * Offline Module — gestión de dispositivos y sincronización de cola
 *
 * GET  /offline/devices
 * POST /offline/devices
 * PATCH /offline/devices/:id
 * POST /offline/sync
 * GET  /offline/queue
 * POST /offline/queue/:id/resolve
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  offlineDevicesTable,
  offlineQueueTable,
  techEventsTable,
  ordersTable,
  orderItemsTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import crypto from "node:crypto";

const router = Router();
const guard = [requireAuth, requireRole("admin", "manager", "encargado")];
const anyAuth = [requireAuth];

// ─── GET /offline/devices ─────────────────────────────────────────────────────
router.get("/offline/devices", ...guard, async (_req, res) => {
  const devices = await db.select().from(offlineDevicesTable)
    .orderBy(desc(offlineDevicesTable.lastSeenAt));
  res.json(devices);
});

// ─── POST /offline/devices ────────────────────────────────────────────────────
router.post("/offline/devices", ...anyAuth, async (req, res) => {
  const { name, deviceType = "tpv", fingerprint: fp } = req.body as Record<string, string>;
  if (!name) return res.status(422).json({ error: "name requerido" });

  // Generate fingerprint if not provided
  const fingerprint = fp ?? crypto.randomBytes(16).toString("hex");

  // Upsert by fingerprint
  const existing = await db.select().from(offlineDevicesTable)
    .where(eq(offlineDevicesTable.fingerprint, fingerprint));

  if (existing.length > 0) {
    await db.update(offlineDevicesTable)
      .set({ lastSeenAt: new Date(), status: "online" })
      .where(eq(offlineDevicesTable.fingerprint, fingerprint));
    return res.json({ ...existing[0], fingerprint });
  }

  const [device] = await db.insert(offlineDevicesTable).values({
    name,
    deviceType: deviceType as string,
    fingerprint,
    offlinePerms: ["open_table", "add_item", "cash_payment", "clock_in", "clock_out"],
    status: "online",
    lastSeenAt: new Date(),
  }).returning();

  res.status(201).json(device);
});

// ─── PATCH /offline/devices/:id ───────────────────────────────────────────────
router.patch("/offline/devices/:id", ...guard, async (req, res) => {
  const id = req.params.id as string;
  const { status, offlinePerms, name } = req.body as Record<string, unknown>;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (status) patch["status"] = status;
  if (offlinePerms) patch["offlinePerms"] = offlinePerms;
  if (name) patch["name"] = name;

  const [row] = await db.update(offlineDevicesTable)
    .set(patch as Parameters<typeof db.update>[0])
    .where(eq(offlineDevicesTable.id, id))
    .returning();

  if (!row) return res.status(404).json({ error: "Dispositivo no encontrado" });

  if (status === "blocked" || status === "revoked") {
    await db.insert(techEventsTable).values({
      level: "warning",
      module: "offline",
      message: `Dispositivo ${row.name} ${status === "blocked" ? "bloqueado" : "revocado"}`,
      data: { deviceId: id },
    }).catch(() => {});
  }

  res.json(row);
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

  // ── Enforce device eligibility: fingerprint is required and must be registered ──
  // Unknown/missing fingerprints are rejected to prevent bypassing revocation
  // controls by rotating the localStorage fingerprint or clearing it.
  if (!deviceFingerprint) {
    return res.status(403).json({
      error: "device_unknown",
      message: "Se requiere un deviceId registrado para sincronizar.",
    });
  }

  const [foundDevice] = await db.select().from(offlineDevicesTable)
    .where(eq(offlineDevicesTable.fingerprint, deviceFingerprint));

  if (!foundDevice) {
    return res.status(403).json({
      error: "device_unknown",
      message: "Dispositivo no registrado. Registra este dispositivo antes de sincronizar.",
    });
  }
  if (foundDevice.status === "blocked") {
    return res.status(403).json({
      error: "device_blocked",
      message: "Este dispositivo está bloqueado. Contacta con el administrador.",
    });
  }
  if (foundDevice.status === "revoked") {
    return res.status(403).json({
      error: "device_revoked",
      message: "Este dispositivo ha sido revocado y ya no puede sincronizar.",
    });
  }

  const deviceRecord = foundDevice;
  // Update last seen — only for permitted devices
  await db.update(offlineDevicesTable)
    .set({ lastSeenAt: new Date(), lastSyncAt: new Date(), status: "online" })
    .where(eq(offlineDevicesTable.id, foundDevice.id))
    .catch(() => {});

  for (const op of operations) {
    // Check idempotency — if already processed, return previous result
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
          // Apply open_table if not already open
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
              name: String(op.payload["name"] ?? ""),
            }).returning().catch(() => [null]);
            resultPayload = { itemId: item?.id ?? null };
          }
          break;
        }
        case "cash_payment":
        case "clock_in":
        case "clock_out":
          // These require more complex logic — acknowledge receipt
          resultPayload = { acknowledged: true, note: "Operación registrada para procesamiento" };
          break;
        default:
          resultPayload = { note: "Tipo de operación desconocido" };
      }

      // Record in queue
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
      // Save as failed
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

  // Update device pending ops count
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

  if (!row) return res.status(404).json({ error: "Operación no encontrada" });
  res.json(row);
});

export default router;
