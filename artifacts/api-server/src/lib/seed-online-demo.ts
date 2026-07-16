/**
 * seed-online-demo.ts — Idempotent demo data for the Online Orders v2 module.
 *
 * Creates:
 *   - One online_orders_config row (if none exists) with sensible defaults
 *     and tip + table ordering enabled for demonstration.
 *   - One demo table session that staff can use to test the /menu?token=... flow.
 *
 * Safe to call multiple times — all checks use unique constraints or presence.
 * Never runs in production (gated by NODE_ENV check in index.ts).
 */

import { db } from "@workspace/db";
import { onlineOrdersConfigTable, tableSessionsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function seedOnlineDemo(): Promise<void> {
  // ── Ensure config row exists ─────────────────────────────────────────────────
  const [existingCfg] = await db.select({ id: onlineOrdersConfigTable.id })
    .from(onlineOrdersConfigTable).limit(1);

  if (!existingCfg) {
    await db.insert(onlineOrdersConfigTable).values({
      takeawayEnabled: true,
      deliveryEnabled: false,
      tableOrderingEnabled: true,
      tipEnabled: true,
      tipPercentages: [5, 10, 15, 20] as unknown as never,
      prepTimeMinutes: 25,
      minOrder: "0",
      minOrderDelivery: "15",
      deliveryFee: "2.50",
      freeDeliveryFrom: "30",
      maxAdvanceHours: 48,
      maxOrdersPerSlot: 8,
      paused: false,
      pauseReason: "",
    } as any);
  } else {
    // Soft-update: enable tips and table ordering if not already set
    await db.execute(sql`
      UPDATE online_orders_config
      SET tip_enabled         = COALESCE(tip_enabled, false),
          table_ordering_enabled = COALESCE(table_ordering_enabled, false)
      WHERE id = ${existingCfg.id}
    `);
  }

  // ── Create a demo table session if none exist ─────────────────────────────────
  const [existingSession] = await db.select({ id: tableSessionsTable.id })
    .from(tableSessionsTable).limit(1);

  if (!existingSession) {
    await db.insert(tableSessionsTable).values({
      tableLabel: "Mesa 1",
      zoneLabel: "Terraza",
      token: "demo-table-session-token",
      status: "open",
      expiresAt: new Date(Date.now() + 365 * 24 * 3600_000), // 1 year for demo
    } as any);
  }
}
