/**
 * Demo Data Manager
 *
 * GET  /admin/demo-data/counts    — count is_demo=true rows per table
 * POST /admin/demo-data/purge     — delete all is_demo=true rows (requires explicit confirm token)
 *
 * Only admin role can access these endpoints.
 * Real records (is_demo=false) are NEVER touched.
 *
 * Purge order is FK-safe:
 *   stock_movements → tickets → payments (direct + orphan) → orders
 *   → cash_sessions → reservations → legacy tables
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  ordersTable,
  ticketsTable,
  cashSessionsTable,
  reservationsTable,
  stockMovementsTable,
} from "@workspace/db";
import { eq, sql, count, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();
const adminOnly = [requireAuth, requireRole("admin")];

// ─── GET /admin/demo-data/counts ──────────────────────────────────────────────

router.get("/admin/demo-data/counts", ...adminOnly, async (_req, res) => {
  const [
    ordersCount,
    ticketsCount,
    paymentsCount,
    cashSessionsCount,
    reservationsCount,
    stockMovementsCount,
  ] = await Promise.all([
    db.select({ n: count() }).from(ordersTable).where(eq(ordersTable.isDemo, true)),
    db.select({ n: count() }).from(ticketsTable).where(eq(ticketsTable.isDemo, true)),
    // payments: count directly-flagged rows + orphan rows referencing demo orders
    db.execute(sql`
      SELECT COUNT(*) AS n FROM payments
      WHERE is_demo = true
         OR order_id IN (SELECT id FROM orders WHERE is_demo = true)
    `).then((r) => [{ n: Number((r as { rows: Array<{ n: string }> }).rows[0]?.n ?? 0) }]),
    db.select({ n: count() }).from(cashSessionsTable).where(eq(cashSessionsTable.isDemo, true)),
    db.select({ n: count() }).from(reservationsTable).where(eq(reservationsTable.isDemo, true)),
    db.select({ n: count() }).from(stockMovementsTable).where(eq(stockMovementsTable.isDemo, true)),
  ]);

  // Legacy tables that have is_demo from earlier migrations
  // Use exact DB table names (confirmed from schema files):
  //   employees.ts → "employees"
  //   hr.ts        → "hr_import_history", "hr_pay_periods", "hr_employee_requests"
  const legacyTables = [
    "backup_records",
    "offline_devices",
    "offline_queue",
    "tech_events",
    "employees",
    "hr_import_history",
    "hr_pay_periods",
    "hr_employee_requests",
    "setup_wizard_sessions",
    "director_metrics",
    "director_targets",
  ];

  const legacyCounts: Record<string, number> = {};
  await Promise.all(
    legacyTables.map(async (tableName) => {
      try {
        const r = await db.execute(
          sql.raw(`SELECT COUNT(*) AS n FROM "${tableName}" WHERE is_demo = true`)
        ) as { rows: Array<{ n: string | number }> };
        legacyCounts[tableName] = Number(r.rows?.[0]?.n ?? 0);
      } catch {
        // Table may not have is_demo column in all environments
        legacyCounts[tableName] = 0;
      }
    })
  );

  const tables = {
    orders: Number(ordersCount[0]?.n ?? 0),
    tickets: Number(ticketsCount[0]?.n ?? 0),
    payments: Number(paymentsCount[0]?.n ?? 0),
    cash_sessions: Number(cashSessionsCount[0]?.n ?? 0),
    reservations: Number(reservationsCount[0]?.n ?? 0),
    stock_movements: Number(stockMovementsCount[0]?.n ?? 0),
    ...legacyCounts,
  };

  const total = Object.values(tables).reduce((a, b) => a + b, 0);

  res.json({ tables, total });
});

// ─── POST /admin/demo-data/purge ──────────────────────────────────────────────

router.post("/admin/demo-data/purge", ...adminOnly, async (req, res) => {
  const { confirm } = req.body as { confirm?: string };

  if (confirm !== "PURGE_DEMO") {
    res.status(422).json({
      error: 'Se requiere confirm:"PURGE_DEMO" para eliminar los datos de demostración',
    });
    return;
  }

  const results: Record<string, number> = {};
  const errors: Record<string, string> = {};

  // ── Step 1: collect all demo order IDs (used for orphan-safe child deletes) ──
  let demoOrderIds: string[] = [];
  try {
    const rows = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(eq(ordersTable.isDemo, true));
    demoOrderIds = rows.map((r) => r.id);
  } catch (err) {
    errors["orders_prefetch"] = String(err);
  }

  // ── Step 2: delete stock_movements (child of order_items → orders) ───────────
  try {
    const r = await db
      .delete(stockMovementsTable)
      .where(eq(stockMovementsTable.isDemo, true));
    results["stock_movements"] = (r as { rowCount?: number }).rowCount ?? 0;
  } catch (err) {
    errors["stock_movements"] = String(err);
    results["stock_movements"] = -1;
  }

  // ── Step 3: delete tickets (FK → orders) ─────────────────────────────────────
  try {
    const r = await db
      .delete(ticketsTable)
      .where(eq(ticketsTable.isDemo, true));
    results["tickets"] = (r as { rowCount?: number }).rowCount ?? 0;
  } catch (err) {
    errors["tickets"] = String(err);
    results["tickets"] = -1;
  }

  // ── Step 4: delete payments (FK → orders)
  //    Two passes: (a) directly flagged rows, (b) orphan rows referencing demo orders
  try {
    // 4a — rows where is_demo = true
    const ra = await db.execute(sql`DELETE FROM payments WHERE is_demo = true`);
    let paymentsDeleted = (ra as { rowCount?: number }).rowCount ?? 0;

    // 4b — orphan rows referencing demo orders (not yet deleted)
    if (demoOrderIds.length > 0) {
      const rb = await db.execute(
        sql`DELETE FROM payments WHERE order_id = ANY(${sql.raw(
          `ARRAY[${demoOrderIds.map((id) => `'${id}'`).join(",")}]::uuid[]`
        )})`
      );
      paymentsDeleted += (rb as { rowCount?: number }).rowCount ?? 0;
    }
    results["payments"] = paymentsDeleted;
  } catch (err) {
    errors["payments"] = String(err);
    results["payments"] = -1;
  }

  // ── Step 5: delete orders ─────────────────────────────────────────────────────
  try {
    const r = await db
      .delete(ordersTable)
      .where(eq(ordersTable.isDemo, true));
    results["orders"] = (r as { rowCount?: number }).rowCount ?? 0;
  } catch (err) {
    errors["orders"] = String(err);
    results["orders"] = -1;
  }

  // ── Step 6: delete cash_sessions ─────────────────────────────────────────────
  try {
    const r = await db
      .delete(cashSessionsTable)
      .where(eq(cashSessionsTable.isDemo, true));
    results["cash_sessions"] = (r as { rowCount?: number }).rowCount ?? 0;
  } catch (err) {
    errors["cash_sessions"] = String(err);
    results["cash_sessions"] = -1;
  }

  // ── Step 7: delete reservations ───────────────────────────────────────────────
  try {
    const r = await db
      .delete(reservationsTable)
      .where(eq(reservationsTable.isDemo, true));
    results["reservations"] = (r as { rowCount?: number }).rowCount ?? 0;
  } catch (err) {
    errors["reservations"] = String(err);
    results["reservations"] = -1;
  }

  // ── Step 8: legacy tables (raw SQL, exact DB table names) ────────────────────
  const legacyTables = [
    // HR tables with is_demo (hr.ts schema)
    "hr_employee_requests",
    "hr_pay_periods",
    "hr_import_history",
    // Backup / offline (backup-offline.ts schema)
    "backup_records",
    "offline_devices",
    "offline_queue",
    "tech_events",
    // Setup
    "setup_wizard_sessions",
    // Director
    "director_metrics",
    "director_targets",
  ];

  for (const tableName of legacyTables) {
    try {
      const r = await db.execute(
        sql.raw(`DELETE FROM "${tableName}" WHERE is_demo = true`)
      ) as { rowCount?: number };
      results[tableName] = r.rowCount ?? 0;
    } catch {
      // Table may not exist or may not have is_demo — skip silently
      results[tableName] = 0;
    }
  }

  const total = Object.values(results).filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const hasErrors = Object.keys(errors).length > 0;

  if (hasErrors) {
    res.status(207).json({
      ok: false,
      total,
      tables: results,
      errors,
      message: `Purga parcial: ${total} registro(s) eliminados, pero algunos pasos fallaron`,
    });
    return;
  }

  res.json({
    ok: true,
    total,
    tables: results,
    message: `${total} registro(s) de demostración eliminados correctamente`,
  });
});

export default router;
